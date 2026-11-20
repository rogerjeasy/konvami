"""Speaking simulations beyond German (spec §6.13): fide in Switzerland's three languages, French,
English and Italian exams, their phrase banks, examiners and estimates on each test's own scale."""

import pytest

from konvami_api.domain.catalog import CATALOG
from konvami_api.domain.exam_centre import _schema, _scorer_instructions, examiner_instructions
from konvami_api.domain.exam_phrases import (
    FUNCTIONS,
    LEVELS,
    PER_PART,
    bank_for,
    functions_in,
    phrases_for,
)
from konvami_api.domain.exams import ExamScale, cards_for, format_for

PACKS = ("de", "en", "fr", "it")


def _pack(code: str):  # type: ignore[no-untyped-def]
    pack = CATALOG.available_pack(code)
    assert pack is not None
    return pack


@pytest.mark.parametrize("code", PACKS)
def test_every_test_fits_one_call_in_its_own_language_with_cards_for_each_part(code: str) -> None:
    pack = _pack(code)
    assert pack.speaking_exams
    ids = [exam.id for exam in pack.speaking_exams]
    assert len(ids) == len(set(ids))
    listed = {exam.id for exam in pack.exams}
    for exam in pack.speaking_exams:
        assert exam.language == code, exam.id
        # Every simulated test is an exam the learner can name in their profile.
        assert exam.exam in listed, exam.id
        assert sum(part.seconds for part in exam.parts) <= 9 * 60, exam.id
        assert len({part.id for part in exam.parts}) == len(exam.parts), exam.id
        cards = [card.id for part in exam.parts for card in part.cards]
        assert len(cards) == len(set(cards)), exam.id
        for part in exam.parts:
            assert part.cards, (exam.id, part.id)
            assert all(card.title and card.prompts for card in part.cards), (exam.id, part.id)
            # Every part has phrases that help with it, in the test's language.
            assert phrases_for(part.kind, exam.levels, code), (exam.id, part.kind)


@pytest.mark.parametrize(
    ("code", "exam", "level", "expected"),
    [
        ("de", "fide", "A2", "fide_de_a1_a2"),
        ("de", "fide", "B1", "fide_de_a2_b1"),
        ("fr", "fide", "B1", "fide_fr_a2_b1"),
        ("it", "fide", None, "fide_it_a1_a2"),
        ("fr", "tcf", "B2", "tcf"),
        ("fr", "delf_dalf", "B1", "delf_b1"),
        ("fr", "delf_dalf", "B2", "delf_b2"),
        ("fr", "delf_dalf", "C1", "dalf_c1"),
        ("fr", "tef", "C1", "tef"),
        ("en", "ielts", "B2", "ielts"),
        ("en", "cambridge", "B2", "cambridge_b2_first"),
        ("en", "cambridge", "C1", "cambridge_c1_advanced"),
        # Cambridge's other levels are not simulated.
        ("en", "cambridge", "A2", None),
        ("en", "toefl", "C1", "toefl"),
        ("it", "celi", "B1", "celi_b1"),
        ("it", "cils", "C1", "cils_c1"),
    ],
)
def test_a_learners_exam_finds_its_test(
    code: str, exam: str, level: str | None, expected: str | None
) -> None:
    found = format_for(_pack(code).speaking_exams, exam, level)

    assert (found.id if found else None) == expected


def test_fide_has_the_parts_of_its_public_handbook_in_each_language() -> None:
    for code in ("de", "fr", "it"):
        lower = format_for(_pack(code).speaking_exams, "fide", "A2")
        upper = format_for(_pack(code).speaking_exams, "fide", "B1")
        assert lower is not None
        assert upper is not None
        kinds = [part.kind for part in upper.parts]
        assert kinds[:3] == ["interview", "describe_picture", "phone_call"]
        assert kinds[-1] == "topic_conversation"
        assert lower.parts[-1].kind == "role_play"
        # fide reports a level, never points.
        assert upper.scale == ExamScale("level", levels=("A1", "A2", "B1"))
        # The phone call's other side knows what the learner does not.
        assert all(card.examiner for card in lower.part("telefon").cards)  # type: ignore[union-attr]
    assert _pack("en").exam("fide") is None


def test_an_exam_of_another_language_is_not_offered() -> None:
    assert _pack("de").exam("ielts") is None
    assert _pack("en").exam("goethe") is None
    assert _pack("fr").exam("celi") is None
    assert _pack("it").exam("fide") is not None


@pytest.mark.parametrize(
    ("scale", "value", "expected"),
    [
        (ExamScale("band", 0, 9, 0.5), 6.7, "6.5"),
        (ExamScale("band", 0, 9, 0.5), 6.8, "7"),
        (ExamScale("band", 0, 9, 0.5), 12, "9"),
        (ExamScale("band", 1, 6, 0.5), 0, "1"),
        (ExamScale("points", 0, 25, 0.5), 15.3, "15.5"),
        (ExamScale("points", 140, 190, 1), 161.4, "161"),
        (ExamScale("points", 0, 20, 1), "12", None),
        (ExamScale("points", 0, 20, 1), True, None),
        (ExamScale("level", levels=("A1", "A2", "B1")), "B1", "B1"),
        (ExamScale("level", levels=("A1", "A2", "B1")), "C1", None),
    ],
)
def test_an_estimate_stays_on_the_tests_scale(
    scale: ExamScale, value: object, expected: str | None
) -> None:
    assert scale.estimate(value) == expected


def test_the_scorer_asks_for_an_estimate_only_for_a_test_with_a_scale() -> None:
    ielts = format_for(_pack("en").speaking_exams, "ielts", "B2")
    celi = format_for(_pack("it").speaking_exams, "celi", "B2")
    assert ielts is not None
    assert celi is not None

    with_scale = _schema([part.id for part in ielts.parts], ielts.scale)
    without = _schema([part.id for part in celi.parts], celi.scale)

    assert with_scale["properties"]["estimate"] == {"type": "number", "minimum": 0, "maximum": 9}
    assert "estimate" not in without["properties"]
    instructions = _scorer_instructions(ielts, "English", "German")
    assert "band" in instructions
    assert "from 0 to 9" in instructions


def test_the_examiner_speaks_the_tests_language_and_its_form_of_address() -> None:
    cases = {"de": '"Sie"', "fr": '"vous"', "it": '"Lei"', "en": "politely"}
    for code, address in cases.items():
        exam = _pack(code).speaking_exams[0]
        text = examiner_instructions(exam, cards_for(exam, 0), CATALOG.english_name(code))
        assert address in text, code
        assert "not the real test" in text


def test_a_paired_test_lets_the_other_candidate_speak_in_their_own_voice() -> None:
    first = format_for(_pack("en").speaking_exams, "cambridge", "B2")
    assert first is not None
    assert [part.kind for part in first.parts] == [
        "interview",
        "compare_pictures",
        "collaborate",
        "discussion",
    ]
    text = examiner_instructions(first, cards_for(first, 0), "English", candidate=True)
    assert "speak_candidate" in text
    assert first.part("part_2").cards[0].picture == "waiting_pair"  # type: ignore[union-attr]


@pytest.mark.parametrize("code", PACKS)
def test_phrases_are_in_the_tests_language_with_the_others_as_meanings(code: str) -> None:
    exam = next(e for e in _pack(code).speaking_exams if "B1" in e.levels)
    bank = bank_for(exam)
    assert bank
    for group in bank:
        texts = [phrase.text for phrase in group.phrases]
        assert len(texts) == len(set(texts)), (code, group.function)
        for phrase in group.phrases:
            assert phrase.meanings[code] == phrase.text
            assert set(phrase.meanings) == set(PACKS)
    for part in exam.parts:
        assert len(phrases_for(part.kind, exam.levels, code)) <= PER_PART


def test_lines_that_name_the_language_learned_name_the_right_one() -> None:
    def line(code: str, start: str) -> str:
        phrases = [p for group in functions_in(code).values() for p in group]
        return next(p.text for p in phrases if p.text.startswith(start))

    assert line("en", "I speak") == "I speak … and a little English."
    assert line("fr", "Je parle") == "Je parle … et un peu de français."
    assert line("it", "Parlo") == "Parlo … e un po' di italiano."
    assert line("de", "Ich spreche") == "Ich spreche … und ein bisschen Deutsch."
    assert line("en", "How do you say") == "How do you say … in English?"


def test_the_new_functions_have_several_phrases_and_one_for_beginners() -> None:
    for function in ("compare", "speculate", "phone"):
        phrases = FUNCTIONS[function]
        assert len(phrases) >= 5
        assert min(LEVELS.index(phrase.level) for phrase in phrases) <= LEVELS.index("A2")
