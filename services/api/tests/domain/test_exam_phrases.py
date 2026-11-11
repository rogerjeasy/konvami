from konvami_api.domain.exam_phrases import phrases_for
from konvami_api.domain.exams import GERMAN_EXAMS


def test_every_exam_task_has_a_phrase_bank_in_all_interface_languages() -> None:
    for exam in GERMAN_EXAMS:
        for part in exam.parts:
            phrases = phrases_for(part.kind)
            assert phrases, part.kind
            for phrase in phrases:
                assert phrase.text
                assert set(phrase.meanings) == {"en", "de", "fr", "it"}
                assert all(phrase.meanings.values())


def test_planning_phrases_help_with_negotiation_and_unknown_tasks_get_none() -> None:
    assert any("schlage" in phrase.text for phrase in phrases_for("plan_together"))
    assert phrases_for("unknown") == ()
