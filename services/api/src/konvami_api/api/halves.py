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
    NUDGE_MAX,
    NUDGE_MIN,
    REPORT_NOTE_MAX,
    SEARCH_HOURS_DEFAULT,
    SEARCH_HOURS_MAX,
    SEARCH_HOURS_MIN,
    Case,
    CaseSummary,
    CaseView,
    HalvesService,
    Move,
    Overview,
    PartnerLabel,
    Profile,
    QueueItem,
    SafetyStats,
    SearchView,
    ShareCard,
    StrandMap,
    StrandPoint,
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
    "too_few_words": 422,
    "limit": 429,
    # The model could not write the Bridge's help, or what it wrote may not be shown.
    "not_written": 503,
}
REFUSED: dict[int | str, dict[str, Any]] = {
    code: {"model": ErrorBody} for code in sorted(set(STATUS.values()) | {503})
}

type ModeOut = Literal["ai", "friend", "duo", "match"]
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


class HalvesSearchOut(ApiModel):
    """A search for a partner (7.3)."""

    since: dt.datetime
    until: dt.datetime
    remind: bool
    # It went on long enough to offer an AI, or it is over.
    offer_ai: bool

    @classmethod
    def of(cls, search: SearchView) -> "HalvesSearchOut":
        return cls(
            since=search.since, until=search.until, remind=search.remind, offer_ai=search.offer_ai
        )


class HalvesOut(ApiModel):
    """The hub (7.1): whether Two Halves is open to the learner, their profile, cases, the week's
    case, duos, invite and blocks, and the choices of the join form. Phase 2: whether they may
    look for a stranger, their search, and the clues understood at the first try (private)."""

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
    strangers: bool
    search: HalvesSearchOut | None
    search_hours: list[int]
    understood_first: int
    told: int

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
            strangers=overview.strangers,
            search=HalvesSearchOut.of(overview.search) if overview.search else None,
            # The search's shortest, usual and longest length, in hours (a Stepper on 7.3).
            search_hours=[SEARCH_HOURS_MIN, SEARCH_HOURS_DEFAULT, SEARCH_HOURS_MAX],
            understood_first=overview.understood_first,
            told=overview.told,
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
    # remove: a strike; warn: a push, no strike; suspend: at once; dismiss: nothing.
    action: Literal["remove", "dismiss", "warn", "suspend"]


class HalvesSearchIn(ApiModel):
    hours: int = Field(default=SEARCH_HOURS_DEFAULT, ge=SEARCH_HOURS_MIN, le=SEARCH_HOURS_MAX)
    # Tell me by push when someone is found, or when the search ends.
    remind: bool = True


class HalvesBridgeIn(ApiModel):
    step: Literal["slower", "simpler", "gist"]


class HalvesNudgeIn(ApiModel):
    text: str = Field(min_length=NUDGE_MIN, max_length=NUDGE_MAX)


class HalvesImportCaseIn(ApiModel):
    import_id: UUID


class HalvesCorrectionOut(ApiModel):
    original: str
    corrected: str
    explanation: str
    certain: bool


class HalvesNudgeOut(ApiModel):
    text: str
    by: str


class HalvesMineOut(ApiModel):
    id: UUID
    status: Literal["checking", "delivered", "held", "failed", "removed"]
    transcript: str
    reasons: list[str]
    veiled: bool
    reaction: str | None
    understood: bool | None
    corrections: list[HalvesCorrectionOut]
    nudges: list[HalvesNudgeOut]


class HalvesTheirsOut(ApiModel):
    id: UUID
    hidden: bool
    question: str
    options: list[str]
    answers: list[int]
    solution: int | None
    reaction: str | None
    caption: str
    can_nudge: bool
    nudged: bool
    # Same-language mode: the Bridge, and what it gave so far.
    bridge: bool
    simpler: str | None
    gist: str | None


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
    # Native intelligibility, private to this seat.
    understood_first: int
    told: int
    same_language: bool
    from_import: bool

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
                            nudges=[HalvesNudgeOut(text=n.text, by=n.by) for n in r.mine.nudges],
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
                            caption=r.theirs.caption,
                            can_nudge=r.theirs.can_nudge,
                            nudged=r.theirs.nudged,
                            bridge=r.theirs.bridge,
                            simpler=r.theirs.simpler,
                            gist=r.theirs.gist,
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
            understood_first=view.understood_first,
            told=view.told,
            same_language=view.same_language,
            from_import=view.from_import,
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
    kind: Literal["held", "report", "nudge"]
    id: UUID
    move_id: UUID
    transcript: str
    reasons: list[str]
    sender: str
    reporter: str | None
    note: str | None
    band: Literal["adult", "minor"]
    created_at: dt.datetime
    strikes: int
    suspended: bool

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
            strikes=item.strikes,
            suspended=item.suspended,
        )


class HalvesQueueOut(ApiModel):
    items: list[HalvesQueueItemOut]


class HalvesStatsOut(ApiModel):
    """The owner's numbers for the last 30 days (6.15)."""

    moves: int
    cases: int
    held_per_1000: float
    reports_per_1000: float
    blocks_per_1000_cases: float
    nudges: int
    nudges_dropped: int
    median_decision_hours: float | None
    open_items: int

    @classmethod
    def of(cls, stats: SafetyStats) -> "HalvesStatsOut":
        return cls(
            moves=stats.moves,
            cases=stats.cases,
            held_per_1000=stats.held_per_1000,
            reports_per_1000=stats.reports_per_1000,
            blocks_per_1000_cases=stats.blocks_per_1000_cases,
            nudges=stats.nudges,
            nudges_dropped=stats.nudges_dropped,
            median_decision_hours=stats.median_decision_hours,
            open_items=stats.open_items,
        )


class HalvesLookOut(ApiModel):
    """What looking for a partner gave: a case when someone fitted at once, else the search."""

    case: HalvesCaseOut | None
    search: HalvesSearchOut | None


class HalvesPointOut(ApiModel):
    label: str
    latitude: float
    longitude: float

    @classmethod
    def of(cls, point: StrandPoint) -> "HalvesPointOut":
        return cls(label=point.label, latitude=point.latitude, longitude=point.longitude)


class HalvesStrandOut(ApiModel):
    codename: str
    point: HalvesPointOut
    cases: int
    duo: bool


class HalvesStrandsOut(ApiModel):
    """The strand map (7.14): nothing finer than a city, only what each chose to share."""

    me: HalvesPointOut | None
    strands: list[HalvesStrandOut]
    unplaced: int

    @classmethod
    def of(cls, found: StrandMap) -> "HalvesStrandsOut":
        return cls(
            me=HalvesPointOut.of(found.me) if found.me else None,
            strands=[
                HalvesStrandOut(
                    codename=s.codename, point=HalvesPointOut.of(s.point), cases=s.cases, duo=s.duo
                )
                for s in found.strands
            ],
            unplaced=found.unplaced,
        )


class HalvesShareOut(ApiModel):
    """The share card (7.15): no voice, no words of the learner, no name."""

    title: str
    week: str | None
    status: CaseStatusOut
    understood_first: int
    told: int
    code: str | None
    codename: str

    @classmethod
    def of(cls, card: ShareCard) -> "HalvesShareOut":
        return cls(
            title=card.title,
            week=card.week,
            status=card.status,
            understood_first=card.understood_first,
            told=card.told,
            code=card.code,
            codename=card.codename,
        )


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

    @router.post("/cases/import", operation_id="startHalvesImportCase")
    def start_import_case(user: CurrentUser, start: HalvesImportCaseIn) -> HalvesCaseOut:
        """A case against the AI written from one of the learner's course imports (7.17)."""
        case = service().play_import(user, start.import_id)
        return HalvesCaseOut.of(service().view(user, case.id))

    @router.post("/search", operation_id="lookForHalvesPartner")
    def look(user: CurrentUser, search: HalvesSearchIn) -> HalvesLookOut:
        """Looks for a stranger to play with (7.3): a case at once when someone fits."""
        found = service().look(user, search.hours, search.remind)
        if isinstance(found, Case):
            return HalvesLookOut(case=HalvesCaseOut.of(service().view(user, found.id)), search=None)
        return HalvesLookOut(case=None, search=HalvesSearchOut.of(found))

    @router.delete("/search", operation_id="stopHalvesSearch", status_code=204)
    def stop_looking(user: CurrentUser) -> None:
        service().stop_looking(user)

    @router.get("/strands", operation_id="getHalvesStrands")
    def get_strands(user: CurrentUser) -> HalvesStrandsOut:
        """The strand map (7.14)."""
        return HalvesStrandsOut.of(service().strands(user))

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

    @router.get("/cases/{case_id}/share", operation_id="getHalvesShareCard")
    def share_card(user: CurrentUser, case_id: UUID) -> HalvesShareOut:
        """What the share card of an ended case shows (7.15)."""
        return HalvesShareOut.of(service().share(user, case_id))

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

    @router.post("/moves/{move_id}/bridge", operation_id="bridgeHalvesMove")
    def bridge(user: CurrentUser, move_id: UUID, step: HalvesBridgeIn) -> HalvesCaseOut:
        """The Bridge (7.7, same-language mode): slower, then simpler, then the gist."""
        return HalvesCaseOut.of(service().bridge(user, move_id, step.step))

    @router.post("/moves/{move_id}/nudge", operation_id="nudgeHalvesMove")
    def nudge(user: CurrentUser, move_id: UUID, nudge: HalvesNudgeIn) -> HalvesCaseOut:
        """Suggests a better way to say a move heard (7.7): checked before the speaker sees it."""
        return HalvesCaseOut.of(service().nudge(user, move_id, nudge.text))

    @router.post("/moves/{move_id}/report", operation_id="reportHalvesMove")
    def report(user: CurrentUser, move_id: UUID, report: HalvesReportIn) -> HalvesCaseOut:
        """Reports a move heard (7.10): hidden at once, and queued for the owner."""
        return HalvesCaseOut.of(service().report(user, move_id, report.reason, report.note))

    @router.get("/queue", operation_id="getHalvesQueue")
    def get_queue(user: CurrentUser) -> HalvesQueueOut:
        """The owner's Two Halves queue (6.15): held moves and reports."""
        return HalvesQueueOut(items=[HalvesQueueItemOut.of(item) for item in service().queue(user)])

    @router.get("/queue/stats", operation_id="getHalvesStats")
    def get_stats(user: CurrentUser) -> HalvesStatsOut:
        """The owner's numbers for the last 30 days (6.15)."""
        return HalvesStatsOut.of(service().stats(user))

    @router.post("/queue/{kind}/{item_id}", operation_id="decideHalvesItem", status_code=204)
    def decide(
        user: CurrentUser,
        kind: Literal["held", "report", "nudge"],
        item_id: UUID,
        decision: HalvesDecisionIn,
    ) -> None:
        service().decide(user, kind, item_id, decision.action)

    return router
