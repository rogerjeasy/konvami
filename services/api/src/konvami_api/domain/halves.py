"""Two Halves (section 7, design note 2026-11-20-two-halves-design.md): a voice mystery for two,
split by language.

Each seat holds half of a case's clues. In each of three rounds a seat tells the other one clue
by voice, in the language it is learning; the other hears it (for them the easier language) and
proves it got through by answering a question about it on the board. After three rounds each,
both answer the case's question. Each learner's own partner briefs and rehearses them in private
(7.5) and corrects their moves in private (7.9): the other player only ever hears the attempt.

Phase 1 (this module): no stranger hears a stranger. A learner plays against an AI stand-in,
always labelled as AI, or (adults only) with a friend they invite by code. Every move a learner
records is checked on the server before anyone hears it (`halves_check.py`): local rules,
the moderation provider and an on-task check, and it fails closed. Moves are kept at most 30
days after the case ends.

Nothing here is free text a learner types: a codename the server makes up, a native language, a
place from a fixed list, template reactions and answers chosen from options. The only words a
learner gives are their moves, which are checked; a report's note goes only to the owner.

Phase 2 (design note 2026-11-20-two-halves-phase2-design.md) adds, behind switches of their own:
matching adults who are strangers (`strangers`, off until the legal review; `halves_match.py`),
the Bridge for same-language mode, native nudges (a short phrase a native suggests, read by a
verifier before the speaker sees it), the strand map, a share card, owner warnings and
suspensions with the queue's numbers, the native-intelligibility count, a case the Learning
Director suggests once a week, and a case written from the learner's own course import.
"""

import datetime as dt
import random
import secrets
import uuid
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass, field, replace
from typing import Literal, Protocol
from uuid import UUID, uuid4

from konvami_api.domain.accounts import AccountDirectory, AccountNotFound
from konvami_api.domain.costs import Feature
from konvami_api.domain.halves_cases import (
    CASES,
    LANGUAGES,
    ROUNDS,
    CaseTemplate,
    Seat,
    other_seat,
    season_case,
    template,
    text_in,
)
from konvami_api.domain.halves_match import Seeker, pairs
from konvami_api.domain.halves_writer import (
    CaseMaterial,
    CaseWriter,
    NoCaseWriter,
    word_case,
)
from konvami_api.domain.moderation import local_problem
from konvami_api.domain.personas import PersonaService
from konvami_api.domain.profile import ProfileService
from konvami_api.domain.reports import words_in
from konvami_api.domain.scenarios import Goal, Scenario
from konvami_api.domain.spoken import Listener, SpokenError
from konvami_api.domain.storage import FileStore

type Band = Literal["adult", "minor"]
# `match`: two adults paired by the matching rules (phase 2, only while `strangers` is on).
type Mode = Literal["ai", "friend", "duo", "match"]
# A nudge (phase 2): `checking` until the verifier answers; only `passed` reaches the speaker.
# `dropped`: wrong or no better, quietly. `held`: it broke a safety rule; the owner's queue.
type NudgeStatus = Literal["checking", "passed", "dropped", "held"]
# What a nudge breaks that the owner sees, rather than a quiet drop.
NUDGE_HOLDS: frozenset[str] = frozenset({"unsafe", "off_topic", "contact", "instructions", "link"})
# What the owner recorded about a learner (6.15): a strike counts towards suspension.
type StrikeKind = Literal["strike", "warning", "suspension"]
# The owner's decisions on an item of the queue.
type Decision = Literal["remove", "dismiss", "warn", "suspend"]
DECISIONS: tuple[str, ...] = ("remove", "dismiss", "warn", "suspend")
type CaseStatus = Literal["open", "solved", "unsolved"]
# `checking`: on the server, nobody hears it yet. `held`: the check stopped it; it is never
# delivered and goes to the owner's queue. `failed`: it could not be checked (fails closed).
# `removed`: taken away (by the owner, a withdrawal of consent, or the 30 days).
type MoveStatus = Literal["checking", "delivered", "held", "failed", "removed"]
type Reaction = Literal["got_it", "again_slower", "helped", "bravo"]
type ReportReason = Literal["harassment", "sexual", "personal", "hate", "off_topic", "other"]
type ReportStatus = Literal["open", "removed", "dismissed"]
type RecapStatus = Literal["none", "pending", "ready", "failed"]
# What a seat is waiting for, as the hub shows it.
type Next = Literal["record", "answer", "final", "again", "wait", "done"]

REACTIONS: tuple[str, ...] = ("got_it", "again_slower", "helped", "bravo")
REPORT_REASONS: tuple[str, ...] = ("harassment", "sexual", "personal", "hate", "off_topic", "other")
NATIVE_LANGUAGES: tuple[str, ...] = (*LANGUAGES, "other")

# The consent to let one other learner hear one's moves (7.2), a record of its own, separate
# from the AI consent of 2.5.
VOICE_CONSENT_VERSION = 1
# A move is at most this long (the app stops recording there).
MOVE_SECONDS = 90
# Fewer words than this is a cough or a mis-tap, not a clue.
MIN_WORDS = 3
# Moves a learner may send in a day: each is a transcription and a few requests to a model.
MOVES_PER_DAY = 20
# Cases a learner may have open at once.
OPEN_CASES = 3
# After this long without a move from the other seat, the waiting learner may hand it to an AI.
SEAT_TIMEOUT = dt.timedelta(hours=72)
INVITE_FOR = dt.timedelta(days=7)
# A move's sound and words are deleted this long after its case ends (and the bucket deletes
# anything under halves/ after 30 days in any case: infra/modules/media).
KEEP_FOR = dt.timedelta(days=30)
# A move still being checked after this long was lost with its worker and is checked again, at
# most `CHECK_ATTEMPTS` times in all; then it fails (closed: never delivered unchecked).
CHECK_STALE = dt.timedelta(minutes=5)
CHECK_ATTEMPTS = 3
# Wrong answers on the board before the right one is shown and the round moves on.
ANSWER_TRIES = 2
FINAL_TRIES = 2
# Confirmed strikes (held or reported moves the owner removed) that suspend social play.
STRIKES_TO_SUSPEND = 3
# How long the app may play a move through one address.
ADDRESS_SECONDS = 5 * 60
REPORT_NOTE_MAX = 300
QUEUE_LIMIT = 100
TICK_SCAN = 200
# About 49 bits from a cryptographic source: a code is the key to a friend's case.
CODE_LENGTH = 10
# Wrong codes a learner may try in a day before redeeming is refused until the next day.
WRONG_CODES_PER_DAY = 10
# No 0/O, 1/I/L: a code is read aloud and typed.
CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
SOUND_TYPE = "audio/mpeg"
FOLDER = "halves"

# --- Phase 2
# How long a learner keeps looking for a partner (7.3): they choose, in steps of hours.
SEARCH_HOURS_DEFAULT = 12
SEARCH_HOURS_MIN = 2
SEARCH_HOURS_MAX = 48
# After this long without a partner, the search offers an AI (concept §3.10).
AI_OFFER_AFTER = dt.timedelta(hours=12)
# A native nudge (7.7): a short phrase, never a message.
NUDGE_MIN = 2
NUDGE_MAX = 120
# A nudge the verifier could not read this many times is dropped (fails closed).
NUDGE_ATTEMPTS = 3
NUDGE_STALE = dt.timedelta(minutes=5)
# The Bridge (same-language mode, 7.7), in the order it is offered.
BRIDGE_STEPS: tuple[str, ...] = ("slower", "simpler", "gist")
# Cases written from a course import a learner may start in a day: each is a strong-model request.
IMPORT_CASES_PER_DAY = 3
# The owner's numbers (6.15) look back this far.
STATS_WINDOW = dt.timedelta(days=30)
# How far back the hub counts the clues the other understood at the first try.
HEARD_WINDOW = dt.timedelta(days=30)

# Where the strand map (7.14) draws a place: latitude and longitude of the listed cities and of
# each country's middle. Nothing finer than a city is ever kept or drawn.
CITY_POINTS: Mapping[str, tuple[float, float]] = {
    "Basel": (47.56, 7.59),
    "Bern": (46.95, 7.45),
    "Genève": (46.20, 6.14),
    "Lausanne": (46.52, 6.63),
    "Lugano": (46.00, 8.95),
    "Luzern": (47.05, 8.31),
    "St. Gallen": (47.42, 9.37),
    "Zürich": (47.37, 8.54),
    "Berlin": (52.52, 13.40),
    "Frankfurt": (50.11, 8.68),
    "Hamburg": (53.55, 9.99),
    "Köln": (50.94, 6.96),
    "Leipzig": (51.34, 12.37),
    "München": (48.14, 11.58),
    "Stuttgart": (48.78, 9.18),
    "Wien": (48.21, 16.37),
    "Bordeaux": (44.84, -0.58),
    "Lille": (50.63, 3.06),
    "Lyon": (45.76, 4.84),
    "Marseille": (43.30, 5.37),
    "Nantes": (47.22, -1.55),
    "Paris": (48.86, 2.35),
    "Strasbourg": (48.57, 7.75),
    "Toulouse": (43.60, 1.44),
    "Bologna": (44.49, 11.34),
    "Firenze": (43.77, 11.26),
    "Milano": (45.46, 9.19),
    "Napoli": (40.85, 14.27),
    "Roma": (41.90, 12.50),
    "Torino": (45.07, 7.69),
    "London": (51.51, -0.13),
    "Bruxelles": (50.85, 4.35),
}
COUNTRY_POINTS: Mapping[str, tuple[float, float]] = {
    "CH": (46.80, 8.23),
    "DE": (51.17, 10.45),
    "AT": (47.52, 14.55),
    "FR": (46.60, 2.21),
    "IT": (42.83, 12.83),
    "BE": (50.50, 4.47),
    "LU": (49.82, 6.13),
    "GB": (52.36, -1.17),
    "IE": (53.41, -8.24),
    "US": (39.83, -98.58),
    "CA": (56.13, -106.35),
}

_AUDIO_TYPES = {"m4a": "audio/mp4", "webm": "audio/webm", "wav": "audio/wav", "mp3": "audio/mpeg"}

# Codenames are a word and a number: neutral in the four languages, and nothing a learner types.
_CODE_WORDS: tuple[str, ...] = (
    "Atlas",
    "Birke",
    "Cedro",
    "Delta",
    "Fjord",
    "Iris",
    "Linde",
    "Luma",
    "Lyra",
    "Mira",
    "Nova",
    "Orion",
    "Pico",
    "Sora",
    "Tarn",
    "Vega",
)

# Where a learner may say they are: a city from this list, a country, or nothing. Never finer.
CITIES: tuple[str, ...] = (
    "Basel",
    "Bern",
    "Genève",
    "Lausanne",
    "Lugano",
    "Luzern",
    "St. Gallen",
    "Zürich",
    "Berlin",
    "Frankfurt",
    "Hamburg",
    "Köln",
    "Leipzig",
    "München",
    "Stuttgart",
    "Wien",
    "Bordeaux",
    "Lille",
    "Lyon",
    "Marseille",
    "Nantes",
    "Paris",
    "Strasbourg",
    "Toulouse",
    "Bologna",
    "Firenze",
    "Milano",
    "Napoli",
    "Roma",
    "Torino",
    "London",
    "Bruxelles",
)
COUNTRIES: tuple[str, ...] = ("CH", "DE", "AT", "FR", "IT", "BE", "LU", "GB", "IE", "US", "CA")

# The AI stand-in plays a learner of the language it speaks to the learner: its name and voice
# go with that language. It is always shown with the AI chip.
STAND_IN_NAMES: Mapping[str, str] = {"de": "Jonas", "en": "Sam", "fr": "Julien", "it": "Giulia"}
STAND_IN_VOICES: tuple[str, ...] = ("ash", "coral", "sage", "verse")
# The neutral voice of a veiled move: the learner's exact words, not their voice.
VEIL_VOICE = "alloy"
# A practice call whose scenario is "halves:<case id>" is the briefing of that case (7.5).
BRIEFING_PREFIX = "halves:"


class HalvesError(Exception):
    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


# --- What is kept --------------------------------------------------------------------------------


@dataclass(frozen=True)
class Profile:
    user_id: UUID
    codename: str
    # One of the four languages, or "other": then the learner plays in same-language mode only.
    native_language: str
    # "city:Zürich", "country:CH", or None.
    place: str | None
    band: Band
    veil_default: bool
    paused: bool
    consent_version: int
    consent_at: dt.datetime
    strikes: int = 0
    suspended: bool = False


@dataclass(frozen=True)
class SeatState:
    seat: Seat
    # None: an AI holds the seat from the start, or the learner's account was deleted.
    user_id: UUID | None
    # The AI's name once an AI plays the seat (from the start, or handed over).
    stand_in: str | None
    speaks: str
    hears: str
    final_answers: tuple[int, ...] = ()
    # Play again with them? None until asked; only for two learners.
    again: bool | None = None
    last_active: dt.datetime | None = None

    @property
    def ai(self) -> bool:
        return self.stand_in is not None or self.user_id is None


@dataclass(frozen=True)
class RecapLine:
    speaker: Seat
    text: str
    audio_key: str | None = None


@dataclass(frozen=True)
class Case:
    id: UUID
    template_id: str
    mode: Mode
    status: CaseStatus
    created_at: dt.datetime
    seats: tuple[SeatState, SeatState]
    ended_at: dt.datetime | None = None
    # The ISO week ("2026-W47") when this is the week's case.
    season: str | None = None
    # One recap per learner's seat, in the language that seat speaks.
    recaps: Mapping[str, tuple[RecapLine, ...]] = field(default_factory=dict)
    recap_status: RecapStatus = "none"
    # A case written for this one case (from a course import, 7.17); None: from the library.
    custom: CaseTemplate | None = None

    def seat(self, seat: Seat) -> SeatState:
        return self.seats[0] if seat == "A" else self.seats[1]

    def seat_of(self, user_id: UUID) -> SeatState | None:
        return next((s for s in self.seats if s.user_id == user_id and s.stand_in is None), None)

    def with_seat(self, state: SeatState) -> "Case":
        seats = (state, self.seats[1]) if state.seat == "A" else (self.seats[0], state)
        return replace(self, seats=seats)


@dataclass(frozen=True)
class Correction:
    original: str
    corrected: str
    explanation: str
    # False when the second check could not confirm it: shown as a possibility only.
    certain: bool


@dataclass(frozen=True)
class Move:
    id: UUID
    case_id: UUID
    seat: Seat
    round: int
    # The learner who said it; None for the AI stand-in.
    user_id: UUID | None
    status: MoveStatus
    transcript: str
    created_at: dt.datetime
    audio_key: str | None = None
    # The same words in a neutral voice, when the learner sent it veiled.
    veil_key: str | None = None
    veiled: bool = False
    # Why it was held or failed: the check's labels.
    reasons: tuple[str, ...] = ()
    delivered_at: dt.datetime | None = None
    # The listener's reaction and the board answers they gave, in order.
    reaction: str | None = None
    answers: tuple[int, ...] = ()
    # The private corrections for the one who said it (7.9).
    corrections: tuple[Correction, ...] = ()
    attempts: int = 0
    # Reported by the listener: no longer shown to them.
    hidden: bool = False
    delete_after: dt.datetime | None = None
    # The Bridge's help for the listener (same-language mode): "simpler", "gist".
    bridge: Mapping[str, str] = field(default_factory=dict)
    # When the owner decided on it, for the queue's time to decision.
    decided_at: dt.datetime | None = None


@dataclass(frozen=True)
class Ticket:
    """A learner looking for a partner (7.3)."""

    user_id: UUID
    created_at: dt.datetime
    # They keep looking until then.
    until: dt.datetime
    # Tell them by push when a partner is found or the search ends.
    remind: bool = True
    # When the search offered an AI; None until it did.
    ai_offered_at: dt.datetime | None = None


@dataclass(frozen=True)
class Nudge:
    """A short phrase a native suggests for one move they heard (7.7)."""

    id: UUID
    move_id: UUID
    user_id: UUID
    text: str
    status: NudgeStatus
    created_at: dt.datetime
    attempts: int = 0
    # Why it was dropped (owner's numbers only; the one who wrote it is not told).
    reason: str | None = None
    delivered_at: dt.datetime | None = None


@dataclass(frozen=True)
class Strike:
    id: UUID
    user_id: UUID
    kind: StrikeKind
    reason: str
    move_id: UUID | None
    at: dt.datetime


@dataclass(frozen=True)
class SafetyCounts:
    """What happened in Two Halves since a moment, for the owner's numbers (6.15)."""

    moves: int
    held: int
    reports: int
    cases: int
    blocks: int
    # Hours from a held move or a report to the owner's decision, for each decided one.
    decision_hours: tuple[float, ...]
    nudges: int = 0
    nudges_dropped: int = 0


@dataclass(frozen=True)
class Invite:
    code: str
    user_id: UUID
    template_id: str | None
    created_at: dt.datetime
    expires_at: dt.datetime


@dataclass(frozen=True)
class Block:
    id: UUID
    blocker: UUID
    blocked: UUID
    # The codename as it was, so the list can name them after they leave.
    codename: str
    created_at: dt.datetime


@dataclass(frozen=True)
class Duo:
    id: UUID
    user_a: UUID
    user_b: UUID
    created_at: dt.datetime

    def other(self, user_id: UUID) -> UUID:
        return self.user_b if user_id == self.user_a else self.user_a


@dataclass(frozen=True)
class Report:
    id: UUID
    reporter: UUID
    move_id: UUID
    reason: str
    note: str | None
    status: ReportStatus
    created_at: dt.datetime
    resolved_at: dt.datetime | None = None


class HalvesRepository(Protocol):
    def profile(self, user_id: UUID) -> Profile | None: ...

    def save_profile(self, profile: Profile) -> None: ...

    def delete_profile(self, user_id: UUID) -> None: ...

    def case(self, case_id: UUID) -> Case | None: ...

    def save_case(self, case: Case) -> None:
        """Stores the case and both seats, in place of what was stored for it."""

    def cases_of(self, user_id: UUID, limit: int) -> list[Case]:
        """The cases where the learner holds a seat, newest first."""

    def open_cases(self, limit: int) -> list[Case]: ...

    def move(self, move_id: UUID) -> Move | None: ...

    def save_move(self, move: Move) -> None:
        """Stores the move in place of what was stored under its id."""

    def moves_of(self, case_id: UUID) -> list[Move]:
        """A case's moves, oldest first."""

    def moves_by(self, user_id: UUID) -> list[Move]: ...

    def moves_since(self, user_id: UUID, since: dt.datetime) -> int: ...

    def held(self, limit: int) -> list[Move]: ...

    def stale_checks(self, before: dt.datetime, limit: int) -> list[Move]: ...

    def expired(self, now: dt.datetime, limit: int) -> list[Move]:
        """Moves past their `delete_after` that still have words or a sound."""

    def invite(self, code: str) -> Invite | None: ...

    def note_wrong_code(self, user_id: UUID, day: dt.date, limit: int) -> bool:
        """Counts one more wrong code on `day` and returns True, unless the learner reached
        `limit`. One step: guesses arriving together cannot both take the last place."""

    def wrong_codes(self, user_id: UUID, day: dt.date) -> int: ...

    def invite_of(self, user_id: UUID) -> Invite | None: ...

    def save_invite(self, invite: Invite) -> None:
        """Stores the invite in place of the learner's earlier one."""

    def delete_invite(self, code: str) -> None: ...

    def delete_expired_invites(self, now: dt.datetime) -> None: ...

    def blocks_of(self, user_id: UUID) -> list[Block]: ...

    def blocked(self, one: UUID, other: UUID) -> bool:
        """Whether either blocked the other."""

    def add_block(self, block: Block) -> None: ...

    def remove_block(self, user_id: UUID, block_id: UUID) -> None: ...

    def duos_of(self, user_id: UUID) -> list[Duo]: ...

    def add_duo(self, duo: Duo) -> None:
        """Stores the duo unless the two are one already."""

    def remove_duo(self, user_id: UUID, other: UUID) -> None: ...

    def add_report(self, report: Report) -> None: ...

    def report(self, report_id: UUID) -> Report | None: ...

    def save_report(self, report: Report) -> None: ...

    def open_reports(self, limit: int) -> list[Report]: ...

    # --- Phase 2

    def ticket(self, user_id: UUID) -> Ticket | None: ...

    def save_ticket(self, ticket: Ticket) -> None:
        """Stores the ticket in place of the learner's earlier one."""

    def delete_ticket(self, user_id: UUID) -> None: ...

    def tickets(self, limit: int) -> list[Ticket]:
        """Everyone looking, the longest waiting first."""

    def add_nudge(self, nudge: Nudge) -> bool:
        """Stores the nudge unless the learner already nudged that move; True when stored."""

    def nudge(self, nudge_id: UUID) -> Nudge | None: ...

    def save_nudge(self, nudge: Nudge) -> None: ...

    def nudges_of(self, move_id: UUID) -> list[Nudge]: ...

    def held_nudges(self, limit: int) -> list[Nudge]: ...

    def delete_nudges_by(self, user_id: UUID) -> None:
        """Deletes the nudges the learner wrote, except held ones: the owner decides those."""

    def stale_nudges(self, before: dt.datetime, limit: int) -> list[Nudge]:
        """Nudges still being checked that were made before `before`."""

    def add_strike(self, strike: Strike) -> None: ...

    def strikes_of(self, user_id: UUID) -> list[Strike]: ...

    def counts(self, since: dt.datetime) -> SafetyCounts: ...


class HalvesStarter(Protocol):
    def start(self, job: str, item_id: UUID) -> None:
        """Has the worker run `job` ("check" a move, "ai" for a case's stand-in, "recap" for a
        case) in an invocation of its own."""


class Brain(Protocol):
    """What a model does in Two Halves (`halves_check.py`), so the service can be tried with a
    stand-in."""

    def check(self, move: Move, band: Band, language: str) -> tuple[str, ...] | None:
        """The labels that hold the move (empty: deliver it). None when it could not be checked:
        the move waits and is checked again, never delivered unchecked."""

    def veil(self, move: Move) -> str | None:
        """The move's words in the neutral voice, stored; None when it could not be made."""

    def correct(self, move: Move, target: str, explanation: str) -> tuple[Correction, ...]: ...

    def understand(
        self, move: Move, question: str, options: Sequence[str], case: Case
    ) -> tuple[int, str]:
        """The stand-in hears a move: which option it picks, and its reaction."""

    def say(self, case: Case, seat: SeatState, text: str, voice: str, move_id: UUID) -> Move:
        """The stand-in's move: its clue said as a learner of that language might say it, with
        its sound. Delivered at once."""

    def recap(
        self, case: Case, seat: SeatState, voices: Mapping[str, tuple[str, str]]
    ) -> tuple[RecapLine, ...]:
        """The ending as a short scene for `seat`, in the language it speaks; `voices` names
        the two characters and their voices by seat."""

    def simplify(self, move: Move, language: str, listener: UUID) -> str | None:
        """The Bridge's second step: the move said again more simply, in its own language,
        keeping every number; moderated before it is shown. None when it could not be
        written."""

    def gist(self, move: Move, language: str, listener: UUID) -> str | None:
        """The Bridge's last step: what the move says, in one sentence in `language` (the
        listener's explanation language). None when it could not be written."""

    def verify_nudge(self, nudge: Nudge, move: Move, language: str) -> str | None:
        """The Nudge Verifier: "" when the phrase is right, more natural here and only about the
        wording; a reason it is dropped otherwise; None when it could not be judged."""


# --- What the app is shown ------------------------------------------------------------------------


@dataclass(frozen=True)
class PartnerLabel:
    name: str
    ai: bool
    place: str | None = None


@dataclass(frozen=True)
class CaseSummary:
    id: UUID
    template_id: str
    title: str
    mode: Mode
    status: CaseStatus
    partner: PartnerLabel
    next: Next
    round: int
    created_at: dt.datetime


@dataclass(frozen=True)
class DuoView:
    id: UUID
    codename: str


@dataclass(frozen=True)
class SearchView:
    """A learner's search for a partner (7.3)."""

    since: dt.datetime
    until: dt.datetime
    remind: bool
    # The search has gone on long enough to offer an AI, or it is over.
    offer_ai: bool


@dataclass(frozen=True)
class Overview:
    available: bool
    profile: Profile | None
    cases: tuple[CaseSummary, ...]
    season_id: str
    season_title: str
    season_week: str
    duos: tuple[DuoView, ...]
    invite: Invite | None
    blocks: tuple[Block, ...]
    # Phase 2. Whether this learner may look for a stranger (the switch is on and they are an
    # adult), and their search when they are looking.
    strangers: bool = False
    search: SearchView | None = None
    # Of the clues they told a human or an AI in the last 30 days, how many were understood at
    # the first try (private: only they see it).
    understood_first: int = 0
    told: int = 0


@dataclass(frozen=True)
class NudgeView:
    text: str
    # The codename of the native who suggested it.
    by: str


@dataclass(frozen=True)
class MineView:
    id: UUID
    status: MoveStatus
    transcript: str
    reasons: tuple[str, ...]
    veiled: bool
    reaction: str | None
    # Whether the other got it at the first try; None while they have not answered.
    understood: bool | None
    corrections: tuple[Correction, ...]
    # The nudges the verifier passed (7.9).
    nudges: tuple[NudgeView, ...] = ()


@dataclass(frozen=True)
class TheirsView:
    id: UUID
    hidden: bool
    question: str
    options: tuple[str, ...]
    answers: tuple[int, ...]
    # The right option once the round is over for this listener; None before.
    solution: int | None
    reaction: str | None
    # The move's checked words, for captions (7.7); empty once reported.
    caption: str = ""
    # The listener grew up with the language of the move: they may suggest a better way.
    can_nudge: bool = False
    nudged: bool = False
    # Same-language mode: the Bridge helps, step by step; what it gave so far.
    bridge: bool = False
    simpler: str | None = None
    gist: str | None = None


@dataclass(frozen=True)
class RoundView:
    round: int
    # The clue this seat tells in this round, in the language it speaks, and in its interface
    # language for help.
    clue: str
    clue_help: str
    mine: MineView | None
    theirs: TheirsView | None


@dataclass(frozen=True)
class FinalView:
    open: bool
    question: str
    options: tuple[str, ...]
    answers: tuple[int, ...]
    other_answered: bool
    solution: int | None


@dataclass(frozen=True)
class CaseView:
    id: UUID
    template_id: str
    title: str
    setting: str
    mode: Mode
    status: CaseStatus
    seat: Seat
    speaks: str
    hears: str
    partner: PartnerLabel
    rounds: tuple[RoundView, ...]
    final: FinalView
    record_round: int | None
    can_hand_over: bool
    again: bool | None
    ask_again: bool
    recap: tuple[RecapLine, ...]
    recap_status: RecapStatus
    veil_default: bool
    ending: str | None
    # Native intelligibility (private): of the clues this seat told, how many the other
    # understood at the first try, and how many they answered.
    understood_first: int = 0
    told: int = 0
    # Both seats speak the same language (same-language mode): the Bridge helps the listener.
    same_language: bool = False
    # The case was written from the learner's course import (7.17).
    from_import: bool = False
    # The two are a duo (both said "play again"), so 7.8 can celebrate it.
    duo: bool = False


@dataclass(frozen=True)
class QueueItem:
    # `nudge`: a native's suggestion that broke a safety rule (phase 2).
    kind: Literal["held", "report", "nudge"]
    id: UUID
    move_id: UUID
    transcript: str
    reasons: tuple[str, ...]
    sender: str
    reporter: str | None
    note: str | None
    band: Band
    created_at: dt.datetime
    # The sender's strikes so far, and whether they are suspended.
    strikes: int = 0
    suspended: bool = False


@dataclass(frozen=True)
class SafetyStats:
    """The owner's numbers for the last 30 days (6.15): rates per 1,000 and decision times."""

    moves: int
    cases: int
    held_per_1000: float
    reports_per_1000: float
    blocks_per_1000_cases: float
    nudges: int
    nudges_dropped: int
    # The median hours from a held move or report to a decision; None before any decision.
    median_decision_hours: float | None
    open_items: int


@dataclass(frozen=True)
class StrandPoint:
    label: str
    latitude: float
    longitude: float


@dataclass(frozen=True)
class Strand:
    """One person the learner played a case with, where they chose to say where they are."""

    codename: str
    point: StrandPoint
    cases: int
    duo: bool


@dataclass(frozen=True)
class StrandMap:
    # The learner's own place, if they shared one.
    me: StrandPoint | None
    strands: tuple[Strand, ...]
    # People they played with who did not share a place: counted, never drawn.
    unplaced: int


@dataclass(frozen=True)
class ShareCard:
    """What the share card (7.15) shows: no voice, no words of the learner, no name."""

    title: str
    week: str | None
    status: CaseStatus
    understood_first: int
    told: int
    # The learner's invite code (adults), so a friend can play with them.
    code: str | None
    codename: str


@dataclass(frozen=True)
class Suggestion:
    """The case the Learning Director suggests this week (5.1)."""

    template_id: str
    title: str


# --- Rules that need no storage ------------------------------------------------------------------


def band_of(age_bracket: str) -> Band:
    """The age band from the sign-up age group (2.1). Anything that is not clearly an adult's is
    a minor's: the stricter band is the safe default."""
    if not age_bracket or age_bracket.startswith("16"):
        return "minor"
    return "adult"


def valid_place(place: str | None) -> bool:
    if place is None:
        return True
    kind, _, value = place.partition(":")
    return (kind == "city" and value in CITIES) or (kind == "country" and value in COUNTRIES)


def invite_code() -> str:
    """About 49 bits from a cryptographic source: a code is the key to a friend's game. Never
    the game's own random source, which picks codenames and may be seeded."""
    return "".join(secrets.choice(CODE_ALPHABET) for _ in range(CODE_LENGTH))


def understands(native: str, target: str, heard: str) -> bool:
    """Whether a learner with `native` and `target` can follow a move in `heard`."""
    return heard in (native, target)


def iso_week(day: dt.date) -> str:
    year, week, _ = day.isocalendar()
    return f"{year}-W{week:02d}"


def template_of(case: Case) -> CaseTemplate | None:
    """The case's template: its own when it was written for it, else the library's."""
    return case.custom or template(case.template_id)


def place_point(place: str | None) -> StrandPoint | None:
    """Where the strand map draws a place: a listed city, or the middle of a country."""
    if place is None:
        return None
    kind, _, value = place.partition(":")
    found = CITY_POINTS.get(value) if kind == "city" else COUNTRY_POINTS.get(value)
    return StrandPoint(value, found[0], found[1]) if found and value else None


def heard_first(case: Case, moves: Sequence[Move], seat: Seat) -> tuple[int, int]:
    """Native intelligibility for `seat`: of its delivered clues the other has answered, how
    many were understood at the first try, and how many were answered."""
    found = template_of(case)
    if found is None:
        return 0, 0
    understood = told = 0
    for move in moves:
        if move.seat != seat or move.status != "delivered" or not move.answers:
            continue
        told += 1
        if move.answers[0] == found.clue(seat, move.round).answer:
            understood += 1
    return understood, told


# A nudge is a rewording: at least this share of its words were in the move.
NUDGE_OVERLAP = 0.5
_LINKISH = ("@", "http", "www", ".com", ".ch", ".de", ".fr", ".it", "://")
# Words that name a way to reach someone outside the game.
_SOCIAL = frozenset(
    {
        "insta",
        "instagram",
        "snap",
        "snapchat",
        "tiktok",
        "whatsapp",
        "telegram",
        "signal",
        "discord",
    }
)


def rewording_problem(text: str, transcript: str, language: str) -> str | None:
    """Why a nudge is not a close rewording of the move, or None. Checked in code before the
    verifier may pass it, so a model's verdict alone never lets a stranger's text through:
    enough words of the move, and no new digits, names, handles, links or contact details."""
    if local_problem(text) is not None:
        return "contact"
    plain = text.casefold()
    if any(mark in plain for mark in _LINKISH):
        return "contact"
    said = set(words_in(transcript))
    words = words_in(text)
    if any(word in _SOCIAL for word in words):
        return "contact"
    if not words:
        return "not_rewording"
    if sum(1 for word in words if word in said) / len(words) < NUDGE_OVERLAP:
        return "not_rewording"
    # Every digit of a nudge was in the move: a new number is a phone, an age or an address.
    digits_said = {w for w in said if any(ch.isdigit() for ch in w)}
    if any(any(ch.isdigit() for ch in w) and w not in digits_said for w in words):
        return "new_detail"
    # A new capitalised word is a name, except in German, where every noun has a capital.
    if language != "de":
        for raw in text.split()[1:]:
            word = "".join(ch for ch in raw if ch.isalpha())
            if word[:1].isupper() and word.casefold() not in said:
                return "new_detail"
    return None


def same_language(case: Case) -> bool:
    return case.seats[0].speaks == case.seats[1].speaks


def _settled(move: Move, clue_answer: int) -> bool:
    """Whether the listener is done with a move: answered right, out of tries, or reported."""
    return move.hidden or clue_answer in move.answers or len(move.answers) >= ANSWER_TRIES


def _answer_of(case: Case, move: Move) -> int:
    found = template_of(case)
    return found.clue(move.seat, move.round).answer if found else -1


def _live(moves: Sequence[Move], seat: Seat) -> list[Move]:
    """A seat's moves that count: being checked or delivered, by round."""
    return sorted(
        (m for m in moves if m.seat == seat and m.status in ("checking", "delivered")),
        key=lambda m: m.round,
    )


def _delivered(moves: Sequence[Move], seat: Seat, round_number: int) -> Move | None:
    return next(
        (
            m
            for m in moves
            if m.seat == seat and m.round == round_number and m.status == "delivered"
        ),
        None,
    )


def next_round(case: Case, moves: Sequence[Move], seat: Seat) -> int | None:
    """The round `seat` may record now, or None. A seat records round r once it has finished
    with the other's move of round r - 1, so the two go forward together."""
    if case.status != "open":
        return None
    live = _live(moves, seat)
    if any(m.status == "checking" for m in live) or len(live) >= ROUNDS:
        return None
    round_number = len(live) + 1
    if round_number == 1:
        return 1
    theirs = _delivered(moves, other_seat(seat), round_number - 1)
    if theirs is None or not _settled(theirs, _answer_of(case, theirs)):
        return None
    return round_number


def final_open(case: Case, moves: Sequence[Move], seat: Seat) -> bool:
    """Whether `seat` may answer the case's question: all its moves are out and it is done with
    all of the other's."""
    if case.status != "open":
        return False
    mine = [m for m in moves if m.seat == seat and m.status == "delivered"]
    if len({m.round for m in mine}) < ROUNDS:
        return False
    for round_number in range(1, ROUNDS + 1):
        theirs = _delivered(moves, other_seat(seat), round_number)
        if theirs is None or not _settled(theirs, _answer_of(case, theirs)):
            return False
    return True


def outcome(case: Case) -> CaseStatus:
    """Open while either seat may still answer; then solved when both got it right."""
    found = template_of(case)
    answer = found.answer if found else -1
    right = [answer in seat.final_answers for seat in case.seats]
    if all(right):
        return "solved"
    done = [
        ok or len(seat.final_answers) >= FINAL_TRIES
        for ok, seat in zip(right, case.seats, strict=True)
    ]
    return "unsolved" if all(done) else "open"


def what_next(case: Case, moves: Sequence[Move], seat: Seat) -> Next:
    state = case.seat(seat)
    if case.status != "open":
        if case.mode != "ai" and not case.seat(other_seat(seat)).ai and state.again is None:
            return "again"
        return "done"
    if next_round(case, moves, seat) is not None:
        return "record"
    for round_number in range(1, ROUNDS + 1):
        theirs = _delivered(moves, other_seat(seat), round_number)
        if theirs is not None and not _settled(theirs, _answer_of(case, theirs)):
            return "answer"
    if final_open(case, moves, seat) and found_right(case, state) is False:
        return "final"
    return "wait"


def found_right(case: Case, state: SeatState) -> bool:
    found = template_of(case)
    if found is None:
        return False
    return found.answer in state.final_answers or len(state.final_answers) >= FINAL_TRIES


def make_codename(rng: random.Random) -> str:
    """A word and a number, neutral in the four languages (Two Halves, Radio Konvami, the
    story chain)."""
    return f"{rng.choice(_CODE_WORDS)}-{rng.randint(2, 99)}"


def stand_in_for(language: str) -> str:
    return STAND_IN_NAMES.get(language, "Sam")


# --- The service ---------------------------------------------------------------------------------


class HalvesService:
    def __init__(
        self,
        *,
        profiles: ProfileService,
        personas: PersonaService,
        accounts: AccountDirectory,
        repository: HalvesRepository,
        listener: Listener,
        brain: Brain,
        files: FileStore,
        starter: HalvesStarter,
        enabled: bool,
        allowed: Callable[[UUID], bool],
        owners: frozenset[UUID],
        clock: Callable[[], dt.datetime],
        announce: Callable[[UUID, UUID, str], None] = lambda *_: None,
        new_id: Callable[[], UUID] = uuid4,
        rng: random.Random | None = None,
        strangers: bool = False,
        writer: CaseWriter | None = None,
        material: Callable[[UUID, UUID], CaseMaterial | None] = lambda *_: None,
    ) -> None:
        """`enabled` turns Two Halves on (`KONVAMI_HALVES`); `allowed` says who may play while
        it is in the testers' hands. `announce` tells a learner by push that a move came
        ("move"), that theirs was held ("held"), that a partner was found ("match"), that the
        search ended without one ("search_over") or that the owner warned them ("warning"),
        with the case's id (a zero id when there is no case).

        Phase 2: `strangers` lets adults be matched with strangers (off until the legal review);
        `writer` writes a case from a course import, which `material` reads (learner, import)."""
        self._profiles = profiles
        self._personas = personas
        self._accounts = accounts
        self._repository = repository
        self._listener = listener
        self._brain = brain
        self._files = files
        self._starter = starter
        self._enabled = enabled
        self._allowed = allowed
        self._owners = owners
        self._clock = clock
        self._announce = announce
        self._new_id = new_id
        self._rng = rng or random.Random()  # noqa: S311 - codenames, not secrets
        self._strangers = strangers
        self._writer = writer or NoCaseWriter()
        self._material = material

    # --- Joining and settings (7.2, 7.11)

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

    def _require(self, user_id: UUID) -> Profile:
        if not self.available(user_id):
            raise HalvesError("unavailable")
        profile = self._repository.profile(user_id)
        if profile is None:
            raise HalvesError("not_joined")
        if profile.suspended:
            raise HalvesError("suspended")
        return profile

    def overview(self, user_id: UUID) -> Overview:
        today = self._clock().date()
        year, week, _ = today.isocalendar()
        season = season_case(year, week)
        language = self._language(user_id)
        available = self.available(user_id)
        profile = self._repository.profile(user_id) if available else None
        cases: list[CaseSummary] = []
        duos: list[DuoView] = []
        understood = told = 0
        if profile is not None:
            since = self._clock() - HEARD_WINDOW
            for case in self._repository.cases_of(user_id, 20):
                summary = self._summary(case, user_id, language)
                if summary is not None:
                    cases.append(summary)
                state = case.seat_of(user_id)
                if state is not None and case.created_at >= since:
                    got, said = heard_first(case, self._repository.moves_of(case.id), state.seat)
                    understood, told = understood + got, told + said
            for duo in self._repository.duos_of(user_id):
                other = self._repository.profile(duo.other(user_id))
                if other is not None:
                    duos.append(DuoView(duo.id, other.codename))
        return Overview(
            available=available,
            profile=profile,
            cases=tuple(cases),
            season_id=season.id,
            season_title=text_in(season.title, language),
            season_week=iso_week(today),
            duos=tuple(duos),
            invite=self._repository.invite_of(user_id) if profile else None,
            blocks=tuple(self._repository.blocks_of(user_id)) if profile else (),
            strangers=self._strangers and profile is not None and self._band(user_id) == "adult",
            search=self._search_view(user_id) if profile else None,
            understood_first=understood,
            told=told,
        )

    def join(
        self,
        user_id: UUID,
        *,
        native_language: str,
        place: str | None,
        veil_default: bool,
        voice_consent: bool,
    ) -> Profile:
        """Joins Two Halves, or changes the answers of one who joined. Raises `HalvesError`:
        `unavailable`, `consent_required` (the voice-sharing consent is not given) and
        `invalid_value`."""
        if not self.available(user_id):
            raise HalvesError("unavailable")
        if not voice_consent:
            raise HalvesError("consent_required")
        if native_language not in NATIVE_LANGUAGES or not valid_place(place):
            raise HalvesError("invalid_value")
        current = self._repository.profile(user_id)
        now = self._clock()
        # The owner's record outlives the profile: leaving and joining again lifts nothing.
        record = self._repository.strikes_of(user_id)
        strikes = sum(1 for s in record if s.kind == "strike")
        suspended = strikes >= STRIKES_TO_SUSPEND or any(s.kind == "suspension" for s in record)
        profile = Profile(
            user_id=user_id,
            codename=current.codename if current else self._codename(),
            native_language=native_language,
            place=place,
            band=self._band(user_id),
            veil_default=veil_default,
            paused=current.paused if current else False,
            consent_version=VOICE_CONSENT_VERSION,
            consent_at=current.consent_at if current else now,
            strikes=max(current.strikes if current else 0, strikes),
            suspended=(current.suspended if current else False) or suspended,
        )
        self._repository.save_profile(profile)
        return profile

    def _codename(self) -> str:
        return make_codename(self._rng)

    def reroll(self, user_id: UUID) -> Profile:
        profile = self._require(user_id)
        changed = replace(profile, codename=self._codename())
        self._repository.save_profile(changed)
        return changed

    def change(
        self,
        user_id: UUID,
        *,
        place: str | None = None,
        clear_place: bool = False,
        veil_default: bool | None = None,
        paused: bool | None = None,
        native_language: str | None = None,
    ) -> Profile:
        profile = self._require(user_id)
        if native_language is not None and native_language not in NATIVE_LANGUAGES:
            raise HalvesError("invalid_value")
        if place is not None and not valid_place(place):
            raise HalvesError("invalid_value")
        changed = replace(
            profile,
            place=None if clear_place else (place if place is not None else profile.place),
            veil_default=profile.veil_default if veil_default is None else veil_default,
            paused=profile.paused if paused is None else paused,
            native_language=native_language or profile.native_language,
        )
        self._repository.save_profile(changed)
        return changed

    def leave(self, user_id: UUID) -> None:
        """Deletes the learner's Two Halves data (7.11), as withdrawing the voice-sharing consent
        does: their moves' words and sounds, their invite, their duos and their profile. Their
        open cases go on with an AI in their seat. Blocks stay, so they keep protecting both."""
        for move in self._repository.moves_by(user_id):
            # A held move stays in the owner's queue until the owner decides: a learner's own
            # action never takes it out (deleting the account still does, with everything).
            if move.status != "held":
                self._forget(move, "removed")
        for case in self._repository.cases_of(user_id, 100):
            state = case.seat_of(user_id)
            if case.status == "open" and state is not None:
                self._repository.save_case(
                    case.with_seat(replace(state, stand_in=stand_in_for(state.speaks)))
                )
                self._start("ai", case.id)
        invite = self._repository.invite_of(user_id)
        if invite is not None:
            self._repository.delete_invite(invite.code)
        for duo in self._repository.duos_of(user_id):
            self._repository.remove_duo(user_id, duo.other(user_id))
        self._repository.delete_ticket(user_id)
        self._repository.delete_nudges_by(user_id)
        self._repository.delete_profile(user_id)

    def _forget(self, move: Move, status: MoveStatus) -> None:
        for key in (move.audio_key, move.veil_key):
            if key:
                self._files.remove(key)
        self._repository.save_move(
            replace(
                move,
                status=status,
                transcript="",
                audio_key=None,
                veil_key=None,
                corrections=(),
                bridge={},
            )
        )

    # --- Starting a case (7.3, 7.12)

    def _template(self, template_id: str | None, season: bool) -> CaseTemplate:
        if season:
            year, week, _ = self._clock().date().isocalendar()
            return season_case(year, week)
        if template_id is None:
            return self._rng.choice(CASES)
        found = template(template_id)
        if found is None:
            raise HalvesError("not_found")
        return found

    def _room(self, user_id: UUID) -> None:
        open_cases = [c for c in self._repository.cases_of(user_id, 50) if c.status == "open"]
        if len(open_cases) >= OPEN_CASES:
            raise HalvesError("too_many_cases")

    def _target(self, user_id: UUID) -> str:
        language = self._profiles.get(user_id).target_language or ""
        if language not in LANGUAGES:
            raise HalvesError("no_language")
        return language

    def play_ai(self, user_id: UUID, template_id: str | None = None, season: bool = False) -> Case:
        """A case against an AI stand-in. The stand-in speaks the learner's native language
        when it is one of the four and not the one they learn (mirror mode), else the one they
        learn (same-language mode)."""
        profile = self._require(user_id)
        if profile.paused:
            raise HalvesError("paused")
        self._room(user_id)
        target = self._target(user_id)
        chosen = self._template(template_id, season)
        # Playing the AI ends a search: the learner has a game.
        self._repository.delete_ticket(user_id)
        return self._against_ai(profile, target, chosen, season=season)

    def _against_ai(
        self,
        profile: Profile,
        target: str,
        chosen: CaseTemplate,
        *,
        season: bool = False,
        custom: bool = False,
        mirror: bool = True,
    ) -> Case:
        native = profile.native_language
        mirrored = mirror and native in LANGUAGES and native != target
        ai_speaks = native if mirrored else target
        now = self._clock()
        user_id = profile.user_id
        case = Case(
            id=self._new_id(),
            template_id=chosen.id,
            mode="ai",
            status="open",
            created_at=now,
            seats=(
                SeatState("A", user_id, None, target, ai_speaks, last_active=now),
                SeatState("B", None, stand_in_for(ai_speaks), ai_speaks, target, last_active=now),
            ),
            season=iso_week(now.date()) if season else None,
            custom=chosen if custom else None,
        )
        self._repository.save_case(case)
        self._start("ai", case.id)
        return case

    def play_import(self, user_id: UUID, import_id: UUID) -> Case:
        """A case against the AI written from one of the learner's course imports (7.17): by the
        Case Writer when it can, else the word case from the import's words. Refused calmly for
        an import that is not theirs (`not_found`), one with too few words when no case could
        be written (`too_few_words`), and past `IMPORT_CASES_PER_DAY` (`limit`)."""
        profile = self._require(user_id)
        if profile.paused:
            raise HalvesError("paused")
        self._room(user_id)
        target = self._target(user_id)
        material = self._material(user_id, import_id)
        if material is None or material.language != target:
            raise HalvesError("not_found")
        since = self._clock() - dt.timedelta(days=1)
        written_today = sum(
            1
            for c in self._repository.cases_of(user_id, 50)
            if c.custom is not None and c.created_at >= since
        )
        if written_today >= IMPORT_CASES_PER_DAY:
            raise HalvesError("limit")
        written = self._writer.write(user_id, material)
        if written is not None:
            return self._against_ai(profile, target, written, custom=True)
        fallback = word_case(material)
        if fallback is None:
            raise HalvesError("too_few_words")
        # The word case's words are in the language learned, so the AI speaks it too.
        return self._against_ai(profile, target, fallback, custom=True, mirror=False)

    def invite(self, user_id: UUID, template_id: str | None = None) -> Invite:
        """A code a friend redeems to play with the learner (adults only in phase 1). Replaces
        the learner's earlier one."""
        self._require(user_id)
        if self._band(user_id) != "adult":
            raise HalvesError("adults_only")
        if template_id is not None and template(template_id) is None:
            raise HalvesError("not_found")
        now = self._clock()
        earlier = self._repository.invite_of(user_id)
        if earlier is not None:
            self._repository.delete_invite(earlier.code)
        code = invite_code()
        made = Invite(code, user_id, template_id, now, now + INVITE_FOR)
        self._repository.save_invite(made)
        return made

    def cancel_invite(self, user_id: UUID) -> None:
        invite = self._repository.invite_of(user_id)
        if invite is not None:
            self._repository.delete_invite(invite.code)

    def redeem(self, user_id: UUID, code: str) -> Case:
        """Starts a case with the friend whose code it is. Refused calmly for a code that is
        wrong or old (`not_found`), one's own, someone blocked either way, across age bands
        (`adults_only`), and when neither could follow the other (`no_shared_language`).
        After `WRONG_CODES_PER_DAY` wrong codes in a day, every code is refused (`limit`) until
        the next day, so codes cannot be guessed."""
        profile = self._require(user_id)
        today = self._clock().date()
        if self._repository.wrong_codes(user_id, today) >= WRONG_CODES_PER_DAY:
            raise HalvesError("limit")
        invite = self._repository.invite("".join(code.split()).upper())
        if invite is None or invite.expires_at <= self._clock():
            self._repository.note_wrong_code(user_id, today, WRONG_CODES_PER_DAY)
            raise HalvesError("not_found")
        if invite.user_id == user_id:
            raise HalvesError("own_code")
        host = self._repository.profile(invite.user_id)
        if host is None or host.suspended:
            raise HalvesError("not_found")
        case = self._pair(host, profile, invite.template_id, "friend")
        self._repository.delete_invite(invite.code)
        self._announce(host.user_id, case.id, "move")
        return case

    def play_duo(self, user_id: UUID, duo_id: UUID) -> Case:
        profile = self._require(user_id)
        duo = next((d for d in self._repository.duos_of(user_id) if d.id == duo_id), None)
        if duo is None:
            raise HalvesError("not_found")
        other = self._repository.profile(duo.other(user_id))
        if other is None or other.suspended:
            raise HalvesError("not_found")
        case = self._pair(profile, other, None, "duo")
        self._announce(other.user_id, case.id, "move")
        return case

    def remove_duo(self, user_id: UUID, duo_id: UUID) -> None:
        self._require(user_id)
        duo = next((d for d in self._repository.duos_of(user_id) if d.id == duo_id), None)
        if duo is None:
            raise HalvesError("not_found")
        self._repository.remove_duo(user_id, duo.other(user_id))

    # --- Finding a partner (7.3, phase 2)

    def look(self, user_id: UUID, hours: int, remind: bool = True) -> SearchView | Case:
        """Looks for a stranger to play with for `hours`: pairs at once when someone fits (the
        case), else waits (the search). Only adults, and only while `strangers` is on: the
        minor band is never matched (`adults_only`), and without the switch `unavailable`."""
        profile = self._require(user_id)
        if not self._strangers:
            raise HalvesError("unavailable")
        if self._band(user_id) != "adult":
            raise HalvesError("adults_only")
        if profile.paused:
            raise HalvesError("paused")
        if not SEARCH_HOURS_MIN <= hours <= SEARCH_HOURS_MAX:
            raise HalvesError("invalid_value")
        self._room(user_id)
        self._target(user_id)
        now = self._clock()
        current = self._repository.ticket(user_id)
        # "Keep looking" runs from now; the wait so far still counts towards the AI offer.
        ticket = Ticket(
            user_id=user_id,
            created_at=current.created_at if current else now,
            until=now + dt.timedelta(hours=hours),
            remind=remind,
            ai_offered_at=current.ai_offered_at if current else None,
        )
        self._repository.save_ticket(ticket)
        made = self._match(only=user_id)
        if made is not None:
            return made
        return self._search_view(user_id) or SearchView(now, ticket.until, remind, False)

    def stop_looking(self, user_id: UUID) -> None:
        self._require(user_id)
        self._repository.delete_ticket(user_id)

    def _search_view(self, user_id: UUID) -> SearchView | None:
        ticket = self._repository.ticket(user_id)
        if ticket is None:
            return None
        now = self._clock()
        offer = now - ticket.created_at >= AI_OFFER_AFTER or now >= ticket.until
        return SearchView(ticket.created_at, ticket.until, ticket.remind, offer)

    def _seeker(self, ticket: Ticket) -> Seeker | None:
        profile = self._repository.profile(ticket.user_id)
        if profile is None or profile.suspended or profile.paused:
            return None
        try:
            target = self._target(ticket.user_id)
        except HalvesError:
            return None
        return Seeker(
            ticket.user_id,
            self._band(ticket.user_id),
            profile.native_language,
            target,
            ticket.created_at,
        )

    def _match(self, only: UUID | None = None) -> Case | None:
        """Pairs everyone who fits (`halves_match.pairs`). With `only`, answers the case made
        for that learner, if one was."""
        if not self._strangers:
            return None
        now = self._clock()
        seekers = [
            seeker
            for ticket in self._repository.tickets(TICK_SCAN)
            if ticket.until > now and (seeker := self._seeker(ticket)) is not None
        ]
        mine: Case | None = None
        for first, second, _ in pairs(seekers, self._repository.blocked):
            one = self._repository.profile(first.user_id)
            other = self._repository.profile(second.user_id)
            if one is None or other is None:
                continue
            try:
                case = self._pair(one, other, None, "match")
            except HalvesError:
                continue
            for seeker in (first, second):
                ticket = self._repository.ticket(seeker.user_id)
                self._repository.delete_ticket(seeker.user_id)
                if seeker.user_id == only:
                    mine = case
                elif ticket is None or ticket.remind:
                    self._announce(seeker.user_id, case.id, "match")
        return mine

    def _end_searches(self) -> None:
        """Searches that ran long enough offer an AI once; ended ones go."""
        now = self._clock()
        for ticket in self._repository.tickets(TICK_SCAN):
            if now >= ticket.until:
                self._repository.delete_ticket(ticket.user_id)
                if ticket.remind:
                    self._announce(ticket.user_id, UUID(int=0), "search_over")
            elif ticket.ai_offered_at is None and now - ticket.created_at >= AI_OFFER_AFTER:
                self._repository.save_ticket(replace(ticket, ai_offered_at=now))
                if ticket.remind:
                    self._announce(ticket.user_id, UUID(int=0), "ai_offer")

    def _pair(self, first: Profile, second: Profile, template_id: str | None, mode: Mode) -> Case:
        if self._band(first.user_id) != "adult" or self._band(second.user_id) != "adult":
            raise HalvesError("adults_only")
        if self._repository.blocked(first.user_id, second.user_id):
            raise HalvesError("not_found")
        if first.paused or second.paused:
            raise HalvesError("paused")
        self._room(first.user_id)
        self._room(second.user_id)
        speaks_a, speaks_b = self._target(first.user_id), self._target(second.user_id)
        if not (
            understands(first.native_language, speaks_a, speaks_b)
            and understands(second.native_language, speaks_b, speaks_a)
        ):
            raise HalvesError("no_shared_language")
        chosen = self._template(template_id, False)
        now = self._clock()
        case = Case(
            id=self._new_id(),
            template_id=chosen.id,
            mode=mode,
            status="open",
            created_at=now,
            seats=(
                SeatState("A", first.user_id, None, speaks_a, speaks_b, last_active=now),
                SeatState("B", second.user_id, None, speaks_b, speaks_a, last_active=now),
            ),
        )
        self._repository.save_case(case)
        return case

    # --- Playing (7.4, 7.6, 7.7, 7.8)

    def _case(self, user_id: UUID, case_id: UUID) -> tuple[Case, SeatState]:
        case = self._repository.case(case_id)
        state = case.seat_of(user_id) if case else None
        if case is None or state is None:
            raise HalvesError("not_found")
        return case, state

    def view(self, user_id: UUID, case_id: UUID) -> CaseView:
        self._require(user_id)
        case, state = self._case(user_id, case_id)
        return self._view(case, state, self._repository.moves_of(case.id), user_id)

    def record(
        self,
        user_id: UUID,
        case_id: UUID,
        audio: bytes,
        audio_format: str,
        seconds: float | None,
        veiled: bool | None = None,
    ) -> Move:
        """The learner's move for the round they may record: written down word for word at
        once, then checked by the worker before the other hears it. Raises `HalvesError`."""
        profile = self._require(user_id)
        case, state = self._case(user_id, case_id)
        moves = self._repository.moves_of(case.id)
        round_number = next_round(case, moves, state.seat)
        if round_number is None:
            raise HalvesError("not_your_turn")
        if seconds is not None and seconds > MOVE_SECONDS + 1:
            raise HalvesError("too_long")
        try:
            self._listener.ready(user_id, audio, audio_format)
        except SpokenError as error:
            raise HalvesError(error.code) from error
        now = self._clock()
        if self._repository.moves_since(user_id, now - dt.timedelta(days=1)) >= MOVES_PER_DAY:
            raise HalvesError("limit")
        try:
            said = self._listener.hear(
                user_id, state.speaks, audio, audio_format, seconds, Feature.HALVES_LISTEN
            )
        except SpokenError as error:
            raise HalvesError(error.code) from error
        if len(words_in(said)) < MIN_WORDS:
            raise HalvesError("too_short")
        move_id = self._new_id()
        key = f"{FOLDER}/{user_id}/{case.id}/{move_id}.{audio_format}"
        self._files.save(key, audio, _AUDIO_TYPES.get(audio_format, "application/octet-stream"))
        move = Move(
            id=move_id,
            case_id=case.id,
            seat=state.seat,
            round=round_number,
            user_id=user_id,
            status="checking",
            transcript=said,
            created_at=now,
            audio_key=key,
            veiled=profile.veil_default if veiled is None else veiled,
        )
        self._repository.save_move(move)
        self._repository.save_case(case.with_seat(replace(state, last_active=now)))
        self._start("check", move.id)
        return move

    def react(self, user_id: UUID, move_id: UUID, reaction: str) -> CaseView:
        if reaction not in REACTIONS:
            raise HalvesError("invalid_value")
        move, case, _ = self._theirs(user_id, move_id)
        self._repository.save_move(replace(move, reaction=reaction))
        return self.view(user_id, case.id)

    def answer(self, user_id: UUID, move_id: UUID, option: int) -> CaseView:
        """The learner acts on a clue they heard: an option of the board's question. Wrong
        answers may be tried again until `ANSWER_TRIES`; then the right one is shown."""
        move, case, state = self._theirs(user_id, move_id)
        found = template_of(case)
        if found is None:
            raise HalvesError("not_found")
        clue = found.clue(move.seat, move.round)
        if not 0 <= option < len(clue.options):
            raise HalvesError("invalid_value")
        if _settled(move, clue.answer):
            raise HalvesError("answered")
        now = self._clock()
        self._repository.save_move(replace(move, answers=(*move.answers, option)))
        self._repository.save_case(case.with_seat(replace(state, last_active=now)))
        if case.seat(other_seat(state.seat)).ai:
            self._start("ai", case.id)
        return self.view(user_id, case.id)

    def solve(self, user_id: UUID, case_id: UUID, option: int) -> CaseView:
        """The learner's answer to the case's question (two tries)."""
        self._require(user_id)
        case, state = self._case(user_id, case_id)
        found = template_of(case)
        moves = self._repository.moves_of(case.id)
        if found is None or not final_open(case, moves, state.seat):
            raise HalvesError("not_your_turn")
        if not 0 <= option < len(found.options):
            raise HalvesError("invalid_value")
        if found_right(case, state):
            raise HalvesError("answered")
        now = self._clock()
        case = case.with_seat(
            replace(state, final_answers=(*state.final_answers, option), last_active=now)
        )
        case = self._settle(case)
        self._repository.save_case(case)
        if case.status == "open" and case.seat(other_seat(state.seat)).ai:
            self._start("ai", case.id)
        return self.view(user_id, case.id)

    def again(self, user_id: UUID, case_id: UUID, yes: bool) -> CaseView:
        """Play again with them? Private: only when both say yes do the two become a duo."""
        self._require(user_id)
        case, state = self._case(user_id, case_id)
        other = case.seat(other_seat(state.seat))
        if case.status == "open" or case.mode == "ai" or other.ai:
            raise HalvesError("not_your_turn")
        case = case.with_seat(replace(state, again=yes))
        self._repository.save_case(case)
        if (
            yes
            and other.again
            and other.user_id is not None
            and self._band(user_id) == "adult"
            and self._band(other.user_id) == "adult"
            and not self._repository.blocked(user_id, other.user_id)
        ):
            self._repository.add_duo(Duo(self._new_id(), user_id, other.user_id, self._clock()))
        return self.view(user_id, case.id)

    def hand_over(self, user_id: UUID, case_id: UUID) -> CaseView:
        """An AI takes the other seat when it has been quiet for `SEAT_TIMEOUT`."""
        self._require(user_id)
        case, state = self._case(user_id, case_id)
        other = case.seat(other_seat(state.seat))
        if not self._can_hand_over(case, state):
            raise HalvesError("not_your_turn")
        self._repository.save_case(
            case.with_seat(replace(other, stand_in=stand_in_for(other.speaks)))
        )
        self._start("ai", case.id)
        return self.view(user_id, case.id)

    def _can_hand_over(self, case: Case, state: SeatState) -> bool:
        other = case.seat(other_seat(state.seat))
        if case.status != "open" or other.ai:
            return False
        quiet_since = other.last_active or case.created_at
        return self._clock() - quiet_since >= SEAT_TIMEOUT

    def _theirs(self, user_id: UUID, move_id: UUID) -> tuple[Move, Case, SeatState]:
        """A move the other seat sent this learner, delivered and not reported."""
        self._require(user_id)
        move = self._repository.move(move_id)
        if move is None:
            raise HalvesError("not_found")
        case, state = self._case(user_id, move.case_id)
        if move.seat == state.seat or move.status != "delivered" or move.hidden:
            raise HalvesError("not_found")
        return move, case, state

    def address(self, user_id: UUID, move_id: UUID) -> str:
        """Where the app may play a move for five minutes: the listener hears the veiled sound
        of a veiled move, the speaker their own."""
        self._require(user_id)
        move = self._repository.move(move_id)
        if move is None:
            raise HalvesError("not_found")
        _, state = self._case(user_id, move.case_id)
        if move.seat == state.seat:
            key = move.audio_key or move.veil_key
        else:
            if move.status != "delivered" or move.hidden:
                raise HalvesError("not_found")
            key = move.veil_key if move.veiled else (move.audio_key or move.veil_key)
        if not key:
            raise HalvesError("not_found")
        return self._files.address(key, ADDRESS_SECONDS)

    def recap_address(self, user_id: UUID, case_id: UUID, line: int) -> str:
        self._require(user_id)
        case, state = self._case(user_id, case_id)
        lines = case.recaps.get(state.seat, ())
        if not 0 <= line < len(lines) or not lines[line].audio_key:
            raise HalvesError("not_found")
        return self._files.address(lines[line].audio_key or "", ADDRESS_SECONDS)

    # --- The Bridge (7.7, same-language mode)

    def bridge(self, user_id: UUID, move_id: UUID, step: str) -> CaseView:
        """Helps the listener with a move in a language both are learning, in order: a slower
        replay (the app plays it slower), then the move said more simply, then its gist in the
        listener's explanation language. Mirror mode needs none: the listener hears their own
        language. Raises `HalvesError`: `not_your_turn` out of order or in mirror mode,
        `not_written` when the model could not write it."""
        if step not in BRIDGE_STEPS:
            raise HalvesError("invalid_value")
        move, case, state = self._theirs(user_id, move_id)
        if not same_language(case):
            raise HalvesError("not_your_turn")
        if step == "slower" or step in move.bridge:
            return self.view(user_id, case.id)
        if step == "gist" and "simpler" not in move.bridge:
            raise HalvesError("not_your_turn")
        written = (
            self._brain.simplify(move, state.hears, user_id)
            if step == "simpler"
            else self._brain.gist(move, self._explanation(user_id, state.hears), user_id)
        )
        if not written or local_problem(written) is not None:
            raise HalvesError("not_written")
        self._repository.save_move(replace(move, bridge={**move.bridge, step: written}))
        return self.view(user_id, case.id)

    # --- Native nudges (7.7, 7.9)

    def _can_nudge(self, case: Case, move: Move, listener: Profile | None) -> bool:
        """A native of the move's language who heard it, an adult, may suggest a better way for
        a human's move. The AI's moves are not nudged."""
        return (
            listener is not None
            and self._band(listener.user_id) == "adult"
            and move.user_id is not None
            and move.status == "delivered"
            and not move.hidden
            and listener.native_language == case.seat(move.seat).speaks
        )

    def nudge(self, user_id: UUID, move_id: UUID, text: str) -> CaseView:
        """Suggests a better way to say the move (a short phrase). It reaches the speaker only
        if the verifier passes it; a dropped one is never shown, and its writer is not told.
        One per move. Raises `HalvesError`."""
        profile = self._require(user_id)
        move, case, _ = self._theirs(user_id, move_id)
        if not self._can_nudge(case, move, profile):
            raise HalvesError("not_your_turn")
        phrase = " ".join(text.split())
        if not NUDGE_MIN <= len(phrase) <= NUDGE_MAX:
            raise HalvesError("invalid_value")
        made = Nudge(self._new_id(), move.id, user_id, phrase, "checking", self._clock())
        if not self._repository.add_nudge(made):
            raise HalvesError("answered")
        self._start("nudge", made.id)
        return self.view(user_id, case.id)

    def check_nudge(self, nudge_id: UUID) -> None:
        """The Nudge Verifier, in the worker. Fails closed: a nudge that cannot be judged is
        tried again, then dropped; only a passed one is ever shown."""
        nudge = self._repository.nudge(nudge_id)
        if nudge is None or nudge.status != "checking":
            return
        move = self._repository.move(nudge.move_id)
        case = self._repository.case(move.case_id) if move else None
        attempt = replace(nudge, attempts=nudge.attempts + 1)
        if move is None or case is None or move.status != "delivered":
            self._repository.save_nudge(replace(attempt, status="dropped", reason="gone"))
            return
        problem = local_problem(nudge.text)
        if problem is not None:
            self._repository.save_nudge(replace(attempt, status="held", reason=problem))
            return
        language = case.seat(move.seat).speaks
        off = rewording_problem(nudge.text, move.transcript, language)
        if off is not None:
            # Not a close rewording: the owner sees it, the speaker never does.
            self._repository.save_nudge(replace(attempt, status="held", reason=off))
            return
        self._repository.save_nudge(attempt)
        verdict = self._brain.verify_nudge(attempt, move, language)
        if verdict is None:
            if attempt.attempts >= NUDGE_ATTEMPTS:
                self._repository.save_nudge(
                    replace(attempt, status="dropped", reason="unavailable")
                )
            return
        if verdict:
            status: NudgeStatus = "held" if verdict in NUDGE_HOLDS else "dropped"
            self._repository.save_nudge(replace(attempt, status=status, reason=verdict))
            return
        self._repository.save_nudge(replace(attempt, status="passed", delivered_at=self._clock()))

    # --- The strand map (7.14) and the share card (7.15)

    def strands(self, user_id: UUID) -> StrandMap:
        """The people the learner played a case with, where each chose to say where they are,
        and the learner's own place. Nothing finer than a city; AI stand-ins are not drawn."""
        profile = self._require(user_id)
        duos = {duo.other(user_id) for duo in self._repository.duos_of(user_id)}
        played: dict[UUID, int] = {}
        for case in self._repository.cases_of(user_id, 100):
            state = case.seat_of(user_id)
            if state is None or case.mode == "ai":
                continue
            other = case.seat(other_seat(state.seat))
            if other.user_id is not None and other.stand_in is None:
                played[other.user_id] = played.get(other.user_id, 0) + 1
        strands: list[Strand] = []
        unplaced = 0
        for other_id, count in played.items():
            if self._repository.blocked(user_id, other_id):
                continue
            known = self._repository.profile(other_id)
            point = place_point(known.place) if known else None
            if known is None or point is None:
                unplaced += 1
                continue
            strands.append(Strand(known.codename, point, count, other_id in duos))
        strands.sort(key=lambda s: (not s.duo, -s.cases, s.codename))
        return StrandMap(place_point(profile.place), tuple(strands), unplaced)

    def share(self, user_id: UUID, case_id: UUID) -> ShareCard:
        """What the share card of an ended case shows (7.15). It is shared only when the learner
        asks; it carries no voice and none of their words. An adult's card carries an invite
        code (made if they have none) so a friend can play with them."""
        profile = self._require(user_id)
        case, state = self._case(user_id, case_id)
        found = template_of(case)
        if found is None or case.status == "open":
            raise HalvesError("not_your_turn")
        understood, told = heard_first(case, self._repository.moves_of(case.id), state.seat)
        code: str | None = None
        if self._band(user_id) == "adult":
            invite = self._repository.invite_of(user_id)
            if invite is None or invite.expires_at <= self._clock():
                invite = self.invite(user_id)
            code = invite.code
        return ShareCard(
            title=text_in(found.title, self._language(user_id)),
            week=case.season,
            status=case.status,
            understood_first=understood,
            told=told,
            code=code,
            codename=profile.codename,
        )

    # --- The Learning Director's suggestion (5.1)

    def suggestion(self, user_id: UUID, monday: dt.date) -> Suggestion | None:
        """The week's case, suggested at most once a week: to a learner who joined, is not
        paused, has no open case and started none this week."""
        if not self.available(user_id):
            return None
        profile = self._repository.profile(user_id)
        if profile is None or profile.paused or profile.suspended:
            return None
        for case in self._repository.cases_of(user_id, 20):
            if case.status == "open" or case.created_at.date() >= monday:
                return None
        year, week, _ = monday.isocalendar()
        chosen = season_case(year, week)
        return Suggestion(chosen.id, text_in(chosen.title, self._language(user_id)))

    # --- Safety (7.10)

    def report(self, user_id: UUID, move_id: UUID, reason: str, note: str | None) -> CaseView:
        """Reports a move the learner heard: it is hidden from them at once and goes to the
        owner's queue. The round moves on."""
        if reason not in REPORT_REASONS:
            raise HalvesError("invalid_value")
        text = (note or "").strip() or None
        if text is not None and len(text) > REPORT_NOTE_MAX:
            raise HalvesError("invalid_value")
        move, case, _ = self._theirs(user_id, move_id)
        self._repository.save_move(replace(move, hidden=True, bridge={}))
        if move.user_id is not None:
            self._repository.add_report(
                Report(self._new_id(), user_id, move.id, reason, text, "open", self._clock())
            )
        return self.view(user_id, case.id)

    def block(self, user_id: UUID, case_id: UUID) -> CaseView:
        """Blocks the other learner: an AI finishes their seat, the two are never paired again
        and are no longer a duo."""
        self._require(user_id)
        case, state = self._case(user_id, case_id)
        other = case.seat(other_seat(state.seat))
        if other.user_id is None:
            raise HalvesError("not_found")
        known = self._repository.profile(other.user_id)
        self._repository.add_block(
            Block(
                self._new_id(),
                user_id,
                other.user_id,
                known.codename if known else "",
                self._clock(),
            )
        )
        self._repository.remove_duo(user_id, other.user_id)
        if case.status == "open" and other.stand_in is None:
            self._repository.save_case(
                case.with_seat(replace(other, stand_in=stand_in_for(other.speaks)))
            )
            self._start("ai", case.id)
        return self.view(user_id, case.id)

    def unblock(self, user_id: UUID, block_id: UUID) -> None:
        self._require(user_id)
        self._repository.remove_block(user_id, block_id)

    # --- The owner's queue (6.15)

    def is_owner(self, user_id: UUID) -> bool:
        return user_id in self._owners

    def queue(self, user_id: UUID) -> list[QueueItem]:
        if not self.is_owner(user_id):
            raise HalvesError("not_owner")
        items: list[QueueItem] = []
        for move in self._repository.held(QUEUE_LIMIT):
            sender = self._repository.profile(move.user_id) if move.user_id else None
            items.append(
                QueueItem(
                    "held",
                    move.id,
                    move.id,
                    move.transcript,
                    move.reasons,
                    sender.codename if sender else "",
                    None,
                    None,
                    sender.band if sender else "minor",
                    move.created_at,
                    strikes=sender.strikes if sender else 0,
                    suspended=sender.suspended if sender else False,
                )
            )
        for report in self._repository.open_reports(QUEUE_LIMIT):
            reported = self._repository.move(report.move_id)
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
                    sender.band if sender else "minor",
                    report.created_at,
                    strikes=sender.strikes if sender else 0,
                    suspended=sender.suspended if sender else False,
                )
            )
        for nudge in self._repository.held_nudges(QUEUE_LIMIT):
            nudger = self._repository.profile(nudge.user_id)
            items.append(
                QueueItem(
                    "nudge",
                    nudge.id,
                    nudge.move_id,
                    nudge.text,
                    (nudge.reason or "unsafe",),
                    nudger.codename if nudger else "",
                    None,
                    None,
                    self._band(nudge.user_id),
                    nudge.created_at,
                    strikes=nudger.strikes if nudger else 0,
                    suspended=nudger.suspended if nudger else False,
                )
            )
        return sorted(items, key=lambda item: item.created_at, reverse=True)

    def _decide_nudge(self, item_id: UUID, action: str) -> None:
        nudge = self._repository.nudge(item_id)
        if nudge is None or nudge.status != "held":
            raise HalvesError("not_found")
        # Never delivered later, whatever the decision.
        self._repository.save_nudge(replace(nudge, status="dropped", delivered_at=None))
        reason = nudge.reason or "unsafe"
        if action == "remove":
            self._strike(nudge.user_id, "strike", reason, None)
        elif action == "warn":
            self._record(nudge.user_id, "warning", reason, None)
            self._announce(nudge.user_id, UUID(int=0), "warning")
        elif action == "suspend":
            self._strike(nudge.user_id, "suspension", reason, None)

    def decide(self, user_id: UUID, kind: str, item_id: UUID, action: str) -> None:
        """The owner's decision on a held or reported move:

        - `remove`: the move goes and its sender gets a strike (three suspend them);
        - `warn`: the move goes and the sender is warned by push, without a strike;
        - `suspend`: the move goes and the sender is suspended at once (a grave case);
        - `dismiss`: a report is closed and the move stays; a held move still goes.

        A held move is never delivered later, whatever the decision: its sender recorded the
        round again (phase 1's call)."""
        if not self.is_owner(user_id):
            raise HalvesError("not_owner")
        if action not in DECISIONS:
            raise HalvesError("invalid_value")
        if kind == "nudge":
            self._decide_nudge(item_id, action)
            return
        now = self._clock()
        reason = "held"
        if kind == "report":
            report = self._repository.report(item_id)
            if report is None or report.status != "open":
                raise HalvesError("not_found")
            self._repository.save_report(
                replace(
                    report,
                    status="dismissed" if action == "dismiss" else "removed",
                    resolved_at=now,
                )
            )
            move = self._repository.move(report.move_id)
            reason = report.reason
        elif kind == "held":
            move = self._repository.move(item_id)
            if move is None or move.status != "held":
                raise HalvesError("not_found")
            reason = move.reasons[0] if move.reasons else "held"
        else:
            raise HalvesError("invalid_value")
        if move is None:
            return
        if action == "dismiss" and kind == "report":
            return
        # A report's decision is timed on the report; a held move's on the move.
        self._forget(replace(move, decided_at=now) if kind == "held" else move, "removed")
        sender = move.user_id
        if sender is None or action == "dismiss":
            return
        if action == "remove":
            self._strike(sender, "strike", reason, move.id)
        elif action == "warn":
            self._record(sender, "warning", reason, move.id)
            self._announce(sender, move.case_id, "warning")
        elif action == "suspend":
            self._strike(sender, "suspension", reason, move.id)

    def _record(self, user_id: UUID, kind: StrikeKind, reason: str, move_id: UUID | None) -> None:
        self._repository.add_strike(
            Strike(self._new_id(), user_id, kind, reason, move_id, self._clock())
        )

    def _strike(
        self,
        user_id: UUID,
        kind: StrikeKind = "strike",
        reason: str = "held",
        move_id: UUID | None = None,
    ) -> None:
        # Recorded first and always: the record outlives the profile, so leaving before the owner
        # decides escapes nothing (`join` reads it back).
        self._record(user_id, kind, reason, move_id)
        profile = self._repository.profile(user_id)
        if profile is None:
            return
        strikes = profile.strikes + (1 if kind == "strike" else 0)
        suspended = kind == "suspension" or strikes >= STRIKES_TO_SUSPEND or profile.suspended
        self._repository.save_profile(replace(profile, strikes=strikes, suspended=suspended))
        if suspended:
            # A suspended learner is no longer matched.
            self._repository.delete_ticket(user_id)

    def stats(self, user_id: UUID) -> SafetyStats:
        """The owner's numbers for the last 30 days (6.15)."""
        if not self.is_owner(user_id):
            raise HalvesError("not_owner")
        counts = self._repository.counts(self._clock() - STATS_WINDOW)

        def per_1000(part: int, whole: int) -> float:
            return round(1000 * part / whole, 1) if whole else 0.0

        hours = sorted(counts.decision_hours)
        median: float | None = None
        if hours:
            middle = len(hours) // 2
            median = hours[middle] if len(hours) % 2 else (hours[middle - 1] + hours[middle]) / 2
            median = round(median, 1)
        open_items = (
            len(self._repository.held(QUEUE_LIMIT))
            + len(self._repository.open_reports(QUEUE_LIMIT))
            + len(self._repository.held_nudges(QUEUE_LIMIT))
        )
        return SafetyStats(
            moves=counts.moves,
            cases=counts.cases,
            held_per_1000=per_1000(counts.held, counts.moves),
            reports_per_1000=per_1000(counts.reports, counts.moves),
            blocks_per_1000_cases=per_1000(counts.blocks, counts.cases),
            nudges=counts.nudges,
            nudges_dropped=counts.nudges_dropped,
            median_decision_hours=median,
            open_items=open_items,
        )

    # --- The worker

    def check(self, move_id: UUID) -> None:
        """Checks a move and delivers it, or holds it (`halves_check.py` does the checking).
        Fails closed: a move that cannot be checked is checked again later, then fails."""
        move = self._repository.move(move_id)
        if move is None or move.status != "checking" or move.user_id is None:
            return
        case = self._repository.case(move.case_id)
        if case is None:
            return
        attempt = replace(move, attempts=move.attempts + 1)
        self._repository.save_move(attempt)
        # The band is read from the account at every delivery, never from what was stored: an
        # age group corrected since the case began counts at once.
        band = self._band(move.user_id)
        speaks = case.seat(move.seat).speaks
        listener_seat = case.seat(other_seat(move.seat))
        if (
            not listener_seat.ai
            and listener_seat.user_id is not None
            and (band != "adult" or self._band(listener_seat.user_id) != "adult")
        ):
            # Two learners hear each other only when both are adults.
            self._repository.save_move(replace(attempt, status="held", reasons=("age_band",)))
            self._announce(move.user_id, case.id, "held")
            return
        labels = self._brain.check(attempt, band, speaks)
        if labels is None:
            self._unchecked(attempt)
            return
        if labels:
            self._repository.save_move(replace(attempt, status="held", reasons=labels))
            self._announce(move.user_id, case.id, "held")
            return
        veil_key = None
        if attempt.veiled:
            veil_key = self._brain.veil(attempt)
            if veil_key is None:
                self._unchecked(attempt)
                return
        now = self._clock()
        delivered = replace(attempt, status="delivered", veil_key=veil_key, delivered_at=now)
        self._repository.save_move(delivered)
        explanation = self._explanation(move.user_id, speaks)
        corrections = self._brain.correct(delivered, speaks, explanation)
        if corrections:
            self._repository.save_move(replace(delivered, corrections=corrections))
        listener = case.seat(other_seat(move.seat))
        if listener.ai:
            self.play(case.id)
        elif listener.user_id is not None:
            self._announce(listener.user_id, case.id, "move")

    def _unchecked(self, move: Move) -> None:
        if move.attempts >= CHECK_ATTEMPTS:
            self._repository.save_move(replace(move, status="failed", reasons=("unavailable",)))
            if move.user_id is not None:
                self._announce(move.user_id, move.case_id, "held")

    def _explanation(self, user_id: UUID, target: str) -> str:
        profile = self._profiles.get(user_id)
        return profile.value(target, "explanation_language") or self._language(user_id)

    def play(self, case_id: UUID) -> None:
        """The stand-in does what it owes: it answers the moves it heard, sends its next move,
        and answers the case's question when it may. Runs in the worker (it speaks)."""
        case = self._repository.case(case_id)
        found = template_of(case) if case else None
        if case is None or found is None or case.status != "open":
            return
        ai = next((s for s in case.seats if s.ai), None)
        if ai is None:
            return
        human = case.seat(other_seat(ai.seat))
        moves = self._repository.moves_of(case.id)
        for move in moves:
            if move.seat != human.seat or move.status != "delivered":
                continue
            clue = found.clue(move.seat, move.round)
            if _settled(move, clue.answer):
                continue
            options = [text_in(option, ai.hears) for option in clue.options]
            picked, reaction = self._brain.understand(
                move, text_in(clue.asks, ai.hears), options, case
            )
            picked = picked if 0 <= picked < len(options) else 0
            answers = (picked,) if picked == clue.answer else (picked, clue.answer)
            self._repository.save_move(replace(move, answers=answers, reaction=reaction))
        moves = self._repository.moves_of(case.id)
        round_number = next_round(case, moves, ai.seat)
        if round_number is not None:
            clue = found.clue(ai.seat, round_number)
            move_id = uuid.uuid5(case.id, f"{ai.seat}{round_number}")
            spoken = self._brain.say(
                case, ai, text_in(clue.says, ai.speaks), self._stand_in_voice(human), move_id
            )
            self._repository.save_move(spoken)
            if human.user_id is not None:
                self._announce(human.user_id, case.id, "move")
            moves = self._repository.moves_of(case.id)
        if final_open(case, moves, ai.seat) and not found_right(case, ai):
            case = case.with_seat(replace(ai, final_answers=(*ai.final_answers, found.answer)))
            case = self._settle(case)
            self._repository.save_case(case)

    def _stand_in_voice(self, human: SeatState) -> str:
        """A voice that is not the learner's own partner's, so the two sound apart."""
        taken = (
            {p.voice for p in self._personas.partners(human.user_id)} if human.user_id else set()
        )
        return next((v for v in STAND_IN_VOICES if v not in taken), STAND_IN_VOICES[0])

    def _settle(self, case: Case) -> Case:
        """Ends the case when both are done answering, and has the recap written."""
        status = outcome(case)
        if status == "open":
            return case
        now = self._clock()
        ended = replace(case, status=status, ended_at=now, recap_status="pending")
        for move in self._repository.moves_of(case.id):
            self._repository.save_move(replace(move, delete_after=now + KEEP_FOR))
        self._start("recap", case.id)
        return ended

    def write_recap(self, case_id: UUID) -> None:
        """The ending as a short scene, one per learner, voiced by the two characters: each
        learner's own partner, or the stand-in."""
        case = self._repository.case(case_id)
        if case is None or case.status == "open" or case.recap_status == "ready":
            return
        voices: dict[str, tuple[str, str]] = {}
        for seat in case.seats:
            if seat.ai:
                human = case.seat(other_seat(seat.seat))
                voices[seat.seat] = (
                    seat.stand_in or stand_in_for(seat.speaks),
                    self._stand_in_voice(human),
                )
            else:
                partners = self._personas.partners(seat.user_id) if seat.user_id else []
                partner = partners[0] if partners else None
                voices[seat.seat] = (
                    partner.name if partner else stand_in_for(seat.speaks),
                    partner.voice if partner else STAND_IN_VOICES[0],
                )
        recaps: dict[str, tuple[RecapLine, ...]] = {}
        for seat in case.seats:
            if not seat.ai:
                recaps[seat.seat] = self._brain.recap(case, seat, voices)
        self._repository.save_case(
            replace(case, recaps=recaps, recap_status="ready" if recaps else "failed")
        )

    def tick(self) -> None:
        """Once an hour: moves lost with their worker are checked again (or fail), sounds and
        words past their 30 days are deleted, old invites go, and stand-ins catch up."""
        now = self._clock()
        for move in self._repository.stale_checks(now - CHECK_STALE, TICK_SCAN):
            if move.attempts >= CHECK_ATTEMPTS:
                self._unchecked(move)
            else:
                self._start("check", move.id)
        for move in self._repository.expired(now, TICK_SCAN):
            if move.status == "held":
                continue  # the owner decides first; the bucket's 30 days still apply to sound
            self._forget(move, "removed" if move.status != "delivered" else "delivered")
        self._repository.delete_expired_invites(now)
        for case in self._repository.open_cases(TICK_SCAN):
            if any(seat.ai for seat in case.seats):
                self._start("ai", case.id)
        for nudge in self._repository.stale_nudges(now - NUDGE_STALE, TICK_SCAN):
            self._start("nudge", nudge.id)
        # Phase 2: pair who fits, then offer an AI to those who waited long enough.
        self._match()
        self._end_searches()

    def _start(self, job: str, item_id: UUID) -> None:
        try:
            self._starter.start(job, item_id)
        except Exception:  # the hourly tick starts it again
            return

    # --- Views

    def _partner_label(self, case: Case, state: SeatState) -> PartnerLabel:
        other = case.seat(other_seat(state.seat))
        if other.ai:
            return PartnerLabel(other.stand_in or stand_in_for(other.speaks), True)
        known = self._repository.profile(other.user_id) if other.user_id else None
        if known is None:
            return PartnerLabel(stand_in_for(other.speaks), True)
        return PartnerLabel(known.codename, False, known.place)

    def _summary(self, case: Case, user_id: UUID, language: str) -> CaseSummary | None:
        state = case.seat_of(user_id)
        found = template_of(case)
        if state is None or found is None:
            return None
        moves = self._repository.moves_of(case.id)
        mine = len(_live(moves, state.seat))
        return CaseSummary(
            id=case.id,
            template_id=case.template_id,
            title=text_in(found.title, language),
            mode=case.mode,
            status=case.status,
            partner=self._partner_label(case, state),
            next=what_next(case, moves, state.seat),
            round=min(mine + 1, ROUNDS),
            created_at=case.created_at,
        )

    def _view(self, case: Case, state: SeatState, moves: Sequence[Move], user_id: UUID) -> CaseView:
        found = template_of(case)
        if found is None:
            raise HalvesError("not_found")
        language = self._language(user_id)
        rounds: list[RoundView] = []
        record_round = next_round(case, moves, state.seat)
        profile = self._repository.profile(user_id)
        bridged = same_language(case)
        for round_number in range(1, ROUNDS + 1):
            clue = found.clue(state.seat, round_number)
            mine_move = next(
                (
                    m
                    for m in sorted(moves, key=lambda m: m.created_at, reverse=True)
                    if m.seat == state.seat and m.round == round_number
                ),
                None,
            )
            mine = None
            if mine_move is not None:
                understood = None
                if mine_move.answers:
                    understood = mine_move.answers[0] == clue.answer
                mine = MineView(
                    id=mine_move.id,
                    status=mine_move.status,
                    transcript=mine_move.transcript,
                    reasons=mine_move.reasons,
                    veiled=mine_move.veiled,
                    reaction=mine_move.reaction,
                    understood=understood,
                    corrections=mine_move.corrections,
                    nudges=self._passed_nudges(mine_move.id),
                )
            theirs_move = _delivered(moves, other_seat(state.seat), round_number)
            theirs = None
            if theirs_move is not None:
                their_clue = found.clue(theirs_move.seat, round_number)
                settled = _settled(theirs_move, their_clue.answer)
                # Words derived from a move go when the move's words go.
                shown_bridge = bridged and not theirs_move.hidden and bool(theirs_move.transcript)
                theirs = TheirsView(
                    id=theirs_move.id,
                    hidden=theirs_move.hidden,
                    question=text_in(their_clue.asks, language),
                    options=tuple(text_in(o, language) for o in their_clue.options),
                    answers=theirs_move.answers,
                    solution=their_clue.answer if settled else None,
                    reaction=theirs_move.reaction,
                    caption="" if theirs_move.hidden else theirs_move.transcript,
                    can_nudge=self._can_nudge(case, theirs_move, profile),
                    nudged=any(
                        n.user_id == user_id for n in self._repository.nudges_of(theirs_move.id)
                    ),
                    bridge=bridged,
                    simpler=theirs_move.bridge.get("simpler") if shown_bridge else None,
                    gist=theirs_move.bridge.get("gist") if shown_bridge else None,
                )
            # A clue is shown for the round being played and the ones before.
            shown = round_number <= (record_round or ROUNDS) or mine is not None
            rounds.append(
                RoundView(
                    round=round_number,
                    clue=text_in(clue.says, state.speaks) if shown else "",
                    clue_help=text_in(clue.says, language) if shown else "",
                    mine=mine,
                    theirs=theirs,
                )
            )
        other = case.seat(other_seat(state.seat))
        ended = case.status != "open"
        final = FinalView(
            open=final_open(case, moves, state.seat) and not found_right(case, state),
            question=text_in(found.question, language),
            options=tuple(text_in(o, language) for o in found.options),
            answers=state.final_answers,
            other_answered=bool(other.final_answers),
            solution=found.answer if ended or found_right(case, state) else None,
        )
        understood_first, told = heard_first(case, moves, state.seat)
        return CaseView(
            id=case.id,
            template_id=case.template_id,
            title=text_in(found.title, language),
            setting=text_in(found.setting, language),
            mode=case.mode,
            status=case.status,
            seat=state.seat,
            speaks=state.speaks,
            hears=state.hears,
            partner=self._partner_label(case, state),
            rounds=tuple(rounds),
            final=final,
            record_round=record_round,
            can_hand_over=self._can_hand_over(case, state),
            again=state.again,
            ask_again=ended and case.mode != "ai" and not other.ai and state.again is None,
            recap=case.recaps.get(state.seat, ()),
            recap_status=case.recap_status,
            veil_default=profile.veil_default if profile else True,
            ending=text_in(found.ending, state.speaks) if ended else None,
            understood_first=understood_first,
            told=told,
            same_language=bridged,
            from_import=case.custom is not None,
            duo=other.user_id is not None
            and any(d.other(user_id) == other.user_id for d in self._repository.duos_of(user_id)),
        )

    def _passed_nudges(self, move_id: UUID) -> tuple[NudgeView, ...]:
        views: list[NudgeView] = []
        for nudge in self._repository.nudges_of(move_id):
            known = self._repository.profile(nudge.user_id)
            # A nudge whose author left Two Halves is not shown any more.
            if nudge.status == "passed" and known is not None:
                views.append(NudgeView(nudge.text, known.codename))
        return tuple(views)

    # --- The briefing (7.5)

    def briefing(self, user_id: UUID, case_id: UUID) -> tuple[str, str, str] | None:
        """For the briefing call: the case's title and setting and the clue the learner tells
        next, in the language they speak. None when there is nothing to rehearse."""
        case = self._repository.case(case_id)
        state = case.seat_of(user_id) if case else None
        found = template_of(case) if case else None
        if case is None or state is None or found is None or case.status != "open":
            return None
        round_number = next_round(case, self._repository.moves_of(case.id), state.seat)
        clue = found.clue(state.seat, round_number or ROUNDS)
        return (
            text_in(found.title, state.speaks),
            text_in(found.setting, state.speaks),
            text_in(clue.says, state.speaks),
        )

    def briefing_scenario(self, user_id: UUID, scenario_id: str) -> Scenario | None:
        """The briefing (7.5) as a role-play of the practice call: the learner's own partner
        rehearses with them the clue they tell next. None for an id that is not a briefing of
        one of their open cases."""
        if not scenario_id.startswith(BRIEFING_PREFIX):
            return None
        try:
            case_id = UUID(scenario_id.removeprefix(BRIEFING_PREFIX))
        except ValueError:
            return None
        found = self.briefing(user_id, case_id)
        if found is None:
            return None
        title, setting, clue = found
        return Scenario(
            id=scenario_id,
            level="A1",
            character=(
                "yourself, the learner's own partner, as their coach for one move of Two Halves, "
                "a two-player mystery game"
            ),
            situation=(
                f'The case "{title}": {setting} In a voice message of at most 90 seconds, in the '
                f"language they are learning, the learner must tell the other player this clue: "
                f'"{clue}". The other player has not heard it. Help the learner say it clearly in '
                "their own words: ask them to try, give one gentle tip about one thing to say "
                "better, and let them try once more. Never tell them other clues or the answer, "
                "and never invent facts of the case."
            ),
            goals=(
                Goal("said_clue", "told the clue clearly in their own words"),
                Goal("tried_again", "said it once more after a tip"),
            ),
        )
