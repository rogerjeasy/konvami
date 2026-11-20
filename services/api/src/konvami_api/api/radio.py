"""Radio Konvami's routes and their shapes (section 8, `domain/radio.py`)."""

import datetime as dt
from collections.abc import Callable
from typing import Any, Literal
from uuid import UUID

from fastapi import APIRouter
from pydantic import Field

from konvami_api.api.auth import CurrentUser
from konvami_api.api.errors import ErrorBody
from konvami_api.api.schemas import MAX_SPOKEN_AUDIO, ApiModel, CardOut, RecordingIn
from konvami_api.domain.halves import Correction
from konvami_api.domain.radio import (
    APPLAUSE,
    CALL_SECONDS,
    REPORT_NOTE_MAX,
    CallView,
    EpisodeCard,
    EpisodeView,
    Overview,
    QueueItem,
    RadioService,
)

# The status of each refusal: not allowed (403), gone (404), a rule of the show (409), a wrong
# value (422), too many (429).
STATUS: dict[str, int] = {
    "unavailable": 403,
    "consent_required": 403,
    "suspended": 403,
    "not_owner": 403,
    "not_found": 404,
    "not_joined": 409,
    "closed": 409,
    "no_language": 409,
    "unsure": 409,
    "invalid_value": 422,
    "too_short": 422,
    "too_long": 422,
    "limit": 429,
}
REFUSED: dict[int | str, dict[str, Any]] = {
    code: {"model": ErrorBody} for code in sorted(set(STATUS.values()) | {503})
}

type CallStatusOut = Literal[
    "checking", "ready", "aired", "not_picked", "private", "held", "failed", "removed"
]
type ApplauseCard = Literal["bravo", "ha_ha", "me_too", "wow"]


class RadioProfileOut(ApiModel):
    codename: str
    band: Literal["adult", "minor"]
    veil_default: bool
    # Whether the learner agreed that other learners hear their calls (adults only).
    agreed: bool


class RadioCorrectionOut(ApiModel):
    original: str
    corrected: str
    explanation: str
    # False: the second check could not confirm it; shown as a possibility only.
    certain: bool

    @classmethod
    def of(cls, correction: Correction) -> "RadioCorrectionOut":
        return cls(
            original=correction.original,
            corrected=correction.corrected,
            explanation=correction.explanation,
            certain=correction.certain,
        )


class RadioCallOut(ApiModel):
    """One of the learner's own calls, privately (8.4)."""

    id: UUID
    episode_id: UUID
    day: dt.date
    question: str
    status: CallStatusOut
    transcript: str
    reasons: list[str]
    veiled: bool
    corrections: list[RadioCorrectionOut]
    aired_at: dt.datetime | None
    created_at: dt.datetime
    playable: bool

    @classmethod
    def of(cls, view: CallView) -> "RadioCallOut":
        return cls(
            id=view.id,
            episode_id=view.episode_id,
            day=view.day,
            question=view.question,
            status=view.status,
            transcript=view.transcript,
            reasons=list(view.reasons),
            veiled=view.veiled,
            corrections=[RadioCorrectionOut.of(c) for c in view.corrections],
            aired_at=view.aired_at,
            created_at=view.created_at,
            playable=view.playable,
        )


class RadioEpisodeCardOut(ApiModel):
    id: UUID
    day: dt.date
    question: str
    host: str
    callers: int
    # AI callers, always labelled as AI.
    ai_callers: int
    mine: bool
    airs_at: dt.datetime

    @classmethod
    def of(cls, card: EpisodeCard) -> "RadioEpisodeCardOut":
        return cls(
            id=card.id,
            day=card.day,
            question=card.question,
            host=card.host,
            callers=card.callers,
            ai_callers=card.ai_callers,
            mine=card.mine,
            airs_at=card.airs_at,
        )


class RadioNextShowOut(ApiModel):
    episode_id: UUID
    day: dt.date
    airs_at: dt.datetime
    question: str
    question_help: str
    my_call: RadioCallOut | None


class RadioOut(ApiModel):
    """The hub (8.1): whether the show is open to the learner, their profile, the show on air,
    the next show's question and their recent calls."""

    available: bool
    profile: RadioProfileOut | None
    language: str | None
    on_air: RadioEpisodeCardOut | None
    warming_up: bool
    next_show: RadioNextShowOut | None
    aired: RadioEpisodeCardOut | None
    calls: list[RadioCallOut]
    strikes: int
    suspended: bool
    # A call is at most this long.
    call_seconds: int

    @classmethod
    def of(cls, overview: Overview) -> "RadioOut":
        profile, upcoming = overview.profile, overview.next_show
        return cls(
            available=overview.available,
            profile=(
                RadioProfileOut(
                    codename=profile.codename,
                    band=profile.band,
                    veil_default=profile.veil_default,
                    agreed=profile.agreed,
                )
                if profile
                else None
            ),
            language=overview.language,
            on_air=RadioEpisodeCardOut.of(overview.on_air) if overview.on_air else None,
            warming_up=overview.warming_up,
            next_show=(
                RadioNextShowOut(
                    episode_id=upcoming.episode_id,
                    day=upcoming.day,
                    airs_at=upcoming.airs_at,
                    question=upcoming.question,
                    question_help=upcoming.question_help,
                    my_call=RadioCallOut.of(upcoming.my_call) if upcoming.my_call else None,
                )
                if upcoming
                else None
            ),
            aired=RadioEpisodeCardOut.of(overview.aired) if overview.aired else None,
            calls=[RadioCallOut.of(c) for c in overview.calls],
            strikes=overview.strikes,
            suspended=overview.suspended,
            call_seconds=CALL_SECONDS,
        )


class RadioArchiveOut(ApiModel):
    episodes: list[RadioEpisodeCardOut]


class RadioSegmentOut(ApiModel):
    index: int
    kind: Literal["host", "call", "ai_call"]
    speaker: str
    # The host and AI callers: always shown with the AI chip.
    ai: bool
    text: str
    playable: bool
    mine: bool
    # How many listeners gave each card, by the card's value.
    applause: dict[ApplauseCard, int]
    my_applause: ApplauseCard | None
    hidden: bool


class RadioEpisodeOut(ApiModel):
    id: UUID
    day: dt.date
    language: str
    question: str
    question_help: str
    host: str
    segments: list[RadioSegmentOut]
    airs_at: dt.datetime

    @classmethod
    def of(cls, view: EpisodeView) -> "RadioEpisodeOut":
        return cls(
            id=view.id,
            day=view.day,
            language=view.language,
            question=view.question,
            question_help=view.question_help,
            host=view.host,
            segments=[
                RadioSegmentOut(
                    index=s.index,
                    kind=s.kind,
                    speaker=s.speaker,
                    ai=s.ai,
                    text=s.text,
                    playable=s.playable,
                    mine=s.mine,
                    applause={card: s.applause.get(card, 0) for card in APPLAUSE},
                    my_applause=s.my_applause,  # type: ignore[arg-type]
                    hidden=s.hidden,
                )
                for s in view.segments
            ],
            airs_at=view.airs_at,
        )


class RadioJoinIn(ApiModel):
    veil_default: bool = True
    # The voice-sharing consent of 8.6 (record `radio_voice`, version 1): adults must give it.
    voice_consent: bool


class RadioChangeIn(ApiModel):
    veil_default: bool | None = None


class RadioCallIn(ApiModel):
    audio: str = Field(min_length=1, max_length=MAX_SPOKEN_AUDIO)
    format: str = Field(min_length=1, max_length=8)
    duration_ms: int | None = Field(default=None, ge=0, le=600_000)
    # Veil: the learner's exact words in a neutral voice. Null: their default.
    veiled: bool | None = None


class RadioApplauseIn(ApiModel):
    # Null takes the learner's card back.
    card: ApplauseCard | None


class RadioReportIn(ApiModel):
    reason: Literal["harassment", "sexual", "personal", "hate", "off_topic", "other"]
    note: str | None = Field(default=None, max_length=REPORT_NOTE_MAX)


class RadioDecisionIn(ApiModel):
    action: Literal["remove", "dismiss"]


class RadioAudioOut(ApiModel):
    # Works for five minutes.
    url: str


class RadioRetriedOut(ApiModel):
    heard: str
    right: bool
    original: str
    corrected: str


class RadioQueueItemOut(ApiModel):
    kind: Literal["held", "report"]
    id: UUID
    episode_id: UUID
    transcript: str
    reasons: list[str]
    speaker: str
    ai: bool
    reporter: str | None
    note: str | None
    band: Literal["adult", "minor"]
    day: dt.date
    created_at: dt.datetime

    @classmethod
    def of(cls, item: QueueItem) -> "RadioQueueItemOut":
        return cls(
            kind=item.kind,
            id=item.id,
            episode_id=item.episode_id,
            transcript=item.transcript,
            reasons=list(item.reasons),
            speaker=item.speaker,
            ai=item.ai,
            reporter=item.reporter,
            note=item.note,
            band=item.band,
            day=item.day,
            created_at=item.created_at,
        )


class RadioQueueOut(ApiModel):
    items: list[RadioQueueItemOut]


def radio_router(service: Callable[[], RadioService], recorded: Any) -> APIRouter:
    """The routes under /v1/radio. `service` gives the service when a request comes (the schema
    is exported without one); `recorded` decodes a recording (`app.recorded`)."""
    router = APIRouter(prefix="/radio", responses=REFUSED)

    @router.get("", operation_id="getRadio")
    def get_radio(user: CurrentUser) -> RadioOut:
        """The show's hub (8.1)."""
        return RadioOut.of(service().overview(user))

    @router.put("/profile", operation_id="joinRadio")
    def join_radio(user: CurrentUser, answers: RadioJoinIn) -> RadioOut:
        """Joins the show, or changes the join answers (8.6)."""
        service().join(user, veil_default=answers.veil_default, voice_consent=answers.voice_consent)
        return RadioOut.of(service().overview(user))

    @router.patch("/profile", operation_id="changeRadio")
    def change_radio(user: CurrentUser, changes: RadioChangeIn) -> RadioOut:
        service().change(user, veil_default=changes.veil_default)
        return RadioOut.of(service().overview(user))

    @router.post("/profile/codename", operation_id="rerollRadioCodename")
    def reroll_codename(user: CurrentUser) -> RadioOut:
        service().reroll(user)
        return RadioOut.of(service().overview(user))

    @router.delete("/profile", operation_id="leaveRadio", status_code=204)
    def leave_radio(user: CurrentUser) -> None:
        """Withdraws the voice-sharing consent and deletes the learner's calls (8.6)."""
        service().leave(user)

    @router.get("/episodes", operation_id="getRadioArchive")
    def get_archive(user: CurrentUser) -> RadioArchiveOut:
        """The last two weeks of shows (8.5)."""
        return RadioArchiveOut(
            episodes=[RadioEpisodeCardOut.of(card) for card in service().archive(user)]
        )

    @router.get("/episodes/{episode_id}", operation_id="getRadioEpisode")
    def get_episode(user: CurrentUser, episode_id: UUID) -> RadioEpisodeOut:
        """One show (8.2): its playlist, captions and applause."""
        return RadioEpisodeOut.of(service().episode(user, episode_id))

    @router.get(
        "/episodes/{episode_id}/segments/{index}/audio", operation_id="getRadioSegmentAudio"
    )
    def segment_audio(user: CurrentUser, episode_id: UUID, index: int) -> RadioAudioOut:
        return RadioAudioOut(url=service().segment_address(user, episode_id, index))

    @router.post(
        "/episodes/{episode_id}/segments/{index}/applause", operation_id="applaudRadioSegment"
    )
    def applaud(
        user: CurrentUser, episode_id: UUID, index: int, applause: RadioApplauseIn
    ) -> RadioEpisodeOut:
        """One of the four applause cards for a call, or none."""
        return RadioEpisodeOut.of(service().applaud(user, episode_id, index, applause.card))

    @router.post(
        "/episodes/{episode_id}/segments/{index}/report", operation_id="reportRadioSegment"
    )
    def report(
        user: CurrentUser, episode_id: UUID, index: int, report: RadioReportIn
    ) -> RadioEpisodeOut:
        """Reports a segment: hidden from the learner at once, and queued for the owner."""
        return RadioEpisodeOut.of(
            service().report(user, episode_id, index, report.reason, report.note)
        )

    @router.post("/calls", operation_id="sendRadioCall")
    def send_call(user: CurrentUser, call: RadioCallIn) -> RadioCallOut:
        """Calls in to the next show (8.3): written down at once, checked before anyone else
        hears it."""
        audio, seconds = recorded(call)
        made = service().call(user, audio, call.format, seconds, call.veiled)
        return RadioCallOut.of(service().my_call(user, made.id))

    @router.get("/calls/{call_id}", operation_id="getRadioCall")
    def get_call(user: CurrentUser, call_id: UUID) -> RadioCallOut:
        """One of the learner's calls, privately (8.4)."""
        return RadioCallOut.of(service().my_call(user, call_id))

    @router.get("/calls/{call_id}/audio", operation_id="getRadioCallAudio")
    def call_audio(user: CurrentUser, call_id: UUID) -> RadioAudioOut:
        return RadioAudioOut(url=service().call_address(user, call_id))

    @router.delete("/calls/{call_id}", operation_id="withdrawRadioCall", status_code=204)
    def withdraw_call(user: CurrentUser, call_id: UUID) -> None:
        """Takes a call back, also out of a show it aired in."""
        service().withdraw_call(user, call_id)

    @router.post(
        "/calls/{call_id}/corrections/{index}/retry", operation_id="sayRadioCorrectionBetter"
    )
    def say_better(
        user: CurrentUser, call_id: UUID, index: int, recording: RecordingIn
    ) -> RadioRetriedOut:
        """ "Say it better" on a confirmed correction of the learner's call."""
        audio, seconds = recorded(recording)
        retried = service().say_better(user, call_id, index, audio, recording.format, seconds)
        return RadioRetriedOut(
            heard=retried.heard,
            right=retried.right,
            original=retried.original,
            corrected=retried.corrected,
        )

    @router.post(
        "/calls/{call_id}/corrections/{index}/card", operation_id="saveRadioCorrectionCard"
    )
    def save_card(user: CurrentUser, call_id: UUID, index: int) -> CardOut:
        """Keeps a confirmed correction as a card."""
        return CardOut.of(service().save_card(user, call_id, index))

    @router.get("/queue", operation_id="getRadioQueue")
    def get_queue(user: CurrentUser) -> RadioQueueOut:
        """The owner's Radio queue (6.15): held calls and reports."""
        return RadioQueueOut(items=[RadioQueueItemOut.of(item) for item in service().queue(user)])

    @router.post("/queue/{kind}/{item_id}", operation_id="decideRadioItem", status_code=204)
    def decide(
        user: CurrentUser,
        kind: Literal["held", "report"],
        item_id: UUID,
        decision: RadioDecisionIn,
    ) -> None:
        service().decide(user, kind, item_id, decision.action)

    @router.post("/episodes/{episode_id}/pull", operation_id="pullRadioEpisode", status_code=204)
    def pull(user: CurrentUser, episode_id: UUID) -> None:
        """The owner takes a whole show off air."""
        service().pull(user, episode_id)

    return router
