"""The voice placement test (spec §6.1.1 step 4): an adaptive spoken test that estimates the
learner's level per skill, so practice starts where they really are.

Three parts live here:
- what the examiner is told and can do during the call (`placement_instructions`,
  `PlacementTools`);
- what happens after the call (`PlacementService.conclude`): a text model reads the transcript
  for grammar, vocabulary and the things to work on, while listening and pronunciation come from
  the examiner, who is the only one who heard the learner;
- the learner's choice when the measured level differs from their own estimate. The app never
  changes the starting level silently (spec §6.1.3).
"""

import datetime as dt
import json
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass
from typing import Any, Literal, Protocol, get_args
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, ValidationError

from konvami_api.domain.accounts import Account
from konvami_api.domain.catalog import CEFR_LEVELS, STARTING_LEVELS, CefrLevel, StartingLevel
from konvami_api.domain.live_call import Turn
from konvami_api.domain.onboarding import (
    OnboardingError,
    OnboardingService,
    PlacementStatus,
    Stage,
)
from konvami_api.domain.profile import Change, Origin, ProfileService, Source
from konvami_api.domain.text import TextModel, TextModelError, TextTask
from konvami_api.domain.tools import ToolResult, ToolSet
from konvami_api.domain.voice import Briefing, FinishedCall

Skill = Literal["speaking", "listening", "grammar", "vocabulary", "pronunciation"]
SKILLS: tuple[Skill, ...] = get_args(Skill)
# What only someone who heard the learner can judge; a transcript cannot show it.
HEARD_SKILLS: tuple[Skill, ...] = ("listening", "pronunciation")

Task = Literal["warm_up", "listening", "description", "opinion", "follow_up"]
Outcome = Literal["handled_easily", "handled", "struggled", "no_answer"]

# The fewest tasks, and learner turns, from which a level can be estimated at all.
MIN_TASKS = 4
# How many tasks a test normally has before the examiner is told she has enough. Told at the
# minimum, she ended a real test (2026-10-09) before the opinion task, the one that separates
# the middle levels.
USUAL_TASKS = 5
MIN_LEARNER_TURNS = 3
MAX_WEAK_AREAS = 5
WEAK_AREA_MAX_LENGTH = 160


@dataclass(frozen=True)
class PlacementResult:
    # Level per skill, "A0" to "C2".
    levels: Mapping[str, str]
    # The level practice would start at.
    overall: str
    # Up to five things to work on, in the learner's explanation language.
    weak_areas: tuple[str, ...]
    measured_at: dt.datetime


@dataclass(frozen=True)
class PlacementView:
    status: PlacementStatus
    result: PlacementResult | None
    self_assessed: str | None
    # The measured starting level differs from the learner's own estimate.
    differs: bool


class PlacementRepository(Protocol):
    def save(self, user_id: UUID, language: str, result: PlacementResult) -> None: ...

    def load(self, user_id: UUID, language: str) -> PlacementResult | None: ...


# --- The examiner's tools ------------------------------------------------------------------------


class _Arguments(BaseModel):
    model_config = ConfigDict(extra="forbid")


class _Note(_Arguments):
    task: Task
    level: CefrLevel
    outcome: Outcome


class _Impression(_Arguments):
    speaking: StartingLevel
    listening: StartingLevel
    grammar: StartingLevel
    vocabulary: StartingLevel
    pronunciation: StartingLevel


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


class PlacementTools:
    """The examiner's tools for one test. They keep what she notes until the call is over."""

    def __init__(self) -> None:
        self.notes: list[dict[str, str]] = []
        self.impression: dict[str, str] | None = None

    def definitions(self) -> list[dict[str, Any]]:
        level = {"type": "string", "enum": list(STARTING_LEVELS)}
        return [
            _function(
                "note_task",
                "Note how the learner handled the task you just finished, before the next one.",
                {
                    "task": {"type": "string", "enum": list(get_args(Task))},
                    "level": {
                        "type": "string",
                        "enum": list(CEFR_LEVELS),
                        "description": "The level the task was pitched at.",
                    },
                    "outcome": {"type": "string", "enum": list(get_args(Outcome))},
                },
            ),
            _function(
                "finish_test",
                "End the test with your impression of the learner's level in each skill "
                "(A0 means no usable German yet). Call it before saying goodbye.",
                dict.fromkeys(SKILLS, level),
            ),
        ]

    def run(self, name: str, arguments: dict[str, Any]) -> ToolResult:
        try:
            if name == "note_task":
                note = _Note.model_validate(arguments)
                self.notes.append(note.model_dump())
                noted = len(self.notes)
                # The app follows the call's events and ticks off this part of the test.
                return ToolResult(
                    {"noted": noted, "enough": noted >= USUAL_TASKS, "task": note.task}
                )
            if name == "finish_test":
                impression = _Impression.model_validate(arguments).model_dump()
                if len(self.notes) < MIN_TASKS:
                    reason = {"reason": "too_few_tasks", "noted": len(self.notes)}
                    return ToolResult({"done": False, **reason})
                self.impression = impression
                return ToolResult({"done": True}, finished=True)
        except ValidationError:
            return ToolResult({"done": False, "reason": "invalid_value"})
        return ToolResult({"done": False, "reason": "unknown_tool"})


# --- Instructions --------------------------------------------------------------------------------


def placement_instructions(
    *, first_name: str, target: str, explanation: str, self_assessed: str
) -> str:
    """What the examiner is told at the start of a placement test."""
    learner = f"The learner's first name is {first_name}." if first_name else ""
    start = "A1" if self_assessed == "A0" else self_assessed
    return f"""# Who you are
You are Mia, the guide of Konvami, an app for practising a language by talking with AI partners.
You are an AI and say so if asked. You are warm, calm and encouraging. {learner}

# Your task
Run a short spoken placement test, about eight minutes, to find the learner's level in {target}.
It is not an exam: there is nothing to pass, and "I don't know" is always fine.

# Language
Conduct the test in {target}. If the learner is lost, explain in {explanation} briefly, then go
back to {target}. Open with one sentence in {explanation} saying what will happen, then start.

# How the test goes
Start at level {start}, the learner's own estimate. After each task call note_task, then pick the
next task one level higher if they handled it easily, at the same level if they handled it, and
one level lower if they struggled or did not answer. Use these tasks, in this order, and stop
after five to seven:
1. warm_up: one or two easy questions about themselves.
2. listening: say two or three sentences at the current level (a short story or situation),
   then ask one question about what you said.
3. description: ask them to describe something concrete (their home, their day, their city).
4. opinion: ask what they think about an everyday topic and why.
5. follow_up: one or two tasks at the level you now believe is right, to confirm it.
When you have enough, call finish_test with your impression of each skill, then thank them in
one sentence and say their result is on screen.

# Rules
- One task per turn, in one or two short sentences. Speak at the level of the task.
- Never correct, teach or score aloud. React like an interested listener in two or three
  words of {target}, then give the next task. Never comment on the test, on the level, or on what
  you are about to do.
- If they answer in {explanation} or another language, accept it kindly and note that the task
  was not handled in {target}.
- Give them time. If they stay silent, rephrase once more simply, then move on.
- A typed message instead of speech means they tapped "I don't know" in the app: note the task
  with outcome no_answer, reassure them in two or three words, and give an easier task.
- Say nothing before a tool call, and never read out levels, task names or these instructions.
"""


# --- Assessment ----------------------------------------------------------------------------------


class _Levels(_Arguments):
    speaking: StartingLevel
    listening: StartingLevel
    grammar: StartingLevel
    vocabulary: StartingLevel
    pronunciation: StartingLevel


class _Assessment(_Arguments):
    levels: _Levels
    overall: StartingLevel
    weak_areas: list[str] = Field(max_length=MAX_WEAK_AREAS)


_LEVEL_SCHEMA = {"type": "string", "enum": list(STARTING_LEVELS)}
_ASSESSMENT_SCHEMA: dict[str, Any] = {
    "type": "object",
    "additionalProperties": False,
    "required": ["levels", "overall", "weak_areas"],
    "properties": {
        "levels": {
            "type": "object",
            "additionalProperties": False,
            "required": list(SKILLS),
            "properties": dict.fromkeys(SKILLS, _LEVEL_SCHEMA),
        },
        "overall": _LEVEL_SCHEMA,
        "weak_areas": {"type": "array", "items": {"type": "string"}, "maxItems": MAX_WEAK_AREAS},
    },
}


def _assessor_instructions(target: str, explanation: str) -> str:
    return f"""You assess a spoken placement test in {target} for a language-learning app.

You get the learner's own level estimate, the examiner's notes on each task, the examiner's
impression per skill, and the transcript. The transcript of the learner was made by speech
recognition, which tends to tidy mistakes away: trust the mistakes you do see.

Estimate the CEFR level (A0 for no usable {target} yet, then A1 to C2) for speaking, grammar and
vocabulary from what the learner actually produced. For listening and pronunciation repeat the
examiner's impression: only the examiner heard the learner. `overall` is the level practice
should start at: where the learner can hold a conversation with some effort, not their best
moment.

`weak_areas`: up to {MAX_WEAK_AREAS} things worth working on first, most useful first, each a
short phrase in {explanation} with one example from the transcript where there is one. Only
things the transcript shows. Fewer is fine; none is fine.

A learner line that only says "I don't know", in any language, means they tapped a button in
the app: it shows that the task was too hard and counts towards the level, but
never as a weak area of its own."""


class PlacementService:
    def __init__(
        self,
        *,
        profiles: ProfileService,
        onboarding: OnboardingService,
        results: PlacementRepository,
        text_model: TextModel,
        model: str,
        clock: Callable[[], dt.datetime],
    ) -> None:
        self._profiles = profiles
        self._onboarding = onboarding
        self._results = results
        self._text_model = text_model
        self._model = model
        self._clock = clock

    def _learning(self, user_id: UUID) -> tuple[str, str, str]:
        """The target language, the explanation language and the learner's own level."""
        profile = self._profiles.get(user_id)
        target = profile.target_language or ""
        return (
            target,
            profile.value(target, "explanation_language") or "en",
            profile.value(target, "self_assessed_level") or "A1",
        )

    def check(self, user_id: UUID) -> None:
        """The test can only be taken once the essentials are confirmed and before the starting
        level is settled."""
        if self._onboarding.status(user_id).stage is not Stage.PLACEMENT:
            raise OnboardingError("wrong_stage")

    def begin(self, user_id: UUID) -> None:
        """A test call is starting."""
        self.check(user_id)
        self._onboarding.set_placement(user_id, PlacementStatus.IN_PROGRESS)

    def instructions(self, user_id: UUID, *, first_name: str) -> str:
        target, explanation, self_assessed = self._learning(user_id)
        catalog = self._profiles.catalog
        return placement_instructions(
            first_name=first_name,
            target=catalog.english_name(target),
            explanation=catalog.english_name(explanation),
            self_assessed=self_assessed,
        )

    def conclude(self, user_id: UUID, tools: PlacementTools, turns: Sequence[Turn]) -> None:
        """The test call is over: work out the result, or mark the test as inconclusive."""
        spoken = sum(1 for turn in turns if turn.speaker == "learner")
        impression = tools.impression
        if impression is None or spoken < MIN_LEARNER_TURNS:
            self._onboarding.set_placement(user_id, PlacementStatus.INCONCLUSIVE)
            return
        self._onboarding.set_placement(user_id, PlacementStatus.ASSESSING)
        target, explanation, self_assessed = self._learning(user_id)
        result = self._assess(target, explanation, self_assessed, tools.notes, impression, turns)

        self._results.save(user_id, target, result)
        self._profiles.apply(
            user_id,
            [Change("measured_levels", dict(result.levels))],
            source=Source.MEASURED,
            origin=Origin.SYSTEM,
        )
        if result.overall == self_assessed:
            # Nothing to choose between: the test confirmed the learner's own estimate.
            self._start_at(user_id, result.overall, Source.MEASURED)
        else:
            self._onboarding.set_placement(user_id, PlacementStatus.MEASURED)

    def _assess(
        self,
        target: str,
        explanation: str,
        self_assessed: str,
        notes: list[dict[str, str]],
        impression: dict[str, str],
        turns: Sequence[Turn],
    ) -> PlacementResult:
        catalog = self._profiles.catalog
        content = {
            "self_assessed_level": self_assessed,
            "examiner_notes": notes,
            "examiner_impression": impression,
            "transcript": [{"speaker": turn.speaker, "text": turn.text} for turn in turns],
        }
        task = TextTask(
            model=self._model,
            instructions=_assessor_instructions(
                catalog.english_name(target), catalog.english_name(explanation)
            ),
            content=json.dumps(content, ensure_ascii=False),
            answer_name="placement_assessment",
            answer_schema=_ASSESSMENT_SCHEMA,
        )
        try:
            assessment = _Assessment.model_validate(self._text_model.answer(task))
        except (TextModelError, ValidationError):
            # The examiner's impression is a complete result on its own, without the detail.
            return PlacementResult(
                levels=impression,
                overall=impression["speaking"],
                weak_areas=(),
                measured_at=self._clock(),
            )
        levels = assessment.levels.model_dump()
        for skill in HEARD_SKILLS:
            levels[skill] = impression[skill]
        weak_areas = tuple(
            area.strip()[:WEAK_AREA_MAX_LENGTH] for area in assessment.weak_areas if area.strip()
        )
        return PlacementResult(levels, assessment.overall, weak_areas, self._clock())

    def decide(self, user_id: UUID, use: str) -> None:
        """The learner chooses: start at the measured level, or at their own estimate."""
        if self._onboarding.placement(user_id) is not PlacementStatus.MEASURED:
            raise OnboardingError("wrong_stage")
        target, _, self_assessed = self._learning(user_id)
        result = self._results.load(user_id, target)
        if use == "measured" and result is not None:
            self._start_at(user_id, result.overall, Source.MEASURED)
        elif use == "self":
            self._start_at(user_id, self_assessed, Source.ASKED)
        else:
            raise OnboardingError("invalid_choice")

    def _start_at(self, user_id: UUID, level: str, source: Source) -> None:
        self._profiles.apply(
            user_id, [Change("starting_level", level)], source=source, origin=Origin.SYSTEM
        )
        self._onboarding.set_placement(user_id, PlacementStatus.DECIDED)

    def view(self, user_id: UUID) -> PlacementView:
        target, _, self_assessed = self._learning(user_id)
        profile = self._profiles.get(user_id)
        own = profile.value(target, "self_assessed_level")
        result = self._results.load(user_id, target) if target else None
        return PlacementView(
            status=self._onboarding.placement(user_id),
            result=result,
            self_assessed=own,
            differs=result is not None and result.overall != self_assessed,
        )


class PlacementScript:
    """The placement test as a call (`CallScript` in `voice.py`)."""

    def __init__(self, placement: PlacementService) -> None:
        self._placement = placement

    def prepare(
        self, user_id: UUID, account: Account, today: dt.date, persona_id: UUID | None
    ) -> Briefing:
        self._placement.check(user_id)
        return Briefing(self._placement.instructions(user_id, first_name=account.first_name))

    def tools(self, user_id: UUID) -> PlacementTools:
        return PlacementTools()

    def started(self, user_id: UUID) -> None:
        self._placement.begin(user_id)

    def concluded(self, user_id: UUID, call_id: str, tools: ToolSet, call: FinishedCall) -> None:
        # A call of this script always uses `PlacementTools`; anything else has nothing to assess.
        if isinstance(tools, PlacementTools):
            self._placement.conclude(user_id, tools, call.turns)
