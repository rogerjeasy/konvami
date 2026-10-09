"""The repositories on PostgreSQL. Each write is one statement, so it is atomic without a
transaction (see `sql.py`); the owning `app_user` row is created on a user's first write.
"""

import datetime as dt
import json
from collections.abc import Sequence
from uuid import UUID

from konvami_api.domain.onboarding import OnboardingState, PlacementStatus
from konvami_api.domain.personas import Persona
from konvami_api.domain.placement import PlacementResult
from konvami_api.domain.profile import ChangeRecord, FieldValue, Profile, Source
from konvami_api.domain.voice import CallPurpose, FinishedCall, VoiceSession
from konvami_api.persistence.sql import SqlClient, epoch_micros, from_epoch_micros

_ENSURE_USER = """
    owner AS (
        INSERT INTO app_user (id) VALUES (CAST(:user_id AS uuid)) ON CONFLICT (id) DO NOTHING
    )
"""

_LOAD_PROFILE = f"""
    SELECT scope, field, CAST(value AS text) AS value, source,
           {epoch_micros("updated_at")} AS updated_at
    FROM profile_field
    WHERE user_id = CAST(:user_id AS uuid)
"""

# The changes arrive as one JSON array. All of them are logged in order; for a field changed
# more than once, the last value is the one stored.
_SAVE_PROFILE = f"""
    WITH input AS (
        SELECT position,
               item ->> 'scope' AS scope,
               item ->> 'field' AS field,
               item -> 'old_value' AS old_value,
               item -> 'new_value' AS new_value,
               item ->> 'source' AS source,
               item ->> 'origin' AS origin,
               CAST(item ->> 'changed_at' AS timestamptz) AS changed_at
        FROM jsonb_array_elements(CAST(:changes AS jsonb)) WITH ORDINALITY AS t (item, position)
    ),
    {_ENSURE_USER},
    logged AS (
        INSERT INTO profile_change
            (user_id, scope, field, old_value, new_value, source, origin, changed_at)
        SELECT CAST(:user_id AS uuid), scope, field, old_value, new_value, source, origin,
               changed_at
        FROM input
        ORDER BY position
    )
    INSERT INTO profile_field (user_id, scope, field, value, source, updated_at)
    SELECT DISTINCT ON (scope, field)
           CAST(:user_id AS uuid), scope, field, new_value, source, changed_at
    FROM input
    ORDER BY scope, field, position DESC
    ON CONFLICT (user_id, scope, field) DO UPDATE
        SET value = EXCLUDED.value, source = EXCLUDED.source, updated_at = EXCLUDED.updated_at
"""

_LOAD_ONBOARDING = f"""
    SELECT {epoch_micros("essentials_confirmed_at")} AS essentials_confirmed_at, placement,
           {epoch_micros("partners_confirmed_at")} AS partners_confirmed_at,
           {epoch_micros("completed_at")} AS completed_at
    FROM onboarding
    WHERE user_id = CAST(:user_id AS uuid)
"""

_SAVE_ONBOARDING = f"""
    WITH {_ENSURE_USER}
    INSERT INTO onboarding
        (user_id, essentials_confirmed_at, placement, partners_confirmed_at, completed_at)
    VALUES (CAST(:user_id AS uuid), CAST(:essentials_confirmed_at AS timestamptz), :placement,
            CAST(:partners_confirmed_at AS timestamptz), CAST(:completed_at AS timestamptz))
    ON CONFLICT (user_id) DO UPDATE
        SET essentials_confirmed_at = EXCLUDED.essentials_confirmed_at,
            placement = EXCLUDED.placement,
            partners_confirmed_at = EXCLUDED.partners_confirmed_at,
            completed_at = EXCLUDED.completed_at
"""

# The personas arrive as one JSON array and are stored in its order.
_ADD_PERSONAS = f"""
    WITH {_ENSURE_USER}
    INSERT INTO persona
        (id, user_id, language, role, name, gender, age, origin, tagline, backstory, look, voice)
    SELECT CAST(item ->> 'id' AS uuid), CAST(:user_id AS uuid), :language, item ->> 'role',
           item ->> 'name', item ->> 'gender', CAST(item ->> 'age' AS integer),
           item ->> 'origin', item ->> 'tagline', item ->> 'backstory', item -> 'look',
           item ->> 'voice'
    FROM jsonb_array_elements(CAST(:personas AS jsonb)) WITH ORDINALITY AS t (item, position)
    ORDER BY position
"""

_LIST_PERSONAS = """
    SELECT CAST(id AS text) AS id, role, name, gender, age, origin, tagline, backstory,
           CAST(look AS text) AS look, voice
    FROM persona
    WHERE user_id = CAST(:user_id AS uuid) AND language = :language
    ORDER BY position
"""

_UPDATE_PERSONA = """
    UPDATE persona
    SET name = :name, look = CAST(:look AS jsonb)
    WHERE id = CAST(:id AS uuid) AND user_id = CAST(:user_id AS uuid)
    RETURNING 1 AS changed
"""

_REMOVE_PERSONA = """
    DELETE FROM persona
    WHERE id = CAST(:id AS uuid) AND user_id = CAST(:user_id AS uuid)
    RETURNING 1 AS removed
"""

_START_SESSION = f"""
    WITH {_ENSURE_USER}
    INSERT INTO voice_session (call_id, user_id, purpose, model, started_at)
    VALUES (:call_id, CAST(:user_id AS uuid), :purpose, :model, CAST(:started_at AS timestamptz))
"""

_LOAD_SESSION = f"""
    SELECT call_id, CAST(user_id AS text) AS user_id, purpose, model,
           {epoch_micros("started_at")} AS started_at
    FROM voice_session
    WHERE call_id = :call_id
"""

_COUNT_SESSIONS = """
    SELECT count(*) AS calls
    FROM voice_session
    WHERE user_id = CAST(:user_id AS uuid) AND started_at >= CAST(:since AS timestamptz)
"""

# Ends the call and stores its turns together. An unknown call updates no row, so no turn is
# inserted either; finishing twice keeps the first transcript.
_FINISH_SESSION = """
    WITH done AS (
        UPDATE voice_session
        SET ended_at = CAST(:ended_at AS timestamptz),
            outcome = :outcome,
            usage = CAST(:usage AS jsonb)
        WHERE call_id = :call_id
        RETURNING call_id
    )
    INSERT INTO voice_turn (call_id, position, speaker, text)
    SELECT done.call_id, turn.position, turn.item ->> 'speaker', turn.item ->> 'text'
    FROM done,
         jsonb_array_elements(CAST(:turns AS jsonb)) WITH ORDINALITY AS turn (item, position)
    ON CONFLICT (call_id, position) DO NOTHING
"""

_SAVE_PLACEMENT = f"""
    WITH {_ENSURE_USER}
    INSERT INTO placement_result (user_id, language, levels, overall, weak_areas, measured_at)
    VALUES (CAST(:user_id AS uuid), :language, CAST(:levels AS jsonb), :overall,
            CAST(:weak_areas AS jsonb), CAST(:measured_at AS timestamptz))
    ON CONFLICT (user_id, language) DO UPDATE
        SET levels = EXCLUDED.levels, overall = EXCLUDED.overall,
            weak_areas = EXCLUDED.weak_areas, measured_at = EXCLUDED.measured_at
"""

_LOAD_PLACEMENT = f"""
    SELECT CAST(levels AS text) AS levels, overall, CAST(weak_areas AS text) AS weak_areas,
           {epoch_micros("measured_at")} AS measured_at
    FROM placement_result
    WHERE user_id = CAST(:user_id AS uuid) AND language = :language
"""


def _moment(micros: int | None) -> dt.datetime | None:
    return None if micros is None else from_epoch_micros(micros)


def _iso(moment: dt.datetime | None) -> str | None:
    return None if moment is None else moment.isoformat()


class SqlProfileRepository:
    def __init__(self, client: SqlClient) -> None:
        self._client = client

    def load(self, user_id: UUID) -> Profile:
        rows = self._client.execute(_LOAD_PROFILE, {"user_id": str(user_id)})
        return Profile(
            {
                (row["scope"], row["field"]): FieldValue(
                    value=json.loads(row["value"]),
                    source=Source(row["source"]),
                    updated_at=from_epoch_micros(row["updated_at"]),
                )
                for row in rows
            }
        )

    def save(self, user_id: UUID, changes: Sequence[ChangeRecord]) -> None:
        if not changes:
            return
        payload = [
            {
                "scope": change.scope,
                "field": change.field,
                "old_value": change.old_value,
                "new_value": change.new_value,
                "source": change.source.value,
                "origin": change.origin.value,
                "changed_at": change.changed_at.isoformat(),
            }
            for change in changes
        ]
        self._client.execute(
            _SAVE_PROFILE, {"user_id": str(user_id), "changes": json.dumps(payload)}
        )


class SqlOnboardingRepository:
    def __init__(self, client: SqlClient) -> None:
        self._client = client

    def load(self, user_id: UUID) -> OnboardingState:
        rows = self._client.execute(_LOAD_ONBOARDING, {"user_id": str(user_id)})
        if not rows:
            return OnboardingState()
        row = rows[0]
        return OnboardingState(
            essentials_confirmed_at=_moment(row["essentials_confirmed_at"]),
            placement=PlacementStatus(row["placement"]),
            partners_confirmed_at=_moment(row["partners_confirmed_at"]),
            completed_at=_moment(row["completed_at"]),
        )

    def save(self, user_id: UUID, state: OnboardingState) -> None:
        self._client.execute(
            _SAVE_ONBOARDING,
            {
                "user_id": str(user_id),
                "essentials_confirmed_at": _iso(state.essentials_confirmed_at),
                "placement": state.placement.value,
                "partners_confirmed_at": _iso(state.partners_confirmed_at),
                "completed_at": _iso(state.completed_at),
            },
        )


class SqlVoiceSessionRepository:
    def __init__(self, client: SqlClient) -> None:
        self._client = client

    def started(self, session: VoiceSession) -> None:
        self._client.execute(
            _START_SESSION,
            {
                "call_id": session.call_id,
                "user_id": str(session.user_id),
                "purpose": session.purpose.value,
                "model": session.model,
                "started_at": session.started_at.isoformat(),
            },
        )

    def get(self, call_id: str) -> VoiceSession | None:
        rows = self._client.execute(_LOAD_SESSION, {"call_id": call_id})
        if not rows:
            return None
        row = rows[0]
        return VoiceSession(
            call_id=row["call_id"],
            user_id=UUID(row["user_id"]),
            purpose=CallPurpose(row["purpose"]),
            model=row["model"],
            started_at=from_epoch_micros(row["started_at"]),
        )

    def count_since(self, user_id: UUID, since: dt.datetime) -> int:
        rows = self._client.execute(
            _COUNT_SESSIONS, {"user_id": str(user_id), "since": since.isoformat()}
        )
        return int(rows[0]["calls"])

    def finish(self, call_id: str, result: FinishedCall) -> None:
        turns = [{"speaker": turn.speaker, "text": turn.text} for turn in result.turns]
        self._client.execute(
            _FINISH_SESSION,
            {
                "call_id": call_id,
                "ended_at": result.ended_at.isoformat(),
                "outcome": result.outcome,
                "usage": json.dumps(dict(result.usage)),
                "turns": json.dumps(turns),
            },
        )


class SqlPlacementRepository:
    def __init__(self, client: SqlClient) -> None:
        self._client = client

    def save(self, user_id: UUID, language: str, result: PlacementResult) -> None:
        self._client.execute(
            _SAVE_PLACEMENT,
            {
                "user_id": str(user_id),
                "language": language,
                "levels": json.dumps(dict(result.levels)),
                "overall": result.overall,
                "weak_areas": json.dumps(list(result.weak_areas)),
                "measured_at": result.measured_at.isoformat(),
            },
        )

    def load(self, user_id: UUID, language: str) -> PlacementResult | None:
        rows = self._client.execute(
            _LOAD_PLACEMENT, {"user_id": str(user_id), "language": language}
        )
        if not rows:
            return None
        row = rows[0]
        return PlacementResult(
            levels=json.loads(row["levels"]),
            overall=row["overall"],
            weak_areas=tuple(json.loads(row["weak_areas"])),
            measured_at=from_epoch_micros(row["measured_at"]),
        )


class SqlPersonaRepository:
    def __init__(self, client: SqlClient) -> None:
        self._client = client

    def add(self, user_id: UUID, language: str, personas: Sequence[Persona]) -> None:
        if not personas:
            return
        payload = [
            {
                "id": str(persona.id),
                "role": persona.role,
                "name": persona.name,
                "gender": persona.gender,
                "age": persona.age,
                "origin": persona.origin,
                "tagline": persona.tagline,
                "backstory": persona.backstory,
                "look": persona.look,
                "voice": persona.voice,
            }
            for persona in personas
        ]
        self._client.execute(
            _ADD_PERSONAS,
            {"user_id": str(user_id), "language": language, "personas": json.dumps(payload)},
        )

    def for_learner(self, user_id: UUID, language: str) -> list[Persona]:
        rows = self._client.execute(_LIST_PERSONAS, {"user_id": str(user_id), "language": language})
        return [
            Persona(
                id=UUID(row["id"]),
                role=row["role"],
                name=row["name"],
                gender=row["gender"],
                age=row["age"],
                origin=row["origin"],
                tagline=row["tagline"],
                backstory=row["backstory"],
                look=json.loads(row["look"]),
                voice=row["voice"],
            )
            for row in rows
        ]

    def update(self, user_id: UUID, persona: Persona) -> bool:
        rows = self._client.execute(
            _UPDATE_PERSONA,
            {
                "id": str(persona.id),
                "user_id": str(user_id),
                "name": persona.name,
                "look": json.dumps(persona.look),
            },
        )
        return bool(rows)

    def remove(self, user_id: UUID, persona_id: UUID) -> bool:
        rows = self._client.execute(
            _REMOVE_PERSONA, {"id": str(persona_id), "user_id": str(user_id)}
        )
        return bool(rows)
