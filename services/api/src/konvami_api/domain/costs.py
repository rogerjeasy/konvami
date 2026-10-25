"""Cost control (spec §6.19, §17; decision D5: a $150 monthly target and a $250 ceiling).

Every paid request to a provider is recorded with the learner and the feature it served, and an
estimated cost from its usage and the price table (a setting, so a price change needs no code
change). The month's estimated spend decides the `Level`: past the target new calls use the
cheaper voice model, at the ceiling new voice calls stop. Each step is emailed to the owner once a
month. The numbers are estimates from usage counts, not the provider's invoice.
"""

import datetime as dt
import logging
from collections.abc import Callable, Mapping
from dataclasses import dataclass
from enum import StrEnum
from typing import Protocol
from uuid import UUID

from konvami_api.domain.accounts import AccountDirectory, AccountNotFound

_log = logging.getLogger(__name__)

# Prices are per million units: tokens, characters, or seconds of audio.
PER = 1_000_000
# The learners who cost the most, on the owner's page.
TOP_LEARNERS = 10


class Feature(StrEnum):
    """What a paid request was for."""

    VOICE_ONBOARDING = "voice_onboarding"
    VOICE_PLACEMENT = "voice_placement"
    VOICE_PRACTICE = "voice_practice"
    PLACEMENT_ASSESSMENT = "placement_assessment"
    # The starter partners, and a partner drafted from a description.
    PARTNERS = "partners"
    REPORT = "report"
    # The second check of a report's corrections.
    REPORT_CHECK = "report_check"
    MEMORY = "memory"
    TUTOR = "tutor"
    # The second transcription of a learner's recorded turns (spec §9.4).
    VERBATIM = "verbatim"
    # The check of a learner's turn during a call (the Live Error Spotter, spec §8.2).
    LIVE_CORRECTIONS = "live_corrections"
    VOICE_SAMPLE = "voice_sample"


@dataclass(frozen=True)
class Charge:
    """Who a paid request is for and why. It travels with the request to the provider."""

    user_id: UUID
    feature: Feature


# Per model, the US dollars per million of each unit it is billed by.
type Prices = Mapping[str, Mapping[str, float]]


def price(prices: Prices, model: str, units: Mapping[str, float]) -> float | None:
    """The estimated cost in dollars; None for a model without prices. A unit without a price
    costs nothing (a call's length is kept with its tokens, but the tokens are what is billed)."""
    rates = prices.get(model)
    if rates is None:
        return None
    return sum(count * rates.get(unit, 0.0) for unit, count in units.items()) / PER


@dataclass(frozen=True)
class ChargeRecord:
    # None once the learner's account is deleted: what was spent still counts.
    user_id: UUID | None
    feature: Feature
    provider: str
    model: str
    units: Mapping[str, float]
    usd: float
    # False: the model had no price, so `usd` is 0 and the total too low.
    priced: bool
    at: dt.datetime


@dataclass(frozen=True)
class DaySpend:
    day: dt.date
    usd: float


@dataclass(frozen=True)
class Share:
    """The spending on one feature or provider."""

    key: str
    usd: float
    requests: int


@dataclass(frozen=True)
class LearnerSpend:
    user_id: UUID | None
    usd: float
    requests: int
    voice_seconds: int


@dataclass(frozen=True)
class Spending:
    total_usd: float
    # Requests to a model without prices.
    unpriced: int
    days: tuple[DaySpend, ...]
    features: tuple[Share, ...]
    providers: tuple[Share, ...]
    # The ones who cost the most, most first.
    learners: tuple[LearnerSpend, ...]


class ChargeRepository(Protocol):
    def add(self, record: ChargeRecord) -> None: ...

    def total(self, since: dt.datetime, until: dt.datetime) -> float:
        """The dollars of every request in [since, until)."""

    def spending(self, since: dt.datetime, until: dt.datetime, top: int) -> Spending:
        """Spending in [since, until), by day (UTC; only days with spending), feature and
        provider (most first), and the `top` learners who cost the most."""


class UsageMeter(Protocol):
    """What providers report a paid request to (`Meter`)."""

    def record(
        self, charge: Charge | None, provider: str, model: str, units: Mapping[str, float]
    ) -> None: ...


class Level(StrEnum):
    NORMAL = "normal"
    # Past the target: new calls use the cheaper voice model.
    ECONOMY = "economy"
    # At the ceiling: new voice calls stop.
    PAUSED = "paused"


class AlertLog(Protocol):
    def first(self, month: dt.date, level: Level) -> bool:
        """Notes that `level` was reached in `month`; True only the first time."""

    def forget(self, month: dt.date, level: Level) -> None:
        """Undoes `first`, when its email could not be sent."""


class Notifier(Protocol):
    def notify(self, subject: str, message: str) -> None:
        """Emails the owner. Raises when it cannot."""


@dataclass(frozen=True)
class Budget:
    target_usd: float
    ceiling_usd: float


def level_of(spent_usd: float, budget: Budget) -> Level:
    if spent_usd >= budget.ceiling_usd:
        return Level.PAUSED
    if spent_usd >= budget.target_usd:
        return Level.ECONOMY
    return Level.NORMAL


def month_start(now: dt.datetime) -> dt.datetime:
    """The first moment of `now`'s month, in UTC."""
    return dt.datetime(now.year, now.month, 1, tzinfo=dt.UTC)


def _next_month(start: dt.datetime) -> dt.datetime:
    return (start + dt.timedelta(days=32)).replace(day=1)


def _usd(amount: float) -> str:
    return f"${amount:,.2f}"


def _alert(level: Level, spent_usd: float, budget: Budget) -> tuple[str, str]:
    spent = _usd(spent_usd)
    if level is Level.PAUSED:
        return (
            f"Konvami: estimated spend reached the {_usd(budget.ceiling_usd).removesuffix('.00')}"
            " ceiling",
            f"This month's estimated spend is {spent}. New voice calls are stopped until the"
            " month ends or the ceiling is raised; text features keep working.",
        )
    return (
        f"Konvami: estimated spend passed the {_usd(budget.target_usd).removesuffix('.00')} target",
        f"This month's estimated spend is {spent}. New calls now use the cheaper voice model;"
        f" voice calls stop at {_usd(budget.ceiling_usd)}.",
    )


class SpendGuard:
    """The month's estimated spend, as a level, emailing each step the first time it is seen."""

    def __init__(
        self,
        *,
        budget: Budget,
        charges: ChargeRepository,
        alerts: AlertLog,
        notifier: Notifier,
        clock: Callable[[], dt.datetime],
    ) -> None:
        self._budget = budget
        self._charges = charges
        self._alerts = alerts
        self._notifier = notifier
        self._clock = clock

    def level(self) -> Level:
        start = month_start(self._clock())
        spent = self._charges.total(start, _next_month(start))
        level = level_of(spent, self._budget)
        if level is not Level.NORMAL:
            self._announce(start.date(), level, spent)
        return level

    def _announce(self, month: dt.date, level: Level, spent: float) -> None:
        if not self._alerts.first(month, level):
            return
        subject, message = _alert(level, spent, self._budget)
        try:
            self._notifier.notify(subject, message)
        except Exception:
            # Tried again with the next request that sees this level.
            _log.exception("budget alert not sent")
            self._alerts.forget(month, level)


class Meter:
    """Where providers report what a request used. Metering never fails the request."""

    def __init__(
        self,
        *,
        prices: Prices,
        charges: ChargeRepository,
        guard: SpendGuard,
        clock: Callable[[], dt.datetime],
    ) -> None:
        self._prices = prices
        self._charges = charges
        self._guard = guard
        self._clock = clock

    def record(
        self, charge: Charge | None, provider: str, model: str, units: Mapping[str, float]
    ) -> None:
        """Records one paid request. A request without a `charge` is not metered."""
        if charge is None:
            return
        try:
            usd = price(self._prices, model, units)
            self._charges.add(
                ChargeRecord(
                    user_id=charge.user_id,
                    feature=charge.feature,
                    provider=provider,
                    model=model,
                    units=dict(units),
                    usd=usd or 0.0,
                    priced=usd is not None,
                    at=self._clock(),
                )
            )
            # Sends the month's alert as soon as a request passes a step.
            self._guard.level()
        except Exception:
            _log.exception("usage not metered")


def week_start(now: dt.datetime) -> dt.datetime:
    """The Monday that starts `now`'s week, at midnight in UTC: when voice minutes come back."""
    day = now.astimezone(dt.UTC).date()
    monday = day - dt.timedelta(days=day.weekday())
    return dt.datetime(monday.year, monday.month, monday.day, tzinfo=dt.UTC)


@dataclass(frozen=True)
class Allowance:
    """A learner's voice minutes this week (spec §6.19), in seconds."""

    weekly_seconds: int
    used_seconds: int
    # When the week's minutes come back.
    resets_at: dt.datetime

    @property
    def remaining_seconds(self) -> int:
        return max(0, self.weekly_seconds - self.used_seconds)


class CostError(Exception):
    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


@dataclass(frozen=True)
class CostReport:
    month: dt.date
    budget: Budget
    level: Level
    spending: Spending
    # The first name of each learner listed; None when the account is gone or has none.
    names: Mapping[UUID, str | None]


class CostService:
    """The owner's view of what the app costs (spec §6.19 owner console)."""

    def __init__(
        self,
        *,
        owners: frozenset[UUID],
        budget: Budget,
        charges: ChargeRepository,
        accounts: AccountDirectory,
        clock: Callable[[], dt.datetime],
    ) -> None:
        self._owners = owners
        self._budget = budget
        self._charges = charges
        self._accounts = accounts
        self._clock = clock

    def is_owner(self, user_id: UUID) -> bool:
        return user_id in self._owners

    def report(self, user_id: UUID, month: dt.date | None = None) -> CostReport:
        """A month's spending (this month by default). Raises `CostError("not_owner")`."""
        if not self.is_owner(user_id):
            raise CostError("not_owner")
        start = month_start(
            self._clock()
            if month is None
            else dt.datetime(month.year, month.month, 1, tzinfo=dt.UTC)
        )
        spending = self._charges.spending(start, _next_month(start), TOP_LEARNERS)
        names = {
            learner.user_id: self._name(learner.user_id)
            for learner in spending.learners
            if learner.user_id is not None
        }
        return CostReport(
            month=start.date(),
            budget=self._budget,
            level=level_of(spending.total_usd, self._budget),
            spending=spending,
            names=names,
        )

    def _name(self, user_id: UUID) -> str | None:
        try:
            return self._accounts.get(user_id).first_name or None
        except AccountNotFound:
            return None
