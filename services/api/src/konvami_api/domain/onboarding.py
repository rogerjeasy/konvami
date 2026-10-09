"""Where a new learner is in onboarding (spec §6.1.1, §12.6).

The stage is worked out from what is stored, so the app can resume after being closed and a
question answered by voice or by form counts the same.
"""

import datetime as dt
from collections.abc import Callable
from dataclasses import dataclass, replace
from enum import StrEnum
from typing import Protocol
from uuid import UUID

from konvami_api.domain.profile import (
    GLOBAL_SCOPE,
    TARGET_LANGUAGE,
    Change,
    Origin,
    Profile,
    ProfileService,
    Source,
)

# The essential questions, in the order they are asked. Each must have a stored answer; for
# `exam` and `course` that answer may be "none".
ESSENTIAL_FIELDS = (
    "explanation_language",
    "explanation_usage",
    "goals",
    "exam",
    "self_assessed_level",
    "course",
)


class Stage(StrEnum):
    ESSENTIALS = "essentials"
    REVIEW = "review"
    PLACEMENT = "placement"
    PARTNERS = "partners"
    # Everything is chosen; the learner has not entered the app yet.
    READY = "ready"
    DONE = "done"


class PlacementStatus(StrEnum):
    NOT_STARTED = "not_started"
    # The test call is running.
    IN_PROGRESS = "in_progress"
    # The call is over and its transcript is being assessed.
    ASSESSING = "assessing"
    # A result is there and differs from the learner's own estimate: they choose which to use.
    MEASURED = "measured"
    # The test ended before there was enough to measure. It can be taken again or postponed.
    INCONCLUSIVE = "inconclusive"
    # The starting level is settled, by the test or by the learner's choice after it.
    DECIDED = "decided"
    # Postponed: practice starts at the learner's own estimate.
    SKIPPED = "skipped"


# The placement statuses after which onboarding moves on.
_PLACEMENT_SETTLED = frozenset({PlacementStatus.DECIDED, PlacementStatus.SKIPPED})


@dataclass(frozen=True)
class OnboardingState:
    essentials_confirmed_at: dt.datetime | None = None
    placement: PlacementStatus = PlacementStatus.NOT_STARTED
    partners_confirmed_at: dt.datetime | None = None
    completed_at: dt.datetime | None = None


@dataclass(frozen=True)
class OnboardingStatus:
    stage: Stage
    # Essential questions without an answer yet, in asking order.
    missing: list[str]


class OnboardingError(Exception):
    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


class OnboardingRepository(Protocol):
    def load(self, user_id: UUID) -> OnboardingState: ...

    def save(self, user_id: UUID, state: OnboardingState) -> None: ...


def missing_essentials(profile: Profile) -> list[str]:
    target = profile.target_language
    if target is None:
        return [TARGET_LANGUAGE, *ESSENTIAL_FIELDS]
    return [field for field in ESSENTIAL_FIELDS if (target, field) not in profile.fields]


def _stage(missing: list[str], state: OnboardingState) -> Stage:
    if missing:
        return Stage.ESSENTIALS
    if state.essentials_confirmed_at is None:
        return Stage.REVIEW
    if state.placement not in _PLACEMENT_SETTLED:
        return Stage.PLACEMENT
    if state.partners_confirmed_at is None:
        return Stage.PARTNERS
    return Stage.READY if state.completed_at is None else Stage.DONE


class OnboardingService:
    def __init__(
        self,
        profiles: ProfileService,
        repository: OnboardingRepository,
        clock: Callable[[], dt.datetime],
    ) -> None:
        self._profiles = profiles
        self._repository = repository
        self._clock = clock

    def status(self, user_id: UUID) -> OnboardingStatus:
        missing = missing_essentials(self._profiles.get(user_id))
        return OnboardingStatus(_stage(missing, self._repository.load(user_id)), missing)

    def placement(self, user_id: UUID) -> PlacementStatus:
        return self._repository.load(user_id).placement

    def set_placement(self, user_id: UUID, status: PlacementStatus) -> None:
        state = self._repository.load(user_id)
        self._repository.save(user_id, replace(state, placement=status))

    def confirm_essentials(self, user_id: UUID) -> None:
        """The learner has checked the review screen. Repeating it changes nothing."""
        if missing_essentials(self._profiles.get(user_id)):
            raise OnboardingError("essentials_incomplete")
        state = self._repository.load(user_id)
        if state.essentials_confirmed_at is None:
            self._repository.save(user_id, replace(state, essentials_confirmed_at=self._clock()))

    def skip_placement(self, user_id: UUID) -> None:
        """Postpones the placement test: practice starts at the level the learner gave."""
        if self.status(user_id).stage is not Stage.PLACEMENT:
            raise OnboardingError("wrong_stage")
        profile = self._profiles.get(user_id)
        target = profile.value(GLOBAL_SCOPE, TARGET_LANGUAGE)
        self._profiles.apply(
            user_id,
            [Change("starting_level", profile.value(target, "self_assessed_level"))],
            source=Source.ASKED,
            origin=Origin.SYSTEM,
        )
        self.set_placement(user_id, PlacementStatus.SKIPPED)

    def confirm_partners(self, user_id: UUID) -> None:
        """The learner has chosen their starter partners."""
        if self.status(user_id).stage is not Stage.PARTNERS:
            raise OnboardingError("wrong_stage")
        state = self._repository.load(user_id)
        self._repository.save(user_id, replace(state, partners_confirmed_at=self._clock()))

    def complete(self, user_id: UUID) -> None:
        """The learner enters the app. Repeating it changes nothing."""
        stage = self.status(user_id).stage
        if stage is Stage.DONE:
            return
        if stage is not Stage.READY:
            raise OnboardingError("wrong_stage")
        state = self._repository.load(user_id)
        self._repository.save(user_id, replace(state, completed_at=self._clock()))
