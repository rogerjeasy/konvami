"""The contract of the cost repositories, run against PostgreSQL and the in-memory fakes."""

from collections.abc import Callable, Mapping
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from uuid import UUID

import pytest

from konvami_api.domain.costs import (
    AlertLog,
    ChargeRecord,
    ChargeRepository,
    Feature,
    Level,
)
from konvami_api.persistence.repositories import (
    SqlAccountRepository,
    SqlAlertLog,
    SqlChargeRepository,
)
from konvami_api.persistence.sql import SqlClient
from tests.fakes import InMemoryAlertLog, InMemoryChargeRepository

USER = UUID("11111111-1111-4111-8111-111111111111")
OTHER_USER = UUID("22222222-2222-4222-8222-222222222222")
NOON = datetime(2026, 10, 9, 12, 0, tzinfo=UTC)
OCTOBER = datetime(2026, 10, 1, tzinfo=UTC)
NOVEMBER = datetime(2026, 11, 1, tzinfo=UTC)


@dataclass
class Charges:
    repository: ChargeRepository
    # Makes the learner known, as their first conversation does.
    sign_up: Callable[[UUID], None]
    delete: Callable[[UUID], None]


@pytest.fixture(params=["memory", "postgres"])
def charges(request: pytest.FixtureRequest) -> Charges:
    if request.param == "memory":
        fake = InMemoryChargeRepository()
        return Charges(fake, lambda _: None, fake.forget_learner)
    db: SqlClient = request.getfixturevalue("db")
    accounts = SqlAccountRepository(db)
    return Charges(
        SqlChargeRepository(db),
        lambda user: accounts.set_picture_key(user, None),
        lambda user: accounts.delete(user, NOON),
    )


@pytest.fixture(params=["memory", "postgres"])
def alerts(request: pytest.FixtureRequest) -> AlertLog:
    if request.param == "memory":
        return InMemoryAlertLog()
    return SqlAlertLog(request.getfixturevalue("db"))


def charge(
    usd: float,
    *,
    user: UUID | None = USER,
    feature: Feature = Feature.REPORT,
    provider: str = "openai",
    at: datetime = NOON,
    priced: bool = True,
    units: Mapping[str, float] | None = None,
) -> ChargeRecord:
    return ChargeRecord(
        user, feature, provider, "gpt-6.1-sol", units or {"input_tokens": 1}, usd, priced, at
    )


def test_charges_are_added_up_within_a_time_range(charges: Charges) -> None:
    charges.sign_up(USER)
    charges.repository.add(charge(0.012345678, at=OCTOBER - timedelta(microseconds=1)))
    charges.repository.add(charge(0.25, at=OCTOBER))
    charges.repository.add(charge(1.5, at=NOVEMBER - timedelta(seconds=1)))
    charges.repository.add(charge(9, at=NOVEMBER))

    assert charges.repository.total(OCTOBER, NOVEMBER) == pytest.approx(1.75)
    assert charges.repository.total(NOVEMBER, NOVEMBER + timedelta(days=30)) == pytest.approx(9)


def test_nothing_spent_is_zero(charges: Charges) -> None:
    assert charges.repository.total(OCTOBER, NOVEMBER) == 0
    spending = charges.repository.spending(OCTOBER, NOVEMBER, top=10)
    assert (spending.total_usd, spending.days, spending.learners) == (0, (), ())


def test_spending_is_shown_by_day_feature_provider_and_learner(charges: Charges) -> None:
    charges.sign_up(USER)
    charges.sign_up(OTHER_USER)
    voice = {"input_audio_tokens": 1000, "call_seconds": 300}
    charges.repository.add(charge(0.5, feature=Feature.VOICE_PRACTICE, units=voice))
    charges.repository.add(charge(0.25, feature=Feature.VOICE_PRACTICE, units=voice))
    charges.repository.add(charge(0.1, at=NOON + timedelta(days=1)))
    charges.repository.add(charge(2, user=OTHER_USER, provider="elevenlabs"))
    charges.repository.add(charge(0, user=OTHER_USER, priced=False))
    charges.repository.add(charge(7, at=NOVEMBER))

    spending = charges.repository.spending(OCTOBER, NOVEMBER, top=10)

    assert spending.total_usd == pytest.approx(2.85)
    assert spending.unpriced == 1
    assert [(day.day, round(day.usd, 6)) for day in spending.days] == [
        (date(2026, 10, 9), 2.75),
        (date(2026, 10, 10), 0.1),
    ]
    assert [(share.key, round(share.usd, 6), share.requests) for share in spending.features] == [
        ("report", 2.1, 3),
        ("voice_practice", 0.75, 2),
    ]
    assert [(share.key, round(share.usd, 6), share.requests) for share in spending.providers] == [
        ("elevenlabs", 2, 1),
        ("openai", 0.85, 4),
    ]
    assert [
        (learner.user_id, round(learner.usd, 6), learner.requests, learner.voice_seconds)
        for learner in spending.learners
    ] == [
        (OTHER_USER, 2, 2, 0),
        (USER, 0.85, 3, 600),
    ]


def test_only_the_learners_who_cost_the_most_are_listed(charges: Charges) -> None:
    charges.sign_up(USER)
    charges.sign_up(OTHER_USER)
    charges.repository.add(charge(1))
    charges.repository.add(charge(2, user=OTHER_USER))

    spending = charges.repository.spending(OCTOBER, NOVEMBER, top=1)

    assert [learner.user_id for learner in spending.learners] == [OTHER_USER]


def test_a_deleted_learners_spending_still_counts_without_them(charges: Charges) -> None:
    charges.sign_up(USER)
    charges.repository.add(charge(1))

    charges.delete(USER)
    charges.repository.add(charge(2))

    spending = charges.repository.spending(OCTOBER, NOVEMBER, top=10)
    assert spending.total_usd == pytest.approx(3)
    assert spending.learners == ()


def test_each_alert_is_first_once_a_month(alerts: AlertLog) -> None:
    october, november = date(2026, 10, 1), date(2026, 11, 1)

    assert alerts.first(october, Level.ECONOMY)
    assert not alerts.first(october, Level.ECONOMY)
    assert alerts.first(october, Level.PAUSED)
    assert alerts.first(november, Level.ECONOMY)


def test_a_forgotten_alert_is_first_again(alerts: AlertLog) -> None:
    october = date(2026, 10, 1)
    alerts.first(october, Level.ECONOMY)

    alerts.forget(october, Level.ECONOMY)

    assert alerts.first(october, Level.ECONOMY)
