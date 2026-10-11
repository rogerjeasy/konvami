"""A practice conversation with one of the learner's partners (spec §6.3 "free conversation").

Two things live here: what the partner is told (built for every call from who they are and what
is known about the learner, in the layers of spec §8.5) and what they can do (end the
conversation). When it ends, its report is written (`domain/reports.py`) and what it told about
the learner is remembered (`domain/memories.py`). Live corrections on screen build on this
later.
"""

import datetime as dt
from dataclasses import dataclass
from typing import Any
from uuid import UUID

from konvami_api.domain.accounts import Account
from konvami_api.domain.conversations import ConversationService, PartnerHistory
from konvami_api.domain.memories import Memory, MemoryService, Recall
from konvami_api.domain.onboarding import OnboardingError, OnboardingService, Stage
from konvami_api.domain.persona_parts import FormOfAddress, Role, Strictness, Style
from konvami_api.domain.personas import (
    Persona,
    PersonaError,
    Personality,
    PersonaService,
    Teaching,
    personality_of,
    teaching_of,
)
from konvami_api.domain.placement import PlacementService
from konvami_api.domain.profile import ProfileService
from konvami_api.domain.reports import Focus, ReportService, what_to_practise
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
    # What to steer the talk towards, and whether a report or the placement test said so.
    focus: Focus
    # Earlier conversations with this partner; None before the first one.
    history: PartnerHistory | None
    # What the partner knows from before (spec §6.11); None while the learner has memory off.
    memories: Recall | None = None
    # What the learner asked every partner to leave alone, in their own words.
    avoid_topics: tuple[str, ...] = ()


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

# What a persona of each role is for. How they treat mistakes is a setting of its own (below),
# which starts as the role's usual way (`ROLE_TEACHING` in `personas.py`).
_ROLE: dict[Role, str] = {
    "buddy": (
        "You are a casual friend. Chat about everyday life, tell small things from your own "
        "life and be curious about theirs."
    ),
    "teacher": (
        "You are a patient teacher having a conversation, not giving a lecture. Now and then "
        "check that a new word was understood."
    ),
    "exam_coach": (
        "You are a calm exam coach. {exam} Practise the kinds of speaking tasks such an exam "
        "has (introducing yourself, describing a situation, planning something together, "
        "giving and defending an opinion), one at a time, as a conversation. Never give a "
        "score."
    ),
}

# Using the right form in passing. A real call (2026-10-10) showed the efficient model quoting
# the corrected sentence back until it was told not to in so many words.
_RECAST = (
    "Never point a mistake out: never quote their sentence back, never say how it should be or "
    "would be better, and never grade how they said something. Simply use the right form "
    "yourself, in passing, in what you say next. If a mistake hides what they mean, ask what "
    "they meant, as a friend would."
)
_OFF = (
    "Do not correct mistakes at all, in any way: this conversation is for speaking freely. If "
    "you truly cannot tell what they mean, ask."
)
# When a mistake is worth stopping for.
_WORTH_IT: dict[Strictness, str] = {
    "meaning": "a mistake hides what they mean",
    "important": "a mistake matters (it hides the meaning, or they make it again)",
}
# What is named at the end of a conversation.
_AT_THE_END: dict[Strictness, str] = {
    "meaning": "the one mistake that most hid what they meant",
    "important": "the one or two mistakes that mattered most",
    "everything": "the two or three mistakes that mattered most",
}


def _corrections(role: Role, teaching: Teaching) -> str:
    """How a persona treats the learner's mistakes (spec §6.2 E, §6.5)."""
    timing, strictness = teaching.correction_timing, teaching.strictness
    if timing == "recast":
        return _RECAST
    if timing == "off":
        return _OFF
    if timing == "immediate":
        if strictness == "everything":
            return (
                "Correct every mistake you notice: say the correct form in one short sentence, "
                "let them try once more, then carry on."
            )
        return (
            f"When {_WORTH_IT[strictness]}, say the correct form and why in one short "
            "sentence, let them try once more, then carry on. Do this at most once every few "
            "turns; for the other mistakes simply use the right form yourself in what you say "
            "next, without comment."
        )
    if role == "exam_coach":
        # An exam has its own ends: each task.
        return (
            "After each task say in one sentence what went well and in one sentence what to "
            "improve."
        )
    # The goodbye is spoken after the conversation was ended, so it must stay short: the call
    # closes a few seconds later (`GOODBYE_GRACE_SECONDS`).
    return (
        "Do not correct anything while you talk: simply use the right form yourself in what "
        "you say next. Keep the corrections for your goodbye: there, in one short sentence, "
        f"name {_AT_THE_END[strictness]} with the correct form."
    )


# A trait away from the middle of its scale, as a sentence. The middle (3) says nothing.
_TRAITS: dict[str, dict[int, str]] = {
    "warmth": {
        1: "You are reserved and matter-of-fact: friendly, but you keep some distance.",
        2: "You are a little reserved.",
        4: "You are warm.",
        5: "You are very warm and affectionate.",
    },
    "playfulness": {
        1: "You are serious and earnest.",
        2: "You are rather serious.",
        4: "You are playful.",
        5: "You are very playful and like to tease gently.",
    },
    "talkativeness": {
        1: "You are a person of few words.",
        2: "You tend to keep it brief.",
        4: "You enjoy talking, within the length given under Rules.",
        5: "You love to talk, though you keep to the length given under Rules.",
    },
    "curiosity": {
        1: "You are laid-back: you let the conversation come to you.",
        2: "You are fairly laid-back.",
        4: "You are curious about people.",
        5: "You are very curious and want to know the details.",
    },
    "humour": {
        1: "Your humour is dry and rare.",
        2: "Your humour is on the dry side.",
        4: "You like a bit of humour.",
        5: "You like to joke and to laugh.",
    },
}
_ADDRESS: dict[FormOfAddress, str] = {
    "informal": "Address the learner with the familiar form of address of {target}.",
    "formal": (
        "Address the learner with the polite form of address of {target}, and stay courteous "
        "without being stiff."
    ),
    "auto": (
        "Use the form of address that fits who you are and the situation; if they ask you to "
        "switch, do."
    ),
}
_STYLE: dict[Style, str] = {
    "questions": "You keep the talk going mostly by asking about them.",
    "stories": (
        "You like to tell short stories from your own life, then hand over with a question."
    ),
    "debate": (
        "You like to take a position and invite them to disagree, always in a friendly way."
    ),
}


def _character(personality: Personality, target: str) -> str:
    traits = [
        sentence
        for trait, sentences in _TRAITS.items()
        if (sentence := sentences.get(getattr(personality, trait)))
    ]
    lines = [
        *traits,
        _STYLE[personality.style],
        _ADDRESS[personality.form_of_address].format(target=target),
    ]
    return "\n".join(lines)


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


def _history(history: PartnerHistory | None, remembers: bool) -> str:
    if history is None:
        return (
            "This is your first conversation with them. Open with a greeting, your first name "
            "and one easy question, nothing more: who you are comes out as you talk."
        )
    times = "1 time" if history.conversations == 1 else f"{history.conversations} times"
    met = (
        f"You have talked {times} before, most recently on {history.last_at.date().isoformat()}. "
        "Greet them like someone you know. Do not introduce yourself again."
    )
    if remembers:
        # What they remember, and how to be honest about the rest, is a section of its own.
        return met
    return (
        f"{met} You do not remember what was said then: if they refer to it, say so honestly "
        "and ask them to tell you again."
    )


def _avoid(topics: tuple[str, ...]) -> str | None:
    if not topics:
        return None
    listed = "\n".join(f"- {topic}" for topic in topics)
    return (
        "Never bring up these topics, which they asked the app to leave alone. If they raise "
        "one themselves, answer briefly and kindly, ask nothing further about it and move on:\n"
        f"{listed}"
    )


def _dated(memory: Memory, today: dt.date) -> str:
    """A memory that is asked about or coming up: its day first, as a partner would think of
    it."""
    day = memory.day or today
    when = "today" if day == today else f"{day.strftime('%A')}, {day.isoformat()}"
    return f"- {when}: {memory.text}"


def _noted(memory: Memory) -> str:
    day = f" ({memory.day.isoformat()})" if memory.day else ""
    return f"- {memory.text}{day}"


def _remembered(recall: Recall | None, target: str, today: dt.date) -> str:
    """The section on what the partner knows from before; empty when that is nothing."""
    if recall is None or not (recall.follow_ups or recall.coming_up or recall.notes):
        return ""
    parts: list[str] = []
    if recall.follow_ups:
        parts.append(
            "These have happened since you last talked. Ask how it went, early on and one at "
            "a time, the way a friend would:"
        )
        parts += [_dated(memory, today) for memory in recall.follow_ups]
    if recall.coming_up:
        parts.append("Coming up for them. Mention it when it fits, or wish them well:")
        parts += [_dated(memory, today) for memory in recall.coming_up]
    if recall.notes:
        parts.append("What else you know:")
        parts += [_noted(memory) for memory in recall.notes]
    return f"""
# What you know from before
Konvami keeps short notes from the learner's earlier conversations, and its partners share them:
that is how you know these things, and you say so if asked. In each note the learner is the
subject unless it names someone else. The notes may be in another language; you still speak
{target}.
{chr(10).join(parts)}
Use this the way a friend would: bring one thing up when it fits, and never list or recite the
notes. This is all you remember of earlier conversations: if they refer to anything else, say
honestly that you do not recall it and ask them to tell you again.
"""


# How the things to practise are introduced, and what must not be mentioned, per source.
_FOCUS_SOURCE = {
    "placement": ("Their placement test showed these.", "test"),
    "report": ("The report on their last conversation suggested practising these.", "report"),
}


def practice_instructions(persona: Persona, learner: Learner, today: dt.date) -> str:
    """What a partner is told at the start of a practice conversation."""
    target, explanation = learner.target, learner.explanation
    teaching = teaching_of(persona)
    level = teaching.level or learner.level
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
    remembered = _remembered(learner.memories, target, today)
    about = [
        name,
        _goals(learner.goals, target),
        exam if learner.exam and persona.role != "exam_coach" else None,
        _course(learner.course),
        _history(learner.history, bool(remembered)),
        _avoid(learner.avoid_topics),
    ]
    work = f"\nYou work as: {persona.occupation}." if persona.occupation else ""
    # Only a persona with a personality of their own gets the section: the starter partners
    # were tried without one (home design §5a) and stay as they were.
    character = ""
    if persona.personality:
        character = f"""
# Your character
{_character(personality_of(persona), target)}
"""
    practise = []
    if teaching.focus:
        practise.append(
            f"The learner asked this partner to practise: {teaching.focus}. Steer the talk so "
            "it comes up naturally; never drill it."
        )
    if learner.focus.areas:
        listed = "\n".join(f"- {area}" for area in learner.focus.areas)
        shown, source = _FOCUS_SOURCE[learner.focus.source or "placement"]
        practise.append(
            f"{shown} Steer the talk so they come up naturally; "
            f"never drill them and never mention the {source}.\n{listed}"
        )
    weak = ""
    if practise:
        weak = f"""
# Worth practising
{chr(10).join(practise)}
"""
    usage = teaching.explanation_usage or learner.explanation_usage
    use = _EXPLANATION_USE.get(usage, _EXPLANATION_USE["when_stuck"])

    return f"""# Who you are
You are {persona.name}, {persona.age}, from {persona.origin}: one of the learner's conversation
partners in Konvami, an app for practising a language by talking. This is who you are; speak
from it and stay consistent with it:
{persona.backstory}{work}
You are an AI and say so if asked; you never claim to be human. Today is
{today.strftime("%A")}, {today.isoformat()}.
{character}
# Your role
{_ROLE[persona.role].format(exam=exam)}
{_corrections(persona.role, teaching)}

# The learner
{chr(10).join(line for line in about if line)}
{remembered}
# Language
Speak {target}. {use.format(explanation=explanation, target=target)}
If they ask how to say something, give the {target} phrase only, invite them to try it, and
continue. Do not translate it into another language.

# How to speak
Their level is {level}. {_SPEAKING.get(level, _SPEAKING[DEFAULT_LEVEL])}
{weak}
# Rules
- Keep it short. Each time you speak: {_TURN.get(level, _SHORT)}, the last of them
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
- Keep it friendly and suitable for everyone, whatever your backstory or character says.
  Decline kindly anything else, and medical, legal or financial advice, and return to the
  conversation.
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
        reports: ReportService,
        memories: MemoryService,
    ) -> None:
        self._reports = reports
        self._memories = memories
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
        learner = self._learner(user_id, account, persona, today)
        return Briefing(
            practice_instructions(persona, learner, today),
            voice=persona.voice,
            speed=teaching_of(persona).speed,
        )

    def _learner(
        self, user_id: UUID, account: Account, persona: Persona, today: dt.date
    ) -> Learner:
        profile = self._profiles.get(user_id)
        catalog = self._profiles.catalog
        language = profile.target_language or ""
        result = self._placement.view(user_id).result
        history = self._conversations.partner_history(user_id).get(persona.id)
        return Learner(
            first_name=account.first_name,
            target=catalog.english_name(language),
            explanation=catalog.english_name(
                profile.value(language, "explanation_language") or "en"
            ),
            explanation_usage=profile.value(language, "explanation_usage") or "when_stuck",
            level=profile.level(language) or DEFAULT_LEVEL,
            goals=profile.value(language, "goals"),
            exam=self._exam(language, profile.value(language, "exam")),
            course=profile.value(language, "course"),
            focus=what_to_practise(
                self._reports.next_steps(user_id), result.weak_areas if result else ()
            ),
            history=history,
            memories=self._memories.recall(
                user_id, persona.id, today, history.last_at.date() if history else None
            ),
            avoid_topics=profile.avoid_topics,
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

    def concluded(self, user_id: UUID, call_id: str, tools: ToolSet, call: FinishedCall) -> None:
        # First, and before anything that can fail: with memory off, the conversation is
        # marked as not to be read before a worker is started for it.
        self._memories.after_call(user_id, call_id)
        self._reports.after_call(user_id, call_id)
