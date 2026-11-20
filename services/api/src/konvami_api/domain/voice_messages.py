"""A learner's voice message that other learners will hear: the check it passes first and the
private corrections its speaker gets. Two Halves' moves (7.x, `halves_check.py`) and Radio
Konvami's calls (8.x, `radio_check.py`) share it.

The check runs in this order and fails closed:

1. local rules (`moderation.local_problem`): instructions aimed at the model, links, email
   addresses, phone numbers and handles;
2. the moderation provider, on the words of the message;
3. an on-task check by the small text model: is this about the game or the show, or is it
   flirting, a meet-up, a question about someone's private life, harassment or self-harm? For the
   minor band, anything off the task is held as well.

A message that fails any step is held, never delivered. When a provider cannot answer, the check
answers None: the message waits and is checked again, never passed on unchecked.
"""

import json
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from typing import Literal, get_args
from uuid import UUID

from pydantic import BaseModel, ConfigDict, ValidationError

from konvami_api.domain.costs import Charge, Feature
from konvami_api.domain.halves import Band, Correction
from konvami_api.domain.moderation import (
    CONTACT,
    INSTRUCTIONS,
    LINK,
    Moderator,
    ModeratorError,
    local_problem,
)
from konvami_api.domain.reports import (
    REVIEW_SCHEMA,
    Review,
    reviewer_instructions,
    within,
    words_in,
)
from konvami_api.domain.text import TextModel, TextModelError, TextTask, answer_list, answer_object

type Label = Literal[
    "on_task",
    "off_task",
    "romance",
    "contact_or_meetup",
    "personal_probe",
    "harassment",
    "self_harm",
]
# What holds a message, for every band; the minor band also holds `off_task`.
HOLD: frozenset[str] = frozenset(
    {"romance", "contact_or_meetup", "personal_probe", "harassment", "self_harm"}
)
# Local rules, as labels of the owner's queue.
_LOCAL_LABELS = {INSTRUCTIONS: "instructions", CONTACT: "contact_or_meetup", LINK: "link"}
MAX_CORRECTIONS = 3
QUOTE_MAX = 300
EXPLANATION_MAX = 400


@dataclass(frozen=True)
class Setting:
    """Where a message is heard, for the on-task check: who checks it and what is on task."""

    # The first paragraph of the instructions: what the message is and who hears it.
    intro: str
    # What `on_task` means here, as a list item ends.
    on_task: str
    # The name of the check's answer, for the logs and the tests.
    answer_name: str
    # What a correction request is called.
    corrections_name: str
    # What the message is, in "A learner of German recorded this …".
    what: str
    feature: Feature


class _Answer(BaseModel):
    model_config = ConfigDict(extra="ignore")


class _Checked(_Answer):
    label: Label


class _Found(_Answer):
    original: str
    corrected: str
    explanation: str


class _Corrections(_Answer):
    corrections: list[_Found]


_STRING = {"type": "string"}
_CHECK_SCHEMA = answer_object(
    {"label": {"type": "string", "enum": list(get_args(Label.__value__))}}
)
_CORRECTIONS_SCHEMA = answer_object(
    {
        "corrections": answer_list(
            answer_object({"original": _STRING, "corrected": _STRING, "explanation": _STRING}),
            MAX_CORRECTIONS,
        )
    }
)


def check_instructions(setting: Setting) -> str:
    return f"""{setting.intro}

Label the message with exactly one of:
- on_task: {setting.on_task} Mistakes in the language never matter.
- off_task: it is about something else, but harmless.
- romance: flirting, compliments on looks, dating or love.
- contact_or_meetup: asks for or gives a way to contact each other outside the app (a phone
  number, a social media handle, an email, an app) or proposes to meet in person.
- personal_probe: asks someone for personal details (age, school, where exactly they live,
  photos, their real name), or gives such details about someone else.
- harassment: insults, threats, hate or sexual content.
- self_harm: says or hints the speaker may hurt themselves.
Answer as JSON with the label only."""


def clip(text: str, most: int) -> str:
    return " ".join(text.split())[:most].strip()


class MessageChecker:
    """The check and the private corrections, on the app's real providers. Empty model names:
    no check can be made (every message waits, then fails) and nothing is corrected."""

    def __init__(
        self,
        *,
        moderator: Moderator,
        text_model: TextModel,
        check_model: str,
        review_model: str,
        language_name: Callable[[str], str],
    ) -> None:
        self._moderator = moderator
        self._text_model = text_model
        self._check_model = check_model
        self._review_model = review_model
        self._language_name = language_name

    def check(
        self,
        user: UUID | None,
        transcript: str,
        band: Band,
        language: str,
        setting: Setting,
        context: dict[str, str] | None = None,
    ) -> tuple[str, ...] | None:
        """The labels that hold the message (empty: pass it on), or None when it could not be
        checked. `context` goes with the message to the on-task check (a show's question)."""
        problem = local_problem(transcript)
        if problem is not None:
            return (_LOCAL_LABELS.get(problem, problem),)
        if user is None or not self._check_model:
            return None
        try:
            verdict = self._moderator.check([transcript], Charge(user, Feature.MODERATION))
        except ModeratorError:
            return None
        if verdict.flagged:
            return ("unsafe",)
        task = TextTask(
            model=self._check_model,
            instructions=check_instructions(setting),
            content=json.dumps(
                {
                    "language": self._language_name(language),
                    **(context or {}),
                    "message": transcript,
                },
                ensure_ascii=False,
            ),
            answer_name=setting.answer_name,
            answer_schema=_CHECK_SCHEMA,
            charge=Charge(user, setting.feature),
        )
        try:
            label = _Checked.model_validate(self._text_model.answer(task)).label
        except (TextModelError, ValidationError):
            return None
        if label in HOLD or (band == "minor" and label == "off_task"):
            return (label,)
        return ()

    def flagged(self, user: UUID | None, texts: Sequence[str]) -> bool | None:
        """Whether any of `texts` breaks a local rule or is flagged by the moderation provider;
        None when that cannot be told (no one to charge, or the provider did not answer)."""
        if any(local_problem(text) is not None for text in texts):
            return True
        if user is None:
            return None
        try:
            return self._moderator.check(list(texts), Charge(user, Feature.MODERATION)).flagged
        except ModeratorError:
            return None

    def clean(self, user: UUID | None, texts: Sequence[str]) -> bool:
        """Whether lines a model wrote may be heard or read by a listener: no local rule broken
        and nothing the moderation provider flags. Fails closed: no one to charge, or a provider
        that cannot answer, is not clean."""
        return self.flagged(user, texts) is False

    def correct(
        self, user: UUID | None, transcript: str, target: str, explanation: str, setting: Setting
    ) -> tuple[Correction, ...]:
        """At most three corrections, each checked a second time (spec §16.1): what the check
        calls wrong is dropped, what it cannot confirm is a possibility."""
        if user is None or not self._review_model:
            return ()
        target_name, explained_in = self._language_name(target), self._language_name(explanation)
        task = TextTask(
            model=self._review_model,
            instructions=(
                f"A learner of {target_name} recorded {setting.what}. Find at "
                f"most {MAX_CORRECTIONS} clear mistakes that matter for being understood or that a "
                "native speaker would notice. Quote the learner's words exactly as `original`, "
                f"give `corrected`, and explain each in one sentence in {explained_in}. No style "
                "preferences, no punctuation or capitals (it is speech). None is a fine answer."
            ),
            content=json.dumps({"message": transcript}, ensure_ascii=False),
            answer_name=setting.corrections_name,
            answer_schema=_CORRECTIONS_SCHEMA,
            charge=Charge(user, setting.feature),
        )
        try:
            found = _Corrections.model_validate(self._text_model.answer(task)).corrections
        except (TextModelError, ValidationError):
            return ()
        heard = words_in(transcript)
        kept: list[Correction] = []
        seen: set[tuple[str, ...]] = set()
        for item in found:
            original, corrected = clip(item.original, QUOTE_MAX), clip(item.corrected, QUOTE_MAX)
            words = words_in(original)
            if not words or words in seen or not within(words, heard):
                continue
            if words_in(corrected) in ((), words):
                continue
            seen.add(words)
            kept.append(
                Correction(original, corrected, clip(item.explanation, EXPLANATION_MAX), True)
            )
        kept = kept[:MAX_CORRECTIONS]
        if not kept:
            return ()
        review = TextTask(
            model=self._review_model,
            instructions=reviewer_instructions(target_name, explained_in),
            content=json.dumps(
                {
                    "mistakes": [
                        {
                            "id": number,
                            "learner_said": transcript,
                            "original": c.original,
                            "corrected": c.corrected,
                            "explanation": c.explanation,
                        }
                        for number, c in enumerate(kept)
                    ],
                    "rewrites": [],
                },
                ensure_ascii=False,
            ),
            answer_name="correction_review",
            answer_schema=REVIEW_SCHEMA,
            charge=Charge(user, setting.feature),
        )
        try:
            verdicts = {
                answer.id: answer.verdict
                for answer in Review.model_validate(self._text_model.answer(review)).mistakes
            }
        except (TextModelError, ValidationError):
            return tuple(Correction(c.original, c.corrected, c.explanation, False) for c in kept)
        return tuple(
            Correction(c.original, c.corrected, c.explanation, verdicts.get(n) == "correct")
            for n, c in enumerate(kept)
            if verdicts.get(n) != "wrong"
        )


__all__ = [
    "HOLD",
    "MAX_CORRECTIONS",
    "MessageChecker",
    "Setting",
    "check_instructions",
    "clip",
]
