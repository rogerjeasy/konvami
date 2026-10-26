"""Push notifications sent by the server (spec §6.18), for what the phone cannot know while the
app is closed: a report that was written after the call, a simulation that was scored, and a
learner who has not talked for a week (the phone's own reminders stop by then).

A device is reachable once the app has registered it, which it does only while the learner has
reminders on and the phone allows notifications. Sending goes through a provider (Expo's push
service, which hands on to Apple and Google); a push that fails is never a reason for anything
else to fail.
"""

import datetime as dt
import logging
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass
from typing import Literal, Protocol
from uuid import UUID
from zoneinfo import ZoneInfo

from konvami_api.domain.conversations import ConversationService, zone_of
from konvami_api.domain.personas import PersonaService

logger = logging.getLogger(__name__)

Platform = Literal["ios", "android"]
# The app languages, which a push is written in.
LANGUAGES = ("en", "de", "fr", "it")
# A learner who has not talked for this long is nudged, at most once in that time.
QUIET_FOR = dt.timedelta(days=7)

# What each push says, in each app language: from the partner, never a reproach. Typographic
# apostrophes and French spacing, as in the app's own strings.
_WORDS: Mapping[str, Mapping[str, str]] = {
    "report": {
        "en": "Your report on our conversation is ready.",
        "de": "Dein Bericht zu unserem Gespräch ist fertig.",
        "fr": "Ton bilan de notre conversation est prêt.",
        "it": "Il resoconto della nostra conversazione è pronto.",
    },
    "simulation": {
        "en": "Your simulation is scored. See how you did.",
        "de": "Deine Simulation ist bewertet. Schau, wie es gelaufen ist.",
        "fr": "Ta simulation est notée. Regarde comment ça s’est passé.",  # noqa: RUF001
        "it": "La tua simulazione è stata valutata. Guarda com’è andata.",  # noqa: RUF001
    },
    "nudge": {
        "en": "It’s been a while. Got five minutes to talk?",  # noqa: RUF001
        "de": "Wir haben lange nicht gesprochen. Hast du fünf Minuten?",
        "fr": "Ça fait un moment ! Tu as cinq minutes pour parler ?",  # noqa: RUF001
        "it": "È passato un po’. Hai cinque minuti per parlare?",  # noqa: RUF001
    },
}
APP_NAME = "Konvami"


@dataclass(frozen=True)
class PushDevice:
    # The provider's address of the app on one phone.
    token: str
    user_id: UUID
    platform: Platform
    # The phone's time zone, app language and reminder time ("18:00"): the nudge comes then.
    timezone: str
    language: str
    time: str
    registered_at: dt.datetime
    # When this phone was last nudged; None before.
    nudged_at: dt.datetime | None = None


@dataclass(frozen=True)
class PushMessage:
    token: str
    title: str
    body: str
    # What a tap opens: {"open": "report", "id": call id}, {"open": "simulation", …} or Today.
    data: Mapping[str, str]


class PushDeviceRepository(Protocol):
    def register(self, device: PushDevice, limit: int) -> None:
        """Keeps a phone for a learner, in place of what was kept for its token (a phone
        signed in to another account moves to this one), and at most `limit` phones of theirs:
        the ones registered longest ago go."""

    def remove(self, token: str, user_id: UUID | None = None) -> None:
        """Forgets a phone: the learner's own one, or (without a learner) one the provider no
        longer reaches."""

    def of(self, user_id: UUID) -> list[PushDevice]: ...

    def not_nudged_since(self, since: dt.datetime, limit: int) -> list[PushDevice]:
        """The phones not nudged since `since` (or never), the longest waiting first."""

    def nudged(self, token: str, at: dt.datetime) -> None: ...


class PushSender(Protocol):
    def send(self, messages: Sequence[PushMessage]) -> list[str]:
        """Sends the messages; answers the tokens the provider says no longer reach a phone.
        Raises `PushError` when it could not send."""


class PushError(Exception):
    pass


class PushRequestError(Exception):
    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


# How many phones the nudge looks at in one run: plenty for the testers.
NUDGE_SCAN = 1000
# The phones one learner may have reached by push: a tablet and a phone or two, no more.
MAX_PHONES = 5


def _is_zone(name: str) -> bool:
    """Whether a name is a time zone this server knows."""
    try:
        ZoneInfo(name)
    except Exception:
        return False
    return True


class PushService:
    def __init__(
        self,
        *,
        repository: PushDeviceRepository,
        sender: PushSender,
        personas: PersonaService,
        conversations: ConversationService,
        clock: Callable[[], dt.datetime],
    ) -> None:
        self._repository = repository
        self._sender = sender
        self._personas = personas
        self._conversations = conversations
        self._clock = clock

    def register(
        self,
        user_id: UUID,
        *,
        token: str,
        platform: Platform,
        timezone: str,
        language: str,
        time: str,
    ) -> None:
        if language not in LANGUAGES or not _is_zone(timezone):
            raise PushRequestError("invalid_value")
        self._repository.register(
            PushDevice(token, user_id, platform, timezone, language, time, self._clock()),
            MAX_PHONES,
        )

    def unregister(self, user_id: UUID, token: str) -> None:
        self._repository.remove(token, user_id)

    def _send(
        self, devices: Sequence[PushDevice], kind: str, title: str, data: Mapping[str, str]
    ) -> None:
        if not devices:
            return
        messages = [
            PushMessage(device.token, title, _WORDS[kind][device.language], data)
            for device in devices
        ]
        try:
            gone = self._sender.send(messages)
        except PushError:
            logger.warning("push not sent: %s", kind)
            return
        for token in gone:
            self._repository.remove(token)

    def _partner_name(self, user_id: UUID, persona_id: UUID | None) -> str:
        partners = self._personas.partners(user_id)
        chosen = next(
            (p for p in partners if p.id == persona_id), partners[0] if partners else None
        )
        return chosen.name if chosen else APP_NAME

    def report_ready(self, user_id: UUID, call_id: str, persona_id: UUID | None) -> None:
        """The report on a conversation was written: from its partner, opening the report."""
        self._send(
            self._repository.of(user_id),
            "report",
            self._partner_name(user_id, persona_id),
            {"open": "report", "id": call_id},
        )

    def simulation_scored(self, user_id: UUID, call_id: str, exam_name: str) -> None:
        self._send(
            self._repository.of(user_id),
            "simulation",
            exam_name,
            {"open": "simulation", "id": call_id},
        )

    def nudge(self) -> int:
        """Once an hour: each phone whose reminder hour it is now, of a learner who has not
        talked for a week and was not nudged in that week, gets one gentle push from the partner
        they talked to last. Answers how many were nudged."""
        now = self._clock()
        due: dict[UUID, list[PushDevice]] = {}
        for device in self._repository.not_nudged_since(now - QUIET_FOR, NUDGE_SCAN):
            try:
                local = now.astimezone(zone_of(device.timezone))
                hour = int(device.time[:2])
            except (ValueError, OSError):
                # A row that cannot be read is skipped; the others are still nudged.
                logger.warning("push device skipped: unreadable time zone or hour")
                continue
            if local.hour == hour:
                due.setdefault(device.user_id, []).append(device)
        nudged = 0
        for user_id, devices in due.items():
            last = self._conversations.listed(user_id, limit=1).conversations
            # Someone who never talked is quiet from when the phone was registered.
            quiet_from = (
                last[0].started_at if last else min(device.registered_at for device in devices)
            )
            if now - quiet_from < QUIET_FOR:
                continue
            partner = last[0].persona_id if last else None
            self._send(devices, "nudge", self._partner_name(user_id, partner), {"open": "today"})
            for device in devices:
                self._repository.nudged(device.token, now)
            nudged += len(devices)
        return nudged
