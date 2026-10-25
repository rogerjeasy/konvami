"""The Live Error Spotter (spec §8.2): each of the learner's turns checked within seconds, while
the conversation goes on, so that a mistake can be shown on screen as a correction chip and the
partner can use the right form in reply (spec §6.4, §6.5).

A turn is written down a second time from its audio first, by the verbatim pass (spec §9.4):
the live transcription tidies mistakes away, and what is not in the text cannot be corrected.
That text is kept with the turn, so the pass after the call does not pay for it twice. A small
text model then names the mistakes it is sure of. A wrong correction is worse than none
(spec §16.1), so only those it is sure of, that matter and that quote the learner's own words
are shown; the Session Report after the call checks every mistake again, more thoroughly.
"""

import json
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from typing import Any, get_args
from uuid import UUID

from pydantic import BaseModel, ConfigDict, ValidationError

from konvami_api.domain.costs import Charge, Feature
from konvami_api.domain.live_call import LiveCorrection, Spot, Spotted
from konvami_api.domain.personas import PersonaService, teaching_of
from konvami_api.domain.profile import ProfileService
from konvami_api.domain.recordings import wav
from konvami_api.domain.reports import (
    DEFAULT_LEVEL,
    OTHER_CATEGORY,
    QUOTE_MAX,
    TEXT_MAX,
    Severity,
    within,
    words_in,
)
from konvami_api.domain.speech import (
    Transcriber,
    TranscriptionError,
    TranscriptionTask,
    verbatim_prompt,
)
from konvami_api.domain.text import TextModel, TextModelError, TextTask, answer_list, answer_object
from konvami_api.domain.voice import CallPurpose, VoiceSession

# The most chips one turn gets: a learner reads them while the partner is talking.
MAX_LIVE_CORRECTIONS = 2
# What the checker may name; the best of them are shown.
MAX_FOUND = 3
# A turn shorter than this ("Ja, gern.") has nothing worth stopping for.
MIN_SPOT_WORDS = 3
# The answer is no use once the conversation has moved on.
SPOT_TIMEOUT_SECONDS = 8.0

# Checks one turn of one call (see `LiveSpotter.for_call`).
type CallSpotter = Callable[[Spot], Spotted]


@dataclass(frozen=True)
class SpotContext:
    """What the checker needs to know about the call, read once when it starts."""

    user_id: UUID
    # The language learned, as a code and by its English name; the explanation language's name.
    language: str
    target: str
    explanation: str
    level: str
    categories: tuple[str, ...]
    # The kinds of mistake that are mistakes in the topics the conversation's plan practises.
    focus: tuple[str, ...]


class _Answer(BaseModel):
    model_config = ConfigDict(extra="forbid")


class _Found(_Answer):
    original: str
    corrected: str
    explanation: str
    category: str
    severity: Severity
    sure: bool


class _Check(_Answer):
    mistakes: list[_Found]


_STRING = {"type": "string"}


def _schema(categories: Sequence[str]) -> dict[str, Any]:
    mistake = answer_object(
        {
            "original": _STRING,
            "corrected": _STRING,
            "explanation": _STRING,
            "category": {"type": "string", "enum": [*categories, OTHER_CATEGORY]},
            "severity": {"type": "string", "enum": list(get_args(Severity))},
            "sure": {"type": "boolean"},
        }
    )
    return answer_object({"mistakes": answer_list(mistake, MAX_FOUND)})


def _instructions(target: str, explanation: str) -> str:
    return f"""You check one spoken turn of a learner of {target}, during a live conversation with
an AI conversation partner, so that a language-learning app can show a small correction on
screen within seconds. A wrong correction is worse than none: name only mistakes you are certain
of.

You get the learner's level, the partner's line the turn answers (`partner`), the turn as it was
written down from the recording, keeping mistakes (`said`), what live speech recognition heard
when that differs (`live`), and the kinds of mistake this conversation practises (`focus`).
Go by `said`; where `live` differs, the difference is often a mistake that live recognition
tidied away.

`mistakes`: at most {MAX_FOUND}, the most useful first: one of a `focus` kind first, then one that
hides the meaning, then other clear mistakes. None is fine and usual. For each:
- `original`: the learner's words, copied exactly from `said`, and only as many as the mistake
  needs.
- `corrected`: the same words put right, with nothing else changed.
- `explanation`: one short sentence in {explanation}, to the learner ("you"), with the rule in
  plain words. Where {explanation} has a familiar form of address, use it.
- `category`: the kind of mistake; `other` when none fits.
- `severity`: `blocks_meaning` when one could misunderstand them, `noticeable` when it is
  clearly wrong but understood, `minor` otherwise.
- `sure`: true only when the words are certainly wrong in standard {target} and the correction
  is certainly right.
These are not mistakes: regional standard forms, ordinary spoken {target} (a short answer
without a verb, a dropped ending that native speakers drop too), words in another language (they
may be asking how to say something), breaking off or starting a sentence again, missing
punctuation or capitals. When a slip could as well be a mishearing (a name, a word that sounds
alike), leave it out."""


class LiveCheck:
    """The check of one turn: written down again from its audio, then read for mistakes."""

    def __init__(
        self,
        *,
        transcriber: Transcriber,
        text_model: TextModel,
        transcription_model: str,
        model: str,
    ) -> None:
        self._transcriber = transcriber
        self._text_model = text_model
        self._transcription_model = transcription_model
        # An empty name: no live checks.
        self.model = model

    def check(self, context: SpotContext, spot: Spot) -> Spotted:
        if len(words_in(spot.text)) < MIN_SPOT_WORDS:
            return Spotted(spot.item_id, None, ())
        verbatim = self._verbatim(context, spot.pcm)
        said = verbatim or spot.text
        content: dict[str, Any] = {"level": context.level, "partner": spot.partner, "said": said}
        if words_in(said) != words_in(spot.text):
            content["live"] = spot.text
        content["focus"] = list(context.focus)
        task = TextTask(
            model=self.model,
            instructions=_instructions(context.target, context.explanation),
            content=json.dumps(content, ensure_ascii=False),
            answer_name="live_check",
            answer_schema=_schema(context.categories),
            max_seconds=SPOT_TIMEOUT_SECONDS,
            charge=Charge(context.user_id, Feature.LIVE_CORRECTIONS),
        )
        try:
            check = _Check.model_validate(self._text_model.answer(task))
        except (TextModelError, ValidationError):
            return Spotted(spot.item_id, verbatim, ())
        heard = (words_in(said), words_in(spot.text))
        return Spotted(spot.item_id, verbatim, _shown(check.mistakes, heard, context))

    def _verbatim(self, context: SpotContext, pcm: bytes) -> str | None:
        if not pcm or not self._transcription_model:
            return None
        task = TranscriptionTask(
            model=self._transcription_model,
            audio=wav(pcm),
            language=context.language,
            prompt=verbatim_prompt(context.target),
            charge=Charge(context.user_id, Feature.VERBATIM),
        )
        try:
            return self._transcriber.transcribe(task).strip() or None
        except TranscriptionError:
            return None


class LiveSpotter:
    """Which calls are checked, and what each check needs to know about its call."""

    def __init__(
        self, *, profiles: ProfileService, personas: PersonaService, check: LiveCheck
    ) -> None:
        self._profiles = profiles
        self._personas = personas
        self._check = check

    def for_call(self, session: VoiceSession) -> CallSpotter | None:
        """The check for each turn of a practice call; None when its turns are not checked: a
        partner told not to correct at all, or no model to check with."""
        if not self._check.model or session.purpose is not CallPurpose.PRACTICE:
            return None
        user_id = session.user_id
        persona = next(
            (p for p in self._personas.partners(user_id) if p.id == session.persona_id), None
        )
        teaching = teaching_of(persona) if persona else None
        if teaching is None or teaching.correction_timing == "off":
            return None
        profile = self._profiles.get(user_id)
        catalog = self._profiles.catalog
        language = profile.target_language or ""
        pack = catalog.available_pack(language)
        if pack is None:
            return None
        context = SpotContext(
            user_id=user_id,
            language=language,
            target=catalog.english_name(language),
            explanation=catalog.english_name(
                profile.value(language, "explanation_language") or "en"
            ),
            level=teaching.level or profile.level(language) or DEFAULT_LEVEL,
            categories=pack.error_categories,
            focus=tuple(
                category
                for point in (session.plan.focus if session.plan else ())
                for category in point.categories
            ),
        )
        return lambda spot: self._check.check(context, spot)


def _shown(
    found: Sequence[_Found], heard: tuple[tuple[str, ...], ...], context: SpotContext
) -> tuple[LiveCorrection, ...]:
    """The corrections worth a chip: sure, not minor, quoting the learner's own words and
    changing one, those of the plan's focus first."""
    shown: list[LiveCorrection] = []
    for item in found:
        original, corrected = item.original.strip()[:QUOTE_MAX], item.corrected.strip()[:QUOTE_MAX]
        quote = words_in(original)
        if not item.sure or item.severity == "minor" or not quote:
            continue
        if not any(within(quote, text) for text in heard) or words_in(corrected) in ((), quote):
            continue
        topic = item.category if item.category in context.categories else OTHER_CATEGORY
        why = item.explanation.strip()[:TEXT_MAX]
        shown.append(LiveCorrection(original, corrected, why, topic, topic in context.focus))
    # Stable: of the same standing, the checker's order.
    shown.sort(key=lambda correction: not correction.focus)
    return tuple(shown[:MAX_LIVE_CORRECTIONS])
