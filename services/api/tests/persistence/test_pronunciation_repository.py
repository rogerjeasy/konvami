"""The pronunciation lab's storage, in memory and on PostgreSQL: both keep the same tallies."""

from datetime import UTC, datetime, timedelta
from uuid import UUID

import pytest

from konvami_api.domain.pronunciation import PronunciationRepository
from konvami_api.persistence.pronunciation_repository import SqlPronunciationRepository
from tests.fakes import InMemoryPronunciationRepository

USER = UUID("11111111-1111-4111-8111-111111111111")
OTHER_USER = UUID("22222222-2222-4222-8222-222222222222")
NOON = datetime(2026, 11, 6, 12, 0, 0, tzinfo=UTC)


@pytest.fixture(params=["memory", "postgres"])
def lab(request: pytest.FixtureRequest) -> PronunciationRepository:
    if request.param == "memory":
        return InMemoryPronunciationRepository()
    return SqlPronunciationRepository(request.getfixturevalue("db"))


def drill(
    lab: PronunciationRepository,
    marks: list[tuple[str, bool]],
    *,
    sound: str | None = "ue",
    right: bool = False,
    at: datetime = NOON,
    user: UUID = USER,
) -> None:
    lab.record(
        user,
        "de",
        at,
        drill="word",
        sound_id=sound,
        target=" ".join(word for word, _ in marks),
        heard="x",
        right=right,
        marks=marks,
    )


def test_drills_are_counted_per_learner_and_day_up_to_the_limit(
    lab: PronunciationRepository,
) -> None:
    assert lab.reserve(USER, NOON.date(), 2)
    assert lab.reserve(USER, NOON.date(), 2)
    assert not lab.reserve(USER, NOON.date(), 2)
    assert lab.reserve(OTHER_USER, NOON.date(), 2)
    assert lab.reserve(USER, NOON.date() + timedelta(days=1), 2)


def test_progress_counts_the_drills_and_rights_of_each_sound(
    lab: PronunciationRepository,
) -> None:
    drill(lab, [("für", True)], right=True)
    drill(lab, [("Tür", False)], right=False)
    drill(lab, [("Rad", True)], sound="r", right=True)
    drill(lab, [("für", False)], sound=None)

    assert lab.progress(USER, "de") == {"ue": (2, 1), "r": (1, 1)}
    assert lab.progress(OTHER_USER, "de") == {}
    assert lab.progress(USER, "fr") == {}


def test_a_missed_word_is_a_problem_word_until_it_is_right_twice_in_a_row(
    lab: PronunciationRepository,
) -> None:
    drill(lab, [("für", False)])
    drill(lab, [("für", True)], at=NOON + timedelta(minutes=1))
    assert [(w.word, w.sound_id, w.misses) for w in lab.problems(USER, "de", 10)] == [
        ("für", "ue", 1)
    ]

    drill(lab, [("für", True)], at=NOON + timedelta(minutes=2))

    assert lab.problems(USER, "de", 10) == []


def test_a_miss_starts_the_run_of_rights_again_and_adds_up(
    lab: PronunciationRepository,
) -> None:
    drill(lab, [("für", False)])
    drill(lab, [("für", True)])
    drill(lab, [("für", False)])
    drill(lab, [("für", True)])

    assert [(w.word, w.misses) for w in lab.problems(USER, "de", 10)] == [("für", 2)]


def test_a_word_never_missed_is_not_kept_and_the_most_missed_come_first(
    lab: PronunciationRepository,
) -> None:
    drill(lab, [("Tür", True)])
    drill(lab, [("Brücke", False)])
    drill(lab, [("müde", False), ("Brücke", False)])

    words = lab.problems(USER, "de", 10)

    assert [(w.word, w.misses) for w in words] == [("Brücke", 2), ("müde", 1)]
    assert lab.problems(USER, "de", 1) == words[:1]


def test_problem_words_are_the_learners_own_and_per_language(
    lab: PronunciationRepository,
) -> None:
    drill(lab, [("für", False)])

    assert lab.problems(OTHER_USER, "de", 10) == []
    assert lab.problems(USER, "fr", 10) == []


def test_a_word_is_found_whatever_its_capitals(lab: PronunciationRepository) -> None:
    drill(lab, [("Tür", False)])
    drill(lab, [("tür", False)])

    assert [(w.word.lower(), w.misses) for w in lab.problems(USER, "de", 10)] == [("tür", 2)]
