"""Listening stories (5.29; design note 2026-11-20-stories): short audio episodes at the
learner's level, made around the words they are learning, in a series that goes on.

An episode is about two minutes of listening: a scene told by one of the learner's partners, or
a dialogue between two of them, in the language learned. Its words come from the learner's due
and saved cards, its themes from what the learner likes (their partners' notes, never stated
as facts about them), and its plot continues the series: the same characters, what happened in
the last episodes. The learner listens with the captions hidden, then answers one or two
questions out loud, and the words they heard count as heard (passive vocabulary, §6.7).

The text is written by the small text model and every line is spoken in its speaker's voice, as
a pen-pal note is (spec §6.16); both are kept, so an episode plays again without a new request.
Writing and speaking take longer than a request may, so the worker does it, as for pen-pal
notes: an episode is pending until it is ready.
"""

import datetime as dt
import json
import logging
from collections.abc import Callable, Sequence
from dataclasses import dataclass, field, replace
from typing import Any, Literal, Protocol
from uuid import UUID, uuid4

from pydantic import BaseModel, ConfigDict, ValidationError

from konvami_api.domain.cards import CardService
from konvami_api.domain.costs import Charge, Feature
from konvami_api.domain.memories import MemoryService
from konvami_api.domain.personas import Persona, PersonaService
from konvami_api.domain.profile import ProfileService
from konvami_api.domain.reports import wording, words_in
from konvami_api.domain.speech import SpeechError, SpeechModel, SpeechTask
from konvami_api.domain.spoken import Listener, SpokenError
from konvami_api.domain.storage import FileStore
from konvami_api.domain.text import TextModel, TextModelError, TextTask, answer_list, answer_object
from konvami_api.domain.two_partners import distinct_voice
from konvami_api.domain.word_use import uses_word

logger = logging.getLogger(__name__)

Status = Literal["pending", "ready", "failed"]

# Episodes a learner may have made a day: each is a text request and a minute or two of speech.
MAX_PER_DAY = 3
# What an episode holds: about two minutes of listening at a learner's pace.
MIN_LINES = 4
MAX_LINES = 24
LINE_MAX = 280
EPISODE_MAX = 2400
TITLE_MAX = 80
SUMMARY_MAX = 400
QUESTION_MAX = 200
ANSWER_MAX = 60
MAX_QUESTIONS = 2
# The learner's words an episode is built around; the model uses as many as fit.
MAX_STORY_WORDS = 8
# The earlier episodes the writer reads to go on with the story.
STORY_SO_FAR = 3
# The episodes the screen lists.
LISTED = 30
# A pending episode older than this is shown as failed and can be made again.
PENDING_FOR = dt.timedelta(minutes=5)
MAX_ATTEMPTS = 3
ADDRESS_SECONDS = 30 * 60
SOUND_TYPE = "audio/mpeg"


@dataclass(frozen=True)
class StoryLine:
    # Who says it: 0 the episode's first character, 1 the second.
    speaker: int
    text: str
    audio_key: str | None = None


@dataclass(frozen=True)
class StoryQuestion:
    # In the language learned.
    question: str
    # The shortest right answer, a word or a few, in the language learned.
    answer: str


@dataclass(frozen=True)
class StoryAnswer:
    question: int
    # What the learner said, word for word.
    heard: str
    right: bool


@dataclass(frozen=True)
class Episode:
    id: UUID
    user_id: UUID
    language: str
    number: int
    # The partners who tell it: one tells a scene, two play a dialogue.
    cast: tuple[UUID, ...]
    status: Status
    created_at: dt.datetime
    title: str = ""
    # A few sentences on what happened, for the next episode to go on from (English).
    summary: str = ""
    lines: tuple[StoryLine, ...] = ()
    questions: tuple[StoryQuestion, ...] = ()
    # The learner's words the episode uses.
    words: tuple[str, ...] = ()
    claimed_at: dt.datetime | None = None
    listened_at: dt.datetime | None = None
    answers: tuple[StoryAnswer, ...] = ()


@dataclass(frozen=True)
class EpisodeView:
    episode: Episode
    # A short-lived address per line's sound; None for a line without one.
    addresses: tuple[str | None, ...] = ()
    # The cast's names, in the order of `episode.cast`.
    names: tuple[str, ...] = ()


@dataclass(frozen=True)
class Series:
    episodes: tuple[Episode, ...]
    names: dict[UUID, str] = field(default_factory=dict)
    # How many more episodes can be made today.
    left_today: int = MAX_PER_DAY
    # Whether stories can be made at all here (a text model is configured).
    available: bool = True


class StoryError(Exception):
    """`not_found`, `no_partner`, `daily_limit`, `pending`, `consent_required`, `invalid_value`
    or `unavailable`."""

    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


class StoryRepository(Protocol):
    def add(self, episode: Episode) -> None: ...

    def get(self, episode_id: UUID) -> Episode | None: ...

    def listed(self, user_id: UUID, language: str, limit: int) -> list[Episode]:
        """The learner's episodes in a language, the newest first."""

    def made_since(self, user_id: UUID, since: dt.datetime) -> int:
        """How many episodes the learner had made since then, whatever became of them."""

    def claim(
        self, episode_id: UUID, at: dt.datetime, stale_before: dt.datetime, max_attempts: int
    ) -> bool:
        """Takes a pending episode to write: False when another worker has it, or it is done."""

    def finish(self, episode: Episode) -> None:
        """Stores what was written (status, title, summary, lines, questions, words)."""

    def listened(self, episode_id: UUID, at: dt.datetime, heard: Sequence[tuple[str, str]]) -> None:
        """The learner listened to the end; `heard` are the words they heard, as (key, word),
        kept as passive vocabulary once per episode."""

    def answered(self, episode_id: UUID, answer: StoryAnswer) -> None:
        """Keeps the learner's latest answer to one question."""


class StoryStarter(Protocol):
    def start(self, episode_id: UUID) -> None:
        """Has the worker write a pending episode."""


# --- Writing ----------------------------------------------------------------------------------


class _Model(BaseModel):
    model_config = ConfigDict(extra="forbid")


class _Line(_Model):
    speaker: int
    text: str


class _Question(_Model):
    question: str
    answer: str


class _Written(_Model):
    title: str
    summary: str
    lines: list[_Line]
    questions: list[_Question]
    words_used: list[str]


_SCHEMA = answer_object(
    {
        "title": {"type": "string"},
        "summary": {"type": "string"},
        "lines": answer_list(
            answer_object({"speaker": {"type": "integer"}, "text": {"type": "string"}}),
            MAX_LINES,
        ),
        "questions": answer_list(
            answer_object({"question": {"type": "string"}, "answer": {"type": "string"}}),
            MAX_QUESTIONS,
        ),
        "words_used": answer_list({"type": "string"}, MAX_STORY_WORDS),
    }
)


def story_instructions(target: str, dialogue: bool) -> str:
    """What the writer is told. Plain English; the episode itself is in `target`."""
    form = (
        "a dialogue between the two characters (speaker 0 and speaker 1), who take turns"
        if dialogue
        else "a scene told by one character (speaker 0) about something that happened to them, "
        "in the first person, with what others said in their own words"
    )
    return f"""You write one episode of a listening series for a learner of {target} in a
language app. The episode is {form}. The characters are the learner's conversation partners in
the app; the input says who they are. The learner listens to it and is not a character: never
address them, never speak about them, and never state anything about their life.

Write in {target}, at the learner's level (input "level"): at A1 and A2 short sentences,
present tense and the perfect, common words; at B1 everyday language with a few longer
sentences; at B2 and above natural, varied speech. About 2 minutes when read aloud: between
{MIN_LINES} and {MAX_LINES} lines, each at most {LINE_MAX} characters, {EPISODE_MAX} in all.
Plain spoken text only: no emoji, no markdown, no stage directions, no narrator's labels.

The story:
- Continue the series (input "story_so_far", oldest first): same characters, same places,
  what happened before still true. With no earlier episode, start a story that can go on (a
  flat hunt, a new job, a trip being planned, a neighbour's mystery). End on a small open
  question or a light cliffhanger, so there is a reason to hear the next one.
- Use as many of the input "words" as fit naturally, each in a sentence that makes its meaning
  clear from context; list in words_used the ones you used, exactly as given.
- The input "themes" are things the learner enjoys: pick at most one as a setting or a topic.
  They are hints, never facts about anyone.
- Everyday, friendly content. Never violence, sex, drugs, politics, religion, illness in detail
  or anything frightening; never anything on the input "never_about" list.
- The characters are characters in a language app; they never claim to be human beings outside
  the story.

title: the episode's title in {target}, a few words.
summary: three or four sentences in English on what happened, for writing the next episode.
questions: one or two questions in {target} about what happened, each answered by something
said clearly in the episode; answer: the shortest right answer in {target} (one to four words,
taken from the episode)."""


def _clip(text: str, most: int) -> str:
    text = " ".join(text.split())
    return text if len(text) <= most else text[: most - 1].rstrip() + "…"


def written_episode(answer: dict[str, Any], cast: int) -> _Written | None:
    """The writer's answer if it is an episode that can be told; None when it is not (too
    short, too long, a speaker who is not in the cast, no question)."""
    try:
        written = _Written.model_validate(answer)
    except ValidationError:
        return None
    lines = [line for line in written.lines if line.text.strip()]
    if not MIN_LINES <= len(lines) <= MAX_LINES:
        return None
    if any(not 0 <= line.speaker < cast for line in lines):
        return None
    if sum(len(line.text) for line in lines) > EPISODE_MAX + MAX_LINES * 20:
        return None
    questions = [q for q in written.questions if q.question.strip() and q.answer.strip()]
    if not questions or not written.title.strip():
        return None
    return written.model_copy(update={"lines": lines, "questions": questions[:MAX_QUESTIONS]})


def is_right_answer(heard: str, answer: str) -> bool:
    """Whether what the learner said has the answer's words: plain words, in any order, as a
    short answer may be said in a sentence ("Sie sucht eine Wohnung")."""
    expected = set(words_in(answer))
    return bool(expected) and expected <= set(words_in(heard))


# --- The service --------------------------------------------------------------------------------


class StoryService:
    def __init__(
        self,
        *,
        profiles: ProfileService,
        personas: PersonaService,
        cards: CardService,
        memories: MemoryService,
        repository: StoryRepository,
        listener: Listener,
        text_model: TextModel,
        model: str,
        speech: SpeechModel,
        speech_model: str,
        files: FileStore,
        starter: StoryStarter,
        clock: Callable[[], dt.datetime],
        new_id: Callable[[], UUID] = uuid4,
    ) -> None:
        """An empty `model`: no story can be written. An empty `speech_model`: episodes are
        text only, read with the captions on."""
        self._profiles = profiles
        self._personas = personas
        self._cards = cards
        self._memories = memories
        self._repository = repository
        self._listener = listener
        self._text_model = text_model
        self._model = model
        self._speech = speech
        self._speech_model = speech_model
        self._files = files
        self._starter = starter
        self._clock = clock
        self._new_id = new_id

    # --- What the learner sees

    def series(self, user_id: UUID) -> Series:
        language = self._language(user_id)
        now = self._clock()
        episodes = tuple(
            self._shown(episode, now)
            for episode in self._repository.listed(user_id, language, LISTED)
        )
        made = self._repository.made_since(user_id, now - dt.timedelta(days=1))
        return Series(
            episodes=episodes,
            names={p.id: p.name for p in self._personas.partners(user_id)},
            left_today=max(0, MAX_PER_DAY - made),
            available=bool(self._model),
        )

    def episode(self, user_id: UUID, episode_id: UUID) -> EpisodeView:
        episode = self._shown(self._own(user_id, episode_id), self._clock())
        partners = {p.id: p.name for p in self._personas.partners(user_id)}
        addresses = tuple(
            self._files.address(line.audio_key, ADDRESS_SECONDS)
            if line.audio_key and episode.status == "ready"
            else None
            for line in episode.lines
        )
        names = tuple(partners.get(persona_id, "") for persona_id in episode.cast)
        return EpisodeView(episode, addresses, names)

    # --- Making an episode

    def make(self, user_id: UUID, cast: Sequence[UUID] = ()) -> Episode:
        """Asks for the next episode, told by `cast` (one or two of the learner's partners;
        left out, the story's usual cast). Written in the background. Raises `StoryError`."""
        if not self._model:
            raise StoryError("unavailable")
        language = self._language(user_id)
        now = self._clock()
        earlier = [self._shown(e, now) for e in self._repository.listed(user_id, language, 1)]
        if earlier and earlier[0].status == "pending":
            raise StoryError("pending")
        if self._repository.made_since(user_id, now - dt.timedelta(days=1)) >= MAX_PER_DAY:
            raise StoryError("daily_limit")
        chosen = self._cast(user_id, cast, earlier[0] if earlier else None)
        episode = Episode(
            id=self._new_id(),
            user_id=user_id,
            language=language,
            number=(earlier[0].number + 1) if earlier else 1,
            cast=chosen,
            status="pending",
            created_at=now,
        )
        self._repository.add(episode)
        try:
            self._starter.start(episode.id)
        except Exception:
            logger.warning("story worker not started")
            self._repository.finish(replace(episode, status="failed"))
            return replace(episode, status="failed")
        return episode

    def _cast(
        self, user_id: UUID, wanted: Sequence[UUID], last: Episode | None
    ) -> tuple[UUID, ...]:
        partners = self._personas.partners(user_id)
        ids = [partner.id for partner in partners]
        if not ids:
            raise StoryError("no_partner")
        if wanted:
            unique = tuple(dict.fromkeys(wanted))
            if len(unique) > 2 or any(persona_id not in ids for persona_id in unique):
                raise StoryError("invalid_value")
            return unique
        if last is not None and all(persona_id in ids for persona_id in last.cast):
            # The series keeps its characters; every second episode is a dialogue when the
            # learner has two partners.
            lead = last.cast[0]
            if len(ids) > 1 and last.number % 2 == 1:
                other = next(persona_id for persona_id in ids if persona_id != lead)
                return (lead, other)
            return (lead,)
        return (ids[0],)

    # --- The worker

    def write(self, episode_id: UUID) -> None:
        """Writes a pending episode and speaks its lines. Runs apart from any request, once for
        an episode (a delivery made twice finds it taken)."""
        episode = self._repository.get(episode_id)
        if episode is None:
            return
        now = self._clock()
        if not self._repository.claim(episode_id, now, now - PENDING_FOR, MAX_ATTEMPTS):
            return
        try:
            self._repository.finish(self._written(episode))
        except Exception:
            logger.warning("story failed")
            self._repository.finish(replace(episode, status="failed"))
            raise

    def _written(self, episode: Episode) -> Episode:
        partners = {p.id: p for p in self._personas.partners(episode.user_id)}
        cast = [partners[persona_id] for persona_id in episode.cast if persona_id in partners]
        if len(cast) != len(episode.cast):
            return replace(episode, status="failed")
        task = TextTask(
            model=self._model,
            instructions=story_instructions(
                self._profiles.catalog.english_name(episode.language), len(cast) > 1
            ),
            content=json.dumps(self._context(episode, cast), ensure_ascii=False),
            answer_name="story_episode",
            answer_schema=_SCHEMA,
            charge=Charge(episode.user_id, Feature.STORY),
        )
        try:
            written = written_episode(self._text_model.answer(task), len(cast))
        except TextModelError:
            written = None
        if written is None:
            return replace(episode, status="failed")
        rules = self._word_rules(episode.language)
        text = " ".join(line.text for line in written.lines)
        lines = tuple(StoryLine(line.speaker, _clip(line.text, LINE_MAX)) for line in written.lines)
        spoken = self._spoken(episode, cast, lines)
        if spoken is None:
            return replace(episode, status="failed")
        return replace(
            episode,
            status="ready",
            title=_clip(written.title, TITLE_MAX),
            summary=_clip(written.summary, SUMMARY_MAX),
            lines=spoken,
            questions=tuple(
                StoryQuestion(_clip(q.question, QUESTION_MAX), _clip(q.answer, ANSWER_MAX))
                for q in written.questions
            ),
            # Only the words the episode really says count as heard.
            words=tuple(
                dict.fromkeys(word for word in written.words_used if uses_word(word, text, rules))
            ),
        )

    def _context(self, episode: Episode, cast: Sequence[Persona]) -> dict[str, Any]:
        profile = self._profiles.get(episode.user_id)
        cards = self._cards.words_to_bring_back(episode.user_id, MAX_STORY_WORDS)
        recall = self._memories.recall(episode.user_id, cast[0].id, self._clock().date(), None)
        earlier = [
            {"number": e.number, "title": e.title, "what_happened": e.summary}
            for e in reversed(
                self._repository.listed(episode.user_id, episode.language, STORY_SO_FAR + 1)
            )
            if e.id != episode.id and e.status == "ready"
        ][-STORY_SO_FAR:]
        return {
            "episode": episode.number,
            "level": profile.level(episode.language) or "A1",
            "characters": [
                {
                    "speaker": index,
                    "name": persona.name,
                    "age": persona.age,
                    "from": persona.origin,
                    "occupation": persona.occupation,
                    "who": persona.backstory,
                }
                for index, persona in enumerate(cast)
            ],
            "words": [card.front for card in cards],
            "themes": [memory.text for memory in recall.notes][:5] if recall else [],
            "never_about": list(profile.avoid_topics),
            "story_so_far": earlier,
        }

    def _spoken(
        self, episode: Episode, cast: Sequence[Persona], lines: Sequence[StoryLine]
    ) -> tuple[StoryLine, ...] | None:
        """Each line in its speaker's voice, kept under the learner's folder (deleted with the
        account). Without a speech model the lines stay text; a line that cannot be spoken
        fails the episode, as an episode with a gap is not what was promised."""
        if not self._speech_model:
            return tuple(lines)
        voices = [cast[0].voice]
        if len(cast) > 1:
            voices.append(distinct_voice(cast[0].voice, cast[1].voice))
        spoken: list[StoryLine] = []
        for number, line in enumerate(lines):
            try:
                sound = self._speech.speak(
                    SpeechTask(
                        self._speech_model,
                        voices[line.speaker],
                        line.text,
                        Charge(episode.user_id, Feature.STORY_AUDIO),
                    )
                )
            except SpeechError:
                return None
            key = f"users/{episode.user_id}/stories/{episode.id}/{number:02d}.mp3"
            self._files.save(key, sound, SOUND_TYPE)
            spoken.append(replace(line, audio_key=key))
        return tuple(spoken)

    # --- Listening and answering

    def listened(self, user_id: UUID, episode_id: UUID) -> EpisodeView:
        """The learner listened to the end: the words they heard count as heard, once."""
        episode = self._ready(user_id, episode_id)
        if episode.listened_at is None:
            heard = [(key, word) for word in episode.words if (key := wording(word))]
            self._repository.listened(episode_id, self._clock(), heard)
        return self.episode(user_id, episode_id)

    def answer(
        self,
        user_id: UUID,
        episode_id: UUID,
        question: int,
        audio: bytes,
        audio_format: str,
        seconds: float | None,
    ) -> StoryAnswer:
        """The learner's spoken answer to a question, checked against its answer. Raises
        `StoryError`."""
        episode = self._ready(user_id, episode_id)
        if not 0 <= question < len(episode.questions):
            raise StoryError("not_found")
        try:
            self._listener.ready(user_id, audio, audio_format)
            heard = self._listener.hear(
                user_id, episode.language, audio, audio_format, seconds, Feature.STORY_LISTEN
            )
        except SpokenError as error:
            raise StoryError(error.code) from error
        result = StoryAnswer(
            question, heard, is_right_answer(heard, episode.questions[question].answer)
        )
        self._repository.answered(episode_id, result)
        return result

    # --- Helpers

    def _ready(self, user_id: UUID, episode_id: UUID) -> Episode:
        episode = self._own(user_id, episode_id)
        if episode.status != "ready":
            raise StoryError("not_found")
        return episode

    def _own(self, user_id: UUID, episode_id: UUID) -> Episode:
        episode = self._repository.get(episode_id)
        if episode is None or episode.user_id != user_id:
            raise StoryError("not_found")
        return episode

    def _shown(self, episode: Episode, now: dt.datetime) -> Episode:
        started = episode.claimed_at or episode.created_at
        if episode.status == "pending" and now - started > PENDING_FOR:
            return replace(episode, status="failed")
        return episode

    def _language(self, user_id: UUID) -> str:
        language = self._profiles.get(user_id).target_language
        if not language:
            raise StoryError("not_found")
        return language

    def _word_rules(self, language: str) -> Any:
        pack = self._profiles.catalog.available_pack(language)
        return pack.word_rules if pack else None
