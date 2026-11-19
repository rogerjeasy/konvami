"""The exam phrase banks (5.25, spec §6.13): useful phrases per task, at the exam's level."""

from konvami_api.domain.exam_phrases import (
    FUNCTIONS,
    LEVELS,
    PER_PART,
    bank_for,
    phrases_for,
)
from konvami_api.domain.exams import GERMAN_EXAMS, format_for

MEANINGS = {"en", "de", "fr", "it"}


def test_every_function_has_several_phrases_in_all_interface_languages() -> None:
    for function, phrases in FUNCTIONS.items():
        assert len(phrases) >= 5, function
        assert len({phrase.text for phrase in phrases}) == len(phrases), function
        for phrase in phrases:
            assert phrase.text
            assert phrase.level in LEVELS
            assert set(phrase.meanings) == MEANINGS
            assert all(meaning.strip() for meaning in phrase.meanings.values())
        # Every function offers something a beginner can say.
        assert min(LEVELS.index(phrase.level) for phrase in phrases) <= LEVELS.index("A2")


def test_no_phrase_is_kept_twice_across_functions() -> None:
    texts = [phrase.text for phrases in FUNCTIONS.values() for phrase in phrases]
    assert len(texts) == len(set(texts))


def test_every_exam_task_has_a_few_phrases_at_its_level() -> None:
    for exam in GERMAN_EXAMS:
        top = max(LEVELS.index(level) for level in exam.levels)
        for part in exam.parts:
            phrases = phrases_for(part.kind, exam.levels)
            assert 0 < len(phrases) <= PER_PART, (exam.id, part.kind)
            assert all(LEVELS.index(phrase.level) <= top for phrase in phrases)


def test_planning_offers_suggestions_and_unknown_tasks_get_none() -> None:
    assert any("schlage" in phrase.text for phrase in phrases_for("plan_together", ("B1",)))
    assert phrases_for("unknown", ("B1",)) == ()


def test_a_bank_gathers_the_functions_of_an_exams_parts_without_repeats() -> None:
    b1 = format_for(GERMAN_EXAMS, "goethe", "B1")
    assert b1 is not None

    bank = bank_for(b1)

    functions = [group.function for group in bank]
    assert len(functions) == len(set(functions))
    assert {"suggest", "agree", "disagree", "structure", "react"} <= set(functions)
    assert all(group.phrases for group in bank)
    # Nothing above B1 in a B1 exam.
    assert all(
        LEVELS.index(phrase.level) <= LEVELS.index("B1")
        for group in bank
        for phrase in group.phrases
    )


def test_a_higher_exam_gets_more_and_harder_phrases() -> None:
    a1 = format_for(GERMAN_EXAMS, "goethe", "A1")
    c1 = format_for(GERMAN_EXAMS, "osd", "C1")
    assert a1 is not None
    assert c1 is not None

    opinion_c1 = next(group for group in bank_for(c1) if group.function == "opinion")

    assert any(phrase.level == "C1" for phrase in opinion_c1.phrases)
    assert all(phrase.level == "A1" for group in bank_for(a1) for phrase in group.phrases)
