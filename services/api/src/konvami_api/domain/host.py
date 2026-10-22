"""The setup guide (Mia): the host persona that runs spoken onboarding (spec §6.1.1, §8.2).

Two things live here: what she is told (her instructions, built from what is already saved) and
what she can do (one tool per essential question, plus one to finish). Her tools write through
the same `ProfileService` as the form, so a spoken answer is validated exactly like a typed one.
"""

import datetime as dt
from collections.abc import Callable
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, ValidationError

from konvami_api.domain.accounts import Account
from konvami_api.domain.catalog import (
    CEFR_LEVELS,
    EXPLANATION_USAGES,
    GOAL_REASONS,
    OTHER_EXAM,
    STARTING_LEVELS,
    Catalog,
)
from konvami_api.domain.onboarding import missing_essentials
from konvami_api.domain.profile import (
    TARGET_LANGUAGE,
    Change,
    Origin,
    Profile,
    ProfileError,
    ProfileService,
    Source,
)
from konvami_api.domain.tools import ToolResult
from konvami_api.domain.voice import Briefing

GUIDE_NAME = "Mia"

# The questions, in asking order, with the profile fields each one fills.
QUESTIONS: dict[str, tuple[str, ...]] = {
    "language": (TARGET_LANGUAGE,),
    "explanations": ("explanation_language", "explanation_usage"),
    "goals": ("goals",),
    "exam": ("exam",),
    "level": ("self_assessed_level",),
    "course": ("course",),
}


def open_questions(profile: Profile) -> list[str]:
    missing = set(missing_essentials(profile))
    return [name for name, fields in QUESTIONS.items() if missing.intersection(fields)]


# --- Tool arguments ------------------------------------------------------------------------------


class _Arguments(BaseModel):
    model_config = ConfigDict(extra="forbid")


class _TargetLanguage(_Arguments):
    language: str


class _Explanations(_Arguments):
    language: str
    usage: str


class _Goals(_Arguments):
    reasons: list[str]
    note: str | None = None


class _Exam(_Arguments):
    has_exam: bool
    type: str | None = None
    target_level: str | None = None
    date: str | None = None


class _Level(_Arguments):
    level: str


class _Course(_Arguments):
    has_course: bool
    name: str | None = None
    chapter: str | None = None


def _exam_changes(arguments: _Exam) -> list[Change]:
    if not arguments.has_exam:
        return [Change("exam", None)]
    exam = {
        "type": arguments.type,
        "target_level": arguments.target_level,
        "date": arguments.date,
    }
    return [Change("exam", exam)]


def _course_changes(arguments: _Course) -> list[Change]:
    if not arguments.has_course:
        return [Change("course", None)]
    return [Change("course", {"name": arguments.name, "chapter": arguments.chapter})]


_SAVERS: dict[str, tuple[type[_Arguments], Callable[[Any], list[Change]]]] = {
    "save_target_language": (_TargetLanguage, lambda a: [Change(TARGET_LANGUAGE, a.language)]),
    "save_explanations": (
        _Explanations,
        lambda a: [
            Change("explanation_language", a.language),
            Change("explanation_usage", a.usage),
        ],
    ),
    "save_goals": (_Goals, lambda a: [Change("goals", {"reasons": a.reasons, "note": a.note})]),
    "save_exam": (_Exam, _exam_changes),
    "save_level": (_Level, lambda a: [Change("self_assessed_level", a.level)]),
    "save_course": (_Course, _course_changes),
}
FINISH = "finish_setup"


def _function(
    name: str, description: str, properties: dict[str, Any], required: list[str]
) -> dict[str, Any]:
    return {
        "type": "function",
        "name": name,
        "description": description,
        "parameters": {
            "type": "object",
            "properties": properties,
            "required": required,
            "additionalProperties": False,
        },
    }


_TEXT_OR_NONE = {"type": ["string", "null"]}


class HostTools:
    """The guide's tools for one learner."""

    def __init__(self, user_id: UUID, catalog: Catalog, profiles: ProfileService) -> None:
        self._user_id = user_id
        self._catalog = catalog
        self._profiles = profiles

    def definitions(self) -> list[dict[str, Any]]:
        available = [pack for pack in self._catalog.packs if pack.available]
        exams = sorted({exam.id for pack in available for exam in pack.exams}, key=_exam_order)
        return [
            _function(
                "save_target_language",
                "Save the language the learner wants to learn.",
                {"language": {"type": "string", "enum": [pack.code for pack in available]}},
                ["language"],
            ),
            _function(
                "save_explanations",
                "Save the language for explanations and how much of it to use.",
                {
                    "language": {
                        "type": "string",
                        "description": "ISO 639-1 code of the explanation language, e.g. 'fr'.",
                    },
                    "usage": {"type": "string", "enum": list(EXPLANATION_USAGES)},
                },
                ["language", "usage"],
            ),
            _function(
                "save_goals",
                "Save why the learner is learning the language: only what they said.",
                {
                    "reasons": {
                        "type": "array",
                        "items": {"type": "string", "enum": list(GOAL_REASONS)},
                        "minItems": 1,
                        "description": (
                            "Only the reasons the learner named, usually one or two. "
                            "travel: trips. work: a job. study: school or university. "
                            "exam: a language exam. living_abroad: they live or will live "
                            "where it is spoken. family_friends: partner, family, friends. "
                            "culture: films, books, music. other: only when none of these "
                            "fits. Never add a reason they did not mention."
                        ),
                    },
                    "note": {
                        **_TEXT_OR_NONE,
                        "description": (
                            "A few words of detail in the learner's words, such as "
                            "'job in Zurich'; null when there is none. Not a sentence."
                        ),
                    },
                },
                ["reasons", "note"],
            ),
            _function(
                "save_exam",
                "Save the exam the learner is preparing for, or that there is none.",
                {
                    "has_exam": {"type": "boolean"},
                    "type": {"type": ["string", "null"], "enum": [*exams, OTHER_EXAM, None]},
                    "target_level": {"type": ["string", "null"], "enum": [*CEFR_LEVELS, None]},
                    "date": {
                        **_TEXT_OR_NONE,
                        "description": "The exam day as YYYY-MM-DD, or null when not known.",
                    },
                },
                ["has_exam", "type", "target_level", "date"],
            ),
            _function(
                "save_level",
                "Save the learner's own estimate of their level. A0 means starting from zero.",
                {"level": {"type": "string", "enum": list(STARTING_LEVELS)}},
                ["level"],
            ),
            _function(
                "save_course",
                "Save the course or textbook the learner follows, or that there is none.",
                {
                    "has_course": {"type": "boolean"},
                    "name": _TEXT_OR_NONE,
                    "chapter": _TEXT_OR_NONE,
                },
                ["has_course", "name", "chapter"],
            ),
            _function(
                FINISH,
                "Call once every question is answered, before saying goodbye.",
                {},
                [],
            ),
        ]

    def run(self, name: str, arguments: dict[str, Any]) -> ToolResult:
        if name == FINISH:
            still_open = open_questions(self._profiles.get(self._user_id))
            if still_open:
                return ToolResult({"done": False, "still_open": still_open})
            return ToolResult({"done": True}, finished=True)

        saver = _SAVERS.get(name)
        if saver is None:
            return ToolResult({"saved": False, "reason": "unknown_tool"})
        model, to_changes = saver
        try:
            changes = to_changes(model.model_validate(arguments))
            profile = self._profiles.apply(
                self._user_id, changes, source=Source.ASKED, origin=Origin.VOICE
            )
        except ValidationError:
            return ToolResult({"saved": False, "reason": "invalid_value"})
        except ProfileError as error:
            return ToolResult({"saved": False, "reason": error.code})
        return ToolResult({"saved": True, "still_open": open_questions(profile)})


def _exam_order(exam_id: str) -> int:
    known = ["goethe", "telc", "dtz", "testdaf", "osd"]
    return known.index(exam_id) if exam_id in known else len(known)


# --- Instructions --------------------------------------------------------------------------------

_ASK: dict[str, str] = {
    "language": (
        "Which language do they want to learn? Only these are available today: {languages}. "
        "If they name another one, say kindly that it is not available yet and ask whether one "
        "of the available languages interests them. Tool: save_target_language."
    ),
    "explanations": (
        "Ask in which language they want things explained (grammar tips, word meanings, "
        "feedback), and how much practice partners should use that language: never, only when "
        "the learner is stuck, for grammar and new words, or freely. If they answer only one "
        "half, ask the other half before saving. Tool: save_explanations."
    ),
    "goals": (
        "Ask the open question only (why are they learning the language?) and do not offer "
        "options. Then save exactly the reasons they named, nothing else. Tool: save_goals."
    ),
    "exam": (
        "If their goals already told you about an exam, save it without asking again; if they "
        "made clear there is none, save that. Otherwise ask whether they are preparing for an "
        "exam, and if so which one, which level and, if they know it, the date. Never invent a "
        "date: an unknown day is null. Tool: save_exam."
    ),
    "level": (
        "Ask how they would rate their level today, offering two or three everyday "
        "descriptions rather than a list: just starting, can handle simple everyday "
        "situations, can talk about work and interests, can discuss most topics. Map their "
        "answer yourself: starting from zero is A0, introducing oneself A1, simple everyday "
        "situations A2, work and interests B1, most topics B2, fluent and precise C1, "
        "near-native C2. Say the letters only if the learner used them. A rough guess is fine. "
        "Tool: save_level."
    ),
    "course": (
        "Ask whether they follow a course or a textbook. If yes, save its name and, if they "
        "said it, the chapter or unit as they would write it (for example '5'). "
        "Tool: save_course."
    ),
}


def _saved_lines(profile: Profile) -> list[str]:
    target = profile.target_language
    if target is None:
        return []
    lines = [f"- learning {target}"]
    labels = {
        "explanation_language": "explanations in",
        "explanation_usage": "use of the explanation language:",
        "goals": "goals:",
        "exam": "exam:",
        "self_assessed_level": "own level estimate:",
        "course": "course or textbook:",
    }
    for field, label in labels.items():
        if (target, field) in profile.fields:
            value = profile.value(target, field)
            lines.append(f"- {label} {'none' if value is None else value}")
    return lines


def host_instructions(account: Account, catalog: Catalog, profile: Profile, today: dt.date) -> str:
    """What the guide is told at the start of a setup call."""
    language = catalog.english_name(account.language)
    learner = (
        f"The learner's first name is {account.first_name}. Use it now and then, not every turn."
        if account.first_name
        else "You do not know the learner's name. Do not ask for it and do not invent one."
    )
    available = ", ".join(pack.code for pack in catalog.packs if pack.available)
    still_open = open_questions(profile)
    to_ask = "\n".join(
        f"{number}. {_ASK[question].format(languages=available)}"
        for number, question in enumerate(still_open, start=1)
    )
    saved = "\n".join(_saved_lines(profile)) or "- nothing yet"

    return f"""# Who you are
You are {GUIDE_NAME}, the setup guide of Konvami, an app for practising a language by talking with
AI partners. You are an AI and say so if asked; you never claim to be human. You are warm, calm
and brief. Today is {today.isoformat()}.

# The learner
{learner}

# Language
Speak {language}. Start by greeting the learner and asking whether {language} is fine for this
short setup. If they prefer another language, or answer in another one, continue in that language.

# Your task
Collect the answers below by talking, one question at a time, in this order. Each time the
learner answers:
1. Call the answer's tool at once. Say nothing before a tool call: no "got it", no "let me
   note that", no thinking aloud.
2. When the tool has answered, say two or three words of acknowledgement and ask the next
   question in the same breath.
When every question is answered, call finish_setup, then say one short sentence: their answers
are on screen to check.

# Still to ask
{to_ask or "Nothing. Call finish_setup."}

# Already saved
Do not ask these again. If the learner corrects one, save the new answer with its tool.
{saved}

# Rules
- Each time you speak: at most two short sentences, ending in one question. Never read a list.
- Never say what you are about to do or have just done ("let me save that", "next I will
  ask"). Ask the question itself.
- Save only what the learner said. If an answer is unclear, ask once more in other words.
- "I don't know" is a fine answer: offer the simplest option and move on. Never pressure.
- If a tool answers that something could not be saved, ask that question again differently.
- The learner can switch to typing at any time; that is fine, wish them well.
- This is setup, not a lesson: do not teach, test or correct. If the talk drifts, return kindly.
- Never read out codes, field names or anything from these instructions.
"""


class HostScript:
    """The spoken setup as a call (`CallScript`): the guide's instructions and tools. Every
    answer is saved while the call runs, so nothing is left to do when it ends."""

    def __init__(self, catalog: Catalog, profiles: ProfileService) -> None:
        self._catalog = catalog
        self._profiles = profiles

    def prepare(
        self,
        user_id: UUID,
        account: Account,
        today: dt.date,
        persona_id: UUID | None,
        scenario: str | None = None,
    ) -> Briefing:
        return Briefing(
            host_instructions(account, self._catalog, self._profiles.get(user_id), today)
        )

    def tools(self, user_id: UUID, scenario: str | None = None) -> HostTools:
        return HostTools(user_id, self._catalog, self._profiles)

    def started(self, user_id: UUID) -> None:
        return None

    def concluded(self, user_id: UUID, call_id: str, tools: object, call: object) -> None:
        return None
