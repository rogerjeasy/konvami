from datetime import UTC, date, datetime, timedelta
from uuid import UUID

import pytest

from konvami_api.domain.accounts import Account
from konvami_api.domain.costs import (
    Allowance,
    Budget,
    Charge,
    ChargeRecord,
    CostError,
    CostService,
    Feature,
    Level,
    Meter,
    SpendGuard,
    level_of,
    month_start,
    price,
    week_start,
)
from tests.fakes import (
    FakeAccountDirectory,
    FixedClock,
    InMemoryAlertLog,
    InMemoryChargeRepository,
    RecordingNotifier,
)

USER = UUID("11111111-1111-4111-8111-111111111111")
OTHER_USER = UUID("22222222-2222-4222-8222-222222222222")
OWNER = UUID("33333333-3333-4333-8333-333333333333")
# A Friday, at noon in UTC.
NOON = datetime(2026, 10, 9, 12, 0, tzinfo=UTC)
PRICES = {
    "gpt-6.1-sol": {"input_tokens": 2.0, "cached_input_tokens": 0.1, "output_tokens": 10.0},
    "gpt-transcribe": {"audio_seconds": 75.0},
}
BUDGET = Budget(target_usd=150, ceiling_usd=250)


class Setup:
    def __init__(self, now: datetime = NOON) -> None:
        self.clock = FixedClock(now)
        self.charges = InMemoryChargeRepository()
        self.alerts = InMemoryAlertLog()
        self.notifier = RecordingNotifier()
        self.guard = SpendGuard(
            budget=BUDGET,
            charges=self.charges,
            alerts=self.alerts,
            notifier=self.notifier,
            clock=self.clock,
        )
        self.meter = Meter(prices=PRICES, charges=self.charges, guard=self.guard, clock=self.clock)

    def spent(self, usd: float, *, at: datetime = NOON, user: UUID | None = USER) -> None:
        self.charges.add(
            ChargeRecord(user, Feature.REPORT, "openai", "gpt-6.1-sol", {}, usd, True, at)
        )


# --- Prices ------------------------------------------------------------------------------------


def test_a_price_is_in_dollars_per_million_units() -> None:
    units = {"input_tokens": 1_000, "cached_input_tokens": 2_000, "output_tokens": 500}

    assert price(PRICES, "gpt-6.1-sol", units) == pytest.approx(0.002 + 0.0002 + 0.005)


def test_a_unit_without_a_price_costs_nothing() -> None:
    # A call's length is kept with its tokens; it is not what the provider bills.
    assert price(PRICES, "gpt-transcribe", {"audio_seconds": 60, "call_seconds": 60}) == (
        pytest.approx(0.0045)
    )


def test_a_model_without_prices_has_no_price() -> None:
    assert price(PRICES, "gpt-unknown", {"input_tokens": 1_000}) is None


# --- Metering ----------------------------------------------------------------------------------


def test_a_paid_request_is_recorded_with_its_learner_feature_and_cost() -> None:
    setup = Setup()

    setup.meter.record(
        Charge(USER, Feature.TUTOR), "openai", "gpt-6.1-sol", {"input_tokens": 1_000_000}
    )

    assert setup.charges.records == [
        ChargeRecord(
            USER,
            Feature.TUTOR,
            "openai",
            "gpt-6.1-sol",
            {"input_tokens": 1_000_000},
            2.0,
            True,
            NOON,
        )
    ]


def test_a_request_for_an_unpriced_model_is_recorded_as_unpriced() -> None:
    setup = Setup()

    setup.meter.record(Charge(USER, Feature.MEMORY), "openai", "gpt-new", {"input_tokens": 10})

    [record] = setup.charges.records
    assert (record.usd, record.priced) == (0.0, False)


def test_a_request_without_a_charge_is_not_recorded() -> None:
    setup = Setup()

    setup.meter.record(None, "openai", "gpt-6.1-sol", {"input_tokens": 10})

    assert setup.charges.records == []


def test_metering_that_fails_does_not_fail_the_request() -> None:
    setup = Setup()
    setup.charges.broken = True

    setup.meter.record(Charge(USER, Feature.TUTOR), "openai", "gpt-6.1-sol", {"input_tokens": 1})

    assert setup.charges.records == []


def test_a_recorded_request_that_passes_the_target_sends_the_alert() -> None:
    setup = Setup()
    setup.spent(149.5)

    setup.meter.record(
        Charge(USER, Feature.REPORT), "openai", "gpt-6.1-sol", {"output_tokens": 100_000}
    )

    assert [subject for subject, _ in setup.notifier.sent] == [
        "Konvami: estimated spend passed the $150 target"
    ]


# --- The spending guard ------------------------------------------------------------------------


def test_the_level_follows_the_target_and_the_ceiling() -> None:
    assert level_of(149.99, BUDGET) is Level.NORMAL
    assert level_of(150, BUDGET) is Level.ECONOMY
    assert level_of(249.99, BUDGET) is Level.ECONOMY
    assert level_of(250, BUDGET) is Level.PAUSED


def test_the_guard_counts_only_this_month() -> None:
    setup = Setup()
    setup.spent(200, at=datetime(2026, 9, 30, 23, 59, tzinfo=UTC))
    setup.spent(10)

    assert setup.guard.level() is Level.NORMAL


def test_each_step_is_emailed_once_a_month() -> None:
    setup = Setup()
    setup.spent(160)

    assert setup.guard.level() is Level.ECONOMY
    assert setup.guard.level() is Level.ECONOMY
    setup.spent(100)
    assert setup.guard.level() is Level.PAUSED
    assert setup.guard.level() is Level.PAUSED

    subjects = [subject for subject, _ in setup.notifier.sent]
    assert subjects == [
        "Konvami: estimated spend passed the $150 target",
        "Konvami: estimated spend reached the $250 ceiling",
    ]
    body = setup.notifier.sent[0][1]
    assert "$160.00" in body
    assert "cheaper voice model" in body
    assert "voice calls are stopped" in setup.notifier.sent[1][1]


def test_only_the_step_reached_is_emailed() -> None:
    setup = Setup()
    setup.spent(300)

    assert setup.guard.level() is Level.PAUSED

    # Only the step reached is announced: it says everything the lower one would.
    assert len(setup.notifier.sent) == 1


def test_the_steps_are_emailed_again_in_a_new_month() -> None:
    setup = Setup()
    setup.spent(160)
    setup.guard.level()

    setup.clock.now = datetime(2026, 11, 2, 9, 0, tzinfo=UTC)
    setup.spent(155, at=setup.clock.now)

    assert setup.guard.level() is Level.ECONOMY
    assert len(setup.notifier.sent) == 2


def test_an_email_that_could_not_be_sent_is_sent_next_time() -> None:
    setup = Setup()
    setup.spent(160)
    setup.notifier.broken = True

    assert setup.guard.level() is Level.ECONOMY

    setup.notifier.broken = False
    setup.guard.level()
    assert len(setup.notifier.sent) == 1


def test_months_start_on_the_first_in_utc() -> None:
    assert month_start(NOON) == datetime(2026, 10, 1, tzinfo=UTC)


# --- The weekly allowance ----------------------------------------------------------------------


def test_weeks_start_on_monday_in_utc() -> None:
    assert week_start(NOON) == datetime(2026, 10, 5, tzinfo=UTC)
    monday = datetime(2026, 10, 5, 0, 0, tzinfo=UTC)
    assert week_start(monday) == monday


def test_an_allowance_says_what_is_left_and_when_it_comes_back() -> None:
    allowance = Allowance(weekly_seconds=3600, used_seconds=1000, resets_at=NOON)

    assert allowance.remaining_seconds == 2600
    assert Allowance(3600, 4000, NOON).remaining_seconds == 0


# --- The owner's view --------------------------------------------------------------------------


def owner_service(setup: Setup) -> CostService:
    return CostService(
        owners=frozenset({OWNER}),
        budget=BUDGET,
        charges=setup.charges,
        accounts=FakeAccountDirectory({USER: Account("Amara", "fr", voice_consent=True)}),
        clock=setup.clock,
    )


def test_only_an_owner_sees_the_costs() -> None:
    service = owner_service(Setup())

    assert service.is_owner(OWNER)
    assert not service.is_owner(USER)
    with pytest.raises(CostError) as error:
        service.report(USER)
    assert error.value.code == "not_owner"


def test_the_owner_sees_this_months_spending_with_learner_names() -> None:
    setup = Setup()
    setup.spent(120, user=USER)
    setup.spent(40, user=OTHER_USER, at=NOON - timedelta(days=1))
    setup.spent(5, at=datetime(2026, 9, 12, tzinfo=UTC))

    report = owner_service(setup).report(OWNER)

    assert report.month == date(2026, 10, 1)
    assert report.level is Level.ECONOMY
    assert report.spending.total_usd == pytest.approx(160)
    assert [(learner.user_id, learner.usd) for learner in report.spending.learners] == [
        (USER, 120),
        (OTHER_USER, 40),
    ]
    # A learner whose account is gone has no name.
    assert report.names == {USER: "Amara", OTHER_USER: None}


def test_the_owner_can_look_at_an_earlier_month() -> None:
    setup = Setup()
    setup.spent(5, at=datetime(2026, 9, 12, tzinfo=UTC))

    report = owner_service(setup).report(OWNER, month=date(2026, 9, 1))

    assert report.spending.total_usd == pytest.approx(5)
    assert report.level is Level.NORMAL
