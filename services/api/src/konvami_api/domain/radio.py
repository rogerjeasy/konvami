"""Radio Konvami (section 8, design note 2026-11-20-radio-design.md): a daily call-in show in
each language learned.

Every day has one prompt ("What was your funniest train journey?"). Learners phone in with a
voice note of up to 45 seconds. Each call is written down word for word at once and checked on
the server before anyone else hears it (`radio_check.py`, the same fail-closed check as a Two
Halves move). At the show's hour the episode is built: the host (Mia, a Konvami persona) screens
the calls that passed, picks a few, and weaves them into a short show with an opening, a warm
line after each call and a goodbye; AI callers, always labelled as AI, fill the show when there
are few. Listeners react with four fixed applause cards and nothing else.

The host never corrects anyone on air. Each caller gets a private report of their own call (8.4):
the corrections the second check confirmed, "Say it better" and cards.

Safety by design: an adult opts in with a voice-sharing consent of its own (`radio_voice`, v1);
the Veil (a neutral voice reading the caller's exact words) is on by default; a minor may listen
and call, but their calls are private practice and never aired; a caller is a codename and
nothing more; a held call is never aired; the owner can pull a call or a whole episode (6.15);
calls and episodes are deleted 30 days after their show.

An episode is a playlist of segments (host lines, calls) that the app plays in order, not one
mixed sound file: the Lambda runtime has no audio encoder.
"""

import datetime as dt
import random
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass, field, replace
from typing import Literal, Protocol
from uuid import UUID, uuid4

from konvami_api.domain.accounts import AccountDirectory, AccountNotFound
from konvami_api.domain.costs import Feature
from konvami_api.domain.halves import (
    REPORT_REASONS,
    Band,
    Correction,
    band_of,
    make_codename,
)
from konvami_api.domain.halves_cases import LANGUAGES
from konvami_api.domain.profile import ProfileService
from konvami_api.domain.radio_prompts import Prompt, prompt, prompt_for, question_in
from konvami_api.domain.reports import words_in
from konvami_api.domain.spoken import Listener, SpokenError, is_right
from konvami_api.domain.storage import FileStore

# `open`: taking calls for its day. `building`: the show is being put together. `ready`: on air
# (and in the archive). `failed`: building failed; the tick tries again. `pulled`: the owner
# took it off air. `expired`: past its 30 days, its sounds deleted.
type EpisodeStatus = Literal["open", "building", "ready", "failed", "pulled", "expired"]
# `checking`: nobody hears it yet. `ready`: checked, waiting for the show. `aired`: in the show.
# `not_picked`: checked, not in the show. `private`: a minor's call, never aired. `held`: the
# check stopped it. `failed`: it could not be checked (fails closed). `removed`: taken away.
type CallStatus = Literal[
    "checking", "ready", "aired", "not_picked", "private", "held", "failed", "removed"
]
type SegmentKind = Literal["host", "call", "ai_call"]
type ReportStatus = Literal["open", "removed", "dismissed"]

APPLAUSE: tuple[str, ...] = ("bravo", "ha_ha", "me_too", "wow")

# The consent to let other learners hear one's calls on the show, a record of its own, separate
# from the AI consent of 2.5 and from Two Halves' voice sharing.
VOICE_CONSENT_VERSION = 1
# A call is at most this long (the app stops recording there).
CALL_SECONDS = 45
# Fewer words than this is a cough or a mis-tap, not a call.
MIN_WORDS = 3
# Calls a learner may make in a day: each is a transcription and a few requests to a model.
CALLS_PER_DAY = 5
# "Say it better" tries on calls a learner may make in a day.
RETRIES_PER_DAY = 30
# The show airs at this hour (UTC; 18:00 in Zurich in winter) and takes calls for the next day
# from then on.
AIR_HOUR = 17
# Calls of learners in one show, and the voices a show has at least (AI callers fill the rest).
PICKS = 4
MIN_CALLERS = 3
# Episodes the archive keeps (8.5), and how long a call's and a show's sounds and words are kept.
ARCHIVE_DAYS = 14
KEEP_FOR = dt.timedelta(days=30)
# A call still being checked after this long was lost with its worker and is checked again, at
# most `CHECK_ATTEMPTS` times in all; then it fails (closed: never aired unchecked).
CHECK_STALE = dt.timedelta(minutes=5)
CHECK_ATTEMPTS = 3
# A show still being built after this long was lost with its worker; it is built again, at most
# `BUILD_ATTEMPTS` times.
BUILD_STALE = dt.timedelta(minutes=15)
BUILD_ATTEMPTS = 3
# Confirmed strikes (held or reported calls the owner removed) that suspend calling in.
STRIKES_TO_SUSPEND = 3
# How long the app may play a segment through one address.
ADDRESS_SECONDS = 5 * 60
# A notice on Today that the learner's call aired, this long after the show.
AIRED_NOTICE = dt.timedelta(days=2)
REPORT_NOTE_MAX = 300
QUEUE_LIMIT = 100
TICK_SCAN = 200
SOUND_TYPE = "audio/mpeg"
FOLDER = "radio"

_AUDIO_TYPES = {"m4a": "audio/mp4", "webm": "audio/webm", "wav": "audio/wav", "mp3": "audio/mpeg"}

# The host: Mia, the persona who greets every learner at setup (4.1), in every language.
HOST_NAME = "Mia"
HOST_VOICE = "coral"
# The neutral voice of a veiled call: the caller's exact words, not their voice.
VEIL_VOICE = "alloy"
# AI callers: names of each language, and voices that are neither the host's nor the veil's.
AI_CALLERS: Mapping[str, tuple[str, str]] = {
    "de": ("Jonas", "Klara"),
    "en": ("Sam", "Priya"),
    "fr": ("Julien", "Inès"),
    "it": ("Giulia", "Marco"),
}
AI_VOICES: tuple[str, ...] = ("ash", "sage", "verse")

# The host's own words, when no model writes the script. `{host}`, `{question}`, `{name}`.
_INTRO: Mapping[str, str] = {
    "de": "Hallo und willkommen bei Radio Konvami! Ich bin {host}. Heute fragen wir: {question}",
    "en": "Hello and welcome to Radio Konvami! I'm {host}. Today we're asking: {question}",
    "fr": "Bonjour et bienvenue sur Radio Konvami ! Ici {host}. Aujourd'hui, on se demande : "
    "{question}",
    "it": "Ciao e benvenuti a Radio Konvami! Sono {host}. Oggi ci chiediamo: {question}",
}
_AFTER: Mapping[str, tuple[str, ...]] = {
    "de": (
        "Danke, {name}! Das gefällt mir sehr.",
        "Wunderbar, {name}. Und schon klingelt das Telefon wieder.",
        "Ha, das kenne ich, {name}! Danke für deinen Anruf.",
        "Schön erzählt, {name}. Weiter geht's!",
    ),
    "en": (
        "Thank you, {name}! I love that.",
        "Wonderful, {name}. And the phone is ringing again.",
        "Ha, I know that feeling, {name}! Thanks for calling.",
        "Nicely told, {name}. Let's keep going!",
    ),
    "fr": (
        "Merci, {name} ! J'adore.",
        "Super, {name}. Et le téléphone sonne encore.",
        "Ha, je connais ça, {name} ! Merci pour ton appel.",
        "Bien raconté, {name}. On continue !",
    ),
    "it": (
        "Grazie, {name}! Mi piace tantissimo.",
        "Bellissimo, {name}. E il telefono squilla di nuovo.",
        "Ah, lo conosco bene, {name}! Grazie della chiamata.",
        "Raccontato benissimo, {name}. Andiamo avanti!",
    ),
}
_OUTRO: Mapping[str, str] = {
    "de": "Das war Radio Konvami für heute. Morgen gibt es eine neue Frage. Ruf an!",
    "en": "That was Radio Konvami for today. Tomorrow there's a new question. Call in!",
    "fr": "C'était Radio Konvami pour aujourd'hui. Demain, une nouvelle question. Appelle-nous !",
    "it": "Questa era Radio Konvami per oggi. Domani c'è una nuova domanda. Chiamaci!",
}


class RadioError(Exception):
    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


# --- What is kept --------------------------------------------------------------------------------


@dataclass(frozen=True)
class Profile:
    user_id: UUID
    codename: str
    band: Band
    veil_default: bool
    # 0: not given (a minor, whose calls are never aired, does not need it).
    consent_version: int
    consent_at: dt.datetime | None
    strikes: int = 0
    suspended: bool = False

    @property
    def on_air(self) -> bool:
        """Whether this learner's calls may be aired at all."""
        return self.band == "adult" and self.consent_version >= VOICE_CONSENT_VERSION


@dataclass(frozen=True)
class Segment:
    index: int
    kind: SegmentKind
    # The host's name, an AI caller's name or the caller's codename.
    speaker: str
    ai: bool
    # The captions: what is said, word for word.
    text: str
    audio_key: str | None = None
    call_id: UUID | None = None
    # Taken out of the show (a removed or withdrawn call): skipped by the player.
    removed: bool = False


@dataclass(frozen=True)
class Episode:
    id: UUID
    language: str
    day: dt.date
    prompt_id: str
    status: EpisodeStatus
    created_at: dt.datetime
    # Who the show's requests are metered to: the first learner who opened the hub for it.
    opened_by: UUID | None
    segments: tuple[Segment, ...] = ()
    built_at: dt.datetime | None = None
    attempts: int = 0
    delete_after: dt.datetime | None = None

    @property
    def airs_at(self) -> dt.datetime:
        return air_time(self.day)


@dataclass(frozen=True)
class Call:
    id: UUID
    episode_id: UUID
    user_id: UUID | None
    status: CallStatus
    transcript: str
    created_at: dt.datetime
    audio_key: str | None = None
    veil_key: str | None = None
    veiled: bool = True
    # Whether it may be aired: an adult who agreed, when they called.
    broadcast: bool = False
    reasons: tuple[str, ...] = ()
    corrections: tuple[Correction, ...] = ()
    attempts: int = 0
    aired_at: dt.datetime | None = None
    delete_after: dt.datetime | None = None


@dataclass(frozen=True)
class Report:
    id: UUID
    reporter: UUID
    episode_id: UUID
    segment: int
    reason: str
    note: str | None
    status: ReportStatus
    created_at: dt.datetime
    resolved_at: dt.datetime | None = None


@dataclass(frozen=True)
class Script:
    """The host's words of one show."""

    intro: str
    # One line after each call, in their order.
    after: tuple[str, ...]
    outro: str


class RadioRepository(Protocol):
    def profile(self, user_id: UUID) -> Profile | None: ...

    def save_profile(self, profile: Profile) -> None: ...

    def delete_profile(self, user_id: UUID) -> None: ...

    def episode(self, episode_id: UUID) -> Episode | None: ...

    def episode_on(self, language: str, day: dt.date) -> Episode | None: ...

    def add_episode(self, episode: Episode) -> Episode:
        """Stores a new episode, unless one is stored for its language and day already: then
        that one is the answer. Two learners opening the hub together get the same show."""

    def save_episode(self, episode: Episode) -> None: ...

    def episodes(self, language: str, since: dt.date, statuses: Sequence[str]) -> list[Episode]:
        """A language's episodes on or after `since` in one of `statuses`, newest first."""

    def episodes_in(self, statuses: Sequence[str], limit: int) -> list[Episode]: ...

    def expired_episodes(self, now: dt.datetime, limit: int) -> list[Episode]: ...

    def call(self, call_id: UUID) -> Call | None: ...

    def save_call(self, call: Call) -> None: ...

    def calls_of(self, episode_id: UUID) -> list[Call]:
        """An episode's calls, oldest first."""

    def calls_by(self, user_id: UUID) -> list[Call]:
        """A learner's calls, newest first."""

    def calls_since(self, user_id: UUID, since: dt.datetime) -> int: ...

    def held(self, limit: int) -> list[Call]: ...

    def stale_checks(self, before: dt.datetime, limit: int) -> list[Call]: ...

    def expired_calls(self, now: dt.datetime, limit: int) -> list[Call]:
        """Calls past their `delete_after` that still have words or a sound."""

    def applause(self, episode_id: UUID) -> Mapping[tuple[int, str], int]:
        """How many listeners gave each card to each segment."""

    def applause_of(self, user_id: UUID, episode_id: UUID) -> Mapping[int, str]: ...

    def set_applause(self, user_id: UUID, episode_id: UUID, segment: int, card: str | None) -> None:
        """The learner's card for a segment, in place of their earlier one; None takes it back."""

    def delete_applause(self, user_id: UUID) -> None: ...

    def add_report(self, report: Report) -> None: ...

    def report(self, report_id: UUID) -> Report | None: ...

    def save_report(self, report: Report) -> None: ...

    def open_reports(self, limit: int) -> list[Report]: ...

    def reported(self, user_id: UUID, episode_id: UUID) -> frozenset[int]:
        """The segments of an episode the learner reported: hidden from them."""

    def note_retry(self, user_id: UUID, day: dt.date, limit: int) -> bool:
        """Counts one more "Say it better" try on `day`, unless the learner reached `limit`."""


class RadioStarter(Protocol):
    def start(self, job: str, item_id: UUID) -> None:
        """Has the worker run `job` ("check" a call, "build" an episode) in an invocation of its
        own."""


class Brain(Protocol):
    """What a model does on the show (`radio_check.py`), so the service can be tried with a
    stand-in."""

    def check(self, call: Call, band: Band, language: str, question: str) -> tuple[str, ...] | None:
        """The labels that hold the call (empty: it may be aired). None when it could not be
        checked: the call waits and is checked again, never aired unchecked."""

    def veil(self, call: Call) -> str | None:
        """The call's words in the neutral voice, stored; None when it could not be made."""

    def correct(self, call: Call, target: str, explanation: str) -> tuple[Correction, ...]: ...

    def screen(
        self, question: str, language: str, calls: Sequence[Call], most: int, payer: UUID | None
    ) -> list[UUID] | None:
        """The calls to air, best first, at most `most`; None when no model answered."""

    def ai_call(self, question: str, language: str, name: str, payer: UUID | None) -> str | None:
        """What an AI caller says on the prompt; None when no model answered."""

    def script(
        self,
        question: str,
        language: str,
        callers: Sequence[tuple[str, bool, str]],
        payer: UUID | None,
    ) -> Script | None:
        """The host's opening, a line after each caller (name, AI, words) and the goodbye."""

    def speak(self, payer: UUID | None, voice: str, text: str, key: str) -> str | None:
        """Speaks and stores `text` under `key`; None when nothing could be spoken."""


# --- What the app is shown ------------------------------------------------------------------------


@dataclass(frozen=True)
class EpisodeCard:
    id: UUID
    day: dt.date
    question: str
    host: str
    callers: int
    ai_callers: int
    # Whether one of the learner's own calls is in it.
    mine: bool
    airs_at: dt.datetime


@dataclass(frozen=True)
class CallView:
    id: UUID
    episode_id: UUID
    day: dt.date
    question: str
    status: CallStatus
    transcript: str
    reasons: tuple[str, ...]
    veiled: bool
    corrections: tuple[Correction, ...]
    aired_at: dt.datetime | None
    created_at: dt.datetime
    # Whether the learner can still play it back.
    playable: bool


@dataclass(frozen=True)
class NextShow:
    episode_id: UUID
    day: dt.date
    airs_at: dt.datetime
    question: str
    # The question in the interface language, for help.
    question_help: str
    my_call: CallView | None


@dataclass(frozen=True)
class Overview:
    available: bool
    profile: Profile | None
    language: str | None
    on_air: EpisodeCard | None
    # A first show for the language is being made right now.
    warming_up: bool
    next_show: NextShow | None
    # The learner's call aired in a show of the last two days (a card on Today).
    aired: EpisodeCard | None
    calls: tuple[CallView, ...]


@dataclass(frozen=True)
class SegmentView:
    index: int
    kind: SegmentKind
    speaker: str
    ai: bool
    text: str
    playable: bool
    mine: bool
    applause: Mapping[str, int]
    my_applause: str | None
    hidden: bool


@dataclass(frozen=True)
class EpisodeView:
    id: UUID
    day: dt.date
    language: str
    question: str
    question_help: str
    host: str
    segments: tuple[SegmentView, ...]
    airs_at: dt.datetime


@dataclass(frozen=True)
class Retried:
    heard: str
    right: bool
    original: str
    corrected: str


@dataclass(frozen=True)
class QueueItem:
    kind: Literal["held", "report"]
    id: UUID
    episode_id: UUID
    # The call's or segment's words.
    transcript: str
    reasons: tuple[str, ...]
    # The caller's codename, or the AI caller's or host's name.
    speaker: str
    ai: bool
    reporter: str | None
    note: str | None
    band: Band
    day: dt.date
    created_at: dt.datetime


# --- Rules that need no storage ------------------------------------------------------------------


def air_time(day: dt.date) -> dt.datetime:
    return dt.datetime(day.year, day.month, day.day, AIR_HOUR, tzinfo=dt.UTC)


def next_show_day(now: dt.datetime) -> dt.date:
    """The day of the show that takes calls now: today's until it airs, then tomorrow's."""
    today = now.astimezone(dt.UTC).date()
    return today if now < air_time(today) else today + dt.timedelta(days=1)


def is_due(episode: Episode, now: dt.datetime) -> bool:
    return now >= episode.airs_at


def fallback_script(language: str, question: str, names: Sequence[str]) -> Script:
    """The host's own words when no model writes them."""
    after = _AFTER.get(language, _AFTER["en"])
    return Script(
        intro=_INTRO.get(language, _INTRO["en"]).format(host=HOST_NAME, question=question),
        after=tuple(after[n % len(after)].format(name=name) for n, name in enumerate(names)),
        outro=_OUTRO.get(language, _OUTRO["en"]),
    )


def ai_caller_name(language: str, number: int) -> str:
    names = AI_CALLERS.get(language, AI_CALLERS["en"])
    return names[number % len(names)]


# --- The service ---------------------------------------------------------------------------------


@dataclass
class _Built:
    segments: list[Segment] = field(default_factory=list)


@dataclass(frozen=True)
class _Caller:
    name: str
    text: str
    # None: an AI caller.
    call: Call | None
    voice: str = AI_VOICES[0]


class RadioService:
    def __init__(
        self,
        *,
        profiles: ProfileService,
        accounts: AccountDirectory,
        repository: RadioRepository,
        listener: Listener,
        brain: Brain,
        files: FileStore,
        starter: RadioStarter,
        enabled: bool,
        allowed: Callable[[UUID], bool],
        owners: frozenset[UUID],
        clock: Callable[[], dt.datetime],
        save_card: Callable[[UUID, str, str, str], object] | None = None,
        affordable: Callable[[], bool] = lambda: True,
        announce: Callable[[UUID, UUID, str], None] = lambda *_: None,
        new_id: Callable[[], UUID] = uuid4,
        rng: random.Random | None = None,
    ) -> None:
        """`enabled` turns the show on (`KONVAMI_RADIO`); `allowed` says who may listen and call
        while it is in the testers' hands. `save_card` makes a card of a phrase (learner,
        phrase, meaning, explanation language). `affordable` false: past the month's spend
        target, the show is put together without a model (the host's own words). `announce`
        tells a learner by push that their call aired ("aired", with the episode's id) or was
        held ("held", with the call's id)."""
        self._profiles = profiles
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
        self._save_card = save_card
        self._affordable = affordable
        self._announce = announce
        self._new_id = new_id
        self._rng = rng or random.Random()  # noqa: S311 - codenames, not secrets

    # --- Who may take part

    def available(self, user_id: UUID) -> bool:
        return self._enabled and self._allowed(user_id)

    def _band(self, user_id: UUID) -> Band:
        try:
            return band_of(self._accounts.get(user_id).age_bracket)
        except AccountNotFound:
            return "minor"

    def _interface(self, user_id: UUID) -> str:
        try:
            return self._accounts.get(user_id).language
        except AccountNotFound:
            return "en"

    def _target(self, user_id: UUID) -> str | None:
        language = self._profiles.get(user_id).target_language or ""
        return language if language in LANGUAGES else None

    def _explanation(self, user_id: UUID, target: str) -> str:
        profile = self._profiles.get(user_id)
        return profile.value(target, "explanation_language") or self._interface(user_id)

    def _listening(self, user_id: UUID) -> None:
        if not self.available(user_id):
            raise RadioError("unavailable")

    def _require(self, user_id: UUID) -> Profile:
        self._listening(user_id)
        profile = self._repository.profile(user_id)
        if profile is None:
            raise RadioError("not_joined")
        if profile.suspended:
            raise RadioError("suspended")
        return profile

    # --- Joining and settings (8.6)

    def join(self, user_id: UUID, *, veil_default: bool, voice_consent: bool) -> Profile:
        """Joins the show, or changes the answers of one who joined. An adult must agree that
        other learners hear their calls (`consent_required`); a minor's calls are never aired, so
        nothing is asked of them."""
        self._listening(user_id)
        band = self._band(user_id)
        if band == "adult" and not voice_consent:
            raise RadioError("consent_required")
        current = self._repository.profile(user_id)
        now = self._clock()
        agreed = band == "adult"
        profile = Profile(
            user_id=user_id,
            codename=current.codename if current else make_codename(self._rng),
            band=band,
            veil_default=veil_default,
            consent_version=VOICE_CONSENT_VERSION if agreed else 0,
            consent_at=(current.consent_at if current and current.consent_at else now)
            if agreed
            else None,
            strikes=current.strikes if current else 0,
            suspended=current.suspended if current else False,
        )
        self._repository.save_profile(profile)
        return profile

    def change(self, user_id: UUID, *, veil_default: bool | None = None) -> Profile:
        profile = self._require(user_id)
        changed = replace(
            profile, veil_default=profile.veil_default if veil_default is None else veil_default
        )
        self._repository.save_profile(changed)
        return changed

    def reroll(self, user_id: UUID) -> Profile:
        profile = self._require(user_id)
        changed = replace(profile, codename=make_codename(self._rng))
        self._repository.save_profile(changed)
        return changed

    def leave(self, user_id: UUID) -> None:
        """Withdraws the voice-sharing consent and deletes the learner's radio data (8.6): their
        calls' words and sounds (taken out of the shows they aired in), their applause and their
        profile. Reports they made stay with the owner until decided."""
        for call in self._repository.calls_by(user_id):
            self._take_out(call, "removed")
        self._repository.delete_applause(user_id)
        self._repository.delete_profile(user_id)

    def _forget(self, call: Call, status: CallStatus) -> Call:
        for key in (call.audio_key, call.veil_key):
            if key:
                self._files.remove(key)
        forgotten = replace(
            call, status=status, transcript="", audio_key=None, veil_key=None, corrections=()
        )
        self._repository.save_call(forgotten)
        return forgotten

    def _take_out(self, call: Call, status: CallStatus) -> None:
        """Forgets a call and takes it out of the show it aired in."""
        aired = call.status == "aired"
        self._forget(call, status)
        if not aired:
            return
        episode = self._repository.episode(call.episode_id)
        if episode is not None:
            self._remove_segments(episode, lambda s: s.call_id == call.id)

    def _remove_segments(self, episode: Episode, which: Callable[[Segment], bool]) -> None:
        segments = tuple(
            replace(s, removed=True, text="", audio_key=None) if which(s) else s
            for s in episode.segments
        )
        self._repository.save_episode(replace(episode, segments=segments))

    # --- The hub (8.1) and the archive (8.5)

    def overview(self, user_id: UUID) -> Overview:
        available = self.available(user_id)
        language = self._target(user_id) if available else None
        if not available or language is None:
            return Overview(available, None, language, None, False, None, None, ())
        now = self._clock()
        profile = self._repository.profile(user_id)
        interface = self._interface(user_id)
        upcoming = self._open_show(language, now, user_id)
        recent = self._repository.episodes(
            language, now.date() - dt.timedelta(days=ARCHIVE_DAYS), ("ready", "building")
        )
        ready = [e for e in recent if e.status == "ready"]
        warming = not ready and any(e.status == "building" for e in recent)
        if not recent:
            warming = self._pilot(language, now, user_id)
        calls = self._repository.calls_by(user_id) if profile else []
        my_episodes = {c.episode_id for c in calls if c.status == "aired"}
        on_air = self._card(ready[0], my_episodes, language) if ready else None
        aired = next(
            (
                self._card(e, my_episodes, language)
                for e in ready
                if e.id in my_episodes and now - e.airs_at <= AIRED_NOTICE
            ),
            None,
        )
        mine_now = next((c for c in calls if c.episode_id == upcoming.id), None)
        found = prompt(upcoming.prompt_id) or prompt_for(upcoming.day)
        return Overview(
            available=True,
            profile=profile,
            language=language,
            on_air=on_air,
            warming_up=warming,
            next_show=NextShow(
                episode_id=upcoming.id,
                day=upcoming.day,
                airs_at=upcoming.airs_at,
                question=question_in(found, language),
                question_help=question_in(found, interface),
                my_call=self._call_view(mine_now, language) if mine_now else None,
            ),
            aired=aired,
            calls=tuple(self._call_view(c, language) for c in calls[:10]),
        )

    def _open_show(self, language: str, now: dt.datetime, user_id: UUID) -> Episode:
        day = next_show_day(now)
        found = self._repository.episode_on(language, day)
        if found is not None:
            return found
        return self._repository.add_episode(
            Episode(
                id=self._new_id(),
                language=language,
                day=day,
                prompt_id=prompt_for(day).id,
                status="open",
                created_at=now,
                opened_by=user_id,
                delete_after=air_time(day) + KEEP_FOR,
            )
        )

    def _pilot(self, language: str, now: dt.datetime, user_id: UUID) -> bool:
        """The first time anyone opens the show in a language, the day before's show is made at
        once (AI callers only), so there is something to hear. Whether it is being made."""
        day = next_show_day(now) - dt.timedelta(days=1)
        found = self._repository.episode_on(language, day)
        if found is None:
            found = self._repository.add_episode(
                Episode(
                    id=self._new_id(),
                    language=language,
                    day=day,
                    prompt_id=prompt_for(day).id,
                    status="building",
                    created_at=now,
                    opened_by=user_id,
                    delete_after=air_time(day) + KEEP_FOR,
                )
            )
            self._start("build", found.id)
        return found.status in ("building", "open")

    def _card(self, episode: Episode, mine: set[UUID], language: str) -> EpisodeCard:
        found = prompt(episode.prompt_id) or prompt_for(episode.day)
        live = [s for s in episode.segments if not s.removed]
        return EpisodeCard(
            id=episode.id,
            day=episode.day,
            question=question_in(found, language),
            host=HOST_NAME,
            callers=sum(1 for s in live if s.kind == "call"),
            ai_callers=sum(1 for s in live if s.kind == "ai_call"),
            mine=episode.id in mine,
            airs_at=episode.airs_at,
        )

    def archive(self, user_id: UUID) -> list[EpisodeCard]:
        self._listening(user_id)
        language = self._target(user_id)
        if language is None:
            return []
        since = self._clock().date() - dt.timedelta(days=ARCHIVE_DAYS)
        mine = {c.episode_id for c in self._repository.calls_by(user_id) if c.status == "aired"}
        return [
            self._card(e, mine, language)
            for e in self._repository.episodes(language, since, ("ready",))
        ]

    # --- Listening (8.2)

    def _episode(self, user_id: UUID, episode_id: UUID) -> Episode:
        self._listening(user_id)
        episode = self._repository.episode(episode_id)
        if episode is None or episode.status != "ready":
            raise RadioError("not_found")
        return episode

    def episode(self, user_id: UUID, episode_id: UUID) -> EpisodeView:
        episode = self._episode(user_id, episode_id)
        found = prompt(episode.prompt_id) or prompt_for(episode.day)
        counts = self._repository.applause(episode.id)
        mine = self._repository.applause_of(user_id, episode.id)
        hidden = self._repository.reported(user_id, episode.id)
        my_calls = {c.id for c in self._repository.calls_by(user_id)}
        segments = tuple(
            SegmentView(
                index=s.index,
                kind=s.kind,
                speaker=s.speaker,
                ai=s.ai,
                text="" if s.index in hidden else s.text,
                playable=bool(s.audio_key) and s.index not in hidden,
                mine=s.call_id in my_calls,
                applause={card: counts.get((s.index, card), 0) for card in APPLAUSE},
                my_applause=mine.get(s.index),
                hidden=s.index in hidden,
            )
            for s in episode.segments
            if not s.removed
        )
        return EpisodeView(
            id=episode.id,
            day=episode.day,
            language=episode.language,
            question=question_in(found, episode.language),
            question_help=question_in(found, self._interface(user_id)),
            host=HOST_NAME,
            segments=segments,
            airs_at=episode.airs_at,
        )

    def _segment(self, episode: Episode, index: int) -> Segment:
        found = next((s for s in episode.segments if s.index == index and not s.removed), None)
        if found is None:
            raise RadioError("not_found")
        return found

    def segment_address(self, user_id: UUID, episode_id: UUID, index: int) -> str:
        episode = self._episode(user_id, episode_id)
        segment = self._segment(episode, index)
        if not segment.audio_key or index in self._repository.reported(user_id, episode.id):
            raise RadioError("not_found")
        return self._files.address(segment.audio_key, ADDRESS_SECONDS)

    def applaud(self, user_id: UUID, episode_id: UUID, index: int, card: str | None) -> EpisodeView:
        """Gives a call one of the four applause cards (or takes it back). Only calls get cards:
        the host does not need them."""
        if card is not None and card not in APPLAUSE:
            raise RadioError("invalid_value")
        episode = self._episode(user_id, episode_id)
        if self._segment(episode, index).kind == "host":
            raise RadioError("invalid_value")
        self._repository.set_applause(user_id, episode.id, index, card)
        return self.episode(user_id, episode_id)

    def report(
        self, user_id: UUID, episode_id: UUID, index: int, reason: str, note: str | None
    ) -> EpisodeView:
        """Reports a segment heard on the show: it is hidden from the learner at once and goes
        to the owner's queue."""
        if reason not in REPORT_REASONS:
            raise RadioError("invalid_value")
        episode = self._episode(user_id, episode_id)
        self._segment(episode, index)
        if index not in self._repository.reported(user_id, episode.id):
            self._repository.add_report(
                Report(
                    id=self._new_id(),
                    reporter=user_id,
                    episode_id=episode.id,
                    segment=index,
                    reason=reason,
                    note=(" ".join(note.split())[:REPORT_NOTE_MAX] or None) if note else None,
                    status="open",
                    created_at=self._clock(),
                )
            )
        return self.episode(user_id, episode_id)

    # --- Calling in (8.3) and one's own call (8.4)

    def call(
        self,
        user_id: UUID,
        audio: bytes,
        audio_format: str,
        seconds: float | None,
        veiled: bool | None = None,
    ) -> Call:
        """A call to the next show: written down word for word at once, then checked by the
        worker before anyone else hears it. A new call to the same show replaces the earlier
        one, unless that one already aired."""
        profile = self._require(user_id)
        language = self._target(user_id)
        if language is None:
            raise RadioError("no_language")
        if seconds is not None and seconds > CALL_SECONDS + 1:
            raise RadioError("too_long")
        try:
            self._listener.ready(user_id, audio, audio_format)
        except SpokenError as error:
            raise RadioError(error.code) from error
        now = self._clock()
        if self._repository.calls_since(user_id, now - dt.timedelta(days=1)) >= CALLS_PER_DAY:
            raise RadioError("limit")
        show = self._open_show(language, now, user_id)
        if show.status != "open":
            raise RadioError("closed")
        try:
            said = self._listener.hear(
                user_id, language, audio, audio_format, seconds, Feature.RADIO_LISTEN
            )
        except SpokenError as error:
            raise RadioError(error.code) from error
        if len(words_in(said)) < MIN_WORDS:
            raise RadioError("too_short")
        for earlier in self._repository.calls_of(show.id):
            if earlier.user_id == user_id and earlier.status not in ("removed", "aired"):
                self._forget(earlier, "removed")
        call_id = self._new_id()
        key = f"{FOLDER}/{user_id}/{show.id}/{call_id}.{audio_format}"
        self._files.save(key, audio, _AUDIO_TYPES.get(audio_format, "application/octet-stream"))
        call = Call(
            id=call_id,
            episode_id=show.id,
            user_id=user_id,
            status="checking",
            transcript=said,
            created_at=now,
            audio_key=key,
            veiled=profile.veil_default if veiled is None else veiled,
            broadcast=profile.on_air,
            delete_after=show.airs_at + KEEP_FOR,
        )
        self._repository.save_call(call)
        self._start("check", call.id)
        return call

    def _mine(self, user_id: UUID, call_id: UUID) -> Call:
        self._listening(user_id)
        call = self._repository.call(call_id)
        if call is None or call.user_id != user_id:
            raise RadioError("not_found")
        return call

    def _call_view(self, call: Call, language: str) -> CallView:
        episode = self._repository.episode(call.episode_id)
        day = episode.day if episode else call.created_at.date()
        found = (prompt(episode.prompt_id) if episode else None) or prompt_for(day)
        return CallView(
            id=call.id,
            episode_id=call.episode_id,
            day=day,
            question=question_in(found, language),
            status=call.status,
            transcript=call.transcript,
            reasons=call.reasons,
            veiled=call.veiled,
            corrections=call.corrections,
            aired_at=call.aired_at,
            created_at=call.created_at,
            playable=bool(call.audio_key),
        )

    def my_call(self, user_id: UUID, call_id: UUID) -> CallView:
        call = self._mine(user_id, call_id)
        episode = self._repository.episode(call.episode_id)
        return self._call_view(call, episode.language if episode else "en")

    def call_address(self, user_id: UUID, call_id: UUID) -> str:
        call = self._mine(user_id, call_id)
        if not call.audio_key:
            raise RadioError("not_found")
        return self._files.address(call.audio_key, ADDRESS_SECONDS)

    def withdraw_call(self, user_id: UUID, call_id: UUID) -> None:
        """Takes one of the learner's calls back, also out of a show it aired in."""
        call = self._mine(user_id, call_id)
        if call.status != "removed":
            self._take_out(call, "removed")

    def _correction(self, user_id: UUID, call_id: UUID, index: int) -> tuple[Call, Correction]:
        call = self._mine(user_id, call_id)
        if not 0 <= index < len(call.corrections):
            raise RadioError("not_found")
        return call, call.corrections[index]

    def say_better(
        self,
        user_id: UUID,
        call_id: UUID,
        index: int,
        audio: bytes,
        audio_format: str,
        seconds: float | None,
    ) -> Retried:
        """One try at a confirmed correction of the learner's call: right when the corrected
        words are heard and the wrong ones are not. The try is not kept."""
        call, correction = self._correction(user_id, call_id, index)
        if not correction.certain:
            raise RadioError("unsure")
        episode = self._repository.episode(call.episode_id)
        language = episode.language if episode else (self._target(user_id) or "en")
        try:
            self._listener.ready(user_id, audio, audio_format)
            if not self._repository.note_retry(user_id, self._clock().date(), RETRIES_PER_DAY):
                raise RadioError("limit")
            heard = self._listener.hear(
                user_id, language, audio, audio_format, seconds, Feature.RADIO_LISTEN
            )
        except SpokenError as error:
            raise RadioError(error.code) from error
        return Retried(
            heard,
            is_right(heard, correction.original, correction.corrected),
            correction.original,
            correction.corrected,
        )

    def save_card(self, user_id: UUID, call_id: UUID, index: int) -> object:
        """Makes a card of a confirmed correction: the corrected words, and why."""
        call, correction = self._correction(user_id, call_id, index)
        if not correction.certain:
            raise RadioError("unsure")
        if self._save_card is None:
            raise RadioError("unavailable")
        episode = self._repository.episode(call.episode_id)
        language = episode.language if episode else "en"
        return self._save_card(
            user_id,
            correction.corrected,
            correction.explanation,
            self._explanation(user_id, language),
        )

    # --- The owner (6.15)

    def is_owner(self, user_id: UUID) -> bool:
        return user_id in self._owners

    def queue(self, user_id: UUID) -> list[QueueItem]:
        if not self.is_owner(user_id):
            raise RadioError("not_owner")
        items: list[QueueItem] = []
        for call in self._repository.held(QUEUE_LIMIT):
            sender = self._repository.profile(call.user_id) if call.user_id else None
            episode = self._repository.episode(call.episode_id)
            items.append(
                QueueItem(
                    kind="held",
                    id=call.id,
                    episode_id=call.episode_id,
                    transcript=call.transcript,
                    reasons=call.reasons,
                    speaker=sender.codename if sender else "",
                    ai=False,
                    reporter=None,
                    note=None,
                    band=sender.band if sender else "minor",
                    day=episode.day if episode else call.created_at.date(),
                    created_at=call.created_at,
                )
            )
        for report in self._repository.open_reports(QUEUE_LIMIT):
            episode = self._repository.episode(report.episode_id)
            segment = (
                next((s for s in episode.segments if s.index == report.segment), None)
                if episode
                else None
            )
            if episode is None or segment is None:
                continue
            said = self._repository.call(segment.call_id) if segment.call_id else None
            sender = self._repository.profile(said.user_id) if said and said.user_id else None
            reporter = self._repository.profile(report.reporter)
            items.append(
                QueueItem(
                    kind="report",
                    id=report.id,
                    episode_id=episode.id,
                    transcript=segment.text,
                    reasons=(report.reason,),
                    speaker=segment.speaker,
                    ai=segment.ai,
                    reporter=reporter.codename if reporter else "",
                    note=report.note,
                    band=sender.band if sender else "adult",
                    day=episode.day,
                    created_at=report.created_at,
                )
            )
        return sorted(items, key=lambda item: item.created_at, reverse=True)

    def decide(self, user_id: UUID, kind: str, item_id: UUID, action: str) -> None:
        """The owner removes what was held or reported (a strike for a learner who said it;
        three suspend calling in) or dismisses the item. A held call is never aired later."""
        if not self.is_owner(user_id):
            raise RadioError("not_owner")
        if action not in ("remove", "dismiss"):
            raise RadioError("invalid_value")
        if kind == "held":
            call = self._repository.call(item_id)
            if call is None or call.status != "held":
                raise RadioError("not_found")
            self._forget(call, "removed")
            if action == "remove" and call.user_id is not None:
                self._strike(call.user_id)
            return
        if kind != "report":
            raise RadioError("invalid_value")
        report = self._repository.report(item_id)
        if report is None:
            raise RadioError("not_found")
        self._repository.save_report(
            replace(
                report,
                status="removed" if action == "remove" else "dismissed",
                resolved_at=self._clock(),
            )
        )
        if action != "remove":
            return
        episode = self._repository.episode(report.episode_id)
        segment = (
            next((s for s in episode.segments if s.index == report.segment), None)
            if episode
            else None
        )
        if episode is None or segment is None:
            return
        call = self._repository.call(segment.call_id) if segment.call_id else None
        if call is not None:
            self._take_out(call, "removed")
            if call.user_id is not None:
                self._strike(call.user_id)
        else:
            self._remove_segments(episode, lambda s: s.index == report.segment)

    def pull(self, user_id: UUID, episode_id: UUID) -> None:
        """Takes a whole episode off air."""
        if not self.is_owner(user_id):
            raise RadioError("not_owner")
        episode = self._repository.episode(episode_id)
        if episode is None:
            raise RadioError("not_found")
        self._repository.save_episode(replace(episode, status="pulled"))

    def _strike(self, user_id: UUID) -> None:
        profile = self._repository.profile(user_id)
        if profile is None:
            return
        strikes = profile.strikes + 1
        self._repository.save_profile(
            replace(profile, strikes=strikes, suspended=strikes >= STRIKES_TO_SUSPEND)
        )

    # --- The worker

    def check(self, call_id: UUID) -> None:
        """Checks a call (`radio_check.py` does the checking): held, or ready for the show, or
        private practice (a minor's, or one whose show has gone out already). Fails closed."""
        call = self._repository.call(call_id)
        if call is None or call.status != "checking" or call.user_id is None:
            return
        episode = self._repository.episode(call.episode_id)
        if episode is None:
            return
        attempt = replace(call, attempts=call.attempts + 1)
        self._repository.save_call(attempt)
        sender = self._repository.profile(call.user_id)
        band = sender.band if sender else self._band(call.user_id)
        found = prompt(episode.prompt_id) or prompt_for(episode.day)
        labels = self._brain.check(
            attempt, band, episode.language, question_in(found, episode.language)
        )
        if labels is None:
            self._unchecked(attempt)
            return
        if labels:
            self._repository.save_call(replace(attempt, status="held", reasons=labels))
            self._announce(call.user_id, call.id, "held")
            return
        airable = attempt.broadcast and episode.status == "open"
        veil_key = None
        if airable and attempt.veiled:
            veil_key = self._brain.veil(attempt)
            if veil_key is None:
                self._unchecked(attempt)
                return
        status: CallStatus = (
            "ready" if airable else ("not_picked" if attempt.broadcast else "private")
        )
        checked = replace(attempt, status=status, veil_key=veil_key)
        self._repository.save_call(checked)
        explanation = self._explanation(call.user_id, episode.language)
        corrections = self._brain.correct(checked, episode.language, explanation)
        if corrections:
            self._repository.save_call(replace(checked, corrections=corrections))

    def _unchecked(self, call: Call) -> None:
        if call.attempts >= CHECK_ATTEMPTS:
            self._repository.save_call(replace(call, status="failed", reasons=("unavailable",)))
            if call.user_id is not None:
                self._announce(call.user_id, call.id, "held")

    def build(self, episode_id: UUID) -> None:
        """Puts a show together once its hour has come: the host screens the calls that passed,
        picks a few, AI callers fill the rest, and every line is spoken."""
        episode = self._repository.episode(episode_id)
        now = self._clock()
        if episode is None or episode.status not in ("open", "building", "failed"):
            return
        if episode.status == "open" and not is_due(episode, now):
            return
        if episode.attempts >= BUILD_ATTEMPTS:
            self._repository.save_episode(replace(episode, status="failed"))
            return
        building = replace(episode, status="building", attempts=episode.attempts + 1, built_at=now)
        self._repository.save_episode(building)
        try:
            ready = self._put_together(building)
        except Exception:
            self._repository.save_episode(replace(building, status="failed"))
            raise
        self._repository.save_episode(ready)

    def _put_together(self, episode: Episode) -> Episode:
        language, payer = episode.language, episode.opened_by
        found = prompt(episode.prompt_id) or prompt_for(episode.day)
        question = question_in(found, language)
        models = self._affordable()
        waiting = [c for c in self._repository.calls_of(episode.id) if c.status == "ready"]
        eligible = [c for c in waiting if self._may_air(c)]
        picked = self._pick(question, language, eligible, payer if models else None, models)
        now = self._clock()
        for call in waiting:
            if call not in picked:
                self._repository.save_call(replace(call, status="not_picked"))
        callers: list[_Caller] = []
        for call in picked:
            sender = self._repository.profile(call.user_id) if call.user_id else None
            callers.append(_Caller(sender.codename if sender else "?", call.transcript, call))
        for number in range(max(0, MIN_CALLERS - len(picked))):
            name = ai_caller_name(language, number)
            written = (
                self._brain.ai_call(question, language, name, payer) if models and payer else None
            )
            text = written or found.calls[number % len(found.calls)].get(language, "")
            if text:
                callers.append(_Caller(name, text, None, AI_VOICES[number % len(AI_VOICES)]))
        self._rng.shuffle(callers)
        script = (
            self._brain.script(
                question, language, [(c.name, c.call is None, c.text) for c in callers], payer
            )
            if models and payer
            else None
        )
        if script is None or len(script.after) != len(callers):
            script = fallback_script(language, question, [c.name for c in callers])
        folder = f"{FOLDER}/shows/{episode.id}"
        built = _Built()

        def host(text: str) -> None:
            index = len(built.segments)
            key = self._brain.speak(payer, HOST_VOICE, text, f"{folder}/{index}.mp3")
            built.segments.append(Segment(index, "host", HOST_NAME, True, text, key))

        host(script.intro)
        for caller, after in zip(callers, script.after, strict=True):
            index, sent = len(built.segments), caller.call
            if sent is None:
                key = self._brain.speak(payer, caller.voice, caller.text, f"{folder}/{index}.mp3")
                built.segments.append(
                    Segment(index, "ai_call", caller.name, True, caller.text, key)
                )
            else:
                key = sent.veil_key if sent.veiled else sent.audio_key
                built.segments.append(
                    Segment(index, "call", caller.name, False, caller.text, key, call_id=sent.id)
                )
                self._repository.save_call(replace(sent, status="aired", aired_at=now))
                if sent.user_id is not None:
                    self._announce(sent.user_id, episode.id, "aired")
            host(after)
        host(script.outro)
        return replace(episode, status="ready", segments=tuple(built.segments), built_at=now)

    def _may_air(self, call: Call) -> bool:
        if not call.broadcast or call.user_id is None:
            return False
        sender = self._repository.profile(call.user_id)
        if sender is None or sender.suspended or not sender.on_air:
            return False
        return bool(call.veil_key if call.veiled else call.audio_key)

    def _pick(
        self, question: str, language: str, calls: list[Call], payer: UUID | None, models: bool
    ) -> list[Call]:
        if not calls:
            return []
        chosen = (
            self._brain.screen(question, language, calls, PICKS, payer)
            if models and payer
            else None
        )
        if chosen is None:
            return calls[:PICKS]
        by_id = {c.id: c for c in calls}
        picked: list[Call] = []
        for call_id in chosen:
            call = by_id.pop(call_id, None)
            if call is not None and len(picked) < PICKS:
                picked.append(call)
        return picked

    def tick(self) -> None:
        """Once an hour: calls lost with their worker are checked again (or fail), shows whose
        hour has come are built (or built again), and words and sounds past their 30 days are
        deleted."""
        now = self._clock()
        for call in self._repository.stale_checks(now - CHECK_STALE, TICK_SCAN):
            if call.attempts >= CHECK_ATTEMPTS:
                self._unchecked(call)
            else:
                self._start("check", call.id)
        for episode in self._repository.episodes_in(("open", "building", "failed"), TICK_SCAN):
            if episode.attempts >= BUILD_ATTEMPTS:
                continue
            stale = episode.built_at is None or now - episode.built_at >= BUILD_STALE
            if (episode.status == "open" and is_due(episode, now)) or (
                episode.status != "open" and stale
            ):
                self._start("build", episode.id)
        for call in self._repository.expired_calls(now, TICK_SCAN):
            self._forget(call, call.status)
        for episode in self._repository.expired_episodes(now, TICK_SCAN):
            for segment in episode.segments:
                if segment.audio_key and segment.kind != "call":
                    self._files.remove(segment.audio_key)
            self._repository.save_episode(replace(episode, status="expired", segments=()))

    def _start(self, job: str, item_id: UUID) -> None:
        try:
            self._starter.start(job, item_id)
        except Exception:  # the hourly tick starts it again
            return


__all__ = [
    "AIR_HOUR",
    "APPLAUSE",
    "CALL_SECONDS",
    "Call",
    "CallView",
    "Episode",
    "EpisodeCard",
    "EpisodeView",
    "NextShow",
    "Overview",
    "Profile",
    "Prompt",
    "QueueItem",
    "RadioError",
    "RadioService",
    "Report",
    "Retried",
    "Script",
    "Segment",
    "SegmentView",
    "air_time",
    "fallback_script",
    "next_show_day",
]
