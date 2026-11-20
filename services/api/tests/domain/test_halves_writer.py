import datetime as dt
from collections.abc import Sequence
from typing import Any
from uuid import UUID

from konvami_api.domain.costs import Charge
from konvami_api.domain.halves_cases import (
    LANGUAGES,
    ROUNDS,
    template_document,
    template_from,
    text_in,
)
from konvami_api.domain.halves_writer import (
    CaseMaterial,
    ModelCaseWriter,
    all_texts,
    word_case,
)
from konvami_api.domain.moderation import ModeratorError, Verdict
from konvami_api.domain.text import TextModelError, TextTask

NOON = dt.datetime(2026, 11, 20, 12, tzinfo=dt.UTC)
USER = UUID(int=1)
WORDS = (
    ("die Kündigung", "the notice"),
    ("die Frist", "the deadline"),
    ("der Vermieter", "the landlord"),
    ("die Wohnung", "the flat"),
    ("die Kaution", "the deposit"),
    ("der Schlüssel", "the key"),
    ("die Kaution", "a repeat"),
)


def material(words: Sequence[tuple[str, str]] = WORDS) -> CaseMaterial:
    return CaseMaterial(UUID(int=42), "Brief vom Vermieter", "de", "B1", "…", tuple(words))


def four(text: str) -> dict[str, str]:
    return {language: f"{text} ({language})" for language in LANGUAGES}


def written_case() -> dict[str, Any]:
    return {
        "title": four("The key"),
        "setting": four("The key is gone."),
        "question": four("Where is it?"),
        "options": [four("Here"), four("There"), four("Nowhere")],
        "answer": 1,
        "ending": four("Found it."),
        "clues": [
            {
                "seat": seat,
                "round": number,
                "says": four(f"Clue {seat}{number} at 14:20"),
                "asks": four("When?"),
                "options": [four("14:20"), four("15:00"), four("16:00")],
                "answer": 0,
            }
            for seat in ("A", "B")
            for number in range(1, ROUNDS + 1)
        ],
    }


class Model:
    def __init__(self, answer: dict[str, Any] | Exception) -> None:
        self.answer_given = answer

    def answer(self, task: TextTask) -> dict[str, Any]:
        if isinstance(self.answer_given, Exception):
            raise self.answer_given
        return self.answer_given


class Moderator:
    def __init__(self, flagged: bool = False, fails: bool = False) -> None:
        self.flagged, self.fails = flagged, fails

    def check(self, texts: Sequence[str], charge: Charge) -> Verdict:
        if self.fails:
            raise ModeratorError("down")
        return Verdict(self.flagged)


def writer(
    answer: dict[str, Any] | Exception, moderator: Moderator | None = None
) -> ModelCaseWriter:
    return ModelCaseWriter(
        text_model=Model(answer),
        model="gpt-strong",
        moderator=moderator or Moderator(),
        language_name=lambda code: code,
        clock=lambda: NOON,
    )


def test_a_word_case_holds_three_words_a_seat_and_needs_both_halves() -> None:
    case = word_case(material())
    assert case is not None
    assert case.id == f"import:{UUID(int=42).hex}"
    for seat in ("A", "B"):
        assert sorted(c.round for c in case.clues if c.seat == seat) == [1, 2, 3]
    told = [text_in(c.options[c.answer], "de") for c in case.clues]
    assert len(set(told)) == 6
    right = text_in(case.options[case.answer], "en")
    first_a = text_in(case.clue("A", 1).options[case.clue("A", 1).answer], "en")
    first_b = text_in(case.clue("B", 1).options[case.clue("B", 1).answer], "en")
    assert right == f"{first_a} + {first_b}"
    # The same material always makes the same case.
    assert word_case(material()) == case


def test_too_few_words_make_no_word_case() -> None:
    assert word_case(material(WORDS[:5])) is None


def test_a_case_survives_its_json() -> None:
    case = word_case(material())
    assert case is not None
    assert template_from(template_document(case)) == case


def test_the_model_writes_a_case_in_four_languages() -> None:
    case = writer(written_case()).write(USER, material())
    assert case is not None
    assert set(case.title) == set(LANGUAGES)
    assert case.answer == 1
    assert len(all_texts(case)) > 40


def test_an_incomplete_case_is_not_used() -> None:
    broken = written_case()
    broken["clues"] = broken["clues"][:5]
    assert writer(broken).write(USER, material()) is None
    assert writer(TextModelError("down")).write(USER, material()) is None


def test_a_case_that_is_flagged_or_cannot_be_checked_is_not_used() -> None:
    assert writer(written_case(), Moderator(flagged=True)).write(USER, material()) is None
    assert writer(written_case(), Moderator(fails=True)).write(USER, material()) is None
    contact = written_case()
    contact["setting"] = four("Write to me at lena@example.com")
    assert writer(contact).write(USER, material()) is None
