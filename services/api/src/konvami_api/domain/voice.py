"""Starting and following live voice calls (spec §10.2: backend-brokered WebRTC).

The app sends its WebRTC offer here. The backend checks that the learner may call, creates the
call at the voice provider with the server's key and the persona's server-owned instructions and
tools, and returns the answer. Audio then flows directly between the device and the provider;
the server follows the call through `LiveCall`.
"""

import datetime as dt
import hashlib
from collections.abc import Callable, Mapping
from dataclasses import dataclass
from enum import StrEnum
from typing import Any, Protocol
from uuid import UUID

from konvami_api.domain.accounts import Account, AccountDirectory, AccountNotFound
from konvami_api.domain.live_call import LiveCall, Outcome, Turn
from konvami_api.domain.tools import ToolSet

# Seconds before the limit at which the persona is told to wrap up.
WRAP_UP_SECONDS = 45
# Seconds a goodbye may still play before the call is ended.
GOODBYE_GRACE_SECONDS = 8
DAY = dt.timedelta(hours=24)


class CallPurpose(StrEnum):
    ONBOARDING = "onboarding"
    PLACEMENT = "placement"
    # A conversation with one of the learner's partners.
    PRACTICE = "practice"


# When the learner's turn counts as finished, per purpose. Measured on spoken test sentences
# (2026-10-09), from the end of speech to the end of the turn: silence detection at 0.7 s took
# 0.9 s; the provider's semantic detection took 2 to 2.6 s at high eagerness, 2.4 to 4.5 s at its
# default and 8.4 s at low.
_TURN_DETECTION: dict[CallPurpose, dict[str, Any]] = {
    # Setup is short answers in the learner's own language: answer promptly.
    CallPurpose.ONBOARDING: {"type": "server_vad", "silence_duration_ms": 800},
    # In the language being learned people pause to think: wait for the thought, within a limit.
    CallPurpose.PLACEMENT: {"type": "semantic_vad", "eagerness": "auto"},
    CallPurpose.PRACTICE: {"type": "semantic_vad", "eagerness": "auto"},
}


@dataclass(frozen=True)
class VoiceSettings:
    """Per-environment choices (Terraform variables), so a model changes without a code change."""

    # The voice model per purpose (spec §17.3: the efficient tier unless quality needs more).
    models: Mapping[CallPurpose, str]
    # The longest a call of each purpose may last.
    max_seconds: Mapping[CallPurpose, int]
    # The guide's voice. A partner speaks with their own (`Briefing.voice`).
    voice: str
    transcription_model: str
    daily_call_limit: int


@dataclass(frozen=True)
class CreatedCall:
    call_id: str
    sdp_answer: str


@dataclass(frozen=True)
class CallStarted:
    call_id: str
    sdp_answer: str
    max_seconds: int


@dataclass(frozen=True)
class VoiceSession:
    call_id: str
    user_id: UUID
    purpose: CallPurpose
    model: str
    started_at: dt.datetime
    # The partner of a practice call; None for the guide's calls.
    persona_id: UUID | None = None


@dataclass(frozen=True)
class Briefing:
    """What a call's persona is told, and the voice they speak with."""

    instructions: str
    # None: the guide's voice from the settings.
    voice: str | None = None
    # How fast they speak, as a multiple of the voice's own pace; None for that pace.
    speed: float | None = None


@dataclass(frozen=True)
class FinishedCall:
    ended_at: dt.datetime
    outcome: Outcome
    usage: Mapping[str, int]
    turns: tuple[Turn, ...]


class VoiceProviderError(Exception):
    """The voice provider refused or could not be reached."""


class VoiceError(Exception):
    """Why a call cannot start, as a stable code."""

    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


class VoiceProvider(Protocol):
    def create_call(
        self, sdp_offer: str, session: dict[str, Any], safety_identifier: str
    ) -> CreatedCall:
        """Creates the call and returns the provider's SDP answer. Raises `VoiceProviderError`."""

    def hang_up(self, call_id: str) -> None: ...


class CallScript(Protocol):
    """What one kind of call says, can do and leaves behind (the setup, the placement test)."""

    def prepare(
        self, user_id: UUID, account: Account, today: dt.date, persona_id: UUID | None
    ) -> Briefing:
        """The persona's instructions for this learner. `persona_id` is the partner the app
        asked for, if any. Raises if the call may not start now; changes nothing."""

    def tools(self, user_id: UUID) -> ToolSet:
        """Fresh tools for one call."""

    def started(self, user_id: UUID) -> None:
        """The call exists."""

    def concluded(self, user_id: UUID, call_id: str, tools: ToolSet, call: "FinishedCall") -> None:
        """The call is over and stored under `call_id`; `tools` are the ones it used."""


class CallStarter(Protocol):
    def start(self, call_id: str, user_id: UUID, purpose: CallPurpose) -> None:
        """Starts the server's side of a call (the worker that joins it)."""


class VoiceSessionRepository(Protocol):
    def started(self, session: VoiceSession) -> None: ...

    def get(self, call_id: str) -> VoiceSession | None: ...

    def count_since(self, user_id: UUID, since: dt.datetime) -> int: ...

    def finish(self, call_id: str, result: FinishedCall) -> None: ...


def _today(now: dt.datetime, local_date: dt.date | None) -> dt.date:
    """The date a persona is told. The learner's own, when the app names one that some time
    zone can have right now (at most a day from the date in UTC); otherwise the date in UTC."""
    utc = now.date()
    if local_date is not None and abs((local_date - utc).days) <= 1:
        return local_date
    return utc


class VoiceCallService:
    def __init__(
        self,
        *,
        settings: VoiceSettings,
        scripts: Mapping[CallPurpose, CallScript],
        accounts: AccountDirectory,
        provider: VoiceProvider,
        sessions: VoiceSessionRepository,
        starter: CallStarter,
        clock: Callable[[], dt.datetime],
    ) -> None:
        self._settings = settings
        self._scripts = scripts
        self._accounts = accounts
        self._provider = provider
        self._sessions = sessions
        self._starter = starter
        self._clock = clock

    def start(
        self,
        user_id: UUID,
        purpose: CallPurpose,
        sdp_offer: str,
        persona_id: UUID | None = None,
        local_date: dt.date | None = None,
    ) -> CallStarted:
        """`local_date` is today on the learner's calendar, as their device has it."""
        model = self._settings.models.get(purpose)
        max_seconds = self._settings.max_seconds.get(purpose)
        script = self._scripts.get(purpose)
        if model is None or max_seconds is None or script is None:
            raise VoiceError("voice_unavailable")

        try:
            account = self._accounts.get(user_id)
        except AccountNotFound as error:
            raise VoiceError("not_authenticated") from error
        if not account.voice_consent:
            raise VoiceError("consent_required")
        now = self._clock()
        if self._sessions.count_since(user_id, now - DAY) >= self._settings.daily_call_limit:
            raise VoiceError("call_limit")

        briefing = script.prepare(user_id, account, _today(now, local_date), persona_id)
        output: dict[str, Any] = {"voice": briefing.voice or self._settings.voice}
        if briefing.speed is not None:
            output["speed"] = briefing.speed
        session = {
            "type": "realtime",
            "model": model,
            "instructions": briefing.instructions,
            "tools": script.tools(user_id).definitions(),
            "tool_choice": "auto",
            "audio": {
                "input": {
                    "transcription": {"model": self._settings.transcription_model},
                    "turn_detection": _TURN_DETECTION[purpose],
                },
                "output": output,
            },
        }
        # The provider asks for a stable id per end user for abuse handling; it gets a hash.
        safety_identifier = hashlib.sha256(str(user_id).encode()).hexdigest()
        try:
            created = self._provider.create_call(sdp_offer, session, safety_identifier)
        except VoiceProviderError as error:
            raise VoiceError("voice_unavailable") from error

        self._sessions.started(
            VoiceSession(created.call_id, user_id, purpose, model, now, persona_id)
        )
        try:
            self._starter.start(created.call_id, user_id, purpose)
        except Exception as error:
            # Without its server side the persona's tools would do nothing: end the call.
            self._provider.hang_up(created.call_id)
            raise VoiceError("voice_unavailable") from error
        script.started(user_id)
        return CallStarted(created.call_id, created.sdp_answer, max_seconds)

    def live_call(self, call_id: str) -> LiveCall | None:
        """The server's side of a recorded call, with the tools of the learner it belongs to."""
        session = self._sessions.get(call_id)
        if session is None:
            return None
        return LiveCall(
            self._scripts[session.purpose].tools(session.user_id),
            max_seconds=self._settings.max_seconds[session.purpose],
            wrap_up_seconds=WRAP_UP_SECONDS,
            goodbye_grace_seconds=GOODBYE_GRACE_SECONDS,
        )

    def finished(self, call_id: str, call: LiveCall) -> None:
        """Stores how a call ended, what was said and what it used, then lets the call's script
        draw its conclusions (a placement test is assessed here)."""
        session = self._sessions.get(call_id)
        if session is None:
            return
        result = FinishedCall(
            ended_at=self._clock(),
            outcome=call.outcome or "closed",
            usage=dict(call.usage),
            turns=tuple(call.turns),
        )
        self._sessions.finish(call_id, result)
        self._scripts[session.purpose].concluded(session.user_id, call_id, call.tools, result)
