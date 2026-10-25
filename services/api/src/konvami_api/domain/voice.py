"""Starting and following live voice calls (spec §10.2: backend-brokered WebRTC).

The app sends its WebRTC offer here. The backend checks that the learner may call, creates the
call at the voice provider with the server's key and the persona's server-owned instructions and
tools, and returns the answer. Audio then flows directly between the device and the provider;
the server follows the call through `LiveCall`.
"""

import datetime as dt
import hashlib
from collections.abc import Callable, Mapping
from dataclasses import dataclass, field, replace
from enum import StrEnum
from typing import Any, Protocol
from uuid import UUID

from konvami_api.domain.accounts import Account, AccountDirectory, AccountNotFound
from konvami_api.domain.costs import (
    Allowance,
    Charge,
    Feature,
    Level,
    Meter,
    SpendGuard,
    week_start,
)
from konvami_api.domain.live_call import (
    KeepAudio,
    LiveCall,
    Outcome,
    Spot,
    Spotted,
    Turn,
    TurnAudio,
)
from konvami_api.domain.plan import SessionPlan
from konvami_api.domain.tools import ToolSet

# Seconds before the limit at which the persona is told to wrap up.
WRAP_UP_SECONDS = 45
# Seconds a goodbye may still play before the call is ended.
GOODBYE_GRACE_SECONDS = 8
# The least time worth starting a call with: below it the learner's minutes count as used up.
MIN_CALL_SECONDS = 60
WEEK = dt.timedelta(days=7)


class CallPurpose(StrEnum):
    ONBOARDING = "onboarding"
    PLACEMENT = "placement"
    # A conversation with one of the learner's partners.
    PRACTICE = "practice"


_FEATURES = {
    CallPurpose.ONBOARDING: Feature.VOICE_ONBOARDING,
    CallPurpose.PLACEMENT: Feature.VOICE_PLACEMENT,
    CallPurpose.PRACTICE: Feature.VOICE_PRACTICE,
}


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
    # Each learner's voice minutes per week (spec §6.19), as seconds, for calls of every purpose.
    weekly_seconds: int
    # The cheaper voice model per purpose, used once the month's spend passes the target. A
    # purpose without one keeps its model.
    economy_models: Mapping[CallPurpose, str] = field(default_factory=dict)


@dataclass(frozen=True)
class CreatedCall:
    call_id: str
    sdp_answer: str


@dataclass(frozen=True)
class CallStarted:
    call_id: str
    sdp_answer: str
    max_seconds: int
    # What a practice conversation sets out to practise (for the app to show); None otherwise.
    plan: SessionPlan | None = None


@dataclass(frozen=True)
class VoiceSession:
    call_id: str
    user_id: UUID
    purpose: CallPurpose
    model: str
    started_at: dt.datetime
    # The partner of a practice call; None for the guide's calls.
    persona_id: UUID | None = None
    # The role-play of a practice call (a language pack's scenario id); None for free talk.
    scenario: str | None = None
    # The longest the call may last, as granted when it started (the learner's minutes left
    # could make it shorter than the purpose's own limit). None for calls from before then.
    max_seconds: int | None = None
    # What a practice conversation set out to practise; None for the guide's calls and for
    # calls from before plans.
    plan: SessionPlan | None = None


@dataclass(frozen=True)
class Hearing:
    """How the live transcription is to write down the learner: the language they speak (an
    ISO 639-1 code) and to keep their mistakes. Told both, it keeps more of them
    (docs/evals/2026-10-25-verbatim-fidelity.md)."""

    language: str
    prompt: str


@dataclass(frozen=True)
class Briefing:
    """What a call's persona is told, and the voice they speak with."""

    instructions: str
    # None: the guide's voice from the settings.
    voice: str | None = None
    # How fast they speak, as a multiple of the voice's own pace; None for that pace.
    speed: float | None = None
    # What a practice conversation sets out to practise; None for the guide's calls.
    plan: SessionPlan | None = None
    # None: the learner speaks their own language (the setup), written down as it comes.
    hearing: Hearing | None = None


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
    # Who is paid for the calls ("openai"), for metering.
    name: str

    def create_call(
        self, sdp_offer: str, session: dict[str, Any], safety_identifier: str
    ) -> CreatedCall:
        """Creates the call and returns the provider's SDP answer. Raises `VoiceProviderError`."""

    def hang_up(self, call_id: str) -> None: ...


class CallScript(Protocol):
    """What one kind of call says, can do and leaves behind (the setup, the placement test)."""

    def prepare(
        self,
        user_id: UUID,
        account: Account,
        today: dt.date,
        persona_id: UUID | None,
        scenario: str | None = None,
    ) -> Briefing:
        """The persona's instructions for this learner. `persona_id` is the partner the app
        asked for, if any, and `scenario` the role-play. Raises if the call may not start now;
        changes nothing."""

    def tools(self, user_id: UUID, scenario: str | None = None) -> ToolSet:
        """Fresh tools for one call."""

    def started(self, user_id: UUID) -> None:
        """The call exists."""

    def concluded(self, user_id: UUID, call_id: str, tools: ToolSet, call: "FinishedCall") -> None:
        """The call is over and stored under `call_id`; `tools` are the ones it used."""


class CallStarter(Protocol):
    def start(self, call_id: str, user_id: UUID, purpose: CallPurpose) -> None:
        """Starts the server's side of a call (the worker that joins it)."""


class AudioStore(Protocol):
    """Where the audio of a recorded call's turns is kept (`RecordingService`)."""

    def keep(self, user_id: UUID, call_id: str, audio: KeepAudio) -> TurnAudio: ...


class TurnChecker(Protocol):
    """Checks the learner's turns during a call (the Live Error Spotter, `spotter.py`)."""

    def for_call(self, session: VoiceSession) -> Callable[[Spot], Spotted] | None:
        """The check for each turn of this call; None when its turns are not checked."""


# Which calls are recorded (spec §6.6): the conversations the learner finds in the library.
_RECORDED = frozenset({CallPurpose.PRACTICE})


class VoiceSessionRepository(Protocol):
    def started(self, session: VoiceSession) -> None: ...

    def get(self, call_id: str) -> VoiceSession | None: ...

    def reserve_seconds(
        self, user_id: UUID, week: dt.date, weekly: int, least: int, most: int
    ) -> int:
        """Grants a call of the learner's `week` up to `most` seconds of what is left of
        `weekly`, and counts them as used. Grants nothing, and changes nothing, when less than
        `least` is left. One step: calls started together cannot be granted the same seconds."""

    def release_seconds(self, user_id: UUID, week: dt.date, seconds: int) -> None:
        """Gives back granted seconds a call did not use."""

    def seconds_used(self, user_id: UUID, week: dt.date) -> int: ...

    def finish(self, call_id: str, result: FinishedCall) -> bool:
        """Ends the call with its result, once. True only when this ended it: False for an
        unknown call or one that had already ended (whose first result stays)."""

    def goals_reached(self, call_id: str, goals: tuple[str, ...]) -> None:
        """The role-play goals the learner reached in a call."""


def voice_units(usage: Mapping[str, int], seconds: int) -> dict[str, int]:
    """A call's usage as the units it is priced by, with its length (unpriced, for the owner's
    view). Cached input tokens are billed instead of, not on top of, the uncached ones. Calls
    from before the cached split was kept count their cached tokens as text first: the higher
    estimate, as audio costs more."""
    text = usage.get("input_text_tokens", 0)
    audio = usage.get("input_audio_tokens", 0)
    if "cached_input_text_tokens" in usage:
        cached_text = usage["cached_input_text_tokens"]
        cached_audio = usage.get("cached_input_audio_tokens", 0)
    else:
        cached = usage.get("cached_input_tokens", 0)
        cached_text = min(cached, text)
        cached_audio = cached - cached_text
    return {
        "input_text_tokens": max(0, text - cached_text),
        "input_audio_tokens": max(0, audio - cached_audio),
        "cached_input_text_tokens": cached_text,
        "cached_input_audio_tokens": cached_audio,
        "output_text_tokens": usage.get("output_text_tokens", 0),
        "output_audio_tokens": usage.get("output_audio_tokens", 0),
        "call_seconds": seconds,
    }


def _transcription(model: str, hearing: Hearing | None) -> dict[str, str]:
    if hearing is None:
        return {"model": model}
    return {"model": model, "language": hearing.language, "prompt": hearing.prompt}


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
        recordings: AudioStore | None = None,
        guard: SpendGuard | None = None,
        meter: Meter | None = None,
        checker: TurnChecker | None = None,
    ) -> None:
        """Without a `guard` calls are never switched or stopped for spending; without a
        `meter` they are not metered; without a `checker` no turn is checked live."""
        self._settings = settings
        self._checker = checker
        self._guard = guard
        self._meter = meter
        self._recordings = recordings
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
        scenario: str | None = None,
    ) -> CallStarted:
        """`local_date` is today on the learner's calendar, as their device has it; `scenario`
        makes a practice call a role-play."""
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
        level = self._guard.level() if self._guard else Level.NORMAL
        if level is Level.PAUSED:
            raise VoiceError("voice_paused")
        if level is Level.ECONOMY:
            model = self._settings.economy_models.get(purpose, model)

        briefing = script.prepare(user_id, account, _today(now, local_date), persona_id, scenario)
        output: dict[str, Any] = {"voice": briefing.voice or self._settings.voice}
        if briefing.speed is not None:
            output["speed"] = briefing.speed
        session = {
            "type": "realtime",
            "model": model,
            "instructions": briefing.instructions,
            "tools": script.tools(user_id, scenario).definitions(),
            "tool_choice": "auto",
            "audio": {
                "input": {
                    "transcription": _transcription(
                        self._settings.transcription_model, briefing.hearing
                    ),
                    "turn_detection": _TURN_DETECTION[purpose],
                },
                "output": output,
            },
        }

        week = week_start(now).date()
        weekly = self._settings.weekly_seconds
        granted = (
            self._sessions.reserve_seconds(user_id, week, weekly, MIN_CALL_SECONDS, max_seconds)
            if weekly >= MIN_CALL_SECONDS
            else 0
        )
        if not granted:
            raise VoiceError("minutes_used_up")
        try:
            created = self._create(
                VoiceSession(
                    "", user_id, purpose, model, now, persona_id, scenario, granted, briefing.plan
                ),
                sdp_offer,
                session,
            )
        except BaseException:
            # The call did not start: its time is the learner's again.
            self._sessions.release_seconds(user_id, week, granted)
            raise
        script.started(user_id)
        return CallStarted(created.call_id, created.sdp_answer, granted, briefing.plan)

    def _create(self, call: VoiceSession, sdp_offer: str, session: dict[str, Any]) -> CreatedCall:
        """Creates the call at the provider, records it and starts its server side; a call
        whose server side cannot start is hung up."""
        # The provider asks for a stable id per end user for abuse handling; it gets a hash.
        safety_identifier = hashlib.sha256(str(call.user_id).encode()).hexdigest()
        try:
            created = self._provider.create_call(sdp_offer, session, safety_identifier)
        except VoiceProviderError as error:
            raise VoiceError("voice_unavailable") from error

        self._sessions.started(replace(call, call_id=created.call_id))
        try:
            self._starter.start(created.call_id, call.user_id, call.purpose)
        except Exception as error:
            # Without its server side the persona's tools would do nothing: end the call.
            self._provider.hang_up(created.call_id)
            raise VoiceError("voice_unavailable") from error
        return created

    def allowance(self, user_id: UUID) -> Allowance:
        """The learner's voice minutes this week."""
        start = week_start(self._clock())
        return Allowance(
            weekly_seconds=self._settings.weekly_seconds,
            used_seconds=self._sessions.seconds_used(user_id, start.date()),
            resets_at=start + WEEK,
        )

    def live_call(self, call_id: str) -> LiveCall | None:
        """The server's side of a recorded call, with the tools of the learner it belongs to."""
        session = self._sessions.get(call_id)
        if session is None:
            return None
        return LiveCall(
            self._scripts[session.purpose].tools(session.user_id, session.scenario),
            max_seconds=session.max_seconds or self._settings.max_seconds[session.purpose],
            wrap_up_seconds=WRAP_UP_SECONDS,
            goodbye_grace_seconds=GOODBYE_GRACE_SECONDS,
            record=self._recordings is not None and session.purpose in _RECORDED,
            spot=self._checker is not None and self._checker.for_call(session) is not None,
        )

    def spotter(self, call_id: str) -> Callable[[Spot], Spotted] | None:
        """Checks one of the learner's turns of a call; None for a call whose turns are not."""
        session = self._sessions.get(call_id)
        if session is None or self._checker is None:
            return None
        return self._checker.for_call(session)

    def audio_keeper(self, call_id: str) -> Callable[[KeepAudio], TurnAudio] | None:
        """Stores the audio of one turn of a recorded call; None for a call that is not."""
        session = self._sessions.get(call_id)
        recordings = self._recordings
        if session is None or recordings is None or session.purpose not in _RECORDED:
            return None
        user_id = session.user_id
        return lambda audio: recordings.keep(user_id, call_id, audio)

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
        # A call is concluded once: its unused time is given back, and it is metered, once.
        if not self._sessions.finish(call_id, result):
            return
        seconds = max(0, int((result.ended_at - session.started_at).total_seconds()))
        if session.max_seconds is not None and seconds < session.max_seconds:
            week = week_start(session.started_at).date()
            self._sessions.release_seconds(session.user_id, week, session.max_seconds - seconds)
        if self._meter is not None:
            self._meter.record(
                Charge(session.user_id, _FEATURES[session.purpose]),
                self._provider.name,
                session.model,
                voice_units(result.usage, seconds),
            )
        self._scripts[session.purpose].concluded(session.user_id, call_id, call.tools, result)
