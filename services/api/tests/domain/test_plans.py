"""Plans (spec §6.21.2): what a tier includes, what the store's events do, and minute packs."""

import datetime as dt
from uuid import UUID

import pytest

from konvami_api.domain.plans import (
    FREE_PERSONAS,
    Perk,
    PlanError,
    PlanService,
    PlanSettings,
    StoreEvent,
    Tier,
    token_matches,
)
from tests.fakes import InMemoryEntitlementRepository, InMemoryPackRepository

LEARNER = UUID("11111111-1111-4111-8111-111111111111")
OWNER = UUID("33333333-3333-4333-8333-333333333333")
NOW = dt.datetime(2026, 11, 4, 12, 0, tzinfo=dt.UTC)
WEEK = dt.date(2026, 11, 2)
MONTH = dt.timedelta(days=30)
TESTERS_SECONDS = 3600
# The free plan's minutes per week, in seconds.
QUOTA = 15 * 60

SETTINGS = PlanSettings(
    enforce=True,
    products={"plus_monthly": Tier.PLUS, "pro_yearly": Tier.PRO},
    packs={"minutes_60": 3600},
)


class Clock:
    def __init__(self) -> None:
        self.now = NOW

    def __call__(self) -> dt.datetime:
        return self.now


def service(
    settings: PlanSettings = SETTINGS,
    clock: Clock | None = None,
    used: dict[tuple[UUID, dt.date], int] | None = None,
) -> PlanService:
    """`used` is the seconds each learner's calls used in each week (the voice sessions')."""
    seconds = used if used is not None else {}

    def seconds_used(user_id: UUID, week: dt.date) -> int:
        return seconds.get((user_id, week), 0)

    return PlanService(
        settings=settings,
        entitlements=InMemoryEntitlementRepository(),
        packs=InMemoryPackRepository(seconds_used),
        owners=frozenset({OWNER}),
        legacy_weekly_seconds=TESTERS_SECONDS,
        used_seconds=seconds_used,
        clock=clock or Clock(),
    )


def event(kind: str, **fields: object) -> StoreEvent:
    base: dict[str, object] = {
        "id": "evt",
        "type": kind,
        "user_id": LEARNER,
        "product_id": "plus_monthly",
        "entitlement_ids": ("plus",),
        "trial": False,
        "store": "app_store",
        "expires_at": NOW + MONTH,
        "at": NOW,
        "transaction_id": "tx-1",
        "cancel_reason": "",
    }
    return StoreEvent(**{**base, **fields})  # type: ignore[arg-type]


def test_while_plans_are_not_enforced_the_testers_keep_their_time_and_every_feature() -> None:
    plan = service(PlanSettings()).plan(LEARNER)

    assert (plan.enforced, plan.weekly_seconds, plan.personas) == (False, TESTERS_SECONDS, None)
    assert plan.perks == frozenset(Perk)


def test_a_learner_with_nothing_bought_has_the_free_plan() -> None:
    plans = service()
    plan = plans.plan(LEARNER)

    assert (plan.tier, plan.enforced, plan.weekly_seconds) == (Tier.FREE, True, 15 * 60)
    assert plan.personas == FREE_PERSONAS
    with pytest.raises(PlanError) as refused:
        plans.require(LEARNER, Perk.EXAM_SIMULATIONS)
    assert refused.value.code == "plan_required"


def test_the_free_plan_stops_at_its_number_of_partners() -> None:
    plans = service()

    plans.require_room_for_persona(LEARNER, FREE_PERSONAS - 1)
    with pytest.raises(PlanError):
        plans.require_room_for_persona(LEARNER, FREE_PERSONAS)


def test_a_trial_of_plus_gives_plus_and_ends_when_it_runs_out() -> None:
    clock = Clock()
    plans = service(clock=clock)

    plans.apply(event("INITIAL_PURCHASE", trial=True, expires_at=NOW + dt.timedelta(days=7)))
    during = plans.plan(LEARNER)
    clock.now = NOW + dt.timedelta(days=8)
    after = plans.plan(LEARNER)

    assert (during.tier, during.trial, during.weekly_seconds) == (Tier.PLUS, True, 60 * 60)
    assert during.personas is None
    assert (after.tier, after.trial) == (Tier.FREE, False)


def test_pro_includes_the_exam_simulations() -> None:
    plans = service()

    plans.apply(event("INITIAL_PURCHASE", product_id="pro_yearly", entitlement_ids=("pro",)))

    plans.require(LEARNER, Perk.EXAM_SIMULATIONS)
    assert plans.plan(LEARNER).weekly_seconds == 140 * 60


def test_a_product_the_plans_do_not_know_is_told_by_its_entitlement() -> None:
    plans = service()

    plans.apply(event("INITIAL_PURCHASE", product_id="new_product", entitlement_ids=("pro",)))

    assert plans.plan(LEARNER).tier is Tier.PRO


def test_a_product_nobody_knows_changes_nothing() -> None:
    plans = service()

    plans.apply(event("INITIAL_PURCHASE", product_id="mystery", entitlement_ids=()))

    assert plans.plan(LEARNER).tier is Tier.FREE


def test_a_cancelled_plan_runs_to_its_end_without_renewing() -> None:
    plans = service()
    plans.apply(event("INITIAL_PURCHASE"))

    plans.apply(event("CANCELLATION", at=NOW + dt.timedelta(days=1)))
    plan = plans.plan(LEARNER)

    assert (plan.tier, plan.auto_renew, plan.expires_at) == (Tier.PLUS, False, NOW + MONTH)


def test_a_refund_ends_the_plan_at_once() -> None:
    clock = Clock()
    plans = service(clock=clock)
    plans.apply(event("INITIAL_PURCHASE"))

    clock.now = NOW + dt.timedelta(hours=1)
    plans.apply(event("CANCELLATION", at=clock.now, cancel_reason="CUSTOMER_SUPPORT"))

    assert plans.plan(LEARNER).tier is Tier.FREE


def test_an_expiration_ends_the_plan() -> None:
    clock = Clock()
    plans = service(clock=clock)
    plans.apply(event("INITIAL_PURCHASE"))

    clock.now = NOW + MONTH + dt.timedelta(hours=1)
    plans.apply(event("EXPIRATION", at=clock.now, expires_at=NOW + MONTH))

    assert plans.plan(LEARNER).tier is Tier.FREE


def test_an_event_older_than_the_stored_one_changes_nothing() -> None:
    plans = service()
    plans.apply(event("RENEWAL", at=NOW + dt.timedelta(days=30), expires_at=NOW + 2 * MONTH))

    plans.apply(event("INITIAL_PURCHASE", at=NOW, expires_at=NOW + MONTH))

    assert plans.plan(LEARNER).expires_at == NOW + 2 * MONTH


def test_a_billing_issue_is_noted_and_the_plan_stays() -> None:
    plans = service()
    plans.apply(event("INITIAL_PURCHASE"))

    plans.apply(event("BILLING_ISSUE", at=NOW + dt.timedelta(days=1)))

    plan = plans.plan(LEARNER)
    assert (plan.tier, plan.billing_issue) == (Tier.PLUS, True)


def test_the_owner_has_everything_even_when_plans_are_enforced() -> None:
    plans = service()

    plan = plans.plan(OWNER)

    assert (plan.tier, plan.enforced, plan.weekly_seconds) == (Tier.PRO, False, TESTERS_SECONDS)


def test_a_pack_adds_its_minutes_once_however_often_the_store_says_so() -> None:
    plans = service()

    plans.apply(event("NON_RENEWING_PURCHASE", product_id="minutes_60", transaction_id="tx-9"))
    plans.apply(event("NON_RENEWING_PURCHASE", product_id="minutes_60", transaction_id="tx-9"))

    assert plans.plan(LEARNER).pack_seconds == 3600
    assert plans.weekly_seconds(LEARNER, WEEK) == QUOTA + 3600


def test_minutes_used_from_a_pack_stay_used_however_many_weeks_pass() -> None:
    clock = Clock()
    used: dict[tuple[UUID, dt.date], int] = {}
    plans = service(clock=clock, used=used)
    plans.apply(event("NON_RENEWING_PURCHASE", product_id="minutes_60", transaction_id="tx-9"))

    # The week's minutes are granted when a call starts; the week then goes 10 minutes past
    # its quota. Nobody reads the allowance again before the week ends.
    plans.weekly_seconds(LEARNER, WEEK)
    used[(LEARNER, WEEK)] = QUOTA + 600
    balances = []
    for weeks in (1, 2, 5):
        clock.now = NOW + dt.timedelta(weeks=weeks)
        balances.append(plans.plan(LEARNER).pack_seconds)
        later = WEEK + dt.timedelta(weeks=weeks)
        assert plans.weekly_seconds(LEARNER, later) == QUOTA + 3000

    assert balances == [3000, 3000, 3000]


def test_time_a_call_gives_back_is_given_back_to_the_pack_too() -> None:
    used: dict[tuple[UUID, dt.date], int] = {}
    plans = service(used=used)
    plans.apply(event("NON_RENEWING_PURCHASE", product_id="minutes_60", transaction_id="tx-9"))
    plans.weekly_seconds(LEARNER, WEEK)

    used[(LEARNER, WEEK)] = QUOTA + 900
    during = plans.plan(LEARNER).pack_seconds
    used[(LEARNER, WEEK)] = QUOTA + 300
    after = plans.plan(LEARNER).pack_seconds

    assert (during, after) == (2700, 3300)


def test_a_pack_that_is_used_up_gives_nothing_more() -> None:
    used: dict[tuple[UUID, dt.date], int] = {}
    plans = service(used=used)
    plans.apply(event("NON_RENEWING_PURCHASE", product_id="minutes_60", transaction_id="tx-9"))
    plans.weekly_seconds(LEARNER, WEEK)

    used[(LEARNER, WEEK)] = QUOTA + 3600

    assert plans.plan(LEARNER).pack_seconds == 0
    assert plans.weekly_seconds(LEARNER, WEEK + dt.timedelta(weeks=1)) == QUOTA


def test_a_refunded_pack_takes_its_minutes_back_and_leaves_the_subscription() -> None:
    plans = service()
    plans.apply(event("INITIAL_PURCHASE"))
    plans.apply(event("NON_RENEWING_PURCHASE", product_id="minutes_60", transaction_id="tx-9"))

    plans.apply(
        event(
            "CANCELLATION",
            product_id="minutes_60",
            transaction_id="tx-9",
            cancel_reason="CUSTOMER_SUPPORT",
            at=NOW + dt.timedelta(hours=1),
        )
    )
    # The pack arriving again after its refund is not counted again.
    plans.apply(event("NON_RENEWING_PURCHASE", product_id="minutes_60", transaction_id="tx-9"))

    plan = plans.plan(LEARNER)
    assert (plan.pack_seconds, plan.tier) == (0, Tier.PLUS)


def test_the_refund_of_a_subscription_the_learner_no_longer_has_changes_nothing() -> None:
    plans = service()
    plans.apply(event("INITIAL_PURCHASE", product_id="pro_yearly", entitlement_ids=("pro",)))

    plans.apply(
        event(
            "CANCELLATION",
            product_id="plus_monthly",
            cancel_reason="CUSTOMER_SUPPORT",
            at=NOW + dt.timedelta(hours=1),
        )
    )

    assert plans.plan(LEARNER).tier is Tier.PRO


def test_a_transfer_moves_the_subscription_to_the_new_account() -> None:
    other = UUID("22222222-2222-4222-8222-222222222222")
    clock = Clock()
    plans = service(clock=clock)
    plans.apply(event("INITIAL_PURCHASE"))

    clock.now = NOW + dt.timedelta(hours=1)
    plans.apply(
        event(
            "TRANSFER",
            user_id=other,
            at=clock.now,
            transferred_from=(LEARNER,),
            transferred_to=(other,),
        )
    )

    assert plans.plan(LEARNER).tier is Tier.FREE
    assert (plans.plan(other).tier, plans.plan(other).expires_at) == (Tier.PLUS, NOW + MONTH)


def test_a_product_that_is_not_a_pack_adds_no_minutes() -> None:
    plans = service()

    plans.apply(event("NON_RENEWING_PURCHASE", product_id="gift_card", transaction_id="tx-3"))

    assert plans.plan(LEARNER).pack_seconds == 0


@pytest.mark.parametrize(
    ("sent", "expected", "matches"),
    [
        ("secret", "secret", True),
        ("other", "secret", False),
        (None, "secret", False),
        ("", "", False),
        ("anything", "", False),
    ],
)
def test_the_webhook_secret_must_match_and_a_missing_secret_closes_the_webhook(
    sent: str | None, expected: str, matches: bool
) -> None:
    assert token_matches(sent, expected) is matches
