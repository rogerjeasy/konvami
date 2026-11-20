"""Two Halves' routes and their shapes (section 7, `domain/halves.py`)."""

import datetime as dt
from collections.abc import Callable
from typing import Any, Literal
from uuid import UUID

from fastapi import APIRouter
from pydantic import Field

from konvami_api.api.auth import CurrentUser
from konvami_api.api.errors import ErrorBody
from konvami_api.api.schemas import MAX_SPOKEN_AUDIO, ApiModel
from konvami_api.domain.halves import (
    CITIES,
    COUNTRIES,
    NATIVE_LANGUAGES,
    REPORT_NOTE_MAX,
    CaseSummary,
    CaseView,
    HalvesService,
    Move,
    Overview,
    PartnerLabel,
    Profile,
    QueueItem,
)

# The status of each refusal: a rule of the game (409), not allowed (403), a wrong value (422).
STATUS: dict[str, int] = {
    "unavailable": 403,
    "consent_required": 403,
    "suspended": 403,
    "adults_only": 403,
    "not_owner": 403,
    "not_found": 404,
    "not_joined": 409,
    "not_your_turn": 409,
    "answered": 409,
    "too_many_cases": 409,
    "paused": 409,
    "own_code": 409,
    "no_shared_language": 409,
    "no_language": 409,
    "invalid_value": 422,
    "too_short": 422,
    "too_long": 422,
    "limit": 429,
}
REFUSED: dict[int | str, dict[str, Any]] = {
    code: {"model": ErrorBody} for code in sorted(set(STATUS.values()) | {503})
}

type ModeOut = Literal["ai", "friend", "duo"]
type CaseStatusOut = Literal["open", "solved", "unsolved"]


class HalvesProfileOut(ApiModel):
    codename: str
    native_language: str
    place: str | None
    band: Literal["adult", "minor"]
    veil_default: bool
    paused: bool
    strikes: int
    suspended: bool

    @classmethod
    def of(cls, profile: Profile) -> "HalvesProfileOut":
        return cls(
            codename=profile.codename,
            native_language=profile.native_language,
            place=profile.place,
            band=profile.band,
            veil_default=profile.veil_default,
            paused=profile.paused,
            strikes=profile.strikes,
            suspended=profile.suspended,
        )


class HalvesPartnerOut(ApiModel):
    name: str
    # An AI stand-in: always shown with the AI chip.
    ai: bool
    place: str | None

    @classmethod
    def of(cls, label: PartnerLabel) -> "HalvesPartnerOut":
        return cls(name=label.name, ai=label.ai, place=label.place)


class HalvesCaseSummaryOut(ApiModel):
    id: UUID
    template_id: str
    title: str
    mode: ModeOut
    status: CaseStatusOut
    partner: HalvesPartnerOut
    next: Literal["record", "answer", "final", "again", "wait", "done"]
    round: int
    created_at: dt.datetime

    @classmethod
    def of(cls, case: CaseSummary) -> "HalvesCaseSummaryOut":
        return cls(
            id=case.id,
            template_id=case.template_id,
            title=case.title,
            mode=case.mode,
            status=case.status,
            partner=HalvesPartnerOut.of(case.partner),
            next=case.next,
            round=case.round,
            created_at=case.created_at,
        )


class HalvesInviteOut(ApiModel):
    code: str
    expires_at: dt.datetime


class HalvesDuoOut(ApiModel):
    id: UUID
    codename: str


class HalvesBlockOut(ApiModel):
    id: UUID
    codename: str


class HalvesOut(ApiModel):
    """The hub (7.1): whether Two Halves is open to the learner, their profile, cases, the week's
    case, duos, invite and blocks, and the choices of the join form."""

    available: bool
    profile: HalvesProfileOut | None
    cases: list[HalvesCaseSummaryOut]
    season_id: str
    season_title: str
    season_week: str
    duos: list[HalvesDuoOut]
    invite: HalvesInviteOut | None
    blocks: list[HalvesBlockOut]
    cities: list[str]
    countries: list[str]
    native_languages: list[str]

    @classmethod
    def of(cls, overview: Overview) -> "HalvesOut":
        return cls(
            available=overview.available,
            profile=HalvesProfileOut.of(overview.profile) if overview.profile else None,
            cases=[HalvesCaseSummaryOut.of(case) for case in overview.cases],
            season_id=overview.season_id,
            season_title=overview.season_title,
            season_week=overview.season_week,
            duos=[HalvesDuoOut(id=d.id, codename=d.codename) for d in overview.duos],
            invite=(
                HalvesInviteOut(code=overview.invite.code, expires_at=overview.invite.expires_at)
                if overview.invite
                else None
            ),
            blocks=[HalvesBlockOut(id=b.id, codename=b.codename) for b in overview.blocks],
            cities=list(CITIES),
            countries=list(COUNTRIES),
            native_languages=list(NATIVE_LANGUAGES),
        )


class HalvesJoinIn(ApiModel):
    native_language: str = Field(max_length=8)
    place: str | None = Field(default=None, max_length=40)
    veil_default: bool = True
    # The voice-sharing consent of 7.2 (record version 1): must be true.
    voice_consent: bool


class HalvesProfileChangeIn(ApiModel):
    native_language: str | None = Field(default=None, max_length=8)
    place: str | None = Field(default=None, max_length=40)
    clear_place: bool = False
    veil_default: bool | None = None
    paused: bool | None = None


class HalvesStartIn(ApiModel):
    template_id: str | None = Field(default=None, max_length=40)
    # The week's case, the same for every pair.
    season: bool = False


class HalvesInviteIn(ApiModel):
    template_id: str | None = Field(default=None, max_length=40)


class HalvesRedeemIn(ApiModel):
    code: str = Field(min_length=4, max_length=16)


class HalvesMoveIn(ApiModel):
    audio: str = Field(min_length=1, max_length=MAX_SPOKEN_AUDIO)
    format: str = Field(min_length=1, max_length=8)
    duration_ms: int | None = Field(default=None, ge=0, le=600_000)
    # Veil: the learner's exact words in a neutral voice. Null: their default.
    veiled: bool | None = None


class HalvesReactionIn(ApiModel):
    reaction: Literal["got_it", "again_slower", "helped", "bravo"]


class HalvesOptionIn(ApiModel):
    option: int = Field(ge=0, le=10)


class HalvesAgainIn(ApiModel):
    yes: bool


class HalvesReportIn(ApiModel):
    reason: Literal["harassment", "sexual", "personal", "hate", "off_topic", "other"]
    note: str | None = Field(default=None, max_length=REPORT_NOTE_MAX)


class HalvesDecisionIn(ApiModel):
    action: Literal["remove", "dismiss"]


class HalvesCorrectionOut(ApiModel):
    original: str
    corrected: str
    explanation: str
    certain: bool


class HalvesMineOut(ApiModel):
    id: UUID
    status: Literal["checking", "delivered", "held", "failed", "removed"]
    transcript: str
    reasons: list[str]
    veiled: bool
    reaction: str | None
    understood: bool | None
    corrections: list[HalvesCorrectionOut]


class HalvesTheirsOut(ApiModel):
    id: UUID
    hidden: bool
    question: str
    options: list[str]
    answers: list[int]
    solution: int | None
    reaction: str | None


class HalvesRoundOut(ApiModel):
    round: int
    clue: str
    clue_help: str
    mine: HalvesMineOut | None
    theirs: HalvesTheirsOut | None


class HalvesFinalOut(ApiModel):
    open: bool
    question: str
    options: list[str]
    answers: list[int]
    other_answered: bool
    solution: int | None


class HalvesRecapLineOut(ApiModel):
    speaker: Literal["A", "B"]
    text: str
    has_audio: bool


class HalvesCaseOut(ApiModel):
    """A case as one seat sees it (7.4 to 7.9)."""

    id: UUID
    template_id: str
    title: str
    setting: str
    mode: ModeOut
    status: CaseStatusOut
    seat: Literal["A", "B"]
    speaks: str
    hears: str
    partner: HalvesPartnerOut
    rounds: list[HalvesRoundOut]
    final: HalvesFinalOut
    record_round: int | None
    can_hand_over: bool
    again: bool | None
    ask_again: bool
    recap: list[HalvesRecapLineOut]
    recap_status: Literal["none", "pending", "ready", "failed"]
    veil_default: bool
    ending: str | None

    @classmethod
    def of(cls, view: CaseView) -> "HalvesCaseOut":
        return cls(
            id=view.id,
            template_id=view.template_id,
            title=view.title,
            setting=view.setting,
            mode=view.mode,
            status=view.status,
            seat=view.seat,
            speaks=view.speaks,
            hears=view.hears,
            partner=HalvesPartnerOut.of(view.partner),
            rounds=[
                HalvesRoundOut(
                    round=r.round,
                    clue=r.clue,
                    clue_help=r.clue_help,
                    mine=(
                        HalvesMineOut(
                            id=r.mine.id,
                            status=r.mine.status,
                            transcript=r.mine.transcript,
                            reasons=list(r.mine.reasons),
                            veiled=r.mine.veiled,
                            reaction=r.mine.reaction,
                            understood=r.mine.understood,
                            corrections=[
                                HalvesCorrectionOut(
                                    original=c.original,
                                    corrected=c.corrected,
                                    explanation=c.explanation,
                                    certain=c.certain,
                                )
                                for c in r.mine.corrections
                            ],
                        )
                        if r.mine
                        else None
                    ),
                    theirs=(
                        HalvesTheirsOut(
                            id=r.theirs.id,
                            hidden=r.theirs.hidden,
                            question=r.theirs.question,
                            options=list(r.theirs.options),
                            answers=list(r.theirs.answers),
                            solution=r.theirs.solution,
                            reaction=r.theirs.reaction,
                        )
                        if r.theirs
                        else None
                    ),
                )
                for r in view.rounds
            ],
            final=HalvesFinalOut(
                open=view.final.open,
                question=view.final.question,
                options=list(view.final.options),
                answers=list(view.final.answers),
                other_answered=view.final.other_answered,
                solution=view.final.solution,
            ),
            record_round=view.record_round,
            can_hand_over=view.can_hand_over,
            again=view.again,
            ask_again=view.ask_again,
            recap=[
                HalvesRecapLineOut(
                    speaker=line.speaker, text=line.text, has_audio=line.audio_key is not None
                )
                for line in view.recap
            ],
            recap_status=view.recap_status,
            veil_default=view.veil_default,
            ending=view.ending,
        )


class HalvesMoveOut(ApiModel):
    id: UUID
    round: int
    status: Literal["checking", "delivered", "held", "failed", "removed"]
    transcript: str

    @classmethod
    def of(cls, move: Move) -> "HalvesMoveOut":
        return cls(id=move.id, round=move.round, status=move.status, transcript=move.transcript)


class HalvesAudioOut(ApiModel):
    # Works for five minutes.
    url: str


class HalvesQueueItemOut(ApiModel):
    kind: Literal["held", "report"]
    id: UUID
    move_id: UUID
    transcript: str
    reasons: list[str]
    sender: str
    reporter: str | None
    note: str | None
    band: Literal["adult", "minor"]
    created_at: dt.datetime

    @classmethod
    def of(cls, item: QueueItem) -> "HalvesQueueItemOut":
        return cls(
            kind=item.kind,
            id=item.id,
            move_id=item.move_id,
            transcript=item.transcript,
            reasons=list(item.reasons),
            sender=item.sender,
            reporter=item.reporter,
            note=item.note,
            band=item.band,
            created_at=item.created_at,
        )


class HalvesQueueOut(ApiModel):
    items: list[HalvesQueueItemOut]


def halves_router(service: Callable[[], HalvesService], recorded: Any) -> APIRouter:
    """The routes under /v1/halves. `service` gives the service when a request comes (the
    schema is exported without one); `recorded` decodes a recording (`app.recorded`)."""
    router = APIRouter(prefix="/halves", responses=REFUSED)

    @router.get("", operation_id="getHalves")
    def get_halves(user: CurrentUser) -> HalvesOut:
        """The Two Halves hub (7.1)."""
        return HalvesOut.of(service().overview(user))

    @router.put("/profile", operation_id="joinHalves")
    def join_halves(user: CurrentUser, answers: HalvesJoinIn) -> HalvesOut:
        """Joins Two Halves, or changes the join answers (7.2)."""
        service().join(
            user,
            native_language=answers.native_language,
            place=answers.place,
            veil_default=answers.veil_default,
            voice_consent=answers.voice_consent,
        )
        return HalvesOut.of(service().overview(user))

    @router.patch("/profile", operation_id="changeHalves")
    def change_halves(user: CurrentUser, changes: HalvesProfileChangeIn) -> HalvesOut:
        """Changes Two Halves' settings (7.11)."""
        service().change(
            user,
            place=changes.place,
            clear_place=changes.clear_place,
            veil_default=changes.veil_default,
            paused=changes.paused,
            native_language=changes.native_language,
        )
        return HalvesOut.of(service().overview(user))

    @router.post("/profile/codename", operation_id="rerollHalvesCodename")
    def reroll_codename(user: CurrentUser) -> HalvesOut:
        service().reroll(user)
        return HalvesOut.of(service().overview(user))

    @router.delete("/profile", operation_id="leaveHalves", status_code=204)
    def leave_halves(user: CurrentUser) -> None:
        """Deletes the learner's Two Halves data and withdraws the voice-sharing consent (7.11)."""
        service().leave(user)

    @router.post("/cases", operation_id="startHalvesCase")
    def start_case(user: CurrentUser, start: HalvesStartIn) -> HalvesCaseOut:
        """A case against an AI stand-in (7.3)."""
        case = service().play_ai(user, start.template_id, start.season)
        return HalvesCaseOut.of(service().view(user, case.id))

    @router.post("/invites", operation_id="createHalvesInvite")
    def create_invite(user: CurrentUser, invite: HalvesInviteIn) -> HalvesInviteOut:
        """A code to play with a friend (7.12)."""
        made = service().invite(user, invite.template_id)
        return HalvesInviteOut(code=made.code, expires_at=made.expires_at)

    @router.delete("/invites", operation_id="cancelHalvesInvite", status_code=204)
    def cancel_invite(user: CurrentUser) -> None:
        service().cancel_invite(user)

    @router.post("/invites/redeem", operation_id="redeemHalvesInvite")
    def redeem_invite(user: CurrentUser, code: HalvesRedeemIn) -> HalvesCaseOut:
        case = service().redeem(user, code.code)
        return HalvesCaseOut.of(service().view(user, case.id))

    @router.post("/duos/{duo_id}/cases", operation_id="startHalvesDuoCase")
    def start_duo_case(user: CurrentUser, duo_id: UUID) -> HalvesCaseOut:
        case = service().play_duo(user, duo_id)
        return HalvesCaseOut.of(service().view(user, case.id))

    @router.delete("/duos/{duo_id}", operation_id="removeHalvesDuo", status_code=204)
    def remove_duo(user: CurrentUser, duo_id: UUID) -> None:
        service().remove_duo(user, duo_id)

    @router.delete("/blocks/{block_id}", operation_id="removeHalvesBlock", status_code=204)
    def remove_block(user: CurrentUser, block_id: UUID) -> None:
        service().unblock(user, block_id)

    @router.get("/cases/{case_id}", operation_id="getHalvesCase")
    def get_case(user: CurrentUser, case_id: UUID) -> HalvesCaseOut:
        return HalvesCaseOut.of(service().view(user, case_id))

    @router.post("/cases/{case_id}/moves", operation_id="sendHalvesMove")
    def send_move(user: CurrentUser, case_id: UUID, move: HalvesMoveIn) -> HalvesMoveOut:
        """Records a move (7.6): written down at once, checked before the other hears it."""
        audio, seconds = recorded(move)
        return HalvesMoveOut.of(
            service().record(user, case_id, audio, move.format, seconds, move.veiled)
        )

    @router.post("/cases/{case_id}/final", operation_id="solveHalvesCase")
    def solve_case(user: CurrentUser, case_id: UUID, answer: HalvesOptionIn) -> HalvesCaseOut:
        return HalvesCaseOut.of(service().solve(user, case_id, answer.option))

    @router.post("/cases/{case_id}/again", operation_id="playHalvesAgain")
    def play_again(user: CurrentUser, case_id: UUID, again: HalvesAgainIn) -> HalvesCaseOut:
        return HalvesCaseOut.of(service().again(user, case_id, again.yes))

    @router.post("/cases/{case_id}/hand-over", operation_id="handOverHalvesSeat")
    def hand_over(user: CurrentUser, case_id: UUID) -> HalvesCaseOut:
        return HalvesCaseOut.of(service().hand_over(user, case_id))

    @router.post("/cases/{case_id}/block", operation_id="blockHalvesPartner")
    def block_partner(user: CurrentUser, case_id: UUID) -> HalvesCaseOut:
        return HalvesCaseOut.of(service().block(user, case_id))

    @router.get("/cases/{case_id}/recap/{line}/audio", operation_id="getHalvesRecapAudio")
    def recap_audio(user: CurrentUser, case_id: UUID, line: int) -> HalvesAudioOut:
        return HalvesAudioOut(url=service().recap_address(user, case_id, line))

    @router.get("/moves/{move_id}/audio", operation_id="getHalvesMoveAudio")
    def move_audio(user: CurrentUser, move_id: UUID) -> HalvesAudioOut:
        return HalvesAudioOut(url=service().address(user, move_id))

    @router.post("/moves/{move_id}/reaction", operation_id="reactToHalvesMove")
    def react(user: CurrentUser, move_id: UUID, reaction: HalvesReactionIn) -> HalvesCaseOut:
        return HalvesCaseOut.of(service().react(user, move_id, reaction.reaction))

    @router.post("/moves/{move_id}/answer", operation_id="answerHalvesMove")
    def answer(user: CurrentUser, move_id: UUID, answer: HalvesOptionIn) -> HalvesCaseOut:
        """Acts on a clue heard (7.7): an option of the board's question."""
        return HalvesCaseOut.of(service().answer(user, move_id, answer.option))

    @router.post("/moves/{move_id}/report", operation_id="reportHalvesMove")
    def report(user: CurrentUser, move_id: UUID, report: HalvesReportIn) -> HalvesCaseOut:
        """Reports a move heard (7.10): hidden at once, and queued for the owner."""
        return HalvesCaseOut.of(service().report(user, move_id, report.reason, report.note))

    @router.get("/queue", operation_id="getHalvesQueue")
    def get_queue(user: CurrentUser) -> HalvesQueueOut:
        """The owner's Two Halves queue (6.15): held moves and reports."""
        return HalvesQueueOut(items=[HalvesQueueItemOut.of(item) for item in service().queue(user)])

    @router.post("/queue/{kind}/{item_id}", operation_id="decideHalvesItem", status_code=204)
    def decide(
        user: CurrentUser,
        kind: Literal["held", "report"],
        item_id: UUID,
        decision: HalvesDecisionIn,
    ) -> None:
        service().decide(user, kind, item_id, decision.action)

    return router
