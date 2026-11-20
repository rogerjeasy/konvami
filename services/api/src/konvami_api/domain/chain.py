"""The story chain, Kettengeschichte (section 9, design note 2026-11-20-chain-story-design.md): an
audio story four learners of the same language build together, line by line.

Each seat hears only the line before its own, and the narrator's one-sentence summary of the
story so far, then records one line (45 seconds at most). The narrator, an AI always labelled as
one, keeps the plot together and plays the empty seats as AI characters. When the eighth line is
in, the story is revealed to everyone as a radio play: the lines in order, with the narrator's
short links between them that retell what a line meant, so a mistake never breaks the story.
Each learner's corrections stay private (9.7).

Who plays (no stranger hears a stranger, as in Two Halves phase 1): every learner with three AI
characters; adults also with friends who redeem a code and with their Two Halves duos. Minors
play with AI characters only. Every line a learner records is checked before anyone hears it,
with the same fail-closed check as a Two Halves move (`halves_check.check_spoken`), and is kept
at most 30 days after the story ends.

Blocks, duos, the codename words, invite codes and the daily cap on wrong codes are Two Halves'
own: one social list per learner across both games.
"""

import datetime as dt
import random
import uuid
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass, field, replace
from typing import Literal, Protocol
from uuid import UUID, uuid4

from konvami_api.domain.accounts import AccountDirectory, AccountNotFound
from konvami_api.domain.cards import Card, CardService
from konvami_api.domain.chain_openings import (
    AI_NAMES,
    LANGUAGES,
    OPENINGS,
    Opening,
    opening,
    text_in,
)
from konvami_api.domain.costs import Feature
from konvami_api.domain.halves import (
    CHECK_ATTEMPTS,
    CHECK_STALE,
    REPORT_NOTE_MAX,
    REPORT_REASONS,
    STRIKES_TO_SUSPEND,
    WRONG_CODES_PER_DAY,
    Band,
    Block,
    Correction,
    HalvesRepository,
    QueueItem,
    Report,
    band_of,
    codename_from,
    invite_code,
)
from konvami_api.domain.profile import ProfileService
from konvami_api.domain.reports import words_in
from konvami_api.domain.spoken import Listener, SpokenError, is_right
from konvami_api.domain.storage import FileStore

type Mode = Literal["solo", "friends"]
type StoryStatus = Literal["open", "finishing", "done"]
# As a Two Halves move: `checking` nobody hears yet; `held` stopped by the check, never
# delivered; `failed` could not be checked (closed); `removed` taken away.
type LineStatus = Literal["checking", "delivered", "held", "failed", "removed"]
type PlayStatus = Literal["none", "pending", "ready", "failed"]
type SeatKind = Literal["ai", "friend", "duo"]
type Reaction = Literal["laughed", "surprised", "loved", "encore"]
# What the hub says a story waits for from this learner.
type Next = Literal["record", "wait", "listen", "done"]

REACTIONS: tuple[str, ...] = ("laughed", "surprised", "loved", "encore")
SEATS = 4
# Two rounds of four: about four minutes of radio play with the narrator's links.
LINES = 8
# The voice-sharing consent of 9.2, a record of its own (`chain_voice`), apart from Two Halves'.
VOICE_CONSENT_VERSION = 1
LINE_SECONDS = 45
MIN_WORDS = 3
LINES_PER_DAY = 20
OPEN_STORIES = 3
# A seat whose turn it has been this long (a friend who is quiet, or a seat nobody took) is
# taken over by an AI character, so a story never stalls.
TURN_TIMEOUT = dt.timedelta(hours=48)
INVITE_FOR = dt.timedelta(days=7)
KEEP_FOR = dt.timedelta(days=30)
ADDRESS_SECONDS = 5 * 60
RETRIES_PER_DAY = 100
TICK_SCAN = 200
QUEUE_LIMIT = 100
RECAP_MAX = 240
# Under halves/, so the media bucket's 30-day rule (infra/modules/media) covers the chain too,
# and under the learner's own folder, so deleting the account deletes their lines.
FOLDER = "halves"
NARRATOR_VOICE = "fable"
AI_VOICES: tuple[str, ...] = ("ash", "coral", "sage", "verse")

_AUDIO_TYPES = {"m4a": "audio/mp4", "webm": "audio/webm", "wav": "audio/wav", "mp3": "audio/mpeg"}


class ChainError(Exception):
    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


# --- What is kept --------------------------------------------------------------------------------


@dataclass(frozen=True)
class ChainProfile:
    user_id: UUID
    codename: str
    band: Band
    veil_default: bool
    paused: bool
    consent_version: int
    consent_at: dt.datetime
    strikes: int = 0
    suspended: bool = False


@dataclass(frozen=True)
class ChainSeat:
    seat: int
    # The learner in the seat; None while a seat waits for a friend, or for an AI from the start.
    user_id: UUID | None
    # The AI character's name once an AI plays the seat (from the start, or taken over).
    ai_name: str | None = None
    # Seated by the host: its learner is the host's friend or duo.
    host: bool = False
    # Blocked by another player: an AI took the seat and the learner is out of the story. They
    # keep only the lines they recorded themselves.
    removed: bool = False

    @property
    def ai(self) -> bool:
        return self.ai_name is not None

    @property
    def open(self) -> bool:
        """Waiting for a friend to redeem the code."""
        return self.user_id is None and self.ai_name is None


@dataclass(frozen=True)
class Segment:
    """One part of the radio play: the narrator, or a seat's line."""

    kind: Literal["narrator", "line"]
    text: str
    audio_key: str | None = None
    # The line it is, or the narrator speaking after this line (0: the opening).
    position: int = 0
    line_id: UUID | None = None


@dataclass(frozen=True)
class Story:
    id: UUID
    opening_id: str
    language: str
    level: str
    mode: Mode
    # The learner who started it, in seat 1; None once their account is deleted.
    host: UUID | None
    status: StoryStatus
    created_at: dt.datetime
    seats: tuple[ChainSeat, ...]
    # When the seat whose turn it is got it.
    turn_since: dt.datetime
    ended_at: dt.datetime | None = None
    play: tuple[Segment, ...] = ()
    play_status: PlayStatus = "none"
    # The fixed reaction cards, by the learner's id.
    reactions: Mapping[str, str] = field(default_factory=dict)
    # The narrator's opening, spoken once the story starts.
    opening_key: str | None = None

    def seat(self, number: int) -> ChainSeat:
        return self.seats[number - 1]

    @property
    def payer(self) -> UUID | None:
        """Whose the narrator's requests are: the host's, else the first learner's still there."""
        if self.host is not None:
            return self.host
        return next((s.user_id for s in self.seats if s.user_id is not None), None)

    def seat_of(self, user_id: UUID) -> ChainSeat | None:
        return next((s for s in self.seats if s.user_id == user_id), None)

    def players(self) -> list[UUID]:
        """The learners still in the story: told of it and given its radio play."""
        return [s.user_id for s in self.seats if s.user_id is not None and not s.removed]

    def with_seat(self, state: ChainSeat) -> "Story":
        seats = tuple(state if s.seat == state.seat else s for s in self.seats)
        return replace(self, seats=seats)


@dataclass(frozen=True)
class Line:
    id: UUID
    story_id: UUID
    position: int
    seat: int
    # The learner who said it; None for an AI character.
    user_id: UUID | None
    status: LineStatus
    transcript: str
    created_at: dt.datetime
    ai_name: str | None = None
    audio_key: str | None = None
    veil_key: str | None = None
    veiled: bool = False
    reasons: tuple[str, ...] = ()
    delivered_at: dt.datetime | None = None
    # The narrator's one sentence of the story so far, for the next seat.
    recap: str | None = None
    corrections: tuple[Correction, ...] = ()
    attempts: int = 0
    # The learners who reported it: no longer shown to them.
    hidden_for: tuple[UUID, ...] = ()
    delete_after: dt.datetime | None = None


@dataclass(frozen=True)
class ChainInvite:
    code: str
    user_id: UUID
    story_id: UUID
    created_at: dt.datetime
    expires_at: dt.datetime


class ChainRepository(Protocol):
    def profile(self, user_id: UUID) -> ChainProfile | None: ...

    def save_profile(self, profile: ChainProfile) -> None: ...

    def delete_profile(self, user_id: UUID) -> None: ...

    def story(self, story_id: UUID) -> Story | None: ...

    def save_story(self, story: Story) -> None:
        """Stores the story and its seats, in place of what was stored for it."""

    def stories_of(self, user_id: UUID, limit: int) -> list[Story]:
        """The stories where the learner holds a seat, newest first."""

    def unfinished(self, limit: int) -> list[Story]:
        """Stories open or finishing, oldest first."""

    def ended_before(self, before: dt.datetime, limit: int) -> list[Story]:
        """Done stories that ended before `before` and still have a radio play or opening."""

    def line(self, line_id: UUID) -> Line | None: ...

    def save_line(self, line: Line) -> None: ...

    def lines_of(self, story_id: UUID) -> list[Line]:
        """A story's lines, oldest first."""

    def lines_by(self, user_id: UUID) -> list[Line]: ...

    def lines_since(self, user_id: UUID, since: dt.datetime) -> int: ...

    def held(self, limit: int) -> list[Line]: ...

    def stale_checks(self, before: dt.datetime, limit: int) -> list[Line]: ...

    def expired(self, now: dt.datetime, limit: int) -> list[Line]:
        """Lines past their `delete_after` that still have words or a sound."""

    def invite(self, code: str) -> ChainInvite | None: ...

    def invite_for(self, story_id: UUID) -> ChainInvite | None: ...

    def save_invite(self, invite: ChainInvite) -> None:
        """Stores the invite in place of the story's earlier one."""

    def delete_invite(self, code: str) -> None: ...

    def delete_expired_invites(self, now: dt.datetime) -> None: ...

    def add_report(self, report: Report) -> None: ...

    def report(self, report_id: UUID) -> Report | None: ...

    def save_report(self, report: Report) -> None: ...

    def open_reports(self, limit: int) -> list[Report]: ...

    def reserve_retry(self, user_id: UUID, day: dt.date, limit: int) -> bool:
        """Counts one more "Say it better" try on `day`, unless the learner reached `limit`."""


class ChainStarter(Protocol):
    def start(self, job: str, item_id: UUID) -> None:
        """Has the worker run `job` ("check" a line, "ai" for a story's AI characters, "play" to
        make the radio play) in an invocation of its own."""


class Narrator(Protocol):
    """What models do in the story chain (`chain_brain.py`), so the service can be tried with a
    stand-in."""

    def check(self, line: Line, band: Band, language: str) -> tuple[str, ...] | None:
        """Labels that hold the line, empty to deliver it, None when it could not be checked."""

    def veil(self, line: Line) -> str | None: ...

    def correct(self, line: Line, target: str, explanation: str) -> tuple[Correction, ...]: ...

    def recap(self, story: Story, lines: Sequence[Line]) -> str:
        """The story so far in one short sentence, for the next seat."""

    def speak_opening(self, story: Story) -> str | None:
        """The opening in the narrator's voice, stored; None when it could not be spoken."""

    def go_on(self, story: Story, lines: Sequence[Line], seat: ChainSeat, voice: str) -> Line:
        """An AI character's line that goes on from the last one, spoken in `voice`; delivered."""

    def narrate(self, story: Story, lines: Sequence[Line]) -> tuple[Segment, ...]:
        """The narrator's parts of the radio play, spoken: the opening, a link after each line
        that retells what it meant, and the ending, with `position` saying where each goes.
        The opening's sound is `story.opening_key` when there is one."""


# --- What the app is shown ------------------------------------------------------------------------


@dataclass(frozen=True)
class SeatLabel:
    seat: int
    name: str
    ai: bool
    me: bool
    # `waiting`: a seat a friend has not taken yet.
    state: Literal["playing", "waiting", "taken_over"]
    lines: int


@dataclass(frozen=True)
class StorySummary:
    id: UUID
    opening_id: str
    genre: str
    title: str
    mode: Mode
    status: StoryStatus
    next: Next
    position: int
    seats: tuple[SeatLabel, ...]
    created_at: dt.datetime


@dataclass(frozen=True)
class OpeningView:
    id: str
    genre: str
    title: str


@dataclass(frozen=True)
class DuoChoice:
    id: UUID
    codename: str


@dataclass(frozen=True)
class ChainOverview:
    available: bool
    profile: ChainProfile | None
    stories: tuple[StorySummary, ...]
    openings: tuple[OpeningView, ...]
    duos: tuple[DuoChoice, ...]
    blocks: tuple[Block, ...]


@dataclass(frozen=True)
class Heard:
    """A line a learner may hear: the narrator's opening, or another seat's line."""

    kind: Literal["narrator", "line"]
    id: UUID | None
    name: str
    ai: bool
    text: str
    # The narrator's summary of the story before it.
    recap: str | None
    hidden: bool = False
    has_audio: bool = False


@dataclass(frozen=True)
class MineView:
    id: UUID
    position: int
    status: LineStatus
    transcript: str
    reasons: tuple[str, ...]
    veiled: bool
    corrections: tuple[Correction, ...]
    # What the learner heard before saying it.
    before: Heard | None


@dataclass(frozen=True)
class PlayView:
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


@dataclass(frozen=True)
class StoryView:
    id: UUID
    opening_id: str
    genre: str
    title: str
    language: str
    mode: Mode
    status: StoryStatus
    my_seat: int
    host: bool
    position: int
    turn_seat: int | None
    my_turn: bool
    seats: tuple[SeatLabel, ...]
    before: Heard | None
    mine: tuple[MineView, ...]
    play: tuple[PlayView, ...]
    play_status: PlayStatus
    reactions: Mapping[str, int]
    my_reaction: str | None
    veil_default: bool
    invite: ChainInvite | None
    can_fill: bool


@dataclass(frozen=True)
class Retried:
    heard: str
    right: bool
    original: str
    corrected: str


# --- Rules that need no storage ------------------------------------------------------------------


def seat_for(position: int) -> int:
    """Lines go round the table: 1, 2, 3, 4, 1, 2, 3, 4."""
    return (position - 1) % SEATS + 1


def delivered(lines: Sequence[Line]) -> list[Line]:
    return sorted((x for x in lines if x.status == "delivered"), key=lambda x: x.position)


def next_position(story: Story, lines: Sequence[Line]) -> int | None:
    """The position to be said next, or None: the story is over, or a line is being checked."""
    if story.status != "open" or any(x.status == "checking" for x in lines):
        return None
    position = len(delivered(lines)) + 1
    return position if position <= LINES else None


def ai_name_for(story: Story, seat: int) -> str:
    """A name per seat in the story's language, none used twice."""
    names = AI_NAMES.get(story.language, AI_NAMES["en"])
    taken = {s.ai_name for s in story.seats if s.ai_name}
    free = [n for n in names if n not in taken]
    return free[0] if free else f"{names[(seat - 1) % len(names)]} {seat}"


def ai_voice_for(seat: int) -> str:
    return AI_VOICES[(seat - 1) % len(AI_VOICES)]


# --- The service ---------------------------------------------------------------------------------


class ChainService:
    def __init__(
        self,
        *,
        profiles: ProfileService,
        accounts: AccountDirectory,
        repository: ChainRepository,
        social: HalvesRepository,
        listener: Listener,
        narrator: Narrator,
        files: FileStore,
        cards: CardService,
        starter: ChainStarter,
        enabled: bool,
        allowed: Callable[[UUID], bool],
        owners: frozenset[UUID],
        clock: Callable[[], dt.datetime],
        announce: Callable[[UUID, UUID, str], None] = lambda *_: None,
        new_id: Callable[[], UUID] = uuid4,
        rng: random.Random | None = None,
    ) -> None:
        """`enabled` turns the chain on (`KONVAMI_CHAIN`); `allowed` says who may play while it
        is in the testers' hands. `social` is Two Halves' storage, for duos, blocks and the cap
        on wrong codes. `announce` tells a learner by push that it is their turn ("turn"), that
        their line was held ("held"), that they were given a seat ("invited") or that the radio
        play is ready ("ready")."""
        self._profiles = profiles
        self._accounts = accounts
        self._repository = repository
        self._social = social
        self._listener = listener
        self._narrator = narrator
        self._files = files
        self._cards = cards
        self._starter = starter
        self._enabled = enabled
        self._allowed = allowed
        self._owners = owners
        self._clock = clock
        self._announce = announce
        self._new_id = new_id
        self._rng = rng or random.Random()  # noqa: S311 - codenames, not secrets

    # --- Joining and settings (9.2, 9.8)

    def available(self, user_id: UUID) -> bool:
        return self._enabled and self._allowed(user_id)

    def _band(self, user_id: UUID) -> Band:
        try:
            return band_of(self._accounts.get(user_id).age_bracket)
        except AccountNotFound:
            return "minor"

    def _language(self, user_id: UUID) -> str:
        try:
            return self._accounts.get(user_id).language
        except AccountNotFound:
            return "en"

    def _require(self, user_id: UUID) -> ChainProfile:
        if not self.available(user_id):
            raise ChainError("unavailable")
        profile = self._repository.profile(user_id)
        if profile is None:
            raise ChainError("not_joined")
        if profile.suspended:
            raise ChainError("suspended")
        return profile

    def overview(self, user_id: UUID) -> ChainOverview:
        language = self._language(user_id)
        available = self.available(user_id)
        profile = self._repository.profile(user_id) if available else None
        stories: list[StorySummary] = []
        duos: list[DuoChoice] = []
        blocks: tuple[Block, ...] = ()
        if profile is not None:
            for story in self._repository.stories_of(user_id, 20):
                summary = self._summary(story, user_id, language)
                if summary is not None:
                    stories.append(summary)
            if self._band(user_id) == "adult":
                for duo in self._social.duos_of(user_id):
                    other = self._social.profile(duo.other(user_id))
                    if other is not None:
                        duos.append(DuoChoice(duo.id, other.codename))
            blocks = tuple(self._social.blocks_of(user_id))
        return ChainOverview(
            available=available,
            profile=profile,
            stories=tuple(stories),
            openings=tuple(
                OpeningView(o.id, o.genre, text_in(o.title, language)) for o in OPENINGS
            ),
            duos=tuple(duos),
            blocks=blocks,
        )

    def join(self, user_id: UUID, *, veil_default: bool, voice_consent: bool) -> ChainProfile:
        """Joins the story chain, or changes the answers of one who joined. Raises
        `ChainError`: `unavailable`, `consent_required`."""
        if not self.available(user_id):
            raise ChainError("unavailable")
        if not voice_consent:
            raise ChainError("consent_required")
        current = self._repository.profile(user_id)
        now = self._clock()
        profile = ChainProfile(
            user_id=user_id,
            codename=current.codename if current else codename_from(self._rng),
            band=self._band(user_id),
            veil_default=veil_default,
            paused=current.paused if current else False,
            consent_version=VOICE_CONSENT_VERSION,
            consent_at=current.consent_at if current else now,
            strikes=current.strikes if current else 0,
            suspended=current.suspended if current else False,
        )
        self._repository.save_profile(profile)
        return profile

    def reroll(self, user_id: UUID) -> ChainProfile:
        profile = self._require(user_id)
        changed = replace(profile, codename=codename_from(self._rng))
        self._repository.save_profile(changed)
        return changed

    def change(
        self, user_id: UUID, *, veil_default: bool | None = None, paused: bool | None = None
    ) -> ChainProfile:
        profile = self._require(user_id)
        changed = replace(
            profile,
            veil_default=profile.veil_default if veil_default is None else veil_default,
            paused=profile.paused if paused is None else paused,
        )
        self._repository.save_profile(changed)
        return changed

    def leave(self, user_id: UUID) -> None:
        """Deletes the learner's story-chain data (9.8), as withdrawing the voice-sharing consent
        does: their lines' words and sounds, their invites and their profile. Their open stories
        go on with an AI character in their seat; blocks stay, they protect both."""
        for line in self._repository.lines_by(user_id):
            # A held line stays in the owner's queue: no action of its speaker takes it out.
            if line.status != "held":
                self._forget(line, "removed")
        for story in self._repository.stories_of(user_id, 100):
            state = story.seat_of(user_id)
            if state is None:
                continue
            invite = self._repository.invite_for(story.id)
            if invite is not None and invite.user_id == user_id:
                self._repository.delete_invite(invite.code)
            if story.status == "open" and not state.ai:
                self._take_over(story, state.seat)
        self._repository.delete_profile(user_id)

    def _forget(self, line: Line, status: LineStatus) -> None:
        """Deletes a line's words and sounds, and what the narrator wrote from them: the
        summaries from it on, its link in the radio play, and the ending (the hand-written one
        stands in)."""
        for key in (line.audio_key, line.veil_key):
            if key:
                self._files.remove(key)
        self._repository.save_line(
            replace(
                line,
                status=status,
                transcript="",
                audio_key=None,
                veil_key=None,
                corrections=(),
                recap=None,
            )
        )
        story = self._repository.story(line.story_id)
        if story is None:
            return
        for later in self._repository.lines_of(story.id):
            if later.position > line.position and later.recap:
                self._repository.save_line(replace(later, recap=None))
        if not story.play:
            return
        found = opening(story.opening_id)
        last = len(story.play) - 1
        kept: list[Segment] = []
        for index, segment in enumerate(story.play):
            derived = segment.kind == "narrator" and (
                index == last or (segment.position == line.position and segment.position > 0)
            )
            if not derived:
                kept.append(segment)
                continue
            if segment.audio_key:
                self._files.remove(segment.audio_key)
            if index == last and found is not None:
                kept.append(
                    replace(segment, text=text_in(found.ending, story.language), audio_key=None)
                )
        self._repository.save_story(replace(story, play=tuple(kept)))

    def _wipe_play(self, story: Story) -> None:
        """The radio play 30 days after the story ended: the narrator's sounds and words go."""
        for segment in story.play:
            if segment.audio_key:
                self._files.remove(segment.audio_key)
        if story.opening_key:
            self._files.remove(story.opening_key)
        self._repository.save_story(replace(story, play=(), opening_key=None))

    # --- Starting a story (9.3, 9.9)

    def _room(self, user_id: UUID) -> None:
        open_stories = [s for s in self._repository.stories_of(user_id, 50) if s.status != "done"]
        if len(open_stories) >= OPEN_STORIES:
            raise ChainError("too_many_stories")

    def _target(self, user_id: UUID) -> str:
        language = self._profiles.get(user_id).target_language or ""
        if language not in LANGUAGES:
            raise ChainError("no_language")
        return language

    def start(
        self, user_id: UUID, opening_id: str | None, seats: Sequence[tuple[SeatKind, UUID | None]]
    ) -> Story:
        """A new story with the learner in the first seat. `seats` says who sits in seats 2 to
        4: an AI character, a friend who redeems the code, or one of the learner's duos. Only
        adults seat other learners. Raises `ChainError`."""
        profile = self._require(user_id)
        if profile.paused:
            raise ChainError("paused")
        if len(seats) != SEATS - 1:
            raise ChainError("invalid_value")
        self._room(user_id)
        language = self._target(user_id)
        chosen = self._opening(opening_id)
        people = [kind for kind, _ in seats if kind != "ai"]
        if people and self._band(user_id) != "adult":
            raise ChainError("adults_only")
        duo_ids = [duo for kind, duo in seats if kind == "duo"]
        if len(set(duo_ids)) != len(duo_ids):
            raise ChainError("invalid_value")
        guests: dict[int, UUID] = {}
        for number, (kind, duo_id) in enumerate(seats, start=2):
            if kind == "duo":
                guests[number] = self._duo_guest(user_id, duo_id, language)
        # Nobody is seated with someone either of them blocked, guests among themselves too.
        everyone = [user_id, *guests.values()]
        for index, one in enumerate(everyone):
            for other in everyone[index + 1 :]:
                if self._social.blocked(one, other):
                    raise ChainError("not_found")
        now = self._clock()
        story = Story(
            id=self._new_id(),
            opening_id=chosen.id,
            language=language,
            level=self._profiles.get(user_id).level(language) or "A2",
            mode="friends" if people else "solo",
            host=user_id,
            status="open",
            created_at=now,
            seats=(ChainSeat(1, user_id), *(ChainSeat(n, None) for n in range(2, SEATS + 1))),
            turn_since=now,
        )
        for number, (kind, _) in enumerate(seats, start=2):
            if kind == "ai":
                story = story.with_seat(
                    ChainSeat(number, None, ai_name_for(story, number), host=True)
                )
            elif kind == "duo":
                story = story.with_seat(ChainSeat(number, guests[number], host=True))
        self._repository.save_story(story)
        if any(kind == "friend" for kind, _ in seats):
            self._repository.save_invite(
                ChainInvite(invite_code(), user_id, story.id, now, now + INVITE_FOR)
            )
        for guest in guests.values():
            self._announce(guest, story.id, "invited")
        self._start("opening", story.id)
        return story

    def _opening(self, opening_id: str | None) -> Opening:
        if opening_id is None:
            return self._rng.choice(OPENINGS)
        found = opening(opening_id)
        if found is None:
            raise ChainError("not_found")
        return found

    def _guest_ok(self, host: UUID, guest: UUID, language: str) -> ChainProfile:
        """A learner another seats in their story: joined, an adult, not blocked either way,
        not paused, with room, and learning the same language."""
        profile = self._repository.profile(guest)
        if profile is None or profile.suspended or not self.available(guest):
            raise ChainError("partner_not_joined")
        if self._band(guest) != "adult":
            raise ChainError("adults_only")
        if self._social.blocked(host, guest):
            raise ChainError("not_found")
        if profile.paused:
            raise ChainError("paused")
        if self._profiles.get(guest).target_language != language:
            raise ChainError("no_shared_language")
        self._room(guest)
        return profile

    def _duo_guest(self, user_id: UUID, duo_id: UUID | None, language: str) -> UUID:
        duo = next((d for d in self._social.duos_of(user_id) if d.id == duo_id), None)
        if duo is None:
            raise ChainError("not_found")
        other = duo.other(user_id)
        self._guest_ok(user_id, other, language)
        return other

    def invite(self, user_id: UUID, story_id: UUID) -> ChainInvite:
        """The story's code for its empty seats: the one there is, or a new one."""
        self._require(user_id)
        story, _ = self._story(user_id, story_id)
        if story.host != user_id or story.status != "open":
            raise ChainError("not_host")
        if not any(s.open for s in story.seats):
            raise ChainError("no_empty_seat")
        existing = self._repository.invite_for(story.id)
        now = self._clock()
        if existing is not None and existing.expires_at > now:
            return existing
        made = ChainInvite(invite_code(), user_id, story.id, now, now + INVITE_FOR)
        self._repository.save_invite(made)
        return made

    def redeem(self, user_id: UUID, code: str) -> Story:
        """Takes the first empty seat of the friend's story whose code it is. Refused calmly
        for a code that is wrong or old (`not_found`), across age bands (`adults_only`), when
        the two learn different languages, and after the day's wrong codes (`limit`, shared
        with Two Halves)."""
        self._require(user_id)
        today = self._clock().date()
        if self._social.wrong_codes(user_id, today) >= WRONG_CODES_PER_DAY:
            raise ChainError("limit")
        found = self._repository.invite("".join(code.split()).upper())
        story = self._repository.story(found.story_id) if found else None
        if found is None or story is None or found.expires_at <= self._clock():
            self._social.note_wrong_code(user_id, today, WRONG_CODES_PER_DAY)
            raise ChainError("not_found")
        seated = story.seat_of(user_id)
        if seated is not None:
            raise ChainError("not_found" if seated.removed else "own_code")
        if self._band(user_id) != "adult":
            raise ChainError("adults_only")
        empty = next((s for s in story.seats if s.open), None)
        if story.status != "open" or empty is None:
            raise ChainError("not_found")
        for seat in story.seats:
            if seat.user_id is not None and self._social.blocked(seat.user_id, user_id):
                raise ChainError("not_found")
        self._guest_ok(story.payer or user_id, user_id, story.language)
        story = story.with_seat(replace(empty, user_id=user_id))
        self._repository.save_story(story)
        if not any(s.open for s in story.seats):
            self._repository.delete_invite(found.code)
        if story.host is not None:
            self._announce(story.host, story.id, "invited")
        if self._turn_seat(story) == empty.seat:
            self._announce(user_id, story.id, "turn")
        return story

    def fill(self, user_id: UUID, story_id: UUID) -> StoryView:
        """The host starts without waiting: AI characters take the empty seats."""
        self._require(user_id)
        story, _ = self._story(user_id, story_id)
        if story.host != user_id or story.status != "open":
            raise ChainError("not_host")
        for seat in story.seats:
            if seat.open:
                story = story.with_seat(replace(seat, ai_name=ai_name_for(story, seat.seat)))
        self._repository.save_story(story)
        invite = self._repository.invite_for(story.id)
        if invite is not None:
            self._repository.delete_invite(invite.code)
        self._start("ai", story.id)
        return self.view(user_id, story.id)

    # --- Playing (9.4, 9.5, 9.6)

    def _story(
        self, user_id: UUID, story_id: UUID, *, removed: bool = False
    ) -> tuple[Story, ChainSeat]:
        """The story and the learner's seat. A learner taken out by a block cannot reach it,
        except (`removed`) for their own lines."""
        story = self._repository.story(story_id)
        state = story.seat_of(user_id) if story else None
        if story is None or state is None or (state.removed and not removed):
            raise ChainError("not_found")
        return story, state

    def _turn_seat(self, story: Story) -> int | None:
        position = next_position(story, self._repository.lines_of(story.id))
        return seat_for(position) if position is not None else None

    def view(self, user_id: UUID, story_id: UUID) -> StoryView:
        self._require(user_id)
        story, state = self._story(user_id, story_id)
        return self._view(story, state, self._repository.lines_of(story.id), user_id)

    def record(
        self,
        user_id: UUID,
        story_id: UUID,
        audio: bytes,
        audio_format: str,
        seconds: float | None,
        veiled: bool | None = None,
    ) -> Line:
        """The learner's line when it is their turn: written down word for word at once, then
        checked by the worker before anyone hears it. Raises `ChainError`."""
        profile = self._require(user_id)
        story, state = self._story(user_id, story_id)
        lines = self._repository.lines_of(story.id)
        position = next_position(story, lines)
        if position is None or seat_for(position) != state.seat or state.ai:
            raise ChainError("not_your_turn")
        if seconds is not None and seconds > LINE_SECONDS + 1:
            raise ChainError("too_long")
        try:
            self._listener.ready(user_id, audio, audio_format)
        except SpokenError as error:
            raise ChainError(error.code) from error
        now = self._clock()
        if self._repository.lines_since(user_id, now - dt.timedelta(days=1)) >= LINES_PER_DAY:
            raise ChainError("limit")
        try:
            said = self._listener.hear(
                user_id, story.language, audio, audio_format, seconds, Feature.CHAIN_LISTEN
            )
        except SpokenError as error:
            raise ChainError(error.code) from error
        if len(words_in(said)) < MIN_WORDS:
            raise ChainError("too_short")
        line_id = self._new_id()
        key = f"{FOLDER}/{user_id}/chain/{story.id}/{line_id}.{audio_format}"
        self._files.save(key, audio, _AUDIO_TYPES.get(audio_format, "application/octet-stream"))
        line = Line(
            id=line_id,
            story_id=story.id,
            position=position,
            seat=state.seat,
            user_id=user_id,
            status="checking",
            transcript=said,
            created_at=now,
            audio_key=key,
            veiled=profile.veil_default if veiled is None else veiled,
        )
        self._repository.save_line(line)
        self._start("check", line.id)
        return line

    def react(self, user_id: UUID, story_id: UUID, reaction: str) -> StoryView:
        """A fixed card on the finished radio play: the only thing players say to each other
        beyond their lines."""
        if reaction not in REACTIONS:
            raise ChainError("invalid_value")
        self._require(user_id)
        story, _ = self._story(user_id, story_id)
        if story.status != "done":
            raise ChainError("not_ready")
        self._repository.save_story(
            replace(story, reactions={**story.reactions, str(user_id): reaction})
        )
        return self.view(user_id, story.id)

    def step_out(self, user_id: UUID, story_id: UUID) -> StoryView:
        """The learner leaves an open story: an AI character takes their seat. They still hear
        the radio play at the end."""
        self._require(user_id)
        story, state = self._story(user_id, story_id)
        if story.status != "open" or state.ai:
            raise ChainError("not_your_turn")
        self._take_over(story, state.seat)
        return self.view(user_id, story.id)

    def _take_over(self, story: Story, seat: int) -> Story:
        state = story.seat(seat)
        taken = story.with_seat(replace(state, ai_name=ai_name_for(story, seat)))
        if self._turn_seat(taken) == seat:
            taken = replace(taken, turn_since=self._clock())
        self._repository.save_story(taken)
        self._start("ai", taken.id)
        return taken

    def _may_hear(self, story: Story, state: ChainSeat, line: Line) -> bool:
        """A seat hears its own lines, the line before each of them and before its turn, and
        everything once the story is done."""
        if line.status != "delivered" and line.seat != state.seat:
            return False
        if story.status == "done" or line.seat == state.seat:
            return True
        lines = self._repository.lines_of(story.id)
        mine = {x.position for x in lines if x.seat == state.seat and x.status == "delivered"}
        position = next_position(story, lines)
        if position is not None and seat_for(position) == state.seat:
            mine.add(position)
        return line.position + 1 in mine

    def address(self, user_id: UUID, line_id: UUID) -> str:
        """Where the app may play a line for five minutes: a listener hears the veiled sound of a
        veiled line, the speaker their own."""
        self._require(user_id)
        line = self._repository.line(line_id)
        if line is None:
            raise ChainError("not_found")
        story, state = self._story(user_id, line.story_id, removed=True)
        if state.removed and line.user_id != user_id:
            raise ChainError("not_found")
        if not self._may_hear(story, state, line) or user_id in line.hidden_for:
            raise ChainError("not_found")
        if line.user_id == user_id:
            key = line.audio_key or line.veil_key
        else:
            key = line.veil_key if line.veiled else (line.audio_key or line.veil_key)
        if not key:
            raise ChainError("not_found")
        return self._files.address(key, ADDRESS_SECONDS)

    def play_address(self, user_id: UUID, story_id: UUID, index: int) -> str:
        """A narrator part of the radio play, or the opening while the story is going on."""
        self._require(user_id)
        story, _ = self._story(user_id, story_id)
        segments = story.play
        if not 0 <= index < len(segments):
            raise ChainError("not_found")
        segment = segments[index]
        if segment.kind != "narrator" or not segment.audio_key:
            raise ChainError("not_found")
        return self._files.address(segment.audio_key, ADDRESS_SECONDS)

    # --- The private report (9.7)

    def _own_correction(
        self, user_id: UUID, line_id: UUID, index: int
    ) -> tuple[Story, Line, Correction]:
        self._require(user_id)
        line = self._repository.line(line_id)
        if line is None or line.user_id != user_id:
            raise ChainError("not_found")
        story, _ = self._story(user_id, line.story_id)
        if not 0 <= index < len(line.corrections):
            raise ChainError("not_found")
        correction = line.corrections[index]
        if not correction.certain:
            # A correction nobody could confirm is a hint; drilling it could teach a mistake.
            raise ChainError("unsure")
        return story, line, correction

    def retry(
        self,
        user_id: UUID,
        line_id: UUID,
        index: int,
        audio: bytes,
        audio_format: str,
        seconds: float | None,
    ) -> Retried:
        """ "Say it better" on a confirmed correction of one's own line, as on 5.10."""
        story, _, correction = self._own_correction(user_id, line_id, index)
        try:
            self._listener.ready(user_id, audio, audio_format)
            if not self._repository.reserve_retry(user_id, self._clock().date(), RETRIES_PER_DAY):
                raise ChainError("retry_limit")
            heard = self._listener.hear(
                user_id, story.language, audio, audio_format, seconds, Feature.RETRY
            )
        except SpokenError as error:
            raise ChainError(error.code) from error
        right = is_right(heard, correction.original, correction.corrected)
        return Retried(heard, right, correction.original, correction.corrected)

    def save_card(self, user_id: UUID, line_id: UUID, index: int) -> Card:
        """A confirmed correction of one's own line kept as a card (5.7)."""
        story, _, correction = self._own_correction(user_id, line_id, index)
        return self._cards.save_correction(
            user_id,
            correction.original,
            correction.corrected,
            correction.explanation,
            self._explanation(user_id, story.language),
        )

    # --- Safety (9.10)

    def report(self, user_id: UUID, line_id: UUID, reason: str, note: str | None) -> StoryView:
        """Reports a line the learner heard: hidden from them at once, queued for the owner."""
        if reason not in REPORT_REASONS:
            raise ChainError("invalid_value")
        text = (note or "").strip() or None
        if text is not None and len(text) > REPORT_NOTE_MAX:
            raise ChainError("invalid_value")
        self._require(user_id)
        line = self._repository.line(line_id)
        if line is None or line.user_id == user_id:
            raise ChainError("not_found")
        story, state = self._story(user_id, line.story_id)
        if not self._may_hear(story, state, line):
            raise ChainError("not_found")
        if user_id not in line.hidden_for:
            self._repository.save_line(replace(line, hidden_for=(*line.hidden_for, user_id)))
        if line.user_id is not None:
            self._repository.add_report(
                Report(self._new_id(), user_id, line.id, reason, text, "open", self._clock())
            )
        return self.view(user_id, story.id)

    def block(self, user_id: UUID, story_id: UUID, seat: int) -> StoryView:
        """Blocks the learner in a seat: never seated together again (in either game), and an AI
        character takes their seat while the story is open."""
        self._require(user_id)
        story, state = self._story(user_id, story_id)
        if not 1 <= seat <= SEATS or seat == state.seat:
            raise ChainError("not_found")
        other = story.seat(seat)
        if other.user_id is None:
            raise ChainError("not_found")
        known = self._repository.profile(other.user_id)
        self._social.add_block(
            Block(
                self._new_id(),
                user_id,
                other.user_id,
                known.codename if known else "",
                self._clock(),
            )
        )
        self._social.remove_duo(user_id, other.user_id)
        story = story.with_seat(replace(other, removed=True))
        self._repository.save_story(story)
        if story.status == "open" and not other.ai:
            self._take_over(story, seat)
        return self.view(user_id, story.id)

    def unblock(self, user_id: UUID, block_id: UUID) -> None:
        self._require(user_id)
        self._social.remove_block(user_id, block_id)

    # --- The owner's queue (6.15)

    def is_owner(self, user_id: UUID) -> bool:
        return user_id in self._owners

    def queue(self, user_id: UUID) -> list[QueueItem]:
        if not self.is_owner(user_id):
            raise ChainError("not_owner")
        items: list[QueueItem] = []
        for line in self._repository.held(QUEUE_LIMIT):
            sender = self._repository.profile(line.user_id) if line.user_id else None
            items.append(
                QueueItem(
                    "held",
                    line.id,
                    line.id,
                    line.transcript,
                    line.reasons,
                    sender.codename if sender else "",
                    None,
                    None,
                    self._band(line.user_id) if line.user_id else "minor",
                    line.created_at,
                )
            )
        for report in self._repository.open_reports(QUEUE_LIMIT):
            reported = self._repository.line(report.move_id)
            if reported is None:
                continue
            sender = self._repository.profile(reported.user_id) if reported.user_id else None
            reporter = self._repository.profile(report.reporter)
            items.append(
                QueueItem(
                    "report",
                    report.id,
                    reported.id,
                    reported.transcript,
                    (report.reason,),
                    sender.codename if sender else "",
                    reporter.codename if reporter else "",
                    report.note,
                    self._band(reported.user_id) if reported.user_id else "minor",
                    report.created_at,
                )
            )
        return sorted(items, key=lambda item: item.created_at, reverse=True)

    def decide(self, user_id: UUID, kind: str, item_id: UUID, action: str) -> None:
        """The owner removes a line (a strike for its speaker; three suspend them) or dismisses
        the item. A held line is never delivered later: its speaker recorded it again."""
        if not self.is_owner(user_id):
            raise ChainError("not_owner")
        if action not in ("remove", "dismiss"):
            raise ChainError("invalid_value")
        now = self._clock()
        if kind == "report":
            report = self._repository.report(item_id)
            if report is None:
                raise ChainError("not_found")
            self._repository.save_report(
                replace(
                    report, status="removed" if action == "remove" else "dismissed", resolved_at=now
                )
            )
            line = self._repository.line(report.move_id)
        elif kind == "held":
            line = self._repository.line(item_id)
            if line is None or line.status != "held":
                raise ChainError("not_found")
        else:
            raise ChainError("invalid_value")
        if line is None:
            return
        if action == "remove":
            self._forget(line, "removed")
            if line.user_id is not None:
                self._strike(line.user_id)
        elif kind == "held":
            self._forget(line, "removed")

    def _strike(self, user_id: UUID) -> None:
        profile = self._repository.profile(user_id)
        if profile is None:
            return
        strikes = profile.strikes + 1
        self._repository.save_profile(
            replace(profile, strikes=strikes, suspended=strikes >= STRIKES_TO_SUSPEND)
        )

    # --- The worker

    def check(self, line_id: UUID) -> None:
        """Checks a line and delivers it, or holds it. Fails closed, as a Two Halves move."""
        line = self._repository.line(line_id)
        if line is None or line.status != "checking" or line.user_id is None:
            return
        story = self._repository.story(line.story_id)
        if story is None:
            return
        attempt = replace(line, attempts=line.attempts + 1)
        self._repository.save_line(attempt)
        # From the sign-up age group each time, never a stored flag: the stricter band when unsure.
        band = self._band(line.user_id)
        labels = self._narrator.check(attempt, band, story.language)
        if labels is None:
            self._unchecked(attempt)
            return
        if labels:
            self._repository.save_line(replace(attempt, status="held", reasons=labels))
            self._announce(line.user_id, story.id, "held")
            return
        veil_key = None
        if attempt.veiled:
            veil_key = self._narrator.veil(attempt)
            if veil_key is None:
                self._unchecked(attempt)
                return
        done = replace(attempt, status="delivered", veil_key=veil_key, delivered_at=self._clock())
        self._repository.save_line(done)
        corrections = self._narrator.correct(
            done, story.language, self._explanation(line.user_id, story.language)
        )
        if corrections:
            done = replace(done, corrections=corrections)
            self._repository.save_line(done)
        self._advance(story, done)

    def _unchecked(self, line: Line) -> None:
        if line.attempts >= CHECK_ATTEMPTS:
            self._repository.save_line(replace(line, status="failed", reasons=("unavailable",)))
            if line.user_id is not None:
                self._announce(line.user_id, line.story_id, "held")

    def _explanation(self, user_id: UUID, target: str) -> str:
        profile = self._profiles.get(user_id)
        return profile.value(target, "explanation_language") or self._language(user_id)

    def _advance(self, story: Story, line: Line) -> None:
        """After a line is in: the narrator sums up the story for the next seat, and the next
        seat is told, or the AI goes on, or the radio play is made."""
        lines = self._repository.lines_of(story.id)
        recap = " ".join(self._narrator.recap(story, delivered(lines)).split())[:RECAP_MAX]
        self._repository.save_line(replace(line, recap=recap or None))
        story = replace(story, turn_since=self._clock())
        if line.position >= LINES:
            self._repository.save_story(replace(story, status="finishing", play_status="pending"))
            self._start("play", story.id)
            return
        self._repository.save_story(story)
        upcoming = story.seat(seat_for(line.position + 1))
        if upcoming.ai:
            self._start("ai", story.id)
        elif upcoming.user_id is not None and not upcoming.removed:
            self._announce(upcoming.user_id, story.id, "turn")

    def speak_opening(self, story_id: UUID) -> None:
        """The narrator reads the opening, for the first seat to hear before its line."""
        story = self._repository.story(story_id)
        if story is None or story.opening_key:
            return
        key = self._narrator.speak_opening(story)
        if key:
            current = self._repository.story(story_id) or story
            self._repository.save_story(replace(current, opening_key=key))

    def opening_address(self, user_id: UUID, story_id: UUID) -> str:
        self._require(user_id)
        story, _ = self._story(user_id, story_id)
        if not story.opening_key:
            raise ChainError("not_found")
        return self._files.address(story.opening_key, ADDRESS_SECONDS)

    def play_ai(self, story_id: UUID) -> None:
        """The AI characters say every line they owe, one after the other, until a learner's
        turn comes. Runs in the worker (they speak)."""
        for _ in range(LINES):
            story = self._repository.story(story_id)
            if story is None:
                return
            lines = self._repository.lines_of(story.id)
            position = next_position(story, lines)
            if position is None:
                return
            seat = story.seat(seat_for(position))
            if not seat.ai:
                return
            said = self._narrator.go_on(story, delivered(lines), seat, ai_voice_for(seat.seat))
            said = replace(
                said,
                id=uuid.uuid5(story.id, f"line-{position}"),
                position=position,
                seat=seat.seat,
                ai_name=seat.ai_name,
            )
            self._repository.save_line(said)
            self._advance(story, said)

    def make_play(self, story_id: UUID) -> None:
        """The radio play: the narrator's parts between the lines, then everyone is told."""
        story = self._repository.story(story_id)
        if story is None or story.status != "finishing":
            return
        lines = delivered(self._repository.lines_of(story.id))
        narration = self._narrator.narrate(story, lines)
        segments: list[Segment] = [s for s in narration if s.position == 0]
        for line in lines:
            # The words stay on the line, never copied: forgetting the line forgets them.
            segments.append(Segment("line", "", None, line.position, line_id=line.id))
            segments.extend(s for s in narration if s.position == line.position)
        now = self._clock()
        for line in self._repository.lines_of(story.id):
            self._repository.save_line(replace(line, delete_after=now + KEEP_FOR))
        self._repository.save_story(
            replace(
                story,
                status="done",
                ended_at=now,
                play=tuple(segments),
                play_status="ready" if narration else "failed",
            )
        )
        for player in story.players():
            self._announce(player, story.id, "ready")

    def tick(self) -> None:
        """Once an hour: lines lost with their worker are checked again (or fail), sounds and
        words past their 30 days are deleted, old codes go, a seat quiet on its turn for 48
        hours is taken over by an AI character, and the worker catches up."""
        now = self._clock()
        for line in self._repository.stale_checks(now - CHECK_STALE, TICK_SCAN):
            if line.attempts >= CHECK_ATTEMPTS:
                self._unchecked(line)
            else:
                self._start("check", line.id)
        for line in self._repository.expired(now, TICK_SCAN):
            if line.status == "held":
                # Waits for the owner's decision, which deletes it.
                continue
            self._forget(line, "removed" if line.status != "delivered" else "delivered")
        for story in self._repository.ended_before(now - KEEP_FOR, TICK_SCAN):
            self._wipe_play(story)
        self._repository.delete_expired_invites(now)
        for story in self._repository.unfinished(TICK_SCAN):
            if story.status == "finishing":
                self._start("play", story.id)
                continue
            turn = self._turn_seat(story)
            if turn is None:
                continue
            seat = story.seat(turn)
            if seat.ai:
                self._start("ai", story.id)
            elif now - story.turn_since >= TURN_TIMEOUT:
                self._take_over(story, turn)

    def _start(self, job: str, item_id: UUID) -> None:
        try:
            self._starter.start(job, item_id)
        except Exception:  # the hourly tick starts it again
            return

    # --- Views

    def _seat_label(
        self, story: Story, seat: ChainSeat, me: UUID, lines: Sequence[Line]
    ) -> SeatLabel:
        said = sum(1 for x in lines if x.seat == seat.seat and x.status == "delivered")
        if seat.ai:
            state: Literal["playing", "waiting", "taken_over"] = (
                "taken_over" if seat.user_id is not None else "playing"
            )
            return SeatLabel(seat.seat, seat.ai_name or "", True, seat.user_id == me, state, said)
        if seat.open:
            return SeatLabel(seat.seat, "", False, False, "waiting", said)
        known = self._repository.profile(seat.user_id) if seat.user_id else None
        return SeatLabel(
            seat.seat, known.codename if known else "", False, seat.user_id == me, "playing", said
        )

    def _summary(self, story: Story, user_id: UUID, language: str) -> StorySummary | None:
        state = story.seat_of(user_id)
        found = opening(story.opening_id)
        if state is None or state.removed or found is None:
            return None
        lines = self._repository.lines_of(story.id)
        position = next_position(story, lines)
        if story.status == "done":
            next_: Next = "done" if str(user_id) in story.reactions else "listen"
        elif position is not None and seat_for(position) == state.seat and not state.ai:
            next_ = "record"
        else:
            next_ = "wait"
        return StorySummary(
            id=story.id,
            opening_id=story.opening_id,
            genre=found.genre,
            title=text_in(found.title, language),
            mode=story.mode,
            status=story.status,
            next=next_,
            position=position or len(delivered(lines)),
            seats=tuple(self._seat_label(story, s, user_id, lines) for s in story.seats),
            created_at=story.created_at,
        )

    def _heard(self, story: Story, lines: Sequence[Line], position: int, me: UUID) -> Heard:
        """What a seat hears before saying line `position`: the line before, or the opening."""
        found = opening(story.opening_id)
        if position <= 1 or found is None:
            return Heard(
                "narrator",
                None,
                "",
                True,
                text_in(found.opening, story.language) if found else "",
                None,
                has_audio=story.opening_key is not None,
            )
        before = next(
            (x for x in lines if x.position == position - 1 and x.status == "delivered"), None
        )
        if before is None:
            return Heard("narrator", None, "", True, "", None)
        label = self._seat_label(story, story.seat(before.seat), me, lines)
        return Heard(
            "line",
            before.id,
            before.ai_name or label.name,
            before.user_id is None,
            before.transcript,
            before.recap,
            me in before.hidden_for,
            has_audio=bool(before.audio_key or before.veil_key) and me not in before.hidden_for,
        )

    def _view(
        self, story: Story, state: ChainSeat, lines: Sequence[Line], user_id: UUID
    ) -> StoryView:
        found = opening(story.opening_id)
        if found is None:
            raise ChainError("not_found")
        language = self._language(user_id)
        position = next_position(story, lines)
        turn = seat_for(position) if position is not None else None
        my_turn = turn == state.seat and not state.ai
        mine: list[MineView] = []
        for line in sorted(lines, key=lambda x: x.created_at):
            if line.seat != state.seat or line.user_id != user_id:
                continue
            mine.append(
                MineView(
                    id=line.id,
                    position=line.position,
                    status=line.status,
                    transcript=line.transcript,
                    reasons=line.reasons,
                    veiled=line.veiled,
                    corrections=line.corrections,
                    before=self._heard(story, lines, line.position, user_id),
                )
            )
        labels = tuple(self._seat_label(story, s, user_id, lines) for s in story.seats)
        play: list[PlayView] = []
        if story.status == "done":
            by_id = {x.id: x for x in lines}
            for index, segment in enumerate(story.play):
                if segment.kind == "narrator":
                    play.append(
                        PlayView(
                            index,
                            "narrator",
                            "",
                            True,
                            False,
                            segment.text,
                            segment.position,
                            None,
                            segment.audio_key is not None,
                            False,
                        )
                    )
                    continue
                said = by_id.get(segment.line_id) if segment.line_id else None
                if said is None:
                    continue
                label = labels[said.seat - 1]
                hidden = (
                    user_id in said.hidden_for or said.status != "delivered" or not said.transcript
                )
                play.append(
                    PlayView(
                        index,
                        "line",
                        said.ai_name or label.name,
                        said.user_id is None,
                        said.user_id == user_id,
                        "" if hidden else said.transcript,
                        said.position,
                        said.id,
                        bool(said.audio_key or said.veil_key) and not hidden,
                        hidden,
                    )
                )
        counts = dict.fromkeys(REACTIONS, 0)
        for reaction in story.reactions.values():
            if reaction in counts:
                counts[reaction] += 1
        profile = self._repository.profile(user_id)
        host = story.host == user_id
        return StoryView(
            id=story.id,
            opening_id=story.opening_id,
            genre=found.genre,
            title=text_in(found.title, language),
            language=story.language,
            mode=story.mode,
            status=story.status,
            my_seat=state.seat,
            host=host,
            position=position or len(delivered(lines)),
            turn_seat=turn,
            my_turn=my_turn,
            seats=labels,
            before=self._heard(story, lines, position, user_id) if my_turn and position else None,
            mine=tuple(mine),
            play=tuple(play),
            play_status=story.play_status,
            reactions=counts,
            my_reaction=story.reactions.get(str(user_id)),
            veil_default=profile.veil_default if profile else True,
            invite=(
                self._repository.invite_for(story.id)
                if host and story.status == "open" and any(s.open for s in story.seats)
                else None
            ),
            can_fill=host and story.status == "open" and any(s.open for s in story.seats),
        )
