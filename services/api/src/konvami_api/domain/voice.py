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
from konvami_api.domain.candidate_speech import CandidateSpeech
from konvami_api.domain.continuation import (
    ContinuationError,
    Continuations,
    aggregate,
    continuation_config,
)
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
    Speak,
    Spoken,
    Spot,
    Spotted,
    Turn,
    TurnAudio,
)
from konvami_api.domain.live_speech import LiveSpeech
from konvami_api.domain.plan import SessionPlan
from konvami_api.domain.speech import SpeechError
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
    # A simulated speaking exam (spec §6.13); its "scenario" is the exam's format.
    EXAM = "exam"


_FEATURES = {
    CallPurpose.ONBOARDING: Feature.VOICE_ONBOARDING,
    CallPurpose.PLACEMENT: Feature.VOICE_PLACEMENT,
    CallPurpose.PRACTICE: Feature.VOICE_PRACTICE,
    CallPurpose.EXAM: Feature.VOICE_EXAM,
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
    # A candidate thinks before answering, as in the language practised.
    CallPurpose.EXAM: {"type": "semantic_vad", "eagerness": "auto"},
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
    premium: bool = False
    # Explicit permission for this exam only; its original audio language is kept with it.
    assessment_consent: bool = False
    assessment_language: str | None = None


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
        practise: str | None = None,
    ) -> Briefing:
        """The persona's instructions for this learner. `persona_id` is the partner the app
        asked for, if any, `scenario` the role-play and `practise` a grammar topic the learner
        chose to practise. Raises if the call may not start now; changes nothing."""

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

    def address(self, audio: TurnAudio) -> str: ...

    def release(self, user_id: UUID, call_id: str) -> None: ...


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
        weekly_seconds: Callable[[UUID, dt.date], int] | None = None,
        live_speech: LiveSpeech | None = None,
        candidate_speech: CandidateSpeech | None = None,
        continuations: Continuations | None = None,
        current_language: Callable[[UUID], str | None] | None = None,
        assessment_provider: Callable[[UUID], str | None] | None = None,
    ) -> None:
        """Without a `guard` calls are never switched or stopped for spending; without a
        `meter` they are not metered; without a `checker` no turn is checked live. Without
        `weekly_seconds` (the learner and the week: the seconds the week allows them) every
        learner has the settings' minutes."""
        self._assessment_provider = assessment_provider
        self._continuations = continuations
        self._language = current_language
        self._speech = live_speech
        self._candidate_speech = candidate_speech
        self._weekly = weekly_seconds
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
        practise: str | None = None,
        premium: bool = False,
        assessment_consent: bool = False,
    ) -> CallStarted:
        """`local_date` is today on the learner's calendar, as their device has it; `scenario`
        makes a practice call a role-play; `practise` puts a grammar topic first in its plan."""
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
        if premium and (
            purpose != CallPurpose.PRACTICE
            or self._speech is None
            or not self._speech.available(user_id)
            or self._recordings is None
        ):
            raise VoiceError("voice_unavailable")
        if assessment_consent and (
            purpose is not CallPurpose.EXAM
            or self._recordings is None
            or self._assessment_provider is None
            or not self._assessment_provider(user_id)
        ):
            raise VoiceError("voice_unavailable")
        now = self._clock()
        level = self._guard.level() if self._guard else Level.NORMAL
        if level is Level.PAUSED:
            raise VoiceError("voice_paused")
        if level is Level.ECONOMY:
            model = self._settings.economy_models.get(purpose, model)

        briefing = script.prepare(
            user_id, account, _today(now, local_date), persona_id, scenario, practise
        )
        output: dict[str, Any] = {"voice": briefing.voice or self._settings.voice}
        if briefing.speed is not None:
            output["speed"] = briefing.speed
        session: dict[str, Any] = {
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

        if premium:
            session["output_modalities"] = ["text"]
            session["audio"].pop("output")
            session["instructions"] += (
                "\nYour text replies are spoken aloud by the learner's selected premium voice. "
                "Write natural spoken sentences without markdown. System notes starting "
                "premium_audio are delivery receipts; ignore them and never read their URLs."
            )
        week = week_start(now).date()
        weekly = self._weekly_seconds(user_id, week)
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
                    "",
                    user_id,
                    purpose,
                    model,
                    now,
                    persona_id,
                    scenario,
                    granted,
                    briefing.plan,
                    premium,
                    assessment_consent,
                    briefing.hearing.language if assessment_consent and briefing.hearing else None,
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
            if call.purpose is CallPurpose.PRACTICE and self._continuations is not None:
                self._continuations.register(
                    created.call_id,
                    call.user_id,
                    self._language(call.user_id) or "" if self._language else "",
                    session,
                    call.started_at,
                    call.max_seconds or 0,
                )
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
            weekly_seconds=self._weekly_seconds(user_id, start.date()),
            used_seconds=self._sessions.seconds_used(user_id, start.date()),
            resets_at=start + WEEK,
        )

    def _weekly_seconds(self, user_id: UUID, week: dt.date) -> int:
        """The seconds `week` allows this learner altogether (their plan, spec §6.21.2)."""
        if self._weekly is None:
            return self._settings.weekly_seconds
        return self._weekly(user_id, week)

    def live_call(self, call_id: str) -> LiveCall | None:
        """The server's side of a recorded call, with the tools of the learner it belongs to."""
        session = self._session(call_id)
        if session is None:
            return None
        tools = self._scripts[session.purpose].tools(session.user_id, session.scenario)
        maximum = session.max_seconds or self._settings.max_seconds[session.purpose]
        if self._continuations is not None:
            linked = self._continuations.get(call_id)
            if linked is not None:
                self._restore_goals(tools, aggregate(tuple(linked.segments)).goals)
                maximum = min(
                    maximum, max(0, int((linked.deadline - self._clock()).total_seconds()))
                )
        return LiveCall(
            tools,
            max_seconds=maximum,
            wrap_up_seconds=WRAP_UP_SECONDS,
            goodbye_grace_seconds=GOODBYE_GRACE_SECONDS,
            record=self._recordings is not None
            and (
                session.purpose in _RECORDED
                or (session.purpose is CallPurpose.EXAM and session.assessment_consent)
            ),
            spot=self._checker is not None and self._checker.for_call(session) is not None,
            premium=session.premium,
        )

    def speaker(self, call_id: str) -> Callable[[Speak], Spoken] | None:
        session = self._session(call_id)
        if session is None:
            return None
        candidate = session.purpose is CallPurpose.EXAM
        speech = self._candidate_speech if candidate else self._speech if session.premium else None
        recordings = self._recordings
        if speech is None or recordings is None:
            return None

        def speak(turn: Speak) -> Spoken:
            if (turn.role == "candidate") != candidate:
                raise SpeechError("unexpected speech role")
            pcm = speech.speak(session.user_id, turn.text)
            audio = recordings.keep(
                session.user_id,
                self._root(call_id),
                KeepAudio(self._audio_id(call_id, turn.item_id), "persona", pcm),
            )
            return Spoken(turn.item_id, turn.text, audio, recordings.address(audio))

        return speak

    def spotter(self, call_id: str) -> Callable[[Spot], Spotted] | None:
        """Checks one of the learner's turns of a call; None for a call whose turns are not."""
        session = self._session(call_id)
        if session is None or self._checker is None:
            return None
        return self._checker.for_call(session)

    def audio_keeper(self, call_id: str) -> Callable[[KeepAudio], TurnAudio] | None:
        """Stores the audio of one turn of a recorded call; None for a call that is not."""
        session = self._session(call_id)
        recordings = self._recordings
        if (
            session is None
            or recordings is None
            or not (
                session.purpose in _RECORDED
                or (session.purpose is CallPurpose.EXAM and session.assessment_consent)
            )
        ):
            return None
        user_id = session.user_id
        return lambda audio: recordings.keep(
            user_id,
            self._root(call_id),
            replace(audio, item_id=self._audio_id(call_id, audio.item_id)),
        )

    def finished(self, call_id: str, call: LiveCall) -> None:
        """Stores how a call ended, what was said and what it used, then lets the call's script
        draw its conclusions (a placement test is assessed here)."""
        session = self._session(call_id)
        if session is None:
            return
        result = FinishedCall(
            ended_at=self._clock(),
            outcome=call.outcome or "closed",
            usage=dict(call.usage),
            turns=tuple(call.turns),
        )
        if self._continuations is not None and self._continuations.get(call_id) is not None:
            goals = tuple(getattr(call.tools, "reached", ()))
            self._continuations.close(
                call_id, result.ended_at, result.outcome, result.usage, result.turns, goals
            )
            self.finish_pending(call_id)
            return
        seconds = max(0, int((result.ended_at - session.started_at).total_seconds()))
        self._conclude(session, result, call.tools, seconds)

    def _conclude(
        self, session: VoiceSession, result: FinishedCall, tools: ToolSet, seconds: int
    ) -> None:
        call_id = session.call_id
        # A call is concluded once: its unused time is given back, and it is metered, once.
        if not self._sessions.finish(call_id, result):
            return
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
        queued = False
        try:
            self._scripts[session.purpose].concluded(session.user_id, call_id, tools, result)
            queued = True
        finally:
            if (
                session.purpose is CallPurpose.EXAM
                and (not session.assessment_consent or not queued)
                and self._recordings
            ):
                self._recordings.release(session.user_id, call_id)

    def _session(self, call_id: str) -> VoiceSession | None:
        session = self._sessions.get(call_id)
        if session is not None or self._continuations is None:
            return session
        linked = self._continuations.get(call_id)
        if linked is None:
            return None
        root = self._sessions.get(linked.root_id)
        segment = next((item for item in linked.segments if item.call_id == call_id), None)
        if root is None or segment is None:
            return None
        return replace(
            root, call_id=call_id, started_at=segment.started_at, max_seconds=segment.max_seconds
        )

    def _root(self, call_id: str) -> str:
        linked = self._continuations.get(call_id) if self._continuations else None
        return linked.root_id if linked else call_id

    def _audio_id(self, call_id: str, item_id: str) -> str:
        # Provider item IDs are unique within one transport, not guaranteed across transports.
        linked = self._continuations.get(call_id) if self._continuations else None
        return f"{call_id}_{item_id}" if linked else item_id

    @staticmethod
    def _restore_goals(tools: ToolSet, goals: tuple[str, ...]) -> None:
        restore = getattr(tools, "restore_goals", None)
        if restore is not None:
            restore(goals)

    def continue_call(
        self, user_id: UUID, root_id: str, attempt_id: str, sdp_offer: str
    ) -> CallStarted:
        ledger = self._continuations
        linked = ledger.get(root_id) if ledger else None
        session = self._sessions.get(root_id)
        if (
            ledger is None
            or linked is None
            or session is None
            or linked.root_id != root_id
            or linked.user_id != user_id
            or session.purpose is not CallPurpose.PRACTICE
        ):
            raise VoiceError("continuation_unavailable")
        try:
            account = self._accounts.get(user_id)
        except AccountNotFound as error:
            raise VoiceError("not_authenticated") from error
        if not account.voice_consent:
            raise VoiceError("consent_required")
        if self._guard and self._guard.level() is Level.PAUSED:
            raise VoiceError("voice_paused")
        if self._language and self._language(user_id) != linked.language:
            raise VoiceError("continuation_unavailable")
        if session.premium and (self._speech is None or not self._speech.available(user_id)):
            raise VoiceError("voice_unavailable")
        try:
            attempt = ledger.begin(
                root_id,
                user_id,
                attempt_id,
                hashlib.sha256(sdp_offer.encode()).hexdigest(),
                self._clock(),
            )
            if attempt.status == "ready" and attempt.answer is not None:
                return CallStarted(
                    root_id,
                    attempt.answer,
                    max(0, int((linked.deadline - self._clock()).total_seconds())),
                    session.plan,
                )
            if linked.current.ended_at is None:
                self._provider.hang_up(linked.current.call_id)
            claimed = ledger.creating(root_id, attempt_id, self._clock())
        except ContinuationError as error:
            raise VoiceError(error.code) from error
        created: CreatedCall | None = None
        try:
            created = self._provider.create_call(
                sdp_offer,
                continuation_config(claimed.config, tuple(claimed.segments)),
                hashlib.sha256(str(user_id).encode()).hexdigest(),
            )
            if not ledger.connected(
                root_id, attempt_id, created.call_id, created.sdp_answer, self._clock()
            ):
                raise VoiceError("continuation_unavailable")
            self._starter.start(created.call_id, user_id, CallPurpose.PRACTICE)
        except Exception as error:
            # A timed-out create is ambiguous: never repeat it automatically as another call.
            if created is not None:
                self._provider.hang_up(created.call_id)
            ledger.failed(root_id, attempt_id)
            if created is not None:
                # No worker will persist a segment whose worker could not be launched.
                current = ledger.get(root_id)
                if current is not None and current.current.call_id == created.call_id:
                    ledger.close(created.call_id, self._clock(), "closed", {}, (), ())
                    self.finish_pending(created.call_id)
            self.finish_pending(linked.current.call_id)
            raise VoiceError("voice_unavailable") from error
        return CallStarted(
            root_id,
            created.sdp_answer,
            max(0, int((claimed.deadline - self._clock()).total_seconds())),
            session.plan,
        )

    def end_call(self, user_id: UUID, root_id: str) -> None:
        if self._continuations is None:
            raise VoiceError("continuation_unavailable")
        try:
            active_id = self._continuations.end(root_id, user_id)
        except ContinuationError as error:
            raise VoiceError(error.code) from error
        self._provider.hang_up(active_id)
        self.finish_pending(active_id)

    def finish_pending(self, call_id: str) -> bool:
        """True while this worker owns a closed segment's recovery grace period."""
        ledger = self._continuations
        linked = ledger.get(call_id) if ledger else None
        if (
            ledger is None
            or linked is None
            or linked.current.call_id != call_id
            or linked.state == "done"
            or linked.current.ended_at is None
        ):
            return False
        final = ledger.finalize(call_id, self._clock())
        if final is None:
            return True
        session = self._sessions.get(final.root_id)
        if session is None:
            return False
        joined = aggregate(tuple(final.segments))
        tools = self._scripts[session.purpose].tools(session.user_id, session.scenario)
        self._restore_goals(tools, joined.goals)
        result = FinishedCall(
            final.current.ended_at or self._clock(),
            final.current.outcome or "closed",
            joined.usage,
            joined.turns,
        )
        # Each phase is independently idempotent. A stored transcript alone must not mean
        # that its refund, metering and report handoff succeeded.
        result = replace(result, usage={**result.usage, "connected_seconds": joined.seconds})
        self._sessions.finish(final.root_id, result)
        ledger.repository.refund(
            final.root_id,
            session.user_id,
            week_start(session.started_at).date(),
            max(0, (session.max_seconds or joined.seconds) - joined.seconds),
        )
        if self._meter is not None:
            self._meter.record_once(
                Charge(session.user_id, _FEATURES[session.purpose]),
                self._provider.name,
                session.model,
                voice_units(result.usage, joined.seconds),
                f"voice:{final.root_id}",
            )
        script = self._scripts[session.purpose]
        conclude = getattr(script, "conclude_linked", script.concluded)
        conclude(session.user_id, final.root_id, tools, result)
        ledger.done(final.root_id)
        return False
