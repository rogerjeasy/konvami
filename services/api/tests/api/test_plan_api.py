"""Plans over HTTP (spec §6.21.2): the learner's plan, what the plan refuses, and the store's
webhook."""

from typing import Any

import pytest

from konvami_api.domain.plans import PlanSettings, Tier
from tests.api.conftest import OWNER, STORE_SECRET, USER, Call
from tests.api.test_studio_api import GRETA, in_app  # noqa: F401 - a fixture

# 1790000000 s: a moment in October 2026, well before the tests' clock (so a trial that ends
# a week later is still running when the test asks).
NOW_MS = 1791547200 * 1000
WEEK_MS = 7 * 24 * 3600 * 1000


@pytest.fixture
def plan_settings() -> PlanSettings:
    return PlanSettings(
        enforce=True,
        products={"plus_monthly": Tier.PLUS},
        packs={"minutes_60": 3600},
    )


def hook(**event: Any) -> dict[str, Any]:
    return {
        "api_version": "1.0",
        "event": {
            "id": "evt-1",
            "type": "INITIAL_PURCHASE",
            "app_user_id": USER,
            "product_id": "plus_monthly",
            "entitlement_ids": ["plus"],
            "period_type": "TRIAL",
            "store": "APP_STORE",
            "expiration_at_ms": NOW_MS + WEEK_MS,
            "event_timestamp_ms": NOW_MS,
            "transaction_id": "tx-1",
            **event,
        },
    }


def send(call: Call, body: dict[str, Any], secret: str | None = STORE_SECRET) -> Any:
    headers = {"authorization": secret} if secret is not None else None
    return call("POST", "/webhooks/revenuecat", body, subject=None, headers=headers)


def test_a_learner_with_nothing_bought_is_on_the_free_plan(call: Call) -> None:
    plan = call("GET", "/v1/plan")

    assert plan.status == 200
    assert plan.body["tier"] == "free"
    assert plan.body["enforced"] is True
    assert plan.body["weeklySeconds"] == 15 * 60
    assert plan.body["personas"] == 2
    assert plan.body["perks"] == []


def test_a_purchase_the_store_reports_is_the_learners_plan(call: Call) -> None:
    sent = send(call, hook())
    plan = call("GET", "/v1/plan")

    assert sent.status == 200
    assert (plan.body["tier"], plan.body["trial"], plan.body["autoRenew"]) == ("plus", True, True)
    assert plan.body["weeklySeconds"] == 60 * 60
    assert plan.body["personas"] is None


def test_the_voice_allowance_follows_the_plan(call: Call) -> None:
    free = call("GET", "/v1/voice/allowance").body["weeklySeconds"]
    send(call, hook())
    plus = call("GET", "/v1/voice/allowance").body["weeklySeconds"]

    assert (free, plus) == (15 * 60, 60 * 60)


def test_minute_packs_add_to_the_allowance_once(call: Call) -> None:
    pack = hook(type="NON_RENEWING_PURCHASE", product_id="minutes_60", period_type="NORMAL")
    send(call, pack)
    send(call, pack)

    assert call("GET", "/v1/voice/allowance").body["weeklySeconds"] == 15 * 60 + 3600
    assert call("GET", "/v1/plan").body["packSeconds"] == 3600


def test_a_refunded_pack_leaves_the_allowance_as_it_was_before(call: Call) -> None:
    pack = hook(type="NON_RENEWING_PURCHASE", product_id="minutes_60", period_type="NORMAL")
    send(call, pack)
    send(
        call, hook(**{**pack["event"], "type": "CANCELLATION", "cancel_reason": "CUSTOMER_SUPPORT"})
    )

    assert call("GET", "/v1/voice/allowance").body["weeklySeconds"] == 15 * 60


def test_a_transfer_moves_the_plan_to_the_account_named(call: Call) -> None:
    send(call, hook())
    other = "22222222-2222-4222-8222-222222222222"

    sent = send(
        call,
        hook(
            type="TRANSFER",
            app_user_id="",
            transferred_from=[USER],
            transferred_to=[other],
            event_timestamp_ms=NOW_MS + 1,
        ),
    )

    assert sent.status == 200
    assert call("GET", "/v1/plan", subject=other).body["tier"] == "plus"
    assert call("GET", "/v1/plan").body["autoRenew"] is False


def test_the_webhook_refuses_a_caller_without_the_secret(call: Call) -> None:
    wrong = send(call, hook(), secret="not-the-secret")  # noqa: S106 - a test value
    missing = send(call, hook(), secret=None)

    assert (wrong.status, missing.status) == (401, 401)
    assert call("GET", "/v1/plan").body["tier"] == "free"


def test_an_event_about_nobody_we_know_is_accepted_and_ignored(call: Call) -> None:
    sent = send(call, hook(app_user_id="$RCAnonymousID:abc"))

    assert sent.status == 200
    assert call("GET", "/v1/plan").body["tier"] == "free"


@pytest.mark.usefixtures("in_app")
def test_the_free_plan_refuses_a_third_partner(call: Call) -> None:
    refused = call("POST", "/v1/personas", GRETA)

    assert (refused.status, refused.body["error"]["code"]) == (402, "plan_required")
    assert len(call("GET", "/v1/personas").body["personas"]) == 2


@pytest.mark.usefixtures("in_app")
def test_the_free_plan_refuses_a_copy_of_a_partner_too(call: Call) -> None:
    partners = call("GET", "/v1/personas").body["personas"]

    refused = call("POST", f"/v1/personas/{partners[0]['id']}/duplicate")

    assert (refused.status, refused.body["error"]["code"]) == (402, "plan_required")
    assert len(call("GET", "/v1/personas").body["personas"]) == 2


@pytest.mark.usefixtures("in_app")
def test_plus_has_as_many_partners_as_the_learner_likes(call: Call) -> None:
    send(call, hook())

    assert call("POST", "/v1/personas", GRETA).status == 200


def test_the_free_plan_refuses_an_exam_simulation(call: Call) -> None:
    refused = call("POST", "/v1/voice/calls", {"purpose": "exam", "sdp": "v=0"})

    assert refused.status == 402
    assert refused.body["error"]["code"] == "plan_required"


def test_the_owner_is_not_limited_by_a_plan(call: Call) -> None:
    plan = call("GET", "/v1/plan", subject=OWNER)

    assert (plan.body["tier"], plan.body["enforced"]) == ("pro", False)
