"""Rich cards (spec §6.7): a word card's forms, and the sound of any card.

The forms (a noun's article and plural, a verb's forms and the case it takes, an adjective's
comparison) are written once, by the stronger text model, as a wrong plural on a card would be
learnt by heart. That happens in the worker after a word card is saved (`CardService`), every new
card of the learner in one request; a card the model leaves out gets no forms rather than being
asked about again and again.

The sound is made the first time a card is played: the word with its sentence (or a correction
as it is right), in the voice of the learner's first partner, and kept for every later play.
"""

import datetime as dt
import json
from collections.abc import Callable, Sequence
from typing import Any, get_args
from uuid import UUID

from pydantic import BaseModel, ConfigDict, ValidationError

from konvami_api.domain.cards import (
    Article,
    Card,
    CardError,
    CardRepository,
    Part,
    WordDetails,
)
from konvami_api.domain.costs import Charge, Feature
from konvami_api.domain.personas import PersonaService
from konvami_api.domain.profile import ProfileService
from konvami_api.domain.sounds import Sounds
from konvami_api.domain.speech import SpeechError
from konvami_api.domain.storage import FileStore
from konvami_api.domain.text import TextModel, TextModelError, TextTask, answer_list, answer_object

# The cards one request fills in: more than a report has words.
MAX_DETAIL_CARDS = 30
# A claim older than this was lost with its worker; the cards can be claimed again.
CLAIM_FOR = dt.timedelta(minutes=5)
# The longest a form is kept (a word's forms are a few words).
FORM_MAX = 80
# The voice of a learner who has no partner (the guide's).
DEFAULT_VOICE = "marin"


class _Answer(BaseModel):
    model_config = ConfigDict(extra="forbid")


class _Found(_Answer):
    id: int
    part: Part
    article: str | None
    plural: str | None
    present: str | None
    preterite: str | None
    perfect: str | None
    separable: bool | None
    case: str | None
    comparative: str | None
    superlative: str | None


class _Forms(_Answer):
    cards: list[_Found]


_TEXT_OR_NULL = {"type": ["string", "null"]}
_SCHEMA = answer_object(
    {
        "cards": answer_list(
            answer_object(
                {
                    "id": {"type": "integer"},
                    "part": {"type": "string", "enum": list(get_args(Part))},
                    "article": _TEXT_OR_NULL,
                    "plural": _TEXT_OR_NULL,
                    "present": _TEXT_OR_NULL,
                    "preterite": _TEXT_OR_NULL,
                    "perfect": _TEXT_OR_NULL,
                    "separable": {"type": ["boolean", "null"]},
                    "case": _TEXT_OR_NULL,
                    "comparative": _TEXT_OR_NULL,
                    "superlative": _TEXT_OR_NULL,
                }
            ),
            MAX_DETAIL_CARDS,
        )
    }
)


def _instructions(target: str) -> str:
    return f"""You write the forms of {target} words for a learner's flashcards. A wrong form would
be learnt by heart, so give only forms you are certain of, in standard {target}; null otherwise.

You get words, each with an `id` and often the sentence it came from. For each, answer:
- `part`: noun, verb, adjective, phrase (several words, an expression) or other.
- A noun: `article` (der, die or das, its gender in the singular) and `plural` with its article
  ("die Termine"); null for a noun that has none.
- A verb: `present` (er/sie/es form), `preterite` (er/sie/es form), `perfect` (the Perfekt with its
  auxiliary: "ist gefahren", "hat gemacht"), `separable` (whether its prefix separates), and
  `case` when its object is not in the accusative ("dative", "genitive"), or a preposition it
  goes with ("auf + accusative").
- An adjective: `comparative` and `superlative` ("größer", "am größten").
Every other field is null. Use the word's sense in its sentence."""


def _form(text: str | None) -> str | None:
    clipped = (text or "").strip()[:FORM_MAX]
    return clipped or None


def _details(found: _Found) -> WordDetails:
    article = found.article if found.article in get_args(Article) else None
    noun, verb, adjective = (found.part == part for part in ("noun", "verb", "adjective"))
    return WordDetails(
        part=found.part,
        article=article if noun else None,  # type: ignore[arg-type]
        plural=_form(found.plural) if noun else None,
        present=_form(found.present) if verb else None,
        preterite=_form(found.preterite) if verb else None,
        perfect=_form(found.perfect) if verb else None,
        separable=found.separable if verb else None,
        case=_form(found.case) if verb else None,
        comparative=_form(found.comparative) if adjective else None,
        superlative=_form(found.superlative) if adjective else None,
    )


class CardDetailsService:
    def __init__(
        self,
        *,
        profiles: ProfileService,
        personas: PersonaService,
        repository: CardRepository,
        text_model: TextModel,
        model: str,
        sounds: Sounds,
        files: FileStore,
        clock: Callable[[], dt.datetime],
    ) -> None:
        self._profiles = profiles
        self._personas = personas
        self._repository = repository
        self._text_model = text_model
        # An empty name: no forms.
        self._model = model
        self._sounds = sounds
        self._files = files
        self._clock = clock

    def fill_in(self, user_id: UUID) -> None:
        """Writes the forms of the learner's word cards that have none yet."""
        if not self._model:
            return
        language = self._profiles.get(user_id).target_language or ""
        now = self._clock()
        cards = self._repository.claim_for_details(
            user_id, language, now, now - CLAIM_FOR, MAX_DETAIL_CARDS
        )
        if not cards:
            return
        try:
            forms = self._forms(user_id, language, cards)
        except (TextModelError, ValidationError):
            # The claims run out, and the cards are filled in by a later worker.
            return
        found = {item.id: item for item in forms.cards}
        for number, card in enumerate(cards):
            details = _details(found[number]) if number in found else WordDetails(part="other")
            self._repository.set_details(user_id, card.id, details)

    def _forms(self, user_id: UUID, language: str, cards: Sequence[Card]) -> _Forms:
        content: dict[str, Any] = {
            "words": [
                {"id": number, "word": card.front, "example": card.note}
                for number, card in enumerate(cards)
            ]
        }
        task = TextTask(
            model=self._model,
            instructions=_instructions(self._profiles.catalog.english_name(language)),
            content=json.dumps(content, ensure_ascii=False),
            answer_name="card_forms",
            answer_schema=_SCHEMA,
            charge=Charge(user_id, Feature.CARD_DETAILS),
        )
        return _Forms.model_validate(self._text_model.answer(task))

    def forget(self, user_id: UUID, card_id: UUID) -> None:
        """Removes the sound of a card that is gone."""
        self._files.remove_all(f"users/{user_id}/cards/{card_id}-")

    def audio(self, user_id: UUID, card_id: UUID) -> str:
        """A short-lived address of the card's sound, made the first time. Raises `CardError`
        (`not_found`, `unavailable`)."""
        card = self._repository.get(user_id, card_id)
        if card is None:
            raise CardError("not_found")
        if not self._sounds.available:
            raise CardError("unavailable")
        # A word with its sentence; a correction as it is right.
        if card.kind == "word":
            text = f"{card.front}. {card.note}" if card.note else card.front
        else:
            text = card.back
        partners = self._personas.partners(user_id)
        voice = partners[0].voice if partners else DEFAULT_VOICE
        try:
            return self._sounds.address(
                f"users/{user_id}/cards/{card.id}-",
                voice,
                text,
                Charge(user_id, Feature.CARD_AUDIO),
            )
        except SpeechError as error:
            raise CardError("unavailable") from error
