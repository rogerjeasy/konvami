"""The exam centre (spec §6.13): simulated speaking exams, scored after the call.

A simulation is a voice call with a neutral examiner who runs the format's parts in order, each
with its prompt card, and does not help. The examiner says which part begins through a tool, so
the app shows that part's card. After the call the strong text model scores every part by the
rubric (task completion, coherence, vocabulary, grammar) from what was written down, with the
reasons and a model answer at the exam's level; the result is an estimate, never an official
score. The learner's simulations of a format add up to how ready they are.
"""

import datetime as dt
import json
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass
from typing import Any, Literal, Protocol
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, ValidationError

from konvami_api.domain.accounts import Account
from konvami_api.domain.conversations import ConversationService
from konvami_api.domain.costs import Charge, Feature
from konvami_api.domain.exams import (
    CRITERIA,
    MAX_MARK,
    ExamCard,
    PartScore,
    Readiness,
    SpeakingExam,
    cards_for,
    format_for,
    readiness,
    total_share,
)
from konvami_api.domain.personas import PersonaService
from konvami_api.domain.profile import ProfileService
from konvami_api.domain.scenarios import ScenarioError
from konvami_api.domain.sounds import Sounds
from konvami_api.domain.speech import SpeechError, verbatim_prompt
from konvami_api.domain.text import TextModel, TextModelError, TextTask, answer_list, answer_object
from konvami_api.domain.tools import ToolResult, ToolSet
from konvami_api.domain.voice import Briefing, FinishedCall, Hearing, VoiceSessionRepository

# A simulation whose scoring keeps failing can be asked for this many times in all.
MAX_REQUESTS = 3
# Scoring pending for longer than this was lost with its worker and may be asked for again.
STALE_AFTER = dt.timedelta(minutes=5)
# Fewer learner turns than this are too little to score.
MIN_LEARNER_TURNS = 3
FEEDBACK_MAX = 800
MODEL_ANSWER_MAX = 1200
SUMMARY_MAX = 600
# The examiner's voice when the learner has no exam coach among their partners.
EXAMINER_VOICE = "sage"
# The simulations the centre lists.
LISTED = 20

Status = Literal["pending", "ready", "failed", "too_short"]


class ExamError(Exception):
    """`not_found`, `score_limit`, `nothing_to_score`, `unavailable`."""

    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


@dataclass(frozen=True)
class SimulationResult:
    parts: tuple[PartScore, ...]
    # The main thing to work on, in the learner's explanation language.
    summary: str
    pass_share: float

    @property
    def total(self) -> float:
        return round(total_share(self.parts), 4)

    @property
    def passed(self) -> bool:
        return self.total >= self.pass_share

    def part(self, part_id: str) -> PartScore | None:
        return next((part for part in self.parts if part.part == part_id), None)


@dataclass(frozen=True)
class Simulation:
    call_id: str
    # The speaking test (`SpeakingExam.id`), and the card of each part in their order.
    exam: str
    cards: tuple[str, ...]
    started_at: dt.datetime
    status: Status
    requested_at: dt.datetime
    result: SimulationResult | None = None
    # The examiner's voice, for the model answers.
    voice: str = EXAMINER_VOICE


class ExamRepository(Protocol):
    def started(self, user_id: UUID, language: str, simulation: Simulation) -> None:
        """Keeps a simulation that has just ended, waiting for its score."""

    def request(
        self, call_id: str, at: dt.datetime, *, stale_before: dt.datetime, max_requests: int
    ) -> bool:
        """Asks again for a score that failed or was lost, at most `max_requests` times in all;
        says whether this caller is to start the scorer. One step."""

    def written(self, call_id: str, status: Status, result: SimulationResult | None) -> None: ...

    def load(self, user_id: UUID, call_id: str) -> Simulation | None: ...

    def listed(self, user_id: UUID, language: str, limit: int) -> list[Simulation]:
        """The learner's simulations in a language, newest first."""

    def count(self, user_id: UUID, exam: str) -> int:
        """How many simulations of a speaking test the learner did."""


class ExamStarter(Protocol):
    def start(self, call_id: str) -> None:
        """Has a simulation scored, in the background."""


@dataclass(frozen=True)
class LearnerExam:
    """The exam the learner named in their profile."""

    type: str
    target_level: str | None
    date: dt.date | None


@dataclass(frozen=True)
class ExamCentre:
    language: str
    exam: LearnerExam | None
    # The speaking test of the learner's exam; None when it has none.
    suggested: str | None
    formats: tuple[SpeakingExam, ...]
    simulations: tuple[Simulation, ...]
    # Per speaking test the learner tried.
    readiness: Mapping[str, Readiness]


@dataclass(frozen=True)
class NextSimulation:
    exam: SpeakingExam
    # One per part, in order.
    cards: tuple[ExamCard, ...]


# --- The examiner --------------------------------------------------------------------------------


def _function(name: str, description: str, properties: dict[str, Any]) -> dict[str, Any]:
    return {
        "type": "function",
        "name": name,
        "description": description,
        "parameters": {
            "type": "object",
            "properties": properties,
            "required": list(properties),
            "additionalProperties": False,
        },
    }


class ExamTools:
    """The examiner's tools for one simulation."""

    def __init__(self, exam: SpeakingExam) -> None:
        self._exam = exam
        # The parts begun, in order.
        self.parts: list[str] = []

    def definitions(self) -> list[dict[str, Any]]:
        parts = [part.id for part in self._exam.parts]
        return [
            _function(
                "begin_part",
                "Call before you introduce each part of the exam, with its id.",
                {"part": {"type": "string", "enum": parts}},
            ),
            _function("end_exam", "Call when the last part is over, before saying goodbye.", {}),
        ]

    def run(self, name: str, arguments: dict[str, Any]) -> ToolResult:
        if name == "begin_part":
            part = self._exam.part(str(arguments.get("part", "")))
            if part is None:
                return ToolResult({"done": False, "reason": "invalid_value"})
            self.parts.append(part.id)
            # The app follows the call's events and shows the part's card and its time.
            return ToolResult({"part": part.id, "seconds": part.seconds})
        if name == "end_exam":
            return ToolResult({"done": True}, finished=True)
        return ToolResult({"done": False, "reason": "unknown_tool"})


def _card_text(card: ExamCard) -> str:
    return "; ".join((card.title, *card.prompts))


def examiner_instructions(exam: SpeakingExam, cards: Sequence[ExamCard], target: str) -> str:
    parts = "\n".join(
        f"- {part.id} ({part.title}, about {part.seconds // 60} min {part.seconds % 60} s): "
        f"{part.task} The learner's card: {_card_text(card)}."
        + (f" Only you know: {card.examiner}" if card.examiner else "")
        for part, card in zip(exam.parts, cards, strict=True)
    )
    return f"""# Who you are
You are the examiner of a simulated speaking test, the {exam.name}, in {target}. Neutral, calm
and formal: you address the learner as "Sie" and never use first names. If asked your name, you
are Frau Becker. Speak only {target}.

# The test
Run these parts in this order. Before introducing each one, call begin_part with its id; the
learner then sees its card. Say in one or two sentences what the part asks, then let them do it.
Keep to each part's time: when it is up, close the part briefly and go on.
{parts}
When a part needs another candidate ("plan something together", a discussion, feedback on a
presentation), you take that role too: say once that you play the other candidate, then act as
one, with your own ideas and objections, briefly.

# Rules
- Do not help: no corrections, no hints, no translations, no teaching, no praise of answers.
- If the learner says nothing for a while, repeat the task or point to the next item of their
  card, once. Never answer for them.
- Speak little: the learner should do most of the talking.
- When the last part is over, call end_exam, then thank them and say the test is over, in one
  sentence. Say nothing about how they did: the score comes afterwards.
"""


class ExamScript:
    """A simulation as a call (`CallScript` in `voice.py`). Its scenario is the speaking test."""

    def __init__(self, exams: "ExamService") -> None:
        self._exams = exams

    def prepare(
        self,
        user_id: UUID,
        account: Account,
        today: dt.date,
        persona_id: UUID | None,
        scenario: str | None = None,
        practise: str | None = None,
    ) -> Briefing:
        return self._exams.briefing(user_id, scenario or "")

    def tools(self, user_id: UUID, scenario: str | None = None) -> ToolSet:
        return ExamTools(self._exams.speaking_exam(user_id, scenario or ""))

    def started(self, user_id: UUID) -> None:
        """Nothing is kept until the simulation is over."""

    def concluded(self, user_id: UUID, call_id: str, tools: ToolSet, call: FinishedCall) -> None:
        self._exams.concluded(user_id, call_id, call)


# --- Scoring -------------------------------------------------------------------------------------


class _Answer(BaseModel):
    model_config = ConfigDict(extra="forbid")


class _Marks(_Answer):
    task: int = Field(ge=0, le=MAX_MARK)
    coherence: int = Field(ge=0, le=MAX_MARK)
    vocabulary: int = Field(ge=0, le=MAX_MARK)
    grammar: int = Field(ge=0, le=MAX_MARK)


class _Part(_Answer):
    part: str
    marks: _Marks
    feedback: str = Field(min_length=1, max_length=FEEDBACK_MAX)
    model_answer: str = Field(min_length=1, max_length=MODEL_ANSWER_MAX)


class _Scored(_Answer):
    parts: list[_Part]
    summary: str = Field(min_length=1, max_length=SUMMARY_MAX)


def _schema(parts: Sequence[str]) -> dict[str, Any]:
    mark = {"type": "integer", "minimum": 0, "maximum": MAX_MARK}
    return answer_object(
        {
            "parts": answer_list(
                answer_object(
                    {
                        "part": {"type": "string", "enum": list(parts)},
                        "marks": answer_object(dict.fromkeys(CRITERIA, mark)),
                        "feedback": {"type": "string"},
                        "model_answer": {"type": "string"},
                    }
                ),
                len(parts),
            ),
            "summary": {"type": "string"},
        }
    )


def _scorer_instructions(exam: SpeakingExam, target: str, explanation: str) -> str:
    level = "/".join(exam.levels)
    return f"""You score a simulated speaking test, the {exam.name} ({level}), from what was
written down of it. The examiner ran its parts in order; find each part in the transcript.

Give every part 0 to {MAX_MARK} points on each criterion, judged at {level}:
- task: did the learner do what the part and its card asked, all of it, at the expected length?
- coherence: is it connected and easy to follow (linking words, order, reacting to the other)?
- vocabulary: range and fitness of the words for the task and the level.
- grammar: accuracy and range of structures for the level.
{MAX_MARK} meets the level fully, 2 is just about at it, 0 shows nothing of it. A part the
learner did not do gets 0 on every criterion. Pronunciation is not judged: the transcript cannot
show it. Be fair and strict, as an examiner is: this is an estimate the learner relies on.

For each part write feedback in {explanation}: two or three sentences, specific, quoting the
learner's own words in {target} where it helps, naming what to do better. Write a model answer
in {target}: what a strong candidate at {level} would say for this card, 60 to 120 words, as
spoken. Then a summary in {explanation}: in two sentences, the most important thing to work on.
"""


# --- The service ---------------------------------------------------------------------------------


class ExamService:
    def __init__(
        self,
        *,
        profiles: ProfileService,
        personas: PersonaService,
        conversations: ConversationService,
        sessions: VoiceSessionRepository,
        repository: ExamRepository,
        starter: ExamStarter,
        text_model: TextModel,
        model: str,
        sounds: Sounds,
        clock: Callable[[], dt.datetime],
    ) -> None:
        self._profiles = profiles
        self._personas = personas
        self._conversations = conversations
        self._sessions = sessions
        self._repository = repository
        self._starter = starter
        self._text_model = text_model
        # An empty name: simulations are not scored.
        self._model = model
        self._sounds = sounds
        self._clock = clock

    def _formats(self, user_id: UUID) -> tuple[str, tuple[SpeakingExam, ...]]:
        language = self._profiles.get(user_id).target_language or ""
        pack = self._profiles.catalog.available_pack(language)
        return language, pack.speaking_exams if pack else ()

    def speaking_exam(self, user_id: UUID, exam_id: str) -> SpeakingExam:
        """A speaking test of the learner's language. Raises `ScenarioError("not_found")`."""
        _, formats = self._formats(user_id)
        found = next((exam for exam in formats if exam.id == exam_id), None)
        if found is None:
            raise ScenarioError("not_found")
        return found

    def centre(self, user_id: UUID) -> ExamCentre:
        language, formats = self._formats(user_id)
        stored: dict[str, Any] | None = self._profiles.get(user_id).value(language, "exam")
        exam = (
            LearnerExam(
                stored["type"],
                stored.get("target_level"),
                dt.date.fromisoformat(stored["date"]) if stored.get("date") else None,
            )
            if stored
            else None
        )
        suggested = format_for(formats, exam.type, exam.target_level) if exam else None
        simulations = tuple(self._repository.listed(user_id, language, LISTED))
        results: dict[str, list[tuple[dt.datetime, dict[str, float]]]] = {}
        for simulation in simulations:
            if simulation.result is not None:
                shares = {part.part: part.share for part in simulation.result.parts}
                results.setdefault(simulation.exam, []).append((simulation.started_at, shares))
        pass_shares = {found.id: found.pass_share for found in formats}
        ready = {
            exam_id: progress
            for exam_id, found in results.items()
            if (progress := readiness(found, pass_share=pass_shares.get(exam_id, 0.6)))
        }
        return ExamCentre(
            language=language,
            exam=exam,
            suggested=suggested.id if suggested else None,
            formats=formats,
            simulations=simulations,
            readiness=ready,
        )

    def next(self, user_id: UUID, exam_id: str) -> NextSimulation:
        """The cards of the learner's next simulation of a speaking test: they take turns."""
        exam = self.speaking_exam(user_id, exam_id)
        return NextSimulation(exam, cards_for(exam, self._repository.count(user_id, exam.id)))

    def _voice(self, user_id: UUID) -> str:
        """The exam coach's voice among the learner's partners, or the examiner's own."""
        coaches = [p for p in self._personas.partners(user_id) if p.role == "exam_coach"]
        return coaches[0].voice if coaches else EXAMINER_VOICE

    def briefing(self, user_id: UUID, exam_id: str) -> Briefing:
        upcoming = self.next(user_id, exam_id)
        language = self._profiles.get(user_id).target_language or ""
        target = self._profiles.catalog.english_name(language)
        return Briefing(
            examiner_instructions(upcoming.exam, upcoming.cards, target),
            voice=self._voice(user_id),
            hearing=Hearing(language, verbatim_prompt(target)),
        )

    def concluded(self, user_id: UUID, call_id: str, call: FinishedCall) -> None:
        """Keeps a simulation that has ended and has it scored."""
        session = self._sessions.get(call_id)
        if session is None or session.scenario is None:
            return
        upcoming = self.next(user_id, session.scenario)
        now = self._clock()
        self._repository.started(
            user_id,
            self._profiles.get(user_id).target_language or "",
            Simulation(
                call_id=call_id,
                exam=upcoming.exam.id,
                cards=tuple(card.id for card in upcoming.cards),
                started_at=call.ended_at,
                status="pending",
                requested_at=now,
                voice=self._voice(user_id),
            ),
        )
        self._starter.start(call_id)

    def result(self, user_id: UUID, call_id: str) -> Simulation:
        simulation = self._repository.load(user_id, call_id)
        if simulation is None:
            raise ExamError("not_found")
        return simulation

    def cards_of(self, user_id: UUID, simulation: Simulation) -> tuple[ExamCard, ...]:
        """The cards a simulation was done with, in the order of its parts."""
        exam = self.speaking_exam(user_id, simulation.exam)
        cards = {card.id: card for part in exam.parts for card in part.cards}
        return tuple(cards[card_id] for card_id in simulation.cards if card_id in cards)

    def retry(self, user_id: UUID, call_id: str) -> Simulation:
        """Asks again for a score that failed. Raises `ExamError` (`not_found`, `score_limit`)."""
        simulation = self.result(user_id, call_id)
        if simulation.status not in ("failed", "pending"):
            return simulation
        now = self._clock()
        if self._repository.request(
            call_id, now, stale_before=now - STALE_AFTER, max_requests=MAX_REQUESTS
        ):
            self._starter.start(call_id)
            return self.result(user_id, call_id)
        if simulation.status == "failed":
            raise ExamError("score_limit")
        return simulation

    def score(self, call_id: str) -> None:
        """Scores a simulation waiting for it (the worker's job). Whose it is comes from the
        stored call, so a forged invocation cannot point at someone else's data."""
        session = self._sessions.get(call_id)
        if session is None:
            return
        user_id = session.user_id
        simulation = self._repository.load(user_id, call_id)
        if simulation is None or simulation.status != "pending":
            return
        turns = self._conversations.turns(call_id)
        if sum(1 for turn in turns if turn.speaker == "learner") < MIN_LEARNER_TURNS:
            self._repository.written(call_id, "too_short", None)
            return
        if not self._model:
            self._repository.written(call_id, "failed", None)
            return
        exam = self.speaking_exam(user_id, simulation.exam)
        cards = {card.id: card for part in exam.parts for card in part.cards}
        profile = self._profiles.get(user_id)
        language = profile.target_language or ""
        explanation = profile.value(language, "explanation_language") or "en"
        catalog = self._profiles.catalog
        content = {
            "parts": [
                {
                    "id": part.id,
                    "title": part.title,
                    "task": part.task,
                    "seconds": part.seconds,
                    "card": {"title": card.title, "prompts": list(card.prompts)}
                    if (card := cards.get(card_id))
                    else None,
                }
                for part, card_id in zip(exam.parts, simulation.cards, strict=False)
            ],
            "transcript": [
                {
                    "speaker": "learner" if turn.speaker == "learner" else "examiner",
                    "text": turn.said,
                }
                for turn in turns
            ],
        }
        task = TextTask(
            model=self._model,
            instructions=_scorer_instructions(
                exam, catalog.english_name(language), catalog.english_name(explanation)
            ),
            content=json.dumps(content, ensure_ascii=False),
            answer_name="exam_score",
            answer_schema=_schema([part.id for part in exam.parts]),
            charge=Charge(user_id, Feature.EXAM_SCORE),
        )
        try:
            scored = _Scored.model_validate(self._text_model.answer(task))
        except (TextModelError, ValidationError):
            self._repository.written(call_id, "failed", None)
            return
        by_part = {part.part: part for part in scored.parts}
        if set(by_part) != {part.id for part in exam.parts}:
            self._repository.written(call_id, "failed", None)
            return
        result = SimulationResult(
            parts=tuple(
                PartScore(
                    part.id,
                    by_part[part.id].marks.model_dump(),
                    by_part[part.id].feedback,
                    by_part[part.id].model_answer,
                )
                for part in exam.parts
            ),
            summary=scored.summary,
            pass_share=exam.pass_share,
        )
        self._repository.written(call_id, "ready", result)

    def audio(self, user_id: UUID, call_id: str, part_id: str) -> str:
        """Where a part's model answer plays from, in the examiner's voice, made the first
        time. Raises `ExamError` (`not_found`, `unavailable`)."""
        simulation = self.result(user_id, call_id)
        part = simulation.result.part(part_id) if simulation.result else None
        if part is None:
            raise ExamError("not_found")
        if not self._sounds.available:
            raise ExamError("unavailable")
        try:
            return self._sounds.address(
                f"users/{user_id}/exams/{call_id}-{part_id}-",
                simulation.voice,
                part.model_answer,
                Charge(user_id, Feature.EXAM_AUDIO),
            )
        except SpeechError as error:
            raise ExamError("unavailable") from error
