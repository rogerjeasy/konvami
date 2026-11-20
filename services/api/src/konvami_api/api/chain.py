"""The story chain's routes and their shapes (section 9, `domain/chain.py`)."""

import datetime as dt
from collections.abc import Callable
from typing import Any, Literal
from uuid import UUID

from fastapi import APIRouter
from pydantic import Field

from konvami_api.api.auth import CurrentUser
from konvami_api.api.errors import ErrorBody
from konvami_api.api.halves import HalvesCorrectionOut, HalvesQueueItemOut, HalvesQueueOut
from konvami_api.api.schemas import MAX_SPOKEN_AUDIO, ApiModel
from konvami_api.domain.chain import (
    LINE_SECONDS,
    LINES,
    REACTIONS,
    ChainOverview,
    ChainProfile,
    ChainService,
    Heard,
    Line,
    SeatLabel,
    StorySummary,
    StoryView,
)
from konvami_api.domain.halves import REPORT_NOTE_MAX

# The status of each refusal: a rule of the game (409), not allowed (403), a wrong value (422).
STATUS: dict[str, int] = {
    "unavailable": 403,
    "consent_required": 403,
    "suspended": 403,
    "adults_only": 403,
    "not_owner": 403,
    "not_host": 403,
    "not_found": 404,
    "not_joined": 409,
    "partner_not_joined": 409,
    "not_your_turn": 409,
    "not_ready": 409,
    "no_empty_seat": 409,
    "too_many_stories": 409,
    "paused": 409,
    "own_code": 409,
    "no_shared_language": 409,
    "no_language": 409,
    "unsure": 409,
    "invalid_value": 422,
    "too_short": 422,
    "too_long": 422,
    "limit": 429,
    "retry_limit": 429,
}
REFUSED: dict[int | str, dict[str, Any]] = {
    code: {"model": ErrorBody} for code in sorted(set(STATUS.values()) | {503})
}

type ModeOut = Literal["solo", "friends"]
type StatusOut = Literal["open", "finishing", "done"]
type LineStatusOut = Literal["checking", "delivered", "held", "failed", "removed"]
type ReactionOut = Literal["laughed", "surprised", "loved", "encore"]


class ChainProfileOut(ApiModel):
    codename: str
    band: Literal["adult", "minor"]
    veil_default: bool
    paused: bool
    strikes: int
    suspended: bool

    @classmethod
    def of(cls, profile: ChainProfile) -> "ChainProfileOut":
        return cls(
            codename=profile.codename,
            band=profile.band,
            veil_default=profile.veil_default,
            paused=profile.paused,
            strikes=profile.strikes,
            suspended=profile.suspended,
        )


class ChainSeatOut(ApiModel):
    seat: int
    # Empty for a seat waiting for a friend.
    name: str
    # An AI character: always shown with the AI chip.
    ai: bool
    me: bool
    state: Literal["playing", "waiting", "taken_over"]
    lines: int

    @classmethod
    def of(cls, seat: SeatLabel) -> "ChainSeatOut":
        return cls(
            seat=seat.seat,
            name=seat.name,
            ai=seat.ai,
            me=seat.me,
            state=seat.state,
            lines=seat.lines,
        )


class ChainStorySummaryOut(ApiModel):
    id: UUID
    opening_id: str
    genre: str
    title: str
    mode: ModeOut
    status: StatusOut
    next: Literal["record", "wait", "listen", "done"]
    position: int
    seats: list[ChainSeatOut]
    created_at: dt.datetime

    @classmethod
    def of(cls, story: StorySummary) -> "ChainStorySummaryOut":
        return cls(
            id=story.id,
            opening_id=story.opening_id,
            genre=story.genre,
            title=story.title,
            mode=story.mode,
            status=story.status,
            next=story.next,
            position=story.position,
            seats=[ChainSeatOut.of(s) for s in story.seats],
            created_at=story.created_at,
        )


class ChainOpeningOut(ApiModel):
    id: str
    genre: str
    title: str


class ChainDuoOut(ApiModel):
    id: UUID
    codename: str


class ChainBlockOut(ApiModel):
    id: UUID
    codename: str


class ChainOut(ApiModel):
    """The hub (9.1): whether the story chain is open to the learner, their profile, stories,
    the openings to start one from, duos to seat and the learners they blocked."""

    available: bool
    profile: ChainProfileOut | None
    stories: list[ChainStorySummaryOut]
    openings: list[ChainOpeningOut]
    duos: list[ChainDuoOut]
    blocks: list[ChainBlockOut]
    lines: int
    line_seconds: int

    @classmethod
    def of(cls, overview: ChainOverview) -> "ChainOut":
        return cls(
            available=overview.available,
            profile=ChainProfileOut.of(overview.profile) if overview.profile else None,
            stories=[ChainStorySummaryOut.of(s) for s in overview.stories],
            openings=[
                ChainOpeningOut(id=o.id, genre=o.genre, title=o.title) for o in overview.openings
            ],
            duos=[ChainDuoOut(id=d.id, codename=d.codename) for d in overview.duos],
            blocks=[ChainBlockOut(id=b.id, codename=b.codename) for b in overview.blocks],
            lines=LINES,
            line_seconds=LINE_SECONDS,
        )


class ChainJoinIn(ApiModel):
    veil_default: bool = True
    # The voice-sharing consent of 9.2 (record `chain_voice` version 1): must be true.
    voice_consent: bool


class ChainProfileChangeIn(ApiModel):
    veil_default: bool | None = None
    paused: bool | None = None


class ChainSeatIn(ApiModel):
    kind: Literal["ai", "friend", "duo"]
    duo_id: UUID | None = None


class ChainStartIn(ApiModel):
    # None: an opening picked at random.
    opening_id: str | None = Field(default=None, max_length=40)
    # Who sits in seats 2 to 4.
    seats: list[ChainSeatIn] = Field(min_length=3, max_length=3)


class ChainRedeemIn(ApiModel):
    code: str = Field(min_length=4, max_length=16)


class ChainLineIn(ApiModel):
    audio: str = Field(min_length=1, max_length=MAX_SPOKEN_AUDIO)
    format: str = Field(min_length=1, max_length=8)
    duration_ms: int | None = Field(default=None, ge=0, le=600_000)
    # Veil: the learner's exact words in a neutral voice. Null: their default.
    veiled: bool | None = None


class ChainRetryIn(ApiModel):
    audio: str = Field(min_length=1, max_length=MAX_SPOKEN_AUDIO)
    format: str = Field(min_length=1, max_length=8)
    duration_ms: int | None = Field(default=None, ge=0, le=600_000)


class ChainReactionIn(ApiModel):
    reaction: ReactionOut


class ChainBlockIn(ApiModel):
    seat: int = Field(ge=1, le=4)


class ChainReportIn(ApiModel):
    reason: Literal["harassment", "sexual", "personal", "hate", "off_topic", "other"]
    note: str | None = Field(default=None, max_length=REPORT_NOTE_MAX)


class ChainDecisionIn(ApiModel):
    action: Literal["remove", "dismiss"]


class ChainHeardOut(ApiModel):
    kind: Literal["narrator", "line"]
    id: UUID | None
    name: str
    ai: bool
    # The words, shown only when the learner asks for them: listening comes first.
    text: str
    recap: str | None
    hidden: bool
    has_audio: bool

    @classmethod
    def of(cls, heard: Heard) -> "ChainHeardOut":
        return cls(
            kind=heard.kind,
            id=heard.id,
            name=heard.name,
            ai=heard.ai,
            text="" if heard.hidden else heard.text,
            recap=heard.recap,
            hidden=heard.hidden,
            has_audio=heard.has_audio,
        )


class ChainMineOut(ApiModel):
    id: UUID
    position: int
    status: LineStatusOut
    transcript: str
    reasons: list[str]
    veiled: bool
    corrections: list[HalvesCorrectionOut]
    before: ChainHeardOut | None


class ChainPlayOut(ApiModel):
    index: int
    kind: Literal["narrator", "line"]
    name: str
    ai: bool
    mine: bool
    text: str
    position: int
    line_id: UUID | None
    has_audio: bool
    hidden: bool


class ChainStoryOut(ApiModel):
    """A story as one seat may know it (9.4 to 9.7): only what that seat may hear."""

    id: UUID
    opening_id: str
    genre: str
    title: str
    language: str
    mode: ModeOut
    status: StatusOut
    my_seat: int
    host: bool
    position: int
    turn_seat: int | None
    my_turn: bool
    seats: list[ChainSeatOut]
    before: ChainHeardOut | None
    mine: list[ChainMineOut]
    play: list[ChainPlayOut]
    play_status: Literal["none", "pending", "ready", "failed"]
    reactions: dict[str, int]
    my_reaction: ReactionOut | None
    veil_default: bool
    invite_code: str | None
    invite_expires_at: dt.datetime | None
    can_fill: bool
    lines: int

    @classmethod
    def of(cls, view: StoryView) -> "ChainStoryOut":
        reaction = view.my_reaction if view.my_reaction in REACTIONS else None
        return cls(
            id=view.id,
            opening_id=view.opening_id,
            genre=view.genre,
            title=view.title,
            language=view.language,
            mode=view.mode,
            status=view.status,
            my_seat=view.my_seat,
            host=view.host,
            position=view.position,
            turn_seat=view.turn_seat,
            my_turn=view.my_turn,
            seats=[ChainSeatOut.of(s) for s in view.seats],
            before=ChainHeardOut.of(view.before) if view.before else None,
            mine=[
                ChainMineOut(
                    id=m.id,
                    position=m.position,
                    status=m.status,
                    transcript=m.transcript,
                    reasons=list(m.reasons),
                    veiled=m.veiled,
                    corrections=[
                        HalvesCorrectionOut(
                            original=c.original,
                            corrected=c.corrected,
                            explanation=c.explanation,
                            certain=c.certain,
                        )
                        for c in m.corrections
                    ],
                    before=ChainHeardOut.of(m.before) if m.before else None,
                )
                for m in view.mine
            ],
            play=[
                ChainPlayOut(
                    index=p.index,
                    kind=p.kind,
                    name=p.name,
                    ai=p.ai,
                    mine=p.mine,
                    text=p.text,
                    position=p.position,
                    line_id=p.line_id,
                    has_audio=p.has_audio,
                    hidden=p.hidden,
                )
                for p in view.play
            ],
            play_status=view.play_status,
            reactions=dict(view.reactions),
            my_reaction=reaction,  # type: ignore[arg-type]
            veil_default=view.veil_default,
            invite_code=view.invite.code if view.invite else None,
            invite_expires_at=view.invite.expires_at if view.invite else None,
            can_fill=view.can_fill,
            lines=LINES,
        )


class ChainLineOut(ApiModel):
    id: UUID
    position: int
    status: LineStatusOut
    transcript: str

    @classmethod
    def of(cls, line: Line) -> "ChainLineOut":
        return cls(
            id=line.id, position=line.position, status=line.status, transcript=line.transcript
        )


class ChainAudioOut(ApiModel):
    # Works for five minutes.
    url: str


class ChainRetriedOut(ApiModel):
    heard: str
    right: bool
    original: str
    corrected: str


class ChainCardOut(ApiModel):
    id: UUID


def chain_router(service: Callable[[], ChainService], recorded: Any) -> APIRouter:
    """The routes under /v1/chain. `service` gives the service when a request comes (the schema
    is exported without one); `recorded` decodes a recording (`app.recorded`)."""
    router = APIRouter(prefix="/chain", responses=REFUSED)

    @router.get("", operation_id="getChain")
    def get_chain(user: CurrentUser) -> ChainOut:
        """The story chain's hub (9.1)."""
        return ChainOut.of(service().overview(user))

    @router.put("/profile", operation_id="joinChain")
    def join_chain(user: CurrentUser, answers: ChainJoinIn) -> ChainOut:
        """Joins the story chain, or changes the join answers (9.2)."""
        service().join(user, veil_default=answers.veil_default, voice_consent=answers.voice_consent)
        return ChainOut.of(service().overview(user))

    @router.patch("/profile", operation_id="changeChain")
    def change_chain(user: CurrentUser, changes: ChainProfileChangeIn) -> ChainOut:
        """Changes the story chain's settings (9.8)."""
        service().change(user, veil_default=changes.veil_default, paused=changes.paused)
        return ChainOut.of(service().overview(user))

    @router.post("/profile/codename", operation_id="rerollChainCodename")
    def reroll_codename(user: CurrentUser) -> ChainOut:
        service().reroll(user)
        return ChainOut.of(service().overview(user))

    @router.delete("/profile", operation_id="leaveChain", status_code=204)
    def leave_chain(user: CurrentUser) -> None:
        """Deletes the learner's story-chain data and withdraws the voice-sharing consent."""
        service().leave(user)

    @router.delete("/blocks/{block_id}", operation_id="removeChainBlock", status_code=204)
    def remove_block(user: CurrentUser, block_id: UUID) -> None:
        service().unblock(user, block_id)

    @router.post("/stories", operation_id="startChainStory")
    def start_story(user: CurrentUser, start: ChainStartIn) -> ChainStoryOut:
        """A new story with the learner in the first seat (9.3)."""
        story = service().start(user, start.opening_id, [(s.kind, s.duo_id) for s in start.seats])
        return ChainStoryOut.of(service().view(user, story.id))

    @router.post("/invites/redeem", operation_id="redeemChainInvite")
    def redeem_invite(user: CurrentUser, code: ChainRedeemIn) -> ChainStoryOut:
        """Takes an empty seat of a friend's story (9.9)."""
        story = service().redeem(user, code.code)
        return ChainStoryOut.of(service().view(user, story.id))

    @router.get("/stories/{story_id}", operation_id="getChainStory")
    def get_story(user: CurrentUser, story_id: UUID) -> ChainStoryOut:
        return ChainStoryOut.of(service().view(user, story_id))

    @router.post("/stories/{story_id}/invite", operation_id="createChainInvite")
    def create_invite(user: CurrentUser, story_id: UUID) -> ChainStoryOut:
        """The code for the story's empty seats (9.9), for its host."""
        service().invite(user, story_id)
        return ChainStoryOut.of(service().view(user, story_id))

    @router.post("/stories/{story_id}/fill", operation_id="fillChainSeats")
    def fill_seats(user: CurrentUser, story_id: UUID) -> ChainStoryOut:
        """AI characters take the empty seats, so the story starts now."""
        return ChainStoryOut.of(service().fill(user, story_id))

    @router.post("/stories/{story_id}/lines", operation_id="sendChainLine")
    def send_line(user: CurrentUser, story_id: UUID, line: ChainLineIn) -> ChainLineOut:
        """Records the learner's line (9.4): written down at once, checked before anyone hears
        it."""
        audio, seconds = recorded(line)
        return ChainLineOut.of(
            service().record(user, story_id, audio, line.format, seconds, line.veiled)
        )

    @router.post("/stories/{story_id}/reaction", operation_id="reactToChainStory")
    def react(user: CurrentUser, story_id: UUID, reaction: ChainReactionIn) -> ChainStoryOut:
        """A reaction card on the finished radio play (9.6)."""
        return ChainStoryOut.of(service().react(user, story_id, reaction.reaction))

    @router.post("/stories/{story_id}/leave", operation_id="leaveChainStory")
    def leave_story(user: CurrentUser, story_id: UUID) -> ChainStoryOut:
        """An AI character takes the learner's seat."""
        return ChainStoryOut.of(service().step_out(user, story_id))

    @router.post("/stories/{story_id}/block", operation_id="blockChainPlayer")
    def block(user: CurrentUser, story_id: UUID, seat: ChainBlockIn) -> ChainStoryOut:
        return ChainStoryOut.of(service().block(user, story_id, seat.seat))

    @router.get("/stories/{story_id}/opening/audio", operation_id="getChainOpeningAudio")
    def opening_audio(user: CurrentUser, story_id: UUID) -> ChainAudioOut:
        return ChainAudioOut(url=service().opening_address(user, story_id))

    @router.get("/stories/{story_id}/play/{index}/audio", operation_id="getChainPlayAudio")
    def play_audio(user: CurrentUser, story_id: UUID, index: int) -> ChainAudioOut:
        """A narrator part of the radio play (9.6)."""
        return ChainAudioOut(url=service().play_address(user, story_id, index))

    @router.get("/lines/{line_id}/audio", operation_id="getChainLineAudio")
    def line_audio(user: CurrentUser, line_id: UUID) -> ChainAudioOut:
        return ChainAudioOut(url=service().address(user, line_id))

    @router.post("/lines/{line_id}/report", operation_id="reportChainLine")
    def report(user: CurrentUser, line_id: UUID, report: ChainReportIn) -> ChainStoryOut:
        """Reports a line heard (9.10): hidden at once, and queued for the owner."""
        return ChainStoryOut.of(service().report(user, line_id, report.reason, report.note))

    @router.post("/lines/{line_id}/corrections/{index}/retry", operation_id="retryChainLine")
    def retry(
        user: CurrentUser, line_id: UUID, index: int, attempt: ChainRetryIn
    ) -> ChainRetriedOut:
        """ "Say it better" on a confirmed correction of one's own line (9.7)."""
        audio, seconds = recorded(attempt)
        tried = service().retry(user, line_id, index, audio, attempt.format, seconds)
        return ChainRetriedOut(
            heard=tried.heard, right=tried.right, original=tried.original, corrected=tried.corrected
        )

    @router.post("/lines/{line_id}/corrections/{index}/card", operation_id="saveChainCard")
    def save_card(user: CurrentUser, line_id: UUID, index: int) -> ChainCardOut:
        """A confirmed correction of one's own line kept as a card (9.7)."""
        return ChainCardOut(id=service().save_card(user, line_id, index).id)

    @router.get("/queue", operation_id="getChainQueue")
    def get_queue(user: CurrentUser) -> HalvesQueueOut:
        """The owner's story-chain queue (6.15): held lines and reports."""
        return HalvesQueueOut(items=[HalvesQueueItemOut.of(item) for item in service().queue(user)])

    @router.post("/queue/{kind}/{item_id}", operation_id="decideChainItem", status_code=204)
    def decide(
        user: CurrentUser,
        kind: Literal["held", "report"],
        item_id: UUID,
        decision: ChainDecisionIn,
    ) -> None:
        service().decide(user, kind, item_id, decision.action)

    return router
