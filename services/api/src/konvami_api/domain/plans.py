"""Plans, entitlements and voice minutes (spec §6.21.2, §6.19).

Three tiers (Free, Plus, Pro) are data: voice minutes per week, how many partners, and which
features. What a learner has bought is an `Entitlement`, written only by RevenueCat's webhook
(`PlanService.apply`), never by the app: the store is the source of truth and the server decides
what a learner may do (spec §6.21.2 "quotas are enforced on the server").

Until `enforce` is switched on (Terraform `plans.enforce`), nobody is limited by their tier: the
testers keep the `voice.weekly_minutes` they have and every feature is open, and the owner's
account always has everything. Switching it on is the step that opens the app to the stores.

Minute packs are bought once and used after the week's quota (spec §6.21.2 "Extra minutes after
the quota is used up"). A pack never expires. A week that goes past its quota has used the
packs for the rest, and how much is never stored as a number of its own: it is worked out from
the seconds the week really used (which a call that ends early gives back from) and the quota
the week had (written down when the week's minutes are granted). So minutes used from a pack
stay used however many weeks pass, and minutes given back are the learner's again.
"""

import datetime as dt
import hmac
import logging
from collections.abc import Callable, Mapping
from dataclasses import dataclass, field, replace
from enum import StrEnum
from typing import Any, Protocol
from uuid import UUID

_log = logging.getLogger(__name__)


class Tier(StrEnum):
    FREE = "free"
    PLUS = "plus"
    PRO = "pro"


class Perk(StrEnum):
    """What a tier may do beyond talking. Each is checked on the server."""

    # Scored exam simulations (spec §6.21.2: Pro).
    EXAM_SIMULATIONS = "exam_simulations"
    # Premium voices (ElevenLabs, spec §6.21.2: Pro).
    PREMIUM_VOICES = "premium_voices"


@dataclass(frozen=True)
class TierSpec:
    """What a tier includes."""

    tier: Tier
    # Voice minutes per week. The spec states Plus and Pro per month; a week is a month / 4.3.
    weekly_minutes: int
    # How many partners the learner may have; None for as many as they like.
    personas: int | None
    perks: frozenset[Perk]


# Spec §6.21.2. Free: about 15 voice minutes a week and 2 partners. Plus: about 250 minutes a
# month (60 a week). Pro: about 600 a month (140 a week) and the Pro perks. The minutes can be
# changed per environment (`plans.weekly_minutes`); the rest is part of what a tier means.
FREE_PERSONAS = 2
TIERS: Mapping[Tier, TierSpec] = {
    Tier.FREE: TierSpec(Tier.FREE, 15, FREE_PERSONAS, frozenset()),
    Tier.PLUS: TierSpec(Tier.PLUS, 60, None, frozenset()),
    Tier.PRO: TierSpec(
        Tier.PRO, 140, None, frozenset({Perk.EXAM_SIMULATIONS, Perk.PREMIUM_VOICES})
    ),
}

# Which tier includes which, for a product that RevenueCat names by entitlement.
_RANK = {Tier.FREE: 0, Tier.PLUS: 1, Tier.PRO: 2}


@dataclass(frozen=True)
class PlanSettings:
    """Per-environment choices (Terraform variable `plans`)."""

    # Off: nobody is limited by their tier (the testers' time), see the module docstring.
    enforce: bool = False
    # Minutes per week of a tier, where the environment differs from `TIERS`.
    weekly_minutes: Mapping[Tier, int] = field(default_factory=dict)
    # The store product ids of the subscriptions, by tier (RevenueCat's `product_id`).
    products: Mapping[str, Tier] = field(default_factory=dict)
    # The store product ids of minute packs, and the seconds each adds.
    packs: Mapping[str, int] = field(default_factory=dict)


@dataclass(frozen=True)
class Entitlement:
    """What a learner has bought, as RevenueCat last told us."""

    user_id: UUID
    tier: Tier
    # In a free trial (spec §6.21.2: 7 days of Plus), not yet paying.
    trial: bool
    # False once cancelled: the plan stays until `expires_at`.
    auto_renew: bool
    billing_issue: bool
    expires_at: dt.datetime | None
    product_id: str
    store: str
    # When RevenueCat made the event this comes from: an older event never overwrites it.
    event_at: dt.datetime


@dataclass(frozen=True)
class PackBalance:
    """Minutes bought in packs: all of them, what earlier weeks used, and the quota the week
    being asked about had when its minutes were last granted (None before the first grant)."""

    purchased_seconds: int
    # Used from the packs by every week except the one being asked about.
    used_other_weeks: int
    quota_this_week: int | None = None


@dataclass(frozen=True)
class Plan:
    """A learner's plan as the app shows it."""

    tier: Tier
    trial: bool
    auto_renew: bool
    billing_issue: bool
    expires_at: dt.datetime | None
    # False while the testers' time lasts: no limit by tier, every feature open.
    enforced: bool
    weekly_seconds: int
    # Partners the learner may have; None for as many as they like.
    personas: int | None
    perks: frozenset[Perk]
    # Minutes from packs not yet used, in seconds.
    pack_seconds: int


@dataclass(frozen=True)
class TierInfo:
    """What a tier includes in this environment, for the app to describe it."""

    tier: Tier
    weekly_seconds: int
    personas: int | None
    perks: frozenset[Perk]


class EntitlementRepository(Protocol):
    def get(self, user_id: UUID) -> Entitlement | None: ...

    def save(self, entitlement: Entitlement) -> None:
        """Stores it, unless one made by a newer event is there."""
        ...


class PackRepository(Protocol):
    def credit(self, transaction_id: str, user_id: UUID, seconds: int, at: dt.datetime) -> bool:
        """Adds a bought pack. False when this purchase was already counted."""
        ...

    def refund(self, transaction_id: str) -> bool:
        """Takes a refunded pack back. False when it is unknown or was already taken back; a
        refunded purchase that arrives again is not counted again."""
        ...

    def balance(self, user_id: UUID, week: dt.date) -> PackBalance:
        """What was bought and what earlier weeks used from it (worked out from the seconds
        each of them used and the quota each had)."""
        ...

    def record_quota(self, user_id: UUID, week: dt.date, quota_seconds: int) -> None:
        """Writes down the quota `week` has, so that what it uses beyond it is told later."""
        ...


class PlanError(Exception):
    """A plan refused something. Code: plan_required."""

    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


@dataclass(frozen=True)
class StoreEvent:
    """A RevenueCat webhook event, reduced to what the plans need."""

    id: str
    type: str
    user_id: UUID
    product_id: str
    entitlement_ids: tuple[str, ...]
    trial: bool
    store: str
    expires_at: dt.datetime | None
    at: dt.datetime
    transaction_id: str
    # RevenueCat says why a subscription was cancelled; a refund ends it at once.
    cancel_reason: str
    # A TRANSFER moves what one set of ids bought to another.
    transferred_from: tuple[UUID, ...] = ()
    transferred_to: tuple[UUID, ...] = ()


# The event types that start or extend a subscription.
_GRANTS = frozenset(
    {
        "INITIAL_PURCHASE",
        "RENEWAL",
        "UNCANCELLATION",
        "PRODUCT_CHANGE",
        "TEMPORARY_ENTITLEMENT_GRANT",
    }
)
# RevenueCat's `cancel_reason` for a refund by the store's support: access ends now.
_REFUNDED = "CUSTOMER_SUPPORT"


def token_matches(sent: str | None, expected: str) -> bool:
    """Whether a webhook's Authorization header is the shared secret (compared in constant time).
    An empty secret matches nothing: a webhook that is not set up is closed."""
    return bool(expected) and sent is not None and hmac.compare_digest(sent, expected)


def monday_of(day: dt.date) -> dt.date:
    """The Monday that starts `day`'s week (when voice minutes come back, spec §6.19)."""
    return day - dt.timedelta(days=day.weekday())


class PlanService:
    def __init__(
        self,
        *,
        settings: PlanSettings,
        entitlements: EntitlementRepository,
        packs: PackRepository,
        owners: frozenset[UUID],
        legacy_weekly_seconds: int,
        used_seconds: Callable[[UUID, dt.date], int],
        clock: Callable[[], dt.datetime],
    ) -> None:
        """`legacy_weekly_seconds` is the testers' time (`voice.weekly_minutes`), used while
        plans are not enforced; `used_seconds(learner, week)` is what the learner's calls used
        in the week that starts on that Monday."""
        self._settings = settings
        self._entitlements = entitlements
        self._packs = packs
        self._owners = owners
        self._legacy = legacy_weekly_seconds
        self._used = used_seconds
        self._clock = clock

    # --- What a learner has -------------------------------------------------------------------

    def _bought(self, user_id: UUID) -> Entitlement | None:
        found = self._entitlements.get(user_id)
        if found is None:
            return None
        if found.expires_at is not None and found.expires_at <= self._clock():
            return None
        return found

    def _quota(self, tier: Tier) -> int:
        minutes = self._settings.weekly_minutes.get(tier, TIERS[tier].weekly_minutes)
        return minutes * 60

    def _this_week(self) -> dt.date:
        return monday_of(self._clock().astimezone(dt.UTC).date())

    def plan(self, user_id: UUID) -> Plan:
        """The learner's plan now."""
        bought = self._bought(user_id)
        tier = bought.tier if bought else Tier.FREE
        if user_id in self._owners:
            tier = Tier.PRO
        spec = TIERS[tier]
        enforced = self._settings.enforce and user_id not in self._owners
        week = self._this_week()
        balance = self._packs.balance(user_id, week)
        available = max(0, balance.purchased_seconds - balance.used_other_weeks)
        if enforced:
            weekly, personas, perks = self._quota(tier), spec.personas, spec.perks
            over = max(0, self._used(user_id, week) - weekly)
        else:
            # The testers' time, and every feature open.
            weekly, personas, perks = self._legacy, None, frozenset(Perk)
            over = 0
        return Plan(
            tier=tier,
            trial=bool(bought and bought.trial),
            auto_renew=bool(bought and bought.auto_renew),
            billing_issue=bool(bought and bought.billing_issue),
            expires_at=bought.expires_at if bought else None,
            enforced=enforced,
            weekly_seconds=weekly,
            personas=personas,
            perks=perks,
            pack_seconds=max(0, available - over),
        )

    def weekly_seconds(self, user_id: UUID, week: dt.date) -> int:
        """The seconds the learner may talk in `week` altogether: their tier's quota and the
        minutes of the packs they bought and have not used. Writes down the quota the week
        has, so that what it uses beyond it counts as used from the packs from now on."""
        plan = self.plan(user_id)
        if not plan.enforced:
            return plan.weekly_seconds
        balance = self._packs.balance(user_id, week)
        if balance.quota_this_week != plan.weekly_seconds:
            self._packs.record_quota(user_id, week, plan.weekly_seconds)
        return plan.weekly_seconds + max(0, balance.purchased_seconds - balance.used_other_weeks)

    def require(self, user_id: UUID, perk: Perk) -> None:
        """Raises `plan_required` when the learner's plan does not include `perk`."""
        if perk not in self.plan(user_id).perks:
            raise PlanError("plan_required")

    def require_room_for_persona(self, user_id: UUID, have: int) -> None:
        """Raises `plan_required` when `have` partners are all the plan allows."""
        limit = self.plan(user_id).personas
        if limit is not None and have >= limit:
            raise PlanError("plan_required")

    def tiers(self) -> list[TierInfo]:
        """The three tiers as this environment has them (the paywall describes them)."""
        return [
            TierInfo(spec.tier, self._quota(spec.tier), spec.personas, spec.perks)
            for spec in TIERS.values()
        ]

    def persona_limit(self, user_id: UUID) -> int | None:
        """How many partners the learner may have; None for as many as they like."""
        return self.plan(user_id).personas

    # --- What the store says ------------------------------------------------------------------

    def _tier_of(self, event: StoreEvent) -> Tier | None:
        """The tier an event is for: the product's, else the highest entitlement named."""
        if event.product_id in self._settings.products:
            return self._settings.products[event.product_id]
        named = [Tier(e) for e in event.entitlement_ids if e in {t.value for t in Tier}]
        return max(named, key=_RANK.__getitem__, default=None)

    def apply(self, event: StoreEvent) -> None:
        """Takes a RevenueCat event into account. Events nobody can use are ignored; an event
        older than what is stored changes nothing; one that comes twice is counted once."""
        if event.type in _GRANTS:
            self._grant(event)
        elif event.type == "NON_RENEWING_PURCHASE":
            seconds = self._settings.packs.get(event.product_id)
            if seconds and event.transaction_id:
                self._packs.credit(event.transaction_id, event.user_id, seconds, event.at)
        elif event.type == "CANCELLATION":
            self._cancel(event)
        elif event.type == "EXPIRATION":
            self._expire(event)
        elif event.type == "BILLING_ISSUE":
            self._change(event, billing_issue=True)
        elif event.type == "TRANSFER":
            self._transfer(event)
        else:
            _log.info("store event %s ignored", event.type)

    def _grant(self, event: StoreEvent) -> None:
        tier = self._tier_of(event)
        if tier is None or tier is Tier.FREE:
            _log.warning("store product %s is not in the plans", event.product_id)
            return
        self._entitlements.save(
            Entitlement(
                user_id=event.user_id,
                tier=tier,
                trial=event.trial,
                auto_renew=True,
                billing_issue=False,
                expires_at=event.expires_at,
                product_id=event.product_id,
                store=event.store,
                event_at=event.at,
            )
        )

    def _change(self, event: StoreEvent, **changes: Any) -> None:
        found = self._entitlements.get(event.user_id)
        if found is not None and found.event_at <= event.at:
            self._entitlements.save(replace(found, event_at=event.at, **changes))

    def _cancel(self, event: StoreEvent) -> None:
        if event.cancel_reason != _REFUNDED:
            # The plan runs to its end; it just does not renew.
            self._change(event, auto_renew=False)
        elif event.product_id in self._settings.packs:
            # A refunded pack takes its minutes back and leaves the subscription alone.
            if event.transaction_id:
                self._packs.refund(event.transaction_id)
        else:
            found = self._entitlements.get(event.user_id)
            # Only the refund of what the learner has now ends it: the refund of an earlier
            # subscription they have since replaced does not.
            if found is not None and found.product_id == event.product_id:
                self._expire(event)

    def _expire(self, event: StoreEvent) -> None:
        found = self._entitlements.get(event.user_id)
        if found is not None and found.event_at <= event.at:
            self._entitlements.save(
                replace(found, expires_at=event.at, auto_renew=False, event_at=event.at)
            )

    def _transfer(self, event: StoreEvent) -> None:
        """What one set of ids bought now belongs to another (the learner restored a purchase
        into another account). Bought minutes stay where they were bought: a pack is spent."""
        for source in event.transferred_from:
            found = self._entitlements.get(source)
            if found is None or found.event_at > event.at:
                continue
            self._entitlements.save(
                replace(found, expires_at=event.at, auto_renew=False, event_at=event.at)
            )
            for target in event.transferred_to:
                self._entitlements.save(replace(found, user_id=target, event_at=event.at))
