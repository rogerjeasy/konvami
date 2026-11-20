"""The Case Writer (7.17, phase 3; design note 2026-11-20-two-halves-phase2-design.md): a Two
Halves case made from something the learner imported (5.23), so the words of their own course
become the clues.

The strong text model writes a small mystery around the material in the four languages, at the
learner's level. Every text it writes is read by the local rules and the moderation provider
before it is kept, like everything else a model writes into a game two people play. When there
is no model, or its case is incomplete or refused, code makes a **word case** from the import's
words instead: each seat holds three of them, says each in a sentence of its own, and both find
out which two words came first. A case is never refused for want of a model.
"""

import datetime as dt
import json
import logging
import random
from collections.abc import Callable, Mapping
from dataclasses import dataclass
from typing import Protocol
from uuid import UUID

from pydantic import BaseModel, ConfigDict, ValidationError

from konvami_api.domain.costs import Charge, Feature
from konvami_api.domain.halves_cases import (
    LANGUAGES,
    ROUNDS,
    CaseTemplate,
    Clue,
    Text,
    template_document,
    template_from,
)
from konvami_api.domain.moderation import Moderator, ModeratorError, local_problem
from konvami_api.domain.text import (
    TextModel,
    TextModelError,
    TextTask,
    answer_list,
    answer_object,
)

logger = logging.getLogger(__name__)

# The text of the material the writer reads: enough for a case, little enough to be quick.
MATERIAL_MAX = 4000
# Words a word case needs: three for each seat.
WORDS_NEEDED = 2 * ROUNDS
WORD_MAX = 40
# The writer is waited for by the learner on 7.17.
WRITE_SECONDS = 25.0
TEXT_MAX = 400
PREFIX = "import:"


@dataclass(frozen=True)
class CaseMaterial:
    """What the Case Writer works from: one course import (5.23)."""

    id: UUID
    title: str
    # The language the material is in: the one the learner learns.
    language: str
    level: str
    text: str
    # Its words in the material's language, with their meaning in the explanation language.
    words: tuple[tuple[str, str], ...]


class CaseWriter(Protocol):
    def write(self, user_id: UUID, material: CaseMaterial) -> CaseTemplate | None:
        """A case around `material` in the four languages, or None when none could be written
        (no model, a refusal, an incomplete answer): then the word case is used."""


class NoCaseWriter:
    def write(self, user_id: UUID, material: CaseMaterial) -> CaseTemplate | None:
        return None


def case_id_for(material: CaseMaterial) -> str:
    return f"{PREFIX}{material.id.hex}"


# --- The word case, made by code ----------------------------------------------------------------


def _four(de: str, en: str, fr: str, it: str) -> Mapping[str, str]:
    return {"de": de, "en": en, "fr": fr, "it": it}


def usable_words(material: CaseMaterial) -> list[str]:
    """The import's words a word case can use: distinct, short, nothing that breaks a rule."""
    seen: set[str] = set()
    words: list[str] = []
    for word, _ in material.words:
        plain = " ".join(word.split())
        if not plain or len(plain) > WORD_MAX or plain.casefold() in seen:
            continue
        if local_problem(plain) is not None:
            continue
        seen.add(plain.casefold())
        words.append(plain)
    return words


def word_case(material: CaseMaterial) -> CaseTemplate | None:
    """A case from the import's words alone, in the four languages; None with fewer than six
    usable words. The same material always gives the same case."""
    words = usable_words(material)
    if len(words) < WORDS_NEEDED:
        return None
    rng = random.Random(material.id.int)  # noqa: S311 - which words go where, not a secret
    chosen = rng.sample(words, WORDS_NEEDED)
    held = {"A": chosen[:ROUNDS], "B": chosen[ROUNDS:]}
    title = material.title.strip()[:80] or "?"
    clues: list[Clue] = []
    for seat in ("A", "B"):
        mine = held[seat]
        for number, word in enumerate(mine, start=1):
            # The question's other options are the seat's other words: only the clue tells.
            options: list[Text] = [w for w in mine if w != word]
            options.insert(rng.randrange(len(options) + 1), word)
            clues.append(
                Clue(
                    "A" if seat == "A" else "B",
                    number,
                    _four(
                        f"Mein Wort Nummer {number} ist „{word}“. Sag es in einem eigenen Satz.",
                        f"My word number {number} is “{word}”. Say it in a sentence of your own.",
                        f"Mon mot numéro {number} est « {word} ». Dis-le dans une phrase à toi.",
                        f"La mia parola numero {number} è «{word}». Dilla in una frase tua.",
                    ),
                    _four(
                        f"Welches Wort war Nummer {number}?",
                        f"Which word was number {number}?",
                        f"Quel mot était le numéro {number} ?",
                        f"Quale parola era la numero {number}?",
                    ),
                    tuple(options),
                    options.index(word),
                )
            )
    first = f"{held['A'][0]} + {held['B'][0]}"
    wrong = [f"{held['A'][1]} + {held['B'][2]}", f"{held['A'][2]} + {held['B'][1]}"]
    finals: list[Text] = [*wrong]
    answer = rng.randrange(len(finals) + 1)
    finals.insert(answer, first)
    return CaseTemplate(
        id=case_id_for(material),
        title=_four(title, title, title, title),
        setting=_four(
            f"Der Text „{title}“ ist in zwei Hälften gerissen. Jede Hälfte hat drei seiner Wörter. "
            "Welche zwei Wörter stehen ganz vorne?",
            f"The text “{title}” was torn in two. Each half holds three of its words. Which two "
            "words come first?",
            f"Le texte « {title} » a été déchiré en deux. Chaque moitié garde trois de ses mots. "
            "Quels deux mots viennent en premier ?",
            f"Il testo «{title}» è stato strappato in due. Ogni metà ha tre delle sue parole. "
            "Quali due parole vengono per prime?",
        ),
        clues=tuple(clues),
        question=_four(
            "Welche zwei Wörter waren beide Nummer 1?",
            "Which two words were both number 1?",
            "Quels deux mots étaient tous les deux le numéro 1 ?",
            "Quali due parole erano entrambe la numero 1?",
        ),
        options=tuple(finals),
        answer=answer,
        ending=_four(
            f"Die zwei Hälften passen zusammen: „{first}“. Der Text ist wieder ganz.",
            f"The two halves fit together: “{first}”. The text is whole again.",
            f"Les deux moitiés vont ensemble : « {first} ». Le texte est de nouveau entier.",
            f"Le due metà combaciano: «{first}». Il testo è di nuovo intero.",
        ),
    )


# --- The case written by a model ----------------------------------------------------------------


class _Loose(BaseModel):
    model_config = ConfigDict(extra="ignore")


class _Four(_Loose):
    de: str
    en: str
    fr: str
    it: str


class _WrittenClue(_Loose):
    seat: str
    round: int
    says: _Four
    asks: _Four
    options: list[_Four]
    answer: int


class _WrittenCase(_Loose):
    title: _Four
    setting: _Four
    clues: list[_WrittenClue]
    question: _Four
    options: list[_Four]
    answer: int
    ending: _Four


_STRING = {"type": "string"}
_FOUR = answer_object(dict.fromkeys(LANGUAGES, _STRING))
_CLUE = answer_object(
    {
        "seat": {"type": "string", "enum": ["A", "B"]},
        "round": {"type": "integer"},
        "says": _FOUR,
        "asks": _FOUR,
        "options": answer_list(_FOUR, 3),
        "answer": {"type": "integer"},
    }
)
_CASE_SCHEMA = answer_object(
    {
        "title": _FOUR,
        "setting": _FOUR,
        "clues": answer_list(_CLUE, 2 * ROUNDS),
        "question": _FOUR,
        "options": answer_list(_FOUR, 3),
        "answer": {"type": "integer"},
        "ending": _FOUR,
    }
)

_INSTRUCTIONS = f"""You write one case for Two Halves, a two-player language game. Two learners
each hold half of the clues of a small, friendly, everyday mystery and tell their clues to each
other by voice. Build the case around the learner's own material (a text from their course), so
that its words and topic come back in the clues.

Write:
- title: a short title;
- setting: two sentences shown to both: what happened and what they must find out;
- clues: exactly {2 * ROUNDS}, three for seat A (rounds 1, 2, 3) and three for seat B. Each clue
  `says` one fact in one or two simple sentences at the learner's level, using words of the
  material. Its `asks` is a question the other player answers with that clue only, with 3
  `options` and the index of the right one in `answer`;
- question: the case's question, which needs at least one clue of each seat, with 3 options and
  the index of the right one;
- ending: one or two sentences that tell how it ends.

Write every text in German (de), English (en), French (fr) and Italian (it), with the same
meaning. No real people, no violence, nothing about the players themselves, no links or contact
details. Times and numbers are written as digits."""


def _plain(text: str) -> str:
    return " ".join(text.split())[:TEXT_MAX]


def _four_of(text: _Four) -> Mapping[str, str]:
    return {lang: _plain(getattr(text, lang)) for lang in LANGUAGES}


def all_texts(case: CaseTemplate) -> list[str]:
    """Every text of a case, in every language, for the checks."""
    texts: list[str] = []
    document = template_document(case)

    def walk(value: object) -> None:
        if isinstance(value, str):
            texts.append(value)
        elif isinstance(value, dict):
            for key, inner in value.items():
                if key not in ("id", "seat"):
                    walk(inner)
        elif isinstance(value, list):
            for inner in value:
                walk(inner)

    walk({k: v for k, v in document.items() if k != "id"})
    return [t for t in texts if t.strip()]


class ModelCaseWriter:
    """The `CaseWriter` on the strong text model, checked by the moderation provider."""

    def __init__(
        self,
        *,
        text_model: TextModel,
        model: str,
        moderator: Moderator,
        language_name: Callable[[str], str],
        clock: Callable[[], dt.datetime],
    ) -> None:
        """An empty `model`: nothing is written, and the word case is used."""
        self._text_model = text_model
        self._model = model
        self._moderator = moderator
        self._language_name = language_name
        self._clock = clock

    def write(self, user_id: UUID, material: CaseMaterial) -> CaseTemplate | None:
        if not self._model:
            return None
        task = TextTask(
            model=self._model,
            instructions=_INSTRUCTIONS,
            content=json.dumps(
                {
                    "material_language": self._language_name(material.language),
                    "level": material.level,
                    "title": material.title,
                    "words": [word for word, _ in material.words][:20],
                    "material": material.text[:MATERIAL_MAX],
                },
                ensure_ascii=False,
            ),
            answer_name="halves_case",
            answer_schema=_CASE_SCHEMA,
            max_seconds=WRITE_SECONDS,
            charge=Charge(user_id, Feature.HALVES),
        )
        try:
            written = _WrittenCase.model_validate(self._text_model.answer(task))
            case = template_from(
                {
                    "id": case_id_for(material),
                    "title": _four_of(written.title),
                    "setting": _four_of(written.setting),
                    "question": _four_of(written.question),
                    "options": [_four_of(o) for o in written.options],
                    "answer": written.answer,
                    "ending": _four_of(written.ending),
                    "clues": [
                        {
                            "seat": clue.seat,
                            "round": clue.round,
                            "says": _four_of(clue.says),
                            "asks": _four_of(clue.asks),
                            "options": [_four_of(o) for o in clue.options],
                            "answer": clue.answer,
                        }
                        for clue in written.clues
                    ],
                }
            )
        except (TextModelError, ValidationError, ValueError):
            logger.warning("halves case not written; the word case is used")
            return None
        return case if self._safe(user_id, case) else None

    def _safe(self, user_id: UUID, case: CaseTemplate) -> bool:
        texts = all_texts(case)
        if any(local_problem(text) is not None for text in texts):
            return False
        try:
            return not self._moderator.check(texts, Charge(user_id, Feature.MODERATION)).flagged
        except ModeratorError:
            # Fails closed: what could not be checked is not played; the word case is.
            return False
