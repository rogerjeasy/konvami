"""The scheduler against values from the reference implementation (py-fsrs 6.3.2, default
parameters, no fuzzing), computed for the same review histories."""

import pytest

from konvami_api.domain.fsrs import Memory, Rating, interval_days, retrievability, review

# Each step: days since the review before, the rating, then what the reference implementation
# gives: stability, difficulty and the next interval in days.
HISTORIES: list[list[tuple[int, Rating, float, float, int]]] = [
    [
        (0, "good", 2.3065, 2.118104, 2),
        (2, "good", 10.964332, 2.111214, 11),
        (6, "hard", 24.348325, 4.748285, 24),
        (20, "again", 2.084351, 8.259025, 2),
        (0, "good", 2.086746, 8.245995, 2),
        (1, "good", 3.639374, 8.232977, 4),
        (5, "easy", 13.834389, 7.627749, 14),
    ],
    [
        (0, "again", 0.212, 6.4133, 1),
        (0, "again", 0.083357, 8.806304, 1),
        (0, "hard", 0.083357, 9.192798, 1),
        (1, "easy", 0.902014, 8.908297, 1),
        (30, "good", 5.834722, 8.894617, 6),
    ],
    [
        (0, "easy", 8.2956, 1.0, 8),
        (9, "good", 41.578719, 1.0, 42),
        (40, "good", 158.662583, 1.0, 159),
        (200, "again", 5.02583, 7.02699, 5),
        (3, "hard", 8.373516, 8.011606, 8),
    ],
]


@pytest.mark.parametrize("history", HISTORIES)
def test_a_history_of_reviews_is_scheduled_like_the_reference(
    history: list[tuple[int, Rating, float, float, int]],
) -> None:
    memory: Memory | None = None
    for days, rating, stability, difficulty, interval in history:
        memory = review(memory, days, rating)

        assert memory.stability == pytest.approx(stability, abs=1e-6)
        assert memory.difficulty == pytest.approx(difficulty, abs=1e-6)
        assert interval_days(memory) == interval


def test_the_better_a_new_card_is_known_the_later_it_comes_back() -> None:
    intervals = [
        interval_days(review(None, 0, rating)) for rating in ("again", "hard", "good", "easy")
    ]

    assert intervals == [1, 1, 2, 8]


def test_a_card_is_due_when_nine_in_ten_would_still_be_remembered() -> None:
    memory = Memory(stability=10.0, difficulty=5.0)

    assert retrievability(memory, 0) == 1.0
    assert retrievability(memory, 10) == pytest.approx(0.9, abs=1e-9)
    assert retrievability(memory, 30) == pytest.approx(0.809388, abs=1e-6)
    assert interval_days(memory) == 10


def test_an_interval_is_a_day_at_least_and_a_hundred_years_at_most() -> None:
    assert interval_days(Memory(stability=0.01, difficulty=9.0)) == 1
    assert interval_days(Memory(stability=1e9, difficulty=1.0)) == 36500


def test_forgetting_never_makes_a_memory_stronger() -> None:
    memory = Memory(stability=4.0, difficulty=3.0)

    assert review(memory, 4, "again").stability < memory.stability
    assert review(memory, 4, "again").difficulty > memory.difficulty
