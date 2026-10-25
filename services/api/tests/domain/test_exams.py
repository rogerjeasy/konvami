"""The exam centre's formats and its arithmetic (spec §6.13): parts, cards, scores, readiness."""

import datetime as dt

import pytest

from konvami_api.domain.exams import (
    CRITERIA,
    GERMAN_EXAMS,
    PartScore,
    Readiness,
    cards_for,
    format_for,
    readiness,
    total_share,
)

DAY = dt.timedelta(days=1)
START = dt.datetime(2026, 10, 1, 9, 0, tzinfo=dt.UTC)


def test_every_format_fits_one_call_and_has_cards_for_each_part() -> None:
    for exam in GERMAN_EXAMS:
        assert exam.parts, exam.id
        # A practice call lasts ten minutes; the examiner needs a little time to begin and end.
        assert sum(part.seconds for part in exam.parts) <= 9 * 60, exam.id
        for part in exam.parts:
            assert part.cards, (exam.id, part.id)
            assert all(card.prompts for card in part.cards), (exam.id, part.id)
        assert len({part.id for part in exam.parts}) == len(exam.parts)


def test_the_formats_of_the_spec_are_there() -> None:
    assert {exam.id for exam in GERMAN_EXAMS} == {
        "goethe_a1",
        "goethe_a2",
        "goethe_b1",
        "goethe_b2",
        "telc_b1",
        "dtz",
    }
    b1 = format_for(GERMAN_EXAMS, "goethe", "B1")
    assert b1 is not None
    assert [part.kind for part in b1.parts] == [
        "plan_together",
        "present_topic",
        "feedback_questions",
    ]


@pytest.mark.parametrize(
    ("exam", "level", "expected"),
    [
        ("goethe", "A2", "goethe_a2"),
        ("telc", "B1", "telc_b1"),
        # The DTZ is one test for A2 and B1.
        ("dtz", "A2", "dtz"),
        ("dtz", None, "dtz"),
        ("telc", "C1", None),
        ("testdaf", "B2", None),
    ],
)
def test_a_learners_exam_finds_its_format(exam: str, level: str | None, expected: str) -> None:
    found = format_for(GERMAN_EXAMS, exam, level)

    assert (found.id if found else None) == expected


def test_cards_take_turns_from_one_simulation_to_the_next() -> None:
    b1 = format_for(GERMAN_EXAMS, "goethe", "B1")
    assert b1 is not None

    first = cards_for(b1, done_before=0)
    second = cards_for(b1, done_before=1)

    assert [card.id for card in first] != [card.id for card in second]
    assert len(first) == len(b1.parts)
    assert cards_for(b1, done_before=len(b1.parts[0].cards))[0] == first[0]


def score(*marks: int) -> PartScore:
    return PartScore("teil_1", dict(zip(CRITERIA, marks, strict=True)), "", "")


def test_a_part_scores_its_share_of_the_points_and_a_simulation_their_mean() -> None:
    assert score(4, 4, 4, 4).share == 1.0
    assert score(2, 3, 2, 1).share == 0.5
    assert total_share((score(4, 4, 4, 4), score(2, 3, 2, 1))) == 0.75


def ready(
    results: list[tuple[dt.datetime, dict[str, float]]], pass_share: float = 0.6
) -> Readiness:
    found = readiness(results, pass_share=pass_share)
    assert found is not None
    return found


def test_readiness_names_the_trend_and_the_weakest_part() -> None:
    results = [
        (START + 7 * DAY, {"teil_1": 0.75, "teil_2": 0.5}),
        (START, {"teil_1": 0.5, "teil_2": 0.25}),
    ]

    progress = ready(results)

    assert progress.latest == 0.625
    assert progress.change == 0.25
    assert progress.weakest == "teil_2"
    assert progress.passing


def test_readiness_projects_a_date_from_a_steady_rise_only() -> None:
    rising = [
        (START + 14 * DAY, {"teil_1": 0.5}),
        (START + 7 * DAY, {"teil_1": 0.4}),
        (START, {"teil_1": 0.3}),
    ]
    flat = [(START + 7 * DAY * n, {"teil_1": 0.4}) for n in range(3)]

    # Ten points a week from 50 %: 60 % a week after the last simulation.
    assert ready(rising).ready_on == (START + 21 * DAY).date()
    assert ready(flat).ready_on is None
    assert ready(rising[:2]).ready_on is None


def test_without_simulations_there_is_nothing_to_say() -> None:
    assert readiness([], pass_share=0.6) is None
