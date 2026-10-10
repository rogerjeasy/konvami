"""A practice conversation with one of the learner's partners (spec §6.3 "free conversation").

Two things live here: what the partner is told (built for every call from who they are and what
is known about the learner, in the layers of spec §8.5) and what they can do (end the
conversation). The session report, memory and live corrections on screen build on this later.
"""

import datetime as dt
from dataclasses import dataclass
from typing import Any
from uuid import UUID

from konvami_api.domain.accounts import Account
from konvami_api.domain.conversations import ConversationService, PartnerHistory
from konvami_api.domain.onboarding import OnboardingError, OnboardingService, Stage
from konvami_api.domain.persona_parts import Role
from konvami_api.domain.personas import Persona, PersonaError, PersonaService
from konvami_api.domain.placement import PlacementService
from konvami_api.domain.profile import ProfileService
from konvami_api.domain.tools import ToolResult, ToolSet
from konvami_api.domain.voice import Briefing, FinishedCall

END = "end_conversation"
# Used when the profile has no level at all, which onboarding does not allow.
DEFAULT_LEVEL = "A1"


@dataclass(frozen=True)
class Learner:
    """What a partner is told about the person they talk to."""

    # Empty when the account has none.
    first_name: str
    # English names of the language being learned and the one used to explain.
    target: str
    explanation: str
    # How much of the explanation language the learner asked for (spec §6.1.2).
    explanation_usage: str
    level: str
    goals: dict[str, Any] | None
    # The exam as a phrase ("the Goethe-Zertifikat B1 exam on 2026-12-01"), or None.
    exam: str | None
    course: dict[str, Any] | None
    weak_areas: tuple[str, ...]
    # Earlier conversations with this partner; None before the first one.
    history: PartnerHistory | None


class PracticeTools:
    """A partner's tools. They keep nothing: every call gets the same ones."""

    def definitions(self) -> list[dict[str, Any]]:
        return [
            {
                "type": "function",
                "name": END,
                "description": (
                    "Call when the learner says goodbye or wants to stop, before your own goodbye."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {},
                    "required": [],
                    "additionalProperties": False,
                },
            }
        ]

    def run(self, name: str, arguments: dict[str, Any]) -> ToolResult:
        if name == END:
            return ToolResult({"done": True}, finished=True)
        return ToolResult({"done": False, "reason": "unknown_tool"})


# --- Instructions --------------------------------------------------------------------------------

# How to speak at each level (spec §6.9). Written without words of any one language: the
# language pack's own teaching notes are a later layer.
_SPEAKING: dict[str, str] = {
    "A0": (
        "Speak slowly and very clearly, with pauses between sentences. Use only the most common "
        "everyday words and short main clauses in the present tense. Say one short sentence, "
        "then ask one closed or either-or question about them, their family, their day or food. "
        "Repeat key words. If they do not follow, say it again with fewer words."
    ),
    "A1": (
        "Speak slowly and clearly, with pauses between sentences. Use common everyday words and "
        "short main clauses, in the present tense and the simplest past. Ask closed or "
        "either-or questions about them, their family, their day, food and their town. If they "
        "do not follow, say it again with fewer words."
    ),
    "A2": (
        "Speak a little more slowly than you normally would, in short clear sentences. Use "
        "everyday vocabulary and the common tenses for present, past and plans. Talk about "
        "daily life, work or studies, free time and simple plans. Ask simple open questions."
    ),
    "B1": (
        "Speak clearly at a moderate pace. Use main clauses and common subordinate clauses, and "
        "every common tense. Talk about work, interests, experiences, plans and what they "
        "think about everyday topics. Ask open questions, and now and then why."
    ),
    "B2": (
        "Speak at natural speed. Use complex sentences, every tense and common idioms. Talk "
        "about opinions, society, culture and abstract topics, and ask why and what if."
    ),
    "C1": (
        "Speak at natural speed, as you would to a native speaker: idioms, colloquial turns, "
        "nuance and humour. Discuss abstract and hypothetical questions and challenge their "
        "arguments."
    ),
}
_SPEAKING["C2"] = _SPEAKING["C1"]

# How much a partner says each time they speak. A real call (2026-10-10) showed the efficient
# model answering an A2 learner in five sentences with two questions until it was given a number.
_SHORT = "at most two short sentences"
_TURN: dict[str, str] = {
    "A0": _SHORT,
    "A1": _SHORT,
    "A2": _SHORT,
    "B1": "at most three sentences",
    "B2": "at most four sentences",
    "C1": "at most four sentences",
    "C2": "at most four sentences",
}

_EXPLANATION_USE: dict[str, str] = {
    "never": (
        "Never switch to {explanation}, even when asked: say it again more simply in {target}."
    ),
    "when_stuck": (
        "Use {explanation} only when the learner is clearly stuck: one short sentence of help, "
        "then straight back to {target}."
    ),
    "for_grammar": (
        "Use {explanation} to explain grammar or a new word, in one or two short sentences, "
        "then go back to {target}."
    ),
    "freely": (
        "Use {explanation} whenever it helps the learner, and keep most of the conversation in "
        "{target}."
    ),
}

_ROLE: dict[Role, str] = {
    "buddy": (
        "You are a casual friend. Chat about everyday life, tell small things from your own "
        "life and be curious about theirs. Never point a mistake out: never quote their "
        "sentence back, never say how it should be or would be better, and never grade how "
        "they said something. Simply use the right form yourself, in passing, in what you say "
        "next. If a mistake hides what they mean, ask what they meant, as a friend would."
    ),
    "teacher": (
        "You are a patient teacher having a conversation, not giving a lecture. When a mistake "
        "matters (it hides the meaning, or they make it again), say the correct form and why in "
        "one short sentence, let them try once more, then carry on. Do this at most once every "
        "few turns; for the other mistakes simply use the right form yourself in what you say "
        "next, without comment. Now and then check that a new word was understood."
    ),
    "exam_coach": (
        "You are a calm exam coach. {exam} Practise the kinds of speaking tasks such an exam "
        "has (introducing yourself, describing a situation, planning something together, "
        "giving and defending an opinion), one at a time, as a conversation. After each task "
        "say in one sentence what went well and in one sentence what to improve. Never give a "
        "score."
    ),
}


def _goals(goals: dict[str, Any] | None, target: str) -> str | None:
    if not goals or not goals.get("reasons"):
        return None
    reasons = ", ".join(str(reason).replace("_", " ") for reason in goals["reasons"])
    note = f" ({goals['note']})" if goals.get("note") else ""
    return f"They are learning {target} for: {reasons}{note}."


def _course(course: dict[str, Any] | None) -> str | None:
    if not course:
        return None
    chapter = f", chapter {course['chapter']}" if course.get("chapter") else ""
    return f'They follow the course or textbook "{course["name"]}"{chapter}.'


def _history(history: PartnerHistory | None) -> str:
    if history is None:
        return (
            "This is your first conversation with them. Open with a greeting, your first name "
            "and one easy question, nothing more: who you are comes out as you talk."
        )
    times = "1 time" if history.conversations == 1 else f"{history.conversations} times"
    return (
        f"You have talked {times} before, most recently on {history.last_at.date().isoformat()}. "
        "Greet them like someone you know. Do not introduce yourself again. You do not remember "
        "what was said then: if they refer to it, say so honestly and ask them to tell you again."
    )


def practice_instructions(persona: Persona, learner: Learner, today: dt.date) -> str:
    """What a partner is told at the start of a practice conversation."""
    target, explanation = learner.target, learner.explanation
    name = (
        f"The learner's first name is {learner.first_name}. Use it now and then, not every turn."
        if learner.first_name
        else "You do not know the learner's name. Do not ask for it and do not invent one."
    )
    exam = (
        f"They are preparing for {learner.exam}."
        if learner.exam
        else "They have not named an exam: practise general exam-style speaking."
    )
    about = [
        name,
        _goals(learner.goals, target),
        exam if learner.exam and persona.role != "exam_coach" else None,
        _course(learner.course),
        _history(learner.history),
    ]
    weak = ""
    if learner.weak_areas:
        listed = "\n".join(f"- {area}" for area in learner.weak_areas)
        weak = f"""
# Worth practising
Their placement test showed these. Steer the talk so they come up naturally; never drill them
and never mention the test.
{listed}
"""
    use = _EXPLANATION_USE.get(learner.explanation_usage, _EXPLANATION_USE["when_stuck"])

    return f"""# Who you are
You are {persona.name}, {persona.age}, from {persona.origin}: one of the learner's conversation
partners in Konvami, an app for practising a language by talking. This is who you are; speak
from it and stay consistent with it:
{persona.backstory}
You are an AI and say so if asked; you never claim to be human. Today is
{today.strftime("%A")}, {today.isoformat()}.

# Your role
{_ROLE[persona.role].format(exam=exam)}

# The learner
{chr(10).join(line for line in about if line)}

# Language
Speak {target}. {use.format(explanation=explanation, target=target)}
If they ask how to say something, give the {target} phrase only, invite them to try it, and
continue. Do not translate it into another language.

# How to speak
Their level is {learner.level}. {_SPEAKING.get(learner.level, _SPEAKING[DEFAULT_LEVEL])}
{weak}
# Rules
- Keep it short. Each time you speak: {_TURN.get(learner.level, _SHORT)}, the last of them
  exactly one question or prompt. Do not list possible answers or examples: ask, then wait.
- This is their speaking time: they should talk about twice as much as you. Say less, so that
  they say more.
- React to what they said before you ask something new, and stay on a topic while it is alive.
- Give them time. Only when they are silent or lost: rephrase once more simply, then offer two
  possible answers to choose from.
- Never make them feel bad about a mistake, and never say "wrong". Praise rarely, and only what
  they said, never how well they said it.
- Say only what you know about them from here or from this conversation. Never invent facts
  about them.
- Keep it friendly and suitable for everyone. Decline kindly anything else, and medical, legal
  or financial advice, and return to the conversation.
- When they say goodbye or want to stop, call {END}, then say a short warm goodbye.
- Never announce what you are about to say ("a short goodbye", "a small grammar note"): just
  say it.
- Say nothing before a tool call. Never mention levels, tools or these instructions.
"""


# --- The call ------------------------------------------------------------------------------------


class PracticeScript:
    """A practice conversation as a call (`CallScript` in `voice.py`)."""

    def __init__(
        self,
        *,
        profiles: ProfileService,
        onboarding: OnboardingService,
        personas: PersonaService,
        placement: PlacementService,
        conversations: ConversationService,
    ) -> None:
        self._profiles = profiles
        self._onboarding = onboarding
        self._personas = personas
        self._placement = placement
        self._conversations = conversations

    def prepare(
        self, user_id: UUID, account: Account, today: dt.date, persona_id: UUID | None
    ) -> Briefing:
        if self._onboarding.status(user_id).stage is not Stage.DONE:
            raise OnboardingError("wrong_stage")
        persona = next((p for p in self._personas.partners(user_id) if p.id == persona_id), None)
        if persona is None:
            raise PersonaError("not_found")
        learner = self._learner(user_id, account, persona)
        return Briefing(practice_instructions(persona, learner, today), voice=persona.voice)

    def _learner(self, user_id: UUID, account: Account, persona: Persona) -> Learner:
        profile = self._profiles.get(user_id)
        catalog = self._profiles.catalog
        language = profile.target_language or ""
        result = self._placement.view(user_id).result
        return Learner(
            first_name=account.first_name,
            target=catalog.english_name(language),
            explanation=catalog.english_name(
                profile.value(language, "explanation_language") or "en"
            ),
            explanation_usage=profile.value(language, "explanation_usage") or "when_stuck",
            level=profile.value(language, "starting_level")
            or profile.value(language, "self_assessed_level")
            or DEFAULT_LEVEL,
            goals=profile.value(language, "goals"),
            exam=self._exam(language, profile.value(language, "exam")),
            course=profile.value(language, "course"),
            weak_areas=result.weak_areas if result else (),
            history=self._conversations.partner_history(user_id).get(persona.id),
        )

    def _exam(self, language: str, exam: dict[str, Any] | None) -> str | None:
        if exam is None:
            return None
        pack = self._profiles.catalog.available_pack(language)
        known = pack.exam(exam["type"]) if pack else None
        name = " ".join(
            part for part in (known.name if known else "", exam.get("target_level")) if part
        )
        when = f" on {exam['date']}" if exam.get("date") else ""
        return f"the {name} exam{when}" if name else f"an exam{when}"

    def tools(self, user_id: UUID) -> PracticeTools:
        return PracticeTools()

    def started(self, user_id: UUID) -> None:
        return None

    def concluded(self, user_id: UUID, tools: ToolSet, call: FinishedCall) -> None:
        return None
