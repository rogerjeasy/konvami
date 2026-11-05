"""Voice-note pen-pal mode (spec §6.16, §12.5): a partner who writes to the learner like a friend
on a messaging app, in a thread per partner.

A partner sends a voice note now and then of its own accord (about its day, a question about
something the learner told it, a small challenge), within the frequency and quiet hours the
learner chose. The learner answers when it suits them, with a voice note. It is written down
word for word (the verbatim pass, spec §9.4) and the partner answers with a reply of its own and
a gentle correction. Nothing is live: a note has no time limit and nobody waits for the answer.

The corrections follow the rule of the Session Report (spec §16.1): a model proposes them, an
independent second pass checks each one, what it calls wrong is dropped, and what it cannot
confirm is shown as a possibility and never spoken as a fact. A note's text is written by the
small text model and spoken in the partner's voice; both are kept, so every note can be played
and read again.
"""

import datetime as dt
import json
import logging
from collections.abc import Callable, Sequence
from dataclasses import dataclass, replace
from typing import Any, Literal, Protocol
from uuid import UUID, uuid4
from zoneinfo import ZoneInfo

from pydantic import BaseModel, ConfigDict, ValidationError

from konvami_api.domain.accounts import AccountDirectory, AccountNotFound
from konvami_api.domain.conversations import ConversationService, zone_of
from konvami_api.domain.costs import Charge, Feature
from konvami_api.domain.memories import MEMORY_NOTES_SCHEMA, MemoryService
from konvami_api.domain.personas import Persona, PersonaService
from konvami_api.domain.profile import ProfileService
from konvami_api.domain.reports import (
    REVIEW_SCHEMA,
    Review,
    reviewer_instructions,
    within,
    words_in,
)
from konvami_api.domain.speech import SpeechError, SpeechModel, SpeechTask
from konvami_api.domain.spoken import Listener, SpokenError
from konvami_api.domain.storage import FileStore
from konvami_api.domain.text import (
    TextModel,
    TextModelError,
    TextTask,
    answer_list,
    answer_object,
    familiar_address,
)

logger = logging.getLogger(__name__)

Sender = Literal["partner", "learner"]
# `pending`: a note or an answer on its way (the worker is writing it). A learner's own note is
# always `ready`.
Status = Literal["pending", "ready", "failed"]

# How many notes a learner may ask for a week at most, whatever frequency they chose, so that an
# eager one cannot spend more than the setting allows.
MAX_PER_WEEK = 7
# What the learner may set.
DEFAULT_PER_WEEK = 3
DEFAULT_QUIET_FROM = 21
DEFAULT_QUIET_TO = 8
# A note is sent after at least this share of the time a note a week-share stands for, so that
# "three a week" is spread over the week and not three in a row.
GAP_SHARE = 0.75
# A partner does not pile up notes: with this many waiting for an answer it keeps quiet.
MAX_UNANSWERED = 2
# The notes a learner may ask a partner for in a day, outside the schedule ("Send me a note").
MAX_ASKED_PER_DAY = 2
# The voice notes a learner may send in a day: each is a transcription, two requests to a paid
# model and a sound.
MAX_REPLIES_PER_DAY = 30
# The fewest words a voice note must have to be answered; less is a cough or a mis-tap.
MIN_WORDS = 3
# A note or an answer pending longer than this was lost with its worker and may be asked for
# again, at most `MAX_ATTEMPTS` times in all (every attempt is paid requests).
PENDING_FOR = dt.timedelta(minutes=5)
MAX_ATTEMPTS = 3
# The notes of a thread the app shows, the newest.
THREAD_NOTES = 50
# The notes of a thread a model is shown for context.
CONTEXT_NOTES = 6
# The most characters of a note's text (about a minute of speech).
TEXT_MAX = 900
EXPLANATION_MAX = 400
QUOTE_MAX = 300
MAX_CORRECTIONS = 3
# Of the corrections the second check confirmed, the partner speaks this many.
MAX_SPOKEN_CORRECTIONS = 2
# How many learners one run of the schedule looks at: plenty for the testers.
SCAN = 1000
# How long the app may play a note through one address.
ADDRESS_SECONDS = 15 * 60
SOUND_TYPE = "audio/mpeg"
# Hooks a note can have, as the text model names them.
Hook = Literal["follow_up", "own_day", "challenge"]

_AUDIO_TYPES = {
    "m4a": "audio/mp4",
    "webm": "audio/webm",
    "wav": "audio/wav",
    "mp3": "audio/mpeg",
}


@dataclass(frozen=True)
class Settings:
    """What the learner chose for their partners' unprompted notes (spec §6.16: frequency and
    quiet hours are configurable)."""

    # Off until the learner turns it on: a partner writing first is something to agree to.
    enabled: bool = False
    per_week: int = DEFAULT_PER_WEEK
    # The hours of the day, 0 to 23 on the learner's clock, between which no note is sent. From
    # equal to to: no quiet hours.
    quiet_from: int = DEFAULT_QUIET_FROM
    quiet_to: int = DEFAULT_QUIET_TO
    # The learner's time zone, as the phone reports it.
    timezone: str = "UTC"


@dataclass(frozen=True)
class Correction:
    # The learner's words, and the same words put right.
    original: str
    corrected: str
    # Why, in the learner's explanation language.
    explanation: str
    category: str
    # False when the second check could not confirm it: shown as a possibility, never spoken.
    certain: bool


@dataclass(frozen=True)
class Note:
    id: UUID
    user_id: UUID
    persona_id: UUID
    sender: Sender
    status: Status
    # A partner's note: what it says, as written. A learner's: what they said, word for word.
    text: str
    created_at: dt.datetime
    # The learner's note a partner's answer is to; None for a note written on its own.
    reply_to: UUID | None = None
    # Where the sound is kept; None when there is none (a learner's note when recordings are
    # not kept, or an answer whose sound could not be made).
    audio_key: str | None = None
    corrections: tuple[Correction, ...] = ()
    # How often the writing was started, and when it was last taken up (for a pending note).
    attempts: int = 0
    claimed_at: dt.datetime | None = None
    # Whether the learner has opened the thread since a partner's note arrived.
    read: bool = False


@dataclass(frozen=True)
class Heard:
    """A note as the learner sees it: with an address to play it, when it has a sound."""

    note: Note
    audio_url: str | None


@dataclass(frozen=True)
class Thread:
    persona_id: UUID
    notes: tuple[Heard, ...]
    # The partner's notes the learner has not opened.
    unread: int


@dataclass(frozen=True)
class ThreadSummary:
    persona_id: UUID
    # The newest note of the thread; None before the first.
    last: Note | None
    unread: int


@dataclass(frozen=True)
class Overview:
    settings: Settings
    threads: tuple[ThreadSummary, ...]


class PenPalError(Exception):
    """`not_found`, `invalid_value`, `too_short`, `consent_required`, `unavailable`, `limit` or
    `retry_limit`."""

    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


class PenPalRepository(Protocol):
    def settings(self, user_id: UUID) -> Settings | None: ...

    def save_settings(self, user_id: UUID, settings: Settings, at: dt.datetime) -> None: ...

    def enabled(self, limit: int) -> list[tuple[UUID, Settings]]:
        """The learners whose partners write on their own, up to `limit`."""

    def add(self, note: Note) -> None: ...

    def get(self, note_id: UUID) -> Note | None:
        """Any note: the worker is given only the id."""

    def thread(self, user_id: UUID, persona_id: UUID, limit: int) -> list[Note]:
        """The newest `limit` notes of a thread, oldest first."""

    def last_of(self, user_id: UUID, persona_id: UUID | None) -> Note | None:
        """The newest note of a thread, or (without a partner) of any."""

    def partner_notes_since(self, user_id: UUID, since: dt.datetime) -> int:
        """The partners' notes written on their own, not counting answers, since `since`."""

    def learner_notes_since(self, user_id: UUID, since: dt.datetime) -> int: ...

    def unanswered(self, user_id: UUID, persona_id: UUID) -> int:
        """The partner's notes, not counting answers, after the learner's last note."""

    def unread(self, user_id: UUID) -> dict[UUID, int]:
        """Per partner, the notes the learner has not opened."""

    def mark_read(self, user_id: UUID, persona_id: UUID) -> None: ...

    def claim(
        self, note_id: UUID, at: dt.datetime, stale_before: dt.datetime, max_attempts: int
    ) -> bool:
        """The worker takes a pending note to write it. Only one worker is ever told True for
        it, until `stale_before` has passed, and not after `max_attempts` attempts."""

    def reopen(self, note_id: UUID, stale_before: dt.datetime, max_attempts: int) -> bool:
        """A note that failed (or was lost) may be written again: pending, and nobody's yet."""

    def finish(
        self,
        note_id: UUID,
        status: Status,
        text: str,
        audio_key: str | None,
        corrections: Sequence[Correction],
    ) -> None: ...


class PenPalStarter(Protocol):
    def start(self, note_id: UUID) -> None:
        """Has the worker write a pending note, apart from the request."""


# --- What the models answer ----------------------------------------------------------------------


class _Answer(BaseModel):
    model_config = ConfigDict(extra="forbid")


class _Written(_Answer):
    text: str
    hook: Hook


class _Found(_Answer):
    original: str
    corrected: str
    # One short friendly sentence in the language being learned that says the right way.
    spoken: str
    explanation: str
    category: str


class _Replied(_Answer):
    reply: str
    correction_lead: str
    corrections: list[_Found]
    memories: list[dict[str, Any]]


_NOTE_SCHEMA = answer_object(
    {
        "text": {"type": "string"},
        "hook": {"type": "string", "enum": ["follow_up", "own_day", "challenge"]},
    }
)


def _reply_schema(categories: Sequence[str]) -> dict[str, Any]:
    return answer_object(
        {
            "reply": {"type": "string"},
            "correction_lead": {"type": "string"},
            "corrections": answer_list(
                answer_object(
                    {
                        "original": {"type": "string"},
                        "corrected": {"type": "string"},
                        "spoken": {"type": "string"},
                        "explanation": {"type": "string"},
                        "category": {"type": "string", "enum": [*categories, "other"]},
                    }
                ),
                MAX_CORRECTIONS,
            ),
            "memories": MEMORY_NOTES_SCHEMA,
        }
    )


def _persona_lines(persona: Persona) -> dict[str, Any]:
    return {
        "name": persona.name,
        "origin": persona.origin,
        "occupation": persona.occupation,
        "backstory": persona.backstory,
        "role": persona.role,
    }


_LEVEL_RULE = (
    "Write at the learner's level: short sentences and common words at A1 and A2, ordinary "
    "everyday language at B1, natural and varied at B2 and above. Plain text only: no emoji, "
    "no markdown, no stage directions. Never say or suggest that you are a human being; you "
    "are a character in a language app, and may talk about your day as that character."
)


def _note_instructions(target: str, explanation: str) -> str:
    return f"""You are a conversation partner in a language-learning app, writing a voice note to
a learner of {target} like a friend on a messaging app. You get your own details (`you`), the
learner's level, today's weekday, what you know about them (`known`: `follow_ups` are things
that happened since you last talked and are worth asking about, `coming_up` is what they have
ahead, `notes` is the rest), what they do not want to talk about (`never_about`), and your last
notes to them (`earlier`), so that you do not repeat yourself.

Write the note in {target}: 40 to 80 words, spoken aloud as written. {_LEVEL_RULE}
{familiar_address(target)} Pick one `hook`:
- `follow_up`: ask about something from `follow_ups` or `coming_up`, naturally, as a friend
  who remembers. Prefer this when there is something.
- `own_day`: tell one small, ordinary thing from your own day or life, true to your details,
  and ask them about theirs.
- `challenge`: a small thing to answer in a voice note ("Tell me about your favourite food!").
End with exactly one question or challenge. Be warm, never a reproach, never about how well
they speak. Never touch a topic in `never_about`. The learner reads {explanation}; do not use
it in the note except for a name."""


def _reply_instructions(target: str, explanation: str) -> str:
    return f"""You are a conversation partner in a language-learning app, answering a voice note
from a learner of {target}, like a friend on a messaging app. You get your own details (`you`),
the learner's level, what you know about them (`known`), what they do not want to talk about
(`never_about`), the thread so far (`thread`) and their voice note (`note`). Their note was
written down by speech recognition told to keep mistakes: it tends to tidy mistakes away and
sometimes mishears, so report only what the text shows, and leave out a slip that could as well
be a mishearing (a name, a word that sounds alike).

`reply`: your answer in {target}, 30 to 70 words, spoken aloud as written. React to what they
said first, as a friend would, then end with one question or small challenge. {_LEVEL_RULE}
{familiar_address(target)} Do not repeat their mistakes and do not correct them in the reply:
the correction comes separately.

`correction_lead`: two to four words in {target} that introduce a correction kindly, for
example "Kleine Korrektur:" for German. Said only if a correction follows.

`corrections`: the mistakes in their {target} worth their attention, the most useful first, at
most {MAX_CORRECTIONS}. None is fine, and usual when they spoke well. For each:
- `original`: their words copied exactly from `note`, only as many as the mistake needs.
- `corrected`: the same words put right, with nothing else changed.
- `spoken`: one short friendly sentence in {target} that says the right way, containing the
  corrected words exactly.
- `explanation`: one or two short sentences in {explanation} saying why, with the rule in
  plain words. {familiar_address(explanation)}
- `category`: the kind of mistake; `other` when none fits.
These are not mistakes: regional standard forms, ordinary spoken {target}, words in another
language, missing punctuation or capital letters (this was speech), and breaking off or starting
a sentence again.

`memories`: up to 3 short notes in {explanation} about the learner that a good friend would
remember, each in one sentence with the learner as its unnamed subject ("Has a job interview on
Friday"); only what the learner said in `note` about their own life, never what you said, never
how well they speak. `kind` is `fact`, `event` (with its `day` as YYYY-MM-DD worked out from
`today`, else null), `preference` or `relationship`; `importance` 3, 2 or 1; `ask`: for an
`event` after today, the one short friendly question you would send the day after it, in
{explanation}, else null. None is fine, and usual. Nothing that touches `never_about`."""


# --- Reading the models' answers -------------------------------------------------------------


def _clip(text: str, most: int) -> str:
    return " ".join(text.split())[:most].strip()


def _corrections(
    found: Sequence[_Found], said: str, categories: Sequence[str]
) -> list[tuple[_Found, Correction]]:
    """What of the model's corrections is kept: a model can quote words nobody said, and a
    correction of those must never reach the learner. The correction must change a word (speech
    has no punctuation or capitals to get wrong), and one mistake is reported once."""
    heard = words_in(said)
    kept: list[tuple[_Found, Correction]] = []
    seen: set[tuple[str, ...]] = set()
    for item in found:
        original, corrected = _clip(item.original, QUOTE_MAX), _clip(item.corrected, QUOTE_MAX)
        words = words_in(original)
        if not words or words in seen or not within(words, heard):
            continue
        if words_in(corrected) in ((), words):
            continue
        seen.add(words)
        category = item.category if item.category in categories else "other"
        kept.append(
            (
                item,
                Correction(
                    original=original,
                    corrected=corrected,
                    explanation=_clip(item.explanation, EXPLANATION_MAX),
                    category=category,
                    certain=True,
                ),
            )
        )
    return kept[:MAX_CORRECTIONS]


def _says(spoken: str, corrected: str) -> str:
    """The sentence a partner says for a correction: the model's own when it holds the corrected
    words, else just the corrected words."""
    cleaned = _clip(spoken, QUOTE_MAX)
    if words_in(cleaned) and within(words_in(corrected), words_in(cleaned)):
        return cleaned
    return corrected


# --- The service ---------------------------------------------------------------------------------


class PenPalService:
    def __init__(
        self,
        *,
        profiles: ProfileService,
        personas: PersonaService,
        conversations: ConversationService,
        memories: MemoryService,
        accounts: AccountDirectory,
        repository: PenPalRepository,
        listener: Listener,
        text_model: TextModel,
        note_model: str,
        reply_model: str,
        speech: SpeechModel,
        speech_model: str,
        files: FileStore,
        starter: PenPalStarter,
        clock: Callable[[], dt.datetime],
        announce: Callable[[UUID, UUID, bool], None] = lambda *_: None,
        new_id: Callable[[], UUID] = uuid4,
    ) -> None:
        """`announce` tells the learner, by push, that a note came (`reply` False) or that the
        partner answered (`reply` True): their id, the partner's, and which. Empty model names:
        nothing is written, and an empty `speech_model` leaves the notes without a sound."""
        self._profiles = profiles
        self._personas = personas
        self._conversations = conversations
        self._memories = memories
        self._accounts = accounts
        self._repository = repository
        self._listener = listener
        self._text_model = text_model
        self._note_model = note_model
        self._reply_model = reply_model
        self._speech = speech
        self._speech_model = speech_model
        self._files = files
        self._starter = starter
        self._clock = clock
        self._announce = announce
        self._new_id = new_id

    # --- What the learner sees and chooses

    def settings(self, user_id: UUID) -> Settings:
        return self._repository.settings(user_id) or Settings()

    def configure(
        self,
        user_id: UUID,
        *,
        enabled: bool | None = None,
        per_week: int | None = None,
        quiet_from: int | None = None,
        quiet_to: int | None = None,
        timezone: str | None = None,
    ) -> Settings:
        """The learner's choices; None leaves one as it is. Raises `PenPalError`
        (`invalid_value`) and then changes nothing."""
        current = self.settings(user_id)
        changed = replace(
            current,
            enabled=current.enabled if enabled is None else enabled,
            per_week=current.per_week if per_week is None else per_week,
            quiet_from=current.quiet_from if quiet_from is None else quiet_from,
            quiet_to=current.quiet_to if quiet_to is None else quiet_to,
            timezone=current.timezone if timezone is None else timezone,
        )
        if (
            not 1 <= changed.per_week <= MAX_PER_WEEK
            or not 0 <= changed.quiet_from <= 23
            or not 0 <= changed.quiet_to <= 23
            or not _is_zone(changed.timezone)
        ):
            raise PenPalError("invalid_value")
        self._repository.save_settings(user_id, changed, self._clock())
        return changed

    def overview(self, user_id: UUID) -> Overview:
        """The learner's settings and a line per partner: their newest note and what is unread."""
        unread = self._repository.unread(user_id)
        threads = tuple(
            ThreadSummary(
                persona.id, self._repository.last_of(user_id, persona.id), unread.get(persona.id, 0)
            )
            for persona in self._personas.partners(user_id)
        )
        return Overview(self.settings(user_id), threads)

    def thread(self, user_id: UUID, persona_id: UUID) -> Thread:
        """A thread: its notes, oldest first, each with an address to play it. A note that is
        pending for too long is shown as failed. Raises `PenPalError` (`not_found`)."""
        self._partner(user_id, persona_id)
        now = self._clock()
        notes = [
            self._shown(note, now)
            for note in self._repository.thread(user_id, persona_id, THREAD_NOTES)
        ]
        unread = self._repository.unread(user_id).get(persona_id, 0)
        return Thread(
            persona_id,
            tuple(Heard(note, self._address(note)) for note in notes),
            unread,
        )

    def opened(self, user_id: UUID, persona_id: UUID) -> None:
        """The learner opened a thread: what the partner sent is read."""
        self._partner(user_id, persona_id)
        self._repository.mark_read(user_id, persona_id)

    def _shown(self, note: Note, now: dt.datetime) -> Note:
        if note.status == "pending" and now - (note.claimed_at or note.created_at) > PENDING_FOR:
            return replace(note, status="failed")
        return note

    def _address(self, note: Note) -> str | None:
        if note.audio_key is None or note.status != "ready":
            return None
        return self._files.address(note.audio_key, ADDRESS_SECONDS)

    def _partner(self, user_id: UUID, persona_id: UUID) -> Persona:
        partner = next((p for p in self._personas.partners(user_id) if p.id == persona_id), None)
        if partner is None:
            raise PenPalError("not_found")
        return partner

    # --- Asking for a note, and sending one

    def ask(self, user_id: UUID, persona_id: UUID) -> Note:
        """The learner asks a partner for a note now. It is written by the worker; the thread
        shows it as pending until then. Raises `PenPalError`."""
        self._partner(user_id, persona_id)
        if not self._note_model:
            raise PenPalError("unavailable")
        self._consented(user_id)
        now = self._clock()
        if self._repository.partner_notes_since(user_id, now - dt.timedelta(days=1)) >= (
            MAX_ASKED_PER_DAY
        ):
            raise PenPalError("limit")
        note = self._pending(user_id, persona_id, None, now)
        self._repository.add(note)
        self._start(note)
        return note

    def send_due(self) -> int:
        """Once an hour: each learner whose partners write on their own, whose turn it is, gets a
        note from the partner they talked to last, written and spoken at once (this runs in the
        worker, apart from any request). Answers how many were sent."""
        if not self._note_model:
            return 0
        now = self._clock()
        sent = 0
        for user_id, settings in self._repository.enabled(SCAN):
            try:
                if self._due(user_id, settings, now) and self._send(user_id, now):
                    sent += 1
            except Exception:
                logger.warning("pen-pal note not sent")
        return sent

    def _due(self, user_id: UUID, settings: Settings, now: dt.datetime) -> bool:
        local = now.astimezone(zone_of(settings.timezone))
        if _quiet(local.hour, settings):
            return False
        week = dt.timedelta(days=7)
        if self._repository.partner_notes_since(user_id, now - week) >= settings.per_week:
            return False
        last = self._repository.last_of(user_id, None)
        gap = week / settings.per_week * GAP_SHARE
        if last is not None and last.sender == "partner" and now - last.created_at < gap:
            return False
        try:
            return self._accounts.get(user_id).voice_consent
        except AccountNotFound:
            return False

    def _send(self, user_id: UUID, now: dt.datetime) -> bool:
        partners = self._personas.partners(user_id)
        if not partners:
            return False
        recent = self._conversations.listed(user_id, limit=1).conversations
        chosen = next((p for p in partners if recent and p.id == recent[0].persona_id), partners[0])
        if self._repository.unanswered(user_id, chosen.id) >= MAX_UNANSWERED:
            return False
        note = self._pending(user_id, chosen.id, None, now)
        self._repository.add(note)
        self.write(note.id)
        written = self._repository.get(note.id)
        return written is not None and written.status == "ready"

    def _pending(
        self, user_id: UUID, persona_id: UUID, reply_to: UUID | None, now: dt.datetime
    ) -> Note:
        return Note(
            id=self._new_id(),
            user_id=user_id,
            persona_id=persona_id,
            sender="partner",
            status="pending",
            text="",
            created_at=now,
            reply_to=reply_to,
        )

    def _start(self, note: Note) -> None:
        """Has the worker write a pending note. If it cannot be started the note is failed, and
        the learner can ask again."""
        try:
            self._starter.start(note.id)
        except Exception:
            logger.warning("pen-pal worker not started")
            self._repository.finish(note.id, "failed", "", None, ())

    def _consented(self, user_id: UUID) -> None:
        # What the learner says goes to the providers of speech and text, which they must have
        # agreed to (Apple guideline 5.1.2(i)); they may have withdrawn since.
        try:
            consented = self._accounts.get(user_id).voice_consent
        except AccountNotFound:
            consented = False
        if not consented:
            raise PenPalError("consent_required")

    # --- The learner's voice note

    def reply(
        self,
        user_id: UUID,
        persona_id: UUID,
        audio: bytes,
        audio_format: str,
        seconds: float | None = None,
    ) -> tuple[Note, Note]:
        """The learner answers with a voice note: it is written down word for word at once, and
        the partner's answer is started. Answers the learner's note and the pending answer.
        Raises `PenPalError`."""
        self._partner(user_id, persona_id)
        if not self._reply_model:
            raise PenPalError("unavailable")
        try:
            self._listener.ready(user_id, audio, audio_format)
        except SpokenError as error:
            raise PenPalError(error.code) from error
        now = self._clock()
        if self._repository.learner_notes_since(user_id, now - dt.timedelta(days=1)) >= (
            MAX_REPLIES_PER_DAY
        ):
            raise PenPalError("limit")
        profile = self._profiles.get(user_id)
        language = profile.target_language or ""
        try:
            said = self._listener.hear(
                user_id, language, audio, audio_format, seconds, Feature.PEN_PAL_LISTEN
            )
        except SpokenError as error:
            raise PenPalError(error.code) from error
        if len(words_in(said)) < MIN_WORDS:
            raise PenPalError("too_short")
        note_id = self._new_id()
        key = None
        # The sound is kept only where the learner chose to keep their recordings (spec §6.6);
        # it sits with them, so turning that off deletes it.
        if profile.recordings_kept:
            key = f"users/{user_id}/recordings/penpal/{note_id}.{audio_format}"
            self._files.save(key, audio, _AUDIO_TYPES.get(audio_format, "application/octet-stream"))
        heard = Note(
            id=note_id,
            user_id=user_id,
            persona_id=persona_id,
            sender="learner",
            status="ready",
            text=said,
            created_at=now,
            audio_key=key,
            read=True,
        )
        self._repository.add(heard)
        answer = self._pending(user_id, persona_id, note_id, now)
        self._repository.add(answer)
        self._start(answer)
        return heard, answer

    def retry(self, user_id: UUID, note_id: UUID) -> Note:
        """A note or an answer that failed is written again, at most `MAX_ATTEMPTS` times in
        all. Raises `PenPalError`."""
        note = self._repository.get(note_id)
        if note is None or note.user_id != user_id or note.sender != "partner":
            raise PenPalError("not_found")
        now = self._clock()
        if not self._repository.reopen(note_id, now - PENDING_FOR, MAX_ATTEMPTS):
            current = self._repository.get(note_id)
            if current is not None and current.status == "failed":
                raise PenPalError("retry_limit")
            return current or note
        reopened = self._repository.get(note_id) or note
        self._start(reopened)
        return reopened

    # --- The worker

    def write(self, note_id: UUID) -> None:
        """Writes a pending note or answer and its sound. Runs apart from any request, once for
        a note (a delivery made twice finds it taken)."""
        note = self._repository.get(note_id)
        if note is None or note.sender != "partner":
            return
        now = self._clock()
        if not self._repository.claim(note_id, now, now - PENDING_FOR, MAX_ATTEMPTS):
            return
        try:
            self._written(note)
        except Exception:
            logger.warning("pen-pal note failed")
            self._repository.finish(note_id, "failed", "", None, ())
            raise

    def _written(self, note: Note) -> None:
        partner = next(
            (p for p in self._personas.partners(note.user_id) if p.id == note.persona_id), None
        )
        if partner is None:
            self._repository.finish(note.id, "failed", "", None, ())
            return
        if note.reply_to is None:
            self._write_note(note, partner)
        else:
            self._write_reply(note, partner)

    def _context(self, note: Note, partner: Persona) -> dict[str, Any]:
        """What both kinds of writing know: who the partner is and who the learner is."""
        profile = self._profiles.get(note.user_id)
        language = profile.target_language or ""
        now = self._clock()
        recent = self._conversations.listed(note.user_id, limit=1).conversations
        recall = self._memories.recall(
            note.user_id,
            partner.id,
            now.date(),
            recent[0].started_at.date() if recent else None,
        )
        earlier = [
            {"from": earlier_note.sender, "text": earlier_note.text}
            for earlier_note in self._repository.thread(note.user_id, partner.id, CONTEXT_NOTES + 1)
            if earlier_note.id != note.id and earlier_note.status == "ready"
        ][-CONTEXT_NOTES:]
        return {
            "you": _persona_lines(partner),
            "level": profile.level(language) or "A1",
            "weekday": now.strftime("%A"),
            "today": now.date().isoformat(),
            "never_about": list(profile.avoid_topics),
            "known": {
                "follow_ups": [m.text for m in recall.follow_ups] if recall else [],
                "coming_up": [m.text for m in recall.coming_up] if recall else [],
                "notes": [m.text for m in recall.notes] if recall else [],
            },
            "thread": earlier,
        }

    def _names(self, user_id: UUID) -> tuple[str, str, str]:
        profile = self._profiles.get(user_id)
        catalog = self._profiles.catalog
        language = profile.target_language or ""
        explained_in = profile.value(language, "explanation_language") or "en"
        return language, catalog.english_name(language), catalog.english_name(explained_in)

    def _write_note(self, note: Note, partner: Persona) -> None:
        _, target, explanation = self._names(note.user_id)
        content = self._context(note, partner)
        content["earlier"] = content.pop("thread")
        task = TextTask(
            model=self._note_model,
            instructions=_note_instructions(target, explanation),
            content=json.dumps(content, ensure_ascii=False),
            answer_name="pen_pal_note",
            answer_schema=_NOTE_SCHEMA,
            charge=Charge(note.user_id, Feature.PEN_PAL),
        )
        try:
            written = _Written.model_validate(self._text_model.answer(task))
        except (TextModelError, ValidationError):
            self._repository.finish(note.id, "failed", "", None, ())
            return
        text = _clip(written.text, TEXT_MAX)
        if not words_in(text):
            self._repository.finish(note.id, "failed", "", None, ())
            return
        key = self._spoken(note, partner, text)
        # A voice note without a voice is not what was promised: the schedule tries again.
        if key is None and self._speech_model:
            self._repository.finish(note.id, "failed", "", None, ())
            return
        self._repository.finish(note.id, "ready", text, key, ())
        self._announce(note.user_id, partner.id, False)

    def _spoken(self, note: Note, partner: Persona, text: str) -> str | None:
        """The text in the partner's voice, kept under the learner's folder (deleted with the
        account). None when there is no speech model or it failed."""
        if not self._speech_model:
            return None
        try:
            sound = self._speech.speak(
                SpeechTask(
                    self._speech_model,
                    partner.voice,
                    text,
                    Charge(note.user_id, Feature.PEN_PAL_AUDIO),
                )
            )
        except SpeechError:
            return None
        key = f"users/{note.user_id}/penpal/{note.id}.mp3"
        self._files.save(key, sound, SOUND_TYPE)
        return key

    def _write_reply(self, note: Note, partner: Persona) -> None:
        user_id = note.user_id
        heard = self._repository.get(note.reply_to) if note.reply_to else None
        if heard is None or heard.user_id != user_id:
            self._repository.finish(note.id, "failed", "", None, ())
            return
        language, target, explanation = self._names(user_id)
        pack = self._profiles.catalog.available_pack(language)
        categories = tuple(pack.error_categories) if pack else ()
        content = self._context(note, partner)
        content["thread"] = [line for line in content["thread"] if line["text"] != heard.text]
        content["note"] = heard.text
        task = TextTask(
            model=self._reply_model,
            instructions=_reply_instructions(target, explanation),
            content=json.dumps(content, ensure_ascii=False),
            answer_name="pen_pal_reply",
            answer_schema=_reply_schema(categories),
            charge=Charge(user_id, Feature.PEN_PAL),
        )
        try:
            replied = _Replied.model_validate(self._text_model.answer(task))
        except (TextModelError, ValidationError):
            self._repository.finish(note.id, "failed", "", None, ())
            return
        reply = _clip(replied.reply, TEXT_MAX)
        if not words_in(reply):
            self._repository.finish(note.id, "failed", "", None, ())
            return
        found = _corrections(replied.corrections, heard.text, categories)
        checked = self._checked(user_id, target, explanation, heard.text, found)
        spoken = [
            _says(item.spoken, correction.corrected)
            for item, correction in checked
            if correction.certain
        ][:MAX_SPOKEN_CORRECTIONS]
        text = reply
        if spoken:
            text = f"{reply} {_clip(replied.correction_lead, QUOTE_MAX)} {' '.join(spoken)}"
            text = _clip(text, TEXT_MAX)
        key = self._spoken(note, partner, text)
        self._repository.finish(
            note.id, "ready", text, key, tuple(correction for _, correction in checked)
        )
        self._memories.remember(
            user_id, partner, heard.text, replied.memories, self._clock().date()
        )
        self._announce(user_id, partner.id, True)

    def _checked(
        self,
        user_id: UUID,
        target: str,
        explanation: str,
        said: str,
        found: Sequence[tuple[_Found, Correction]],
    ) -> list[tuple[_Found, Correction]]:
        """The second, independent check (spec §16.1): what it calls wrong is left out, and only
        what it confirms is spoken as a fact."""
        if not found:
            return []
        content = {
            "mistakes": [
                {
                    "id": number,
                    "learner_said": said,
                    "original": correction.original,
                    "corrected": correction.corrected,
                    "explanation": correction.explanation,
                }
                for number, (_, correction) in enumerate(found)
            ],
            "rewrites": [],
        }
        task = TextTask(
            model=self._reply_model,
            instructions=reviewer_instructions(target, explanation),
            content=json.dumps(content, ensure_ascii=False),
            answer_name="correction_review",
            answer_schema=REVIEW_SCHEMA,
            charge=Charge(user_id, Feature.PEN_PAL),
        )
        try:
            review = Review.model_validate(self._text_model.answer(task))
        except (TextModelError, ValidationError):
            # Unchecked, a correction is only a possibility.
            return [(item, replace(correction, certain=False)) for item, correction in found]
        verdicts = {answer.id: answer.verdict for answer in review.mistakes}
        return [
            (item, replace(correction, certain=verdicts.get(number) == "correct"))
            for number, (item, correction) in enumerate(found)
            if verdicts.get(number) != "wrong"
        ]


def _is_zone(name: str) -> bool:
    try:
        ZoneInfo(name)
    except Exception:
        return False
    return True


def _quiet(hour: int, settings: Settings) -> bool:
    """Whether `hour` is within the learner's quiet hours."""
    start, end = settings.quiet_from, settings.quiet_to
    if start == end:
        return False
    if start < end:
        return start <= hour < end
    return hour >= start or hour < end
