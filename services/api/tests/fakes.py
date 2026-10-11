"""In-memory stand-ins for the persistence layer, checked against the same contract tests as SQL."""

from collections.abc import Sequence
from datetime import UTC, date, datetime
from typing import Any
from uuid import UUID
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from konvami_api.domain.accounts import DELETION_MEMORY, Account, AccountNotFound
from konvami_api.domain.cards import Card
from konvami_api.domain.conversations import (
    ActivityDays,
    Conversation,
    DayActivity,
    PartnerHistory,
)
from konvami_api.domain.live_call import Turn
from konvami_api.domain.onboarding import OnboardingState
from konvami_api.domain.personas import Persona
from konvami_api.domain.placement import PlacementResult
from konvami_api.domain.profile import ChangeRecord, FieldValue, Profile
from konvami_api.domain.reports import Report, Status, StoredReport
from konvami_api.domain.speech import SpeechTask
from konvami_api.domain.storage import StoredFile, UploadForm
from konvami_api.domain.text import TextTask
from konvami_api.domain.voice import (
    CallPurpose,
    CreatedCall,
    FinishedCall,
    VoiceProviderError,
    VoiceSession,
)


class FixedClock:
    """A clock that tests move by hand."""

    def __init__(self, now: datetime = datetime(2026, 10, 9, 12, 0, tzinfo=UTC)) -> None:
        self.now = now

    def __call__(self) -> datetime:
        return self.now


class InMemoryProfileRepository:
    def __init__(self) -> None:
        self._fields: dict[UUID, dict[tuple[str, str], FieldValue]] = {}
        self._history: dict[UUID, list[ChangeRecord]] = {}

    def load(self, user_id: UUID) -> Profile:
        return Profile(dict(self._fields.get(user_id, {})))

    def save(self, user_id: UUID, changes: Sequence[ChangeRecord]) -> None:
        fields = self._fields.setdefault(user_id, {})
        for change in changes:
            fields[(change.scope, change.field)] = FieldValue(
                value=change.new_value,
                source=change.source,
                # PostgreSQL hands every time back in UTC.
                updated_at=change.changed_at.astimezone(UTC),
            )
        self._history.setdefault(user_id, []).extend(changes)

    def history(self, user_id: UUID) -> list[ChangeRecord]:
        return list(self._history.get(user_id, []))


class InMemoryOnboardingRepository:
    def __init__(self) -> None:
        self._states: dict[UUID, OnboardingState] = {}

    def load(self, user_id: UUID) -> OnboardingState:
        return self._states.get(user_id, OnboardingState())

    def save(self, user_id: UUID, state: OnboardingState) -> None:
        self._states[user_id] = state


class InMemoryVoiceSessionRepository:
    def __init__(self) -> None:
        self.sessions: dict[str, VoiceSession] = {}
        self.finished: dict[str, FinishedCall] = {}

    def started(self, session: VoiceSession) -> None:
        self.sessions[session.call_id] = session

    def get(self, call_id: str) -> VoiceSession | None:
        return self.sessions.get(call_id)

    def count_since(self, user_id: UUID, since: datetime) -> int:
        return sum(
            1
            for session in self.sessions.values()
            if session.user_id == user_id and session.started_at >= since
        )

    def finish(self, call_id: str, result: FinishedCall) -> None:
        if call_id in self.sessions:
            self.finished[call_id] = result


class FakeAccountDirectory:
    def __init__(self, accounts: dict[UUID, Account] | None = None) -> None:
        self.accounts = accounts or {}
        # True: deleting fails and changes nothing. "after": the account is deleted, but the
        # answer is lost on the way, so the caller sees a failure all the same.
        self.fail_delete: bool | str = False
        self.fail_get = False

    def get(self, user_id: UUID) -> Account:
        if self.fail_get:
            raise RuntimeError("the identity provider did not answer")
        if user_id not in self.accounts:
            raise AccountNotFound
        return self.accounts[user_id]

    def delete(self, user_id: UUID) -> None:
        if self.fail_delete == "after":
            self.accounts.pop(user_id, None)
        if self.fail_delete:
            raise RuntimeError("the identity provider did not answer")
        self.accounts.pop(user_id, None)


class InMemoryAccountRepository:
    def __init__(self) -> None:
        self.pictures: dict[UUID, str] = {}
        self.deleted: list[UUID] = []
        self.deleted_at: dict[UUID, datetime] = {}
        self.fail_delete = False

    def picture_key(self, user_id: UUID) -> str | None:
        return self.pictures.get(user_id)

    def set_picture_key(self, user_id: UUID, key: str | None) -> None:
        if key is None:
            self.pictures.pop(user_id, None)
        else:
            self.pictures[user_id] = key

    def delete(self, user_id: UUID, at: datetime) -> None:
        if self.fail_delete:
            raise RuntimeError("the database did not answer")
        self.pictures.pop(user_id, None)
        self.deleted.append(user_id)
        self.deleted_at = {
            user: moment
            for user, moment in self.deleted_at.items()
            if moment >= at - DELETION_MEMORY
        }
        self.deleted_at[user_id] = at

    def is_deleted(self, user_id: UUID) -> bool:
        return user_id in self.deleted_at

    def restore(self, user_id: UUID) -> None:
        self.deleted_at.pop(user_id, None)


class InMemoryFileStore:
    """Files in a dict. `save` also stands in for the app sending a file with an upload form."""

    def __init__(self) -> None:
        self.files: dict[str, tuple[bytes, str]] = {}
        # Every upload form handed out, as the arguments it was asked with.
        self.forms: list[dict[str, Any]] = []

    def keys(self) -> list[str]:
        return sorted(self.files)

    def upload_form(
        self, key: str, *, content_type: str, max_bytes: int, expires_seconds: int
    ) -> UploadForm:
        self.forms.append(
            {
                "key": key,
                "content_type": content_type,
                "max_bytes": max_bytes,
                "expires_seconds": expires_seconds,
            }
        )
        return UploadForm("https://files.test/", {"key": key, "Content-Type": content_type})

    def stat(self, key: str) -> StoredFile | None:
        stored = self.files.get(key)
        return StoredFile(size=len(stored[0]), content_type=stored[1]) if stored else None

    def read_start(self, key: str, count: int) -> bytes:
        return self.files[key][0][:count]

    def read(self, key: str) -> bytes:
        return self.files[key][0]

    def save(self, key: str, body: bytes, content_type: str) -> None:
        self.files[key] = (body, content_type)

    def move(self, source: str, destination: str) -> None:
        self.files[destination] = self.files.pop(source)

    def address(self, key: str, expires_seconds: int) -> str:
        return f"https://files.test/{key}?expires={expires_seconds}"

    def remove(self, key: str) -> None:
        self.files.pop(key, None)

    def remove_all(self, prefix: str) -> None:
        for key in [key for key in self.files if key.startswith(prefix)]:
            del self.files[key]


class FakeVoiceProvider:
    """Answers call creation like the provider does and records what it was asked."""

    def __init__(self) -> None:
        self.created: list[tuple[str, dict[str, Any], str]] = []
        self.hung_up: list[str] = []
        self.fail = False

    def create_call(
        self, sdp_offer: str, session: dict[str, Any], safety_identifier: str
    ) -> CreatedCall:
        if self.fail:
            raise VoiceProviderError
        self.created.append((sdp_offer, session, safety_identifier))
        return CreatedCall(call_id=f"rtc_{len(self.created)}", sdp_answer="v=0 answer")

    def hang_up(self, call_id: str) -> None:
        self.hung_up.append(call_id)


class RecordingCallStarter:
    def __init__(self) -> None:
        self.started: list[tuple[str, UUID, str]] = []
        self.fail = False

    def start(self, call_id: str, user_id: UUID, purpose: CallPurpose) -> None:
        if self.fail:
            raise RuntimeError("could not start the worker")
        self.started.append((call_id, user_id, purpose.value))


class InMemoryPlacementRepository:
    def __init__(self) -> None:
        self.results: dict[tuple[UUID, str], PlacementResult] = {}

    def save(self, user_id: UUID, language: str, result: PlacementResult) -> None:
        self.results[(user_id, language)] = result

    def load(self, user_id: UUID, language: str) -> PlacementResult | None:
        return self.results.get((user_id, language))


class ScriptedTextModel:
    """Answers each task from a queue (a dict, or an error to raise) and records the tasks."""

    def __init__(self, *answers: dict[str, Any] | Exception) -> None:
        self.answers = list(answers)
        self.tasks: list[TextTask] = []

    def answer(self, task: TextTask) -> dict[str, Any]:
        self.tasks.append(task)
        if not self.answers:
            raise AssertionError("the text model was asked more often than the test expected")
        answer = self.answers.pop(0)
        if isinstance(answer, Exception):
            raise answer
        return answer


class InMemoryPersonaRepository:
    def __init__(self) -> None:
        self.personas: dict[UUID, tuple[UUID, str, Persona]] = {}

    def add(self, user_id: UUID, language: str, personas: Sequence[Persona]) -> None:
        for persona in personas:
            self.personas[persona.id] = (user_id, language, persona)

    def for_learner(self, user_id: UUID, language: str) -> list[Persona]:
        return [
            persona
            for owner, spoken, persona in self.personas.values()
            if owner == user_id and spoken == language
        ]

    def update(self, user_id: UUID, persona: Persona) -> bool:
        stored = self.personas.get(persona.id)
        if stored is None or stored[0] != user_id:
            return False
        self.personas[persona.id] = (user_id, stored[1], persona)
        return True

    def remove(self, user_id: UUID, persona_id: UUID) -> bool:
        stored = self.personas.get(persona_id)
        if stored is None or stored[0] != user_id:
            return False
        del self.personas[persona_id]
        return True


class InMemoryConversationRepository:
    """Reads the calls of an `InMemoryVoiceSessionRepository`, as the SQL one reads the tables."""

    def __init__(self, calls: InMemoryVoiceSessionRepository) -> None:
        self._calls = calls

    def _practice(self, user_id: UUID) -> list[Conversation]:
        conversations = []
        for session in self._calls.sessions.values():
            if session.user_id != user_id or session.purpose is not CallPurpose.PRACTICE:
                continue
            finished = self._calls.finished.get(session.call_id)
            conversations.append(
                Conversation(
                    id=session.call_id,
                    persona_id=session.persona_id,
                    started_at=session.started_at,
                    ended_at=finished.ended_at if finished else None,
                    seconds=int((finished.ended_at - session.started_at).total_seconds())
                    if finished
                    else 0,
                    learner_turns=sum(1 for turn in finished.turns if turn.speaker == "learner")
                    if finished
                    else 0,
                )
            )
        return sorted(conversations, key=lambda c: c.started_at, reverse=True)

    def _counted(self, user_id: UUID) -> list[Conversation]:
        return [c for c in self._practice(user_id) if c.counts]

    def listed(self, user_id: UUID, limit: int, before: datetime | None) -> list[Conversation]:
        counted = self._counted(user_id)
        return [c for c in counted if before is None or c.started_at < before][:limit]

    def get(self, user_id: UUID, call_id: str) -> Conversation | None:
        return next((c for c in self._practice(user_id) if c.id == call_id), None)

    def turns(self, call_id: str) -> list[Turn]:
        finished = self._calls.finished.get(call_id)
        return list(finished.turns) if finished else []

    def partner_history(self, user_id: UUID) -> dict[UUID, PartnerHistory]:
        history: dict[UUID, PartnerHistory] = {}
        # Newest first, so the first one seen per partner is the last time they talked.
        for conversation in self._counted(user_id):
            if conversation.persona_id is None:
                continue
            known = history.get(conversation.persona_id)
            history[conversation.persona_id] = PartnerHistory(
                conversations=(known.conversations if known else 0) + 1,
                last_at=known.last_at if known else conversation.started_at,
            )
        return history

    def days(self, user_id: UUID, timezone: str | None, now: datetime) -> ActivityDays:
        try:
            zone = ZoneInfo(timezone) if timezone else UTC
        except (ZoneInfoNotFoundError, ValueError):
            zone = UTC
        days: dict[Any, DayActivity] = {}
        for conversation in self._counted(user_id):
            day = conversation.started_at.astimezone(zone).date()
            known = days.get(day, DayActivity(day, 0, 0))
            days[day] = DayActivity(
                day, known.seconds + conversation.seconds, known.conversations + 1
            )
        newest_first = sorted(days.values(), key=lambda d: d.day, reverse=True)
        return ActivityDays(now.astimezone(zone).date(), tuple(newest_first))


class InMemoryDraftLog:
    def __init__(self) -> None:
        self.drafts: dict[tuple[UUID, date], int] = {}

    def reserve(self, user_id: UUID, day: date, limit: int) -> bool:
        used = self.drafts.get((user_id, day), 0)
        if used >= limit:
            return False
        self.drafts[(user_id, day)] = used + 1
        return True


class FakeSpeechModel:
    """Answers with bytes that name the voice, and records what it was asked to say."""

    def __init__(self) -> None:
        self.tasks: list[SpeechTask] = []
        self.fail: Exception | None = None

    def speak(self, task: SpeechTask) -> bytes:
        if self.fail:
            raise self.fail
        self.tasks.append(task)
        return f"mp3:{task.voice}".encode()


class InMemoryReportRepository:
    """Keeps reports for the calls of an `InMemoryVoiceSessionRepository`."""

    def __init__(self, calls: InMemoryVoiceSessionRepository) -> None:
        self._calls = calls
        self.reports: dict[str, StoredReport] = {}
        self._requests: dict[str, int] = {}
        self._claimed: set[str] = set()

    def request(
        self, call_id: str, at: datetime, *, stale_before: datetime, max_requests: int
    ) -> bool:
        if call_id not in self._calls.sessions:
            return False
        stored = self.reports.get(call_id)
        if stored is not None:
            lost = stored.status == "pending" and stored.requested_at < stale_before
            again = stored.status == "failed" or lost
            if not again or self._requests[call_id] >= max_requests:
                return False
        self._requests[call_id] = self._requests.get(call_id, 0) + 1
        self._claimed.discard(call_id)
        self.reports[call_id] = StoredReport("pending", at.astimezone(UTC), None)
        return True

    def claim(self, call_id: str, at: datetime) -> bool:
        stored = self.reports.get(call_id)
        if stored is None or stored.status != "pending" or call_id in self._claimed:
            return False
        self._claimed.add(call_id)
        return True

    def written(self, call_id: str, status: Status, report: Report | None) -> None:
        stored = self.reports.get(call_id)
        if stored is not None:
            self.reports[call_id] = StoredReport(status, stored.requested_at, report)

    def load(self, call_id: str) -> StoredReport | None:
        return self.reports.get(call_id)

    def latest(self, user_id: UUID) -> Report | None:
        ready = [
            (self._calls.sessions[call_id].started_at, stored.report)
            for call_id, stored in self.reports.items()
            if stored.report is not None and self._calls.sessions[call_id].user_id == user_id
        ]
        return max(ready, key=lambda found: found[0])[1] if ready else None


class RecordingReportStarter:
    def __init__(self) -> None:
        self.started: list[str] = []
        self.fail = False

    def start(self, call_id: str) -> None:
        if self.fail:
            raise RuntimeError("could not start the worker")
        self.started.append(call_id)


class InMemoryCardRepository:
    def __init__(self) -> None:
        # Per card: its owner, its language and what makes it the same card as another.
        self.cards: dict[UUID, tuple[UUID, str, str, Card]] = {}
        # (card, rating) of every review, in order.
        self.reviews: list[tuple[UUID, str]] = []

    def _of(self, user_id: UUID, language: str) -> list[tuple[str, Card]]:
        return [
            (key, card)
            for owner, spoken, key, card in self.cards.values()
            if owner == user_id and spoken == language
        ]

    def add(self, user_id: UUID, language: str, key: str, card: Card, limit: int) -> bool:
        deck = self._of(user_id, language)
        same = any(known == key and other.kind == card.kind for known, other in deck)
        if same or len(deck) >= limit:
            return False
        self.cards[card.id] = (user_id, language, key, card)
        return True

    def by_key(self, user_id: UUID, language: str, kind: str, key: str) -> Card | None:
        return next(
            (
                card
                for known, card in self._of(user_id, language)
                if (card.kind, known) == (kind, key)
            ),
            None,
        )

    def get(self, user_id: UUID, card_id: UUID) -> Card | None:
        stored = self.cards.get(card_id)
        return stored[3] if stored and stored[0] == user_id else None

    def listed(
        self, user_id: UUID, language: str, limit: int, before: datetime | None
    ) -> list[Card]:
        cards = [card for _, card in self._of(user_id, language)]
        newest_first = sorted(cards, key=lambda c: (c.created_at, str(c.id)), reverse=True)
        return [c for c in newest_first if before is None or c.created_at < before][:limit]

    def due(self, user_id: UUID, language: str, now: datetime, limit: int) -> list[Card]:
        waiting = [card for _, card in self._of(user_id, language) if card.due_at <= now]
        return sorted(waiting, key=lambda c: (c.due_at, c.created_at, str(c.id)))[:limit]

    def counts(self, user_id: UUID, language: str, now: datetime) -> tuple[int, int]:
        cards = [card for _, card in self._of(user_id, language)]
        return len(cards), sum(1 for card in cards if card.due_at <= now)

    def reviewed(self, user_id: UUID, card: Card, rating: str, reviews_before: int) -> bool:
        stored = self.cards.get(card.id)
        if stored is None or stored[0] != user_id or stored[3].reviews != reviews_before:
            return False
        self.cards[card.id] = (*stored[:3], card)
        self.reviews.append((card.id, rating))
        return True

    def remove(self, user_id: UUID, card_id: UUID) -> bool:
        stored = self.cards.get(card_id)
        if stored is None or stored[0] != user_id:
            return False
        del self.cards[card_id]
        return True

    def known(
        self, user_id: UUID, language: str, keys: Sequence[tuple[str, str]]
    ) -> set[tuple[str, str]]:
        have: set[tuple[str, str]] = {(card.kind, key) for key, card in self._of(user_id, language)}
        return have & set(keys)
