from datetime import UTC, datetime
from uuid import UUID

import pytest

from konvami_api.domain.catalog import CATALOG
from konvami_api.domain.onboarding import OnboardingError, OnboardingService, Stage
from konvami_api.domain.profile import Change, Origin, ProfileService, Source
from tests.fakes import FixedClock, InMemoryOnboardingRepository, InMemoryProfileRepository

USER = UUID("11111111-1111-4111-8111-111111111111")
NOON = datetime(2026, 10, 9, 12, 0, tzinfo=UTC)

ESSENTIALS = [
    Change("target_language", "de"),
    Change("explanation_language", "en"),
    Change("explanation_usage", "when_stuck"),
    Change("goals", {"reasons": ["work"], "note": None}),
    Change("exam", None),
    Change("self_assessed_level", "A2"),
    Change("course", None),
]


@pytest.fixture
def profiles() -> ProfileService:
    return ProfileService(InMemoryProfileRepository(), CATALOG, FixedClock(NOON))


@pytest.fixture
def onboarding(profiles: ProfileService) -> OnboardingService:
    return OnboardingService(profiles, InMemoryOnboardingRepository(), FixedClock(NOON))


def answer(profiles: ProfileService, *changes: Change) -> None:
    profiles.apply(USER, changes, source=Source.ASKED, origin=Origin.FORM)


def test_a_new_user_starts_with_every_essential_question_open(
    onboarding: OnboardingService,
) -> None:
    status = onboarding.status(USER)

    assert status.stage is Stage.ESSENTIALS
    assert status.missing == [
        "target_language",
        "explanation_language",
        "explanation_usage",
        "goals",
        "exam",
        "self_assessed_level",
        "course",
    ]


def test_answered_questions_are_no_longer_missing(
    profiles: ProfileService, onboarding: OnboardingService
) -> None:
    answer(profiles, Change("target_language", "de"), Change("self_assessed_level", "B1"))

    assert onboarding.status(USER).missing == [
        "explanation_language",
        "explanation_usage",
        "goals",
        "exam",
        "course",
    ]


def test_no_exam_and_no_course_count_as_answers(
    profiles: ProfileService, onboarding: OnboardingService
) -> None:
    answer(profiles, *ESSENTIALS)

    status = onboarding.status(USER)
    assert status.missing == []
    assert status.stage is Stage.REVIEW


def test_confirming_the_review_moves_on_to_the_placement_test(
    profiles: ProfileService, onboarding: OnboardingService
) -> None:
    answer(profiles, *ESSENTIALS)

    onboarding.confirm_essentials(USER)

    assert onboarding.status(USER).stage is Stage.PLACEMENT


def test_the_review_cannot_be_confirmed_with_questions_open(
    profiles: ProfileService, onboarding: OnboardingService
) -> None:
    answer(profiles, *ESSENTIALS[:-1])

    with pytest.raises(OnboardingError) as error:
        onboarding.confirm_essentials(USER)

    assert error.value.code == "essentials_incomplete"
    assert onboarding.status(USER).stage is Stage.ESSENTIALS


def test_postponing_the_placement_test_starts_at_the_self_assessed_level(
    profiles: ProfileService, onboarding: OnboardingService
) -> None:
    answer(profiles, *ESSENTIALS)
    onboarding.confirm_essentials(USER)

    onboarding.skip_placement(USER)

    assert onboarding.status(USER).stage is Stage.PARTNERS
    starting = profiles.get(USER).fields[("de", "starting_level")]
    assert starting.value == "A2"
    assert starting.source is Source.ASKED


def test_the_placement_test_cannot_be_postponed_before_the_review(
    profiles: ProfileService, onboarding: OnboardingService
) -> None:
    answer(profiles, *ESSENTIALS)

    with pytest.raises(OnboardingError) as error:
        onboarding.skip_placement(USER)

    assert error.value.code == "wrong_stage"
    assert onboarding.status(USER).stage is Stage.REVIEW


def test_confirming_the_review_twice_is_harmless(
    profiles: ProfileService, onboarding: OnboardingService
) -> None:
    answer(profiles, *ESSENTIALS)
    onboarding.confirm_essentials(USER)
    onboarding.skip_placement(USER)

    onboarding.confirm_essentials(USER)

    assert onboarding.status(USER).stage is Stage.PARTNERS
