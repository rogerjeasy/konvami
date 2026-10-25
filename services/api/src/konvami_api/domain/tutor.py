"""Ask-the-Tutor (spec §6.8, §8.4, §12.3): accurate answers to a learner's questions about the
language they learn, as text, about a correction in a report, and during a call.

A wrong rule costs the learner's trust (spec §16.1), so the Tutor is a strong text model that
rests every answer on the language pack's grammar notes, names the one it used, and says when it
is not sure. Every question and its answer are kept for the learner to read again.
"""

import datetime as dt
import json
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from typing import Any, Literal, Protocol
from uuid import UUID, uuid4

from pydantic import BaseModel, ConfigDict, ValidationError

from konvami_api.domain.accounts import AccountDirectory, AccountNotFound
from konvami_api.domain.catalog import LanguagePack
from konvami_api.domain.conversations import ConversationError, ConversationService
from konvami_api.domain.costs import Charge, Feature
from konvami_api.domain.profile import Profile, ProfileService
from konvami_api.domain.reports import DEFAULT_LEVEL, Mistake, ReportService
from konvami_api.domain.text import (
    TextModel,
    TextModelError,
    TextTask,
    answer_list,
    answer_object,
    familiar_address,
)

Source = Literal["text", "report", "call"]

# How many questions a learner may ask in a day, all ways together: each is a request to a paid
# model, and no learner needs more.
QUESTIONS_PER_DAY = 40
# The longest question accepted, in characters.
MAX_QUESTION = 500
MAX_EXAMPLES = 3
# How many earlier questions the screen shows.
HISTORY = 50
# How long an answer may take. Text: the learner is waiting, and the API has 29 seconds in all.
# In a call: the partner is silent meanwhile.
TEXT_SECONDS = 25.0
CALL_SECONDS = 12.0
# The most characters kept of an explanation and of an example.
EXPLANATION_MAX = 1200
EXAMPLE_MAX = 300


@dataclass(frozen=True)
class Example:
    # A sentence in the language learned, and its translation.
    text: str
    translation: str


@dataclass(frozen=True)
class TutorAnswer:
    explanation: str
    examples: tuple[Example, ...]
    # The grammar note the answer rests on; None when none applies ("how do I say …").
    topic: str | None
    # The Tutor could not settle the question: the answer is a possibility, never a fact.
    unsure: bool


@dataclass(frozen=True)
class TutorQuestion:
    id: UUID
    asked_at: dt.datetime
    question: str
    answer: TutorAnswer
    source: Source


class TutorError(Exception):
    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


class TutorRepository(Protocol):
    """Kept questions, and how many each learner asked on a day (see `DraftLog`)."""

    def reserve(self, user_id: UUID, day: dt.date, limit: int) -> bool:
        """Counts one more question for that day and returns True, unless the learner has
        reached `limit`. One step: requests arriving together cannot both take the last place."""

    def save(self, user_id: UUID, question: TutorQuestion) -> None: ...

    def listed(self, user_id: UUID, limit: int) -> list[TutorQuestion]:
        """The learner's questions, newest first."""


class _Example(BaseModel):
    model_config = ConfigDict(extra="ignore")
    text: str
    translation: str


class _Answer(BaseModel):
    model_config = ConfigDict(extra="ignore")
    explanation: str
    examples: list[_Example]
    topic: str | None
    unsure: bool


_EXAMPLE_SCHEMA = answer_object({"text": {"type": "string"}, "translation": {"type": "string"}})


def _schema(examples: int) -> dict[str, Any]:
    return answer_object(
        {
            "explanation": {"type": "string"},
            "examples": answer_list(_EXAMPLE_SCHEMA, examples),
            "topic": {"type": ["string", "null"]},
            "unsure": {"type": "boolean"},
        }
    )


def _instructions(target: str, written_in: str, spoken: bool) -> str:
    language = (
        f"Write the explanation in simple {target}, at the learner's level."
        if written_in == target
        else f"Write the explanation in {written_in}, quoting {target} as it is. "
        + familiar_address(written_in)
    )
    length = (
        "The answer is spoken by the learner's conversation partner in the middle of a "
        "conversation: `explanation` is at most three short sentences, plain enough to be "
        "understood by ear, and `examples` holds one short sentence."
        if spoken
        else f"`explanation` is at most 120 words. `examples` holds one to {MAX_EXAMPLES} "
        "sentences that show the answer."
    )
    return f"""You are the Tutor of a language-learning app. A learner of {target} asks a
question about {target}: a rule, why something is said a certain way, or how to say something.
You get their level, the question, sometimes the sentence it is about or a correction from their
conversation report, and the app's grammar notes for {target}.

Rest your answer on the notes. `topic` is the topic of the note your answer rests on, or null
when none applies (a question about a word or how to say something). When the notes do not
settle the question and you are not sure of the rule, say so plainly and set `unsure` to true:
never invent a rule. When the learner's own sentence was in fact correct, say so.

{language} Answer warmly and plainly, never grade the learner and never mention their level.
Each example is a {target} sentence a learner at that level understands, with its
`translation` into {written_in}.

{length}"""


def _notes(pack: LanguagePack | None) -> list[dict[str, Any]]:
    return [
        {
            "topic": note.topic,
            "title": note.title,
            "rule": note.rule,
            "right": list(note.right),
            "wrong": list(note.wrong),
        }
        for note in (pack.grammar if pack else ())
    ]


class TutorService:
    def __init__(
        self,
        *,
        profiles: ProfileService,
        accounts: AccountDirectory,
        conversations: ConversationService,
        reports: ReportService,
        repository: TutorRepository,
        text_model: TextModel,
        model: str,
        clock: Callable[[], dt.datetime],
        new_id: Callable[[], UUID] = uuid4,
    ) -> None:
        self._profiles = profiles
        self._accounts = accounts
        self._conversations = conversations
        self._reports = reports
        self._repository = repository
        self._text_model = text_model
        # An empty name: no Tutor.
        self._model = model
        self._clock = clock
        self._new_id = new_id

    def history(self, user_id: UUID) -> list[TutorQuestion]:
        return self._repository.listed(user_id, HISTORY)

    def ask(self, user_id: UUID, question: str) -> TutorQuestion:
        """A question typed on the Tutor screen. Raises `TutorError`."""
        text = question.strip()
        if not text or len(text) > MAX_QUESTION:
            raise TutorError("invalid_value")
        return self._answered(user_id, text, {"question": text}, "text")

    def explain_correction(self, user_id: UUID, call_id: str, index: int) -> TutorQuestion:
        """ "Explain this" on a report's correction. The correction is read from the stored
        report, never taken from the app. Raises `TutorError`."""
        mistake, said = self._correction(user_id, call_id, index)
        question = f"{mistake.original} → {mistake.corrected}"
        content = {
            "question": f"Why is “{mistake.original}” wrong here, and why “{mistake.corrected}”?",
            "correction": {
                "learner_said": said,
                "original": mistake.original,
                "corrected": mistake.corrected,
                "report_explanation": mistake.explanation,
                "topic": mistake.category,
                # An unconfirmed correction may be wrong itself (spec §16.1).
                "confirmed": mistake.certain,
            },
        }
        return self._answered(user_id, question, content, "report")

    def in_call(self, user_id: UUID, question: str, about: str | None) -> dict[str, Any]:
        """`ask_tutor` during a call (spec §8.4): what the partner is told back, to say in its
        own words. Never raises: without an answer the partner goes on from what it knows."""
        text = question.strip()[:MAX_QUESTION]
        content: dict[str, Any] = {"question": text}
        if about and about.strip():
            content["about"] = about.strip()[:MAX_QUESTION]
        try:
            kept = self._answered(user_id, text, content, "call")
        except TutorError as error:
            reason = "limit" if error.code == "tutor_limit" else "unavailable"
            return {"answered": False, "reason": reason}
        example = kept.answer.examples[0] if kept.answer.examples else None
        return {
            "answered": True,
            "explanation": kept.answer.explanation,
            "example": example.text if example else None,
            "example_translation": example.translation if example else None,
        }

    def _correction(self, user_id: UUID, call_id: str, index: int) -> tuple[Mistake, str]:
        try:
            state = self._reports.view(user_id, call_id)
            turns = self._conversations.transcript(user_id, call_id).turns
        except ConversationError as error:
            raise TutorError("not_found") from error
        mistakes = state.report.mistakes if state.report else ()
        if not 0 <= index < len(mistakes):
            raise TutorError("not_found")
        mistake = mistakes[index]
        said = turns[mistake.turn].said if 0 <= mistake.turn < len(turns) else mistake.original
        return mistake, said

    def _answered(
        self, user_id: UUID, question: str, content: dict[str, Any], source: Source
    ) -> TutorQuestion:
        if not self._model:
            raise TutorError("unavailable")
        # The question goes to the text model's provider, which the learner must have agreed to
        # (Apple guideline 5.1.2(i)); they may have withdrawn.
        try:
            consented = self._accounts.get(user_id).voice_consent
        except AccountNotFound:
            consented = False
        if not consented:
            raise TutorError("consent_required")
        profile = self._profiles.get(user_id)
        language = profile.target_language
        if not language:
            raise TutorError("no_language")
        now = self._clock()
        if not self._repository.reserve(user_id, now.date(), QUESTIONS_PER_DAY):
            raise TutorError("tutor_limit")

        pack = self._profiles.catalog.available_pack(language)
        spoken = source == "call"
        task = TextTask(
            model=self._model,
            instructions=_instructions(*self._languages(profile, language), spoken),
            content=json.dumps(
                {
                    "level": profile.level(language) or DEFAULT_LEVEL,
                    **content,
                    "notes": _notes(pack),
                },
                ensure_ascii=False,
            ),
            answer_name="tutor_answer",
            answer_schema=_schema(1 if spoken else MAX_EXAMPLES),
            max_seconds=CALL_SECONDS if spoken else TEXT_SECONDS,
            charge=Charge(user_id, Feature.TUTOR),
        )
        try:
            found = _Answer.model_validate(self._text_model.answer(task))
        except (TextModelError, ValidationError) as error:
            raise TutorError("unavailable") from error
        answer = _answer(found, pack)
        if not answer.explanation:
            raise TutorError("unavailable")
        kept = TutorQuestion(self._new_id(), now, question, answer, source)
        self._repository.save(user_id, kept)
        return kept

    def _languages(self, profile: Profile, language: str) -> tuple[str, str]:
        """The language learned and the one the explanation is written in, by English name."""
        catalog = self._profiles.catalog
        target = catalog.english_name(language)
        # A learner who wants no explanations in their own language gets them in simple target.
        if profile.value(language, "explanation_usage") == "never":
            return target, target
        explained_in = profile.value(language, "explanation_language") or "en"
        return target, catalog.english_name(explained_in)


def _answer(found: _Answer, pack: LanguagePack | None) -> TutorAnswer:
    examples: Sequence[Example] = [
        Example(example.text.strip()[:EXAMPLE_MAX], example.translation.strip()[:EXAMPLE_MAX])
        for example in found.examples
        if example.text.strip()
    ]
    known = pack is not None and found.topic is not None and pack.note(found.topic) is not None
    return TutorAnswer(
        explanation=found.explanation.strip()[:EXPLANATION_MAX],
        examples=tuple(examples[:MAX_EXAMPLES]),
        topic=found.topic if known else None,
        unsure=found.unsure,
    )
