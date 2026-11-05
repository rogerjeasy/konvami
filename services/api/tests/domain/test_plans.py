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


def service(settings: PlanSettings = SETTINGS, clock: Clock | None = None) -> PlanService:
    return PlanService(
        settings=settings,
        entitlements=InMemoryEntitlementRepository(),
        packs=InMemoryPackRepository(),
        owners=frozenset({OWNER}),
        legacy_weekly_seconds=TESTERS_SECONDS,
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

    assert plans.plan(LEARNER, WEEK).pack_seconds == 3600
    assert plans.weekly_seconds(LEARNER, WEEK, used=0) == 15 * 60 + 3600


def test_a_week_past_its_quota_draws_from_the_packs_and_the_next_week_finds_less() -> None:
    plans = service()
    plans.apply(event("NON_RENEWING_PURCHASE", product_id="minutes_60", transaction_id="tx-9"))
    quota = 15 * 60

    # 10 minutes past the quota this week.
    plans.weekly_seconds(LEARNER, WEEK, used=quota + 600)
    left_this_week = plans.plan(LEARNER, WEEK).pack_seconds
    next_week = WEEK + dt.timedelta(days=7)
    cap_next_week = plans.weekly_seconds(LEARNER, next_week, used=0)

    assert left_this_week == 3000
    assert cap_next_week == quota + 3000


def test_a_pack_that_is_used_up_gives_nothing_more() -> None:
    plans = service()
    plans.apply(event("NON_RENEWING_PURCHASE", product_id="minutes_60", transaction_id="tx-9"))

    plans.weekly_seconds(LEARNER, WEEK, used=15 * 60 + 5000)

    assert plans.plan(LEARNER, WEEK).pack_seconds == 0


def test_a_product_that_is_not_a_pack_adds_no_minutes() -> None:
    plans = service()

    plans.apply(event("NON_RENEWING_PURCHASE", product_id="gift_card", transaction_id="tx-3"))

    assert plans.plan(LEARNER, WEEK).pack_seconds == 0


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
