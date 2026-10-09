"""In-memory stand-ins for the persistence layer, checked against the same contract tests as SQL."""

from collections.abc import Sequence
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from konvami_api.domain.accounts import Account, AccountNotFound
from konvami_api.domain.onboarding import OnboardingState
from konvami_api.domain.personas import Persona
from konvami_api.domain.placement import PlacementResult
from konvami_api.domain.profile import ChangeRecord, FieldValue, Profile
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

    def get(self, user_id: UUID) -> Account:
        if user_id not in self.accounts:
            raise AccountNotFound
        return self.accounts[user_id]


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
