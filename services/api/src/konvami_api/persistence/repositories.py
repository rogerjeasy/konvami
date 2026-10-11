"""The repositories on PostgreSQL. Each write is one statement, so it is atomic without a
transaction (see `sql.py`); the owning `app_user` row is created on a user's first write.
"""

import dataclasses
import datetime as dt
import json
from collections.abc import Sequence
from typing import Any
from uuid import UUID

from konvami_api.domain.accounts import DELETION_MEMORY
from konvami_api.domain.conversations import (
    ActivityDays,
    Conversation,
    DayActivity,
    PartnerHistory,
)
from konvami_api.domain.live_call import Turn
from konvami_api.domain.onboarding import OnboardingState, PlacementStatus
from konvami_api.domain.personas import Persona
from konvami_api.domain.placement import PlacementResult
from konvami_api.domain.profile import ChangeRecord, FieldValue, Profile, Source
from konvami_api.domain.reports import (
    Mistake,
    Report,
    Rewrite,
    Stats,
    Status,
    StoredReport,
    Word,
)
from konvami_api.domain.voice import CallPurpose, FinishedCall, VoiceSession
from konvami_api.persistence.sql import SqlClient, epoch_micros, from_epoch_micros

# Every write for a learner begins by making sure their `app_user` row is there. A trigger on
# that table (migration 0008) takes the account's lock and refuses the row, and with it the
# whole statement, when the account was deleted: its last access token may still be in use.
_ENSURE_USER = """
    owner AS (
        INSERT INTO app_user (id) VALUES (CAST(:user_id AS uuid)) ON CONFLICT (id) DO NOTHING
    )
"""

_LOAD_PICTURE = "SELECT picture_key FROM app_user WHERE id = CAST(:user_id AS uuid)"

_SAVE_PICTURE = """
    INSERT INTO app_user (id, picture_key)
    VALUES (CAST(:user_id AS uuid), CAST(:picture_key AS text))
    ON CONFLICT (id) DO UPDATE SET picture_key = EXCLUDED.picture_key
"""

# Deletes the learner's rows and remembers the deletion, under the account's lock, so that no
# write for the same account overlaps with it (migration 0008).
_DELETE_USER = """
    SELECT delete_app_user(
        CAST(:user_id AS uuid),
        CAST(:deleted_at AS timestamptz),
        CAST(:forget_before AS timestamptz)
    ) AS done
"""

_FORGET_DELETION = "DELETE FROM deleted_user WHERE id = CAST(:user_id AS uuid)"

_IS_DELETED = "SELECT 1 AS gone FROM deleted_user WHERE id = CAST(:user_id AS uuid)"

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
        (id, user_id, language, role, name, gender, age, origin, tagline, backstory, look, voice,
         occupation, personality, teaching)
    SELECT CAST(item ->> 'id' AS uuid), CAST(:user_id AS uuid), :language, item ->> 'role',
           item ->> 'name', item ->> 'gender', CAST(item ->> 'age' AS integer),
           item ->> 'origin', item ->> 'tagline', item ->> 'backstory', item -> 'look',
           item ->> 'voice', item ->> 'occupation', item -> 'personality', item -> 'teaching'
    FROM jsonb_array_elements(CAST(:personas AS jsonb)) WITH ORDINALITY AS t (item, position)
    ORDER BY position
"""

_LIST_PERSONAS = """
    SELECT CAST(id AS text) AS id, role, name, gender, age, origin, tagline, backstory,
           CAST(look AS text) AS look, voice, occupation,
           CAST(personality AS text) AS personality, CAST(teaching AS text) AS teaching
    FROM persona
    WHERE user_id = CAST(:user_id AS uuid) AND language = :language
    ORDER BY position
"""

# The changed persona arrives as one JSON object: every field but its id and its place.
_UPDATE_PERSONA = """
    UPDATE persona
    SET role = item ->> 'role',
        name = item ->> 'name',
        gender = item ->> 'gender',
        age = CAST(item ->> 'age' AS integer),
        origin = item ->> 'origin',
        tagline = item ->> 'tagline',
        backstory = item ->> 'backstory',
        look = item -> 'look',
        voice = item ->> 'voice',
        occupation = item ->> 'occupation',
        personality = item -> 'personality',
        teaching = item -> 'teaching'
    FROM (SELECT CAST(:persona AS jsonb) AS item) AS input
    WHERE id = CAST(:id AS uuid) AND user_id = CAST(:user_id AS uuid)
    RETURNING 1 AS changed
"""

_REMOVE_PERSONA = """
    DELETE FROM persona
    WHERE id = CAST(:id AS uuid) AND user_id = CAST(:user_id AS uuid)
    RETURNING 1 AS removed
"""

# Counts one more draft for the day, unless the limit is reached: the row is locked while it is
# raised, so requests arriving together are counted one after the other. No row comes back
# when the limit stands.
_RESERVE_DRAFT = f"""
    WITH {_ENSURE_USER}
    INSERT INTO persona_draft_day (user_id, day, drafts)
    VALUES (CAST(:user_id AS uuid), CAST(:day AS date), 1)
    ON CONFLICT (user_id, day) DO UPDATE SET drafts = persona_draft_day.drafts + 1
        WHERE persona_draft_day.drafts < :limit
    RETURNING drafts
"""

_START_SESSION = f"""
    WITH {_ENSURE_USER}
    INSERT INTO voice_session (call_id, user_id, purpose, model, started_at, persona_id)
    VALUES (:call_id, CAST(:user_id AS uuid), :purpose, :model, CAST(:started_at AS timestamptz),
            CAST(:persona_id AS uuid))
"""

_LOAD_SESSION = f"""
    SELECT call_id, CAST(user_id AS text) AS user_id, purpose, model,
           {epoch_micros("started_at")} AS started_at, CAST(persona_id AS text) AS persona_id
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

# A learner's practice calls, as `s`.
_PRACTICE = "s.user_id = CAST(:user_id AS uuid) AND s.purpose = 'practice'"
# The ones that count (see `domain/conversations.py`): ended, and the learner said something.
_COUNTED = f"""
    {_PRACTICE} AND s.ended_at IS NOT NULL
    AND EXISTS (
        SELECT 1 FROM voice_turn t WHERE t.call_id = s.call_id AND t.speaker = 'learner'
    )
"""
# Whole seconds, rounded down; null while the call has not ended.
_SECONDS = "floor(extract(epoch FROM s.ended_at - s.started_at))"

_CONVERSATION = f"""
    SELECT s.call_id, CAST(s.persona_id AS text) AS persona_id,
           {epoch_micros("s.started_at")} AS started_at,
           {epoch_micros("s.ended_at")} AS ended_at,
           CAST({_SECONDS} AS integer) AS seconds,
           (
               SELECT CAST(count(*) AS integer) FROM voice_turn t
               WHERE t.call_id = s.call_id AND t.speaker = 'learner'
           ) AS learner_turns
    FROM voice_session s
"""

_LIST_CONVERSATIONS = f"""
    {_CONVERSATION}
    WHERE {_COUNTED}
      AND (CAST(:before AS timestamptz) IS NULL OR s.started_at < CAST(:before AS timestamptz))
    ORDER BY s.started_at DESC, s.call_id DESC
    LIMIT :limit
"""

_LOAD_CONVERSATION = f"""
    {_CONVERSATION}
    WHERE {_PRACTICE} AND s.call_id = :call_id
"""

_LIST_TURNS = """
    SELECT speaker, text FROM voice_turn WHERE call_id = :call_id ORDER BY position
"""

_PARTNER_HISTORY = f"""
    SELECT CAST(s.persona_id AS text) AS persona_id,
           CAST(count(*) AS integer) AS conversations,
           {epoch_micros("max(s.started_at)")} AS last_at
    FROM voice_session s
    WHERE {_COUNTED} AND s.persona_id IS NOT NULL
    GROUP BY s.persona_id
"""

# Days are cut in the learner's time zone, by the database, which knows every zone's rules. A
# name it does not know counts as UTC. Always one row at least, so `today` is always there; its
# other columns are null when the learner has not practised yet.
_PRACTICE_DAYS = f"""
    WITH zone AS (
        SELECT COALESCE(
            (SELECT name FROM pg_timezone_names WHERE name = :timezone), 'UTC'
        ) AS name
    ),
    per_day AS (
        SELECT CAST(s.started_at AT TIME ZONE zone.name AS date) AS day,
               sum({_SECONDS}) AS seconds,
               count(*) AS conversations
        FROM voice_session s, zone
        WHERE {_COUNTED}
        GROUP BY 1
    )
    SELECT to_char(
               CAST(CAST(:now AS timestamptz) AT TIME ZONE zone.name AS date), 'YYYY-MM-DD'
           ) AS today,
           to_char(per_day.day, 'YYYY-MM-DD') AS day,
           CAST(per_day.seconds AS integer) AS seconds,
           CAST(per_day.conversations AS integer) AS conversations
    FROM zone LEFT JOIN per_day ON true
    ORDER BY per_day.day DESC
"""

# Asking for a report is a write for the call's learner, so it begins like every other one
# (see `_ENSURE_USER`). A call that does not exist, or whose account was deleted, gets nothing.
# One statement decides whether the report may be started (again) and marks it, so of several
# requests at once only one gets its row back: each start is paid for.
_REQUEST_REPORT = """
    WITH call AS (
        SELECT call_id, user_id FROM voice_session WHERE call_id = :call_id
    ),
    owner AS (
        INSERT INTO app_user (id) SELECT user_id FROM call ON CONFLICT (id) DO NOTHING
    )
    INSERT INTO session_report (call_id, status, requested_at, requests, writing_since, content)
    SELECT call_id, 'pending', CAST(:requested_at AS timestamptz), 1, NULL, NULL FROM call
    ON CONFLICT (call_id) DO UPDATE
        SET status = EXCLUDED.status, requested_at = EXCLUDED.requested_at,
            requests = session_report.requests + 1, writing_since = NULL, content = NULL
        WHERE session_report.requests < :max_requests
          AND (
              session_report.status = 'failed'
              OR (
                  session_report.status = 'pending'
                  AND session_report.requested_at < CAST(:stale_before AS timestamptz)
              )
          )
    RETURNING call_id
"""

# The worker that sets writing_since is the one that writes; a second one gets no row.
_CLAIM_REPORT = """
    UPDATE session_report
    SET writing_since = CAST(:at AS timestamptz)
    WHERE call_id = :call_id AND status = 'pending' AND writing_since IS NULL
    RETURNING call_id
"""

_WRITE_REPORT = """
    UPDATE session_report
    SET status = :status, content = CAST(:content AS jsonb)
    WHERE call_id = :call_id
"""

_LOAD_REPORT = f"""
    SELECT status, {epoch_micros("requested_at")} AS requested_at,
           CAST(content AS text) AS content
    FROM session_report
    WHERE call_id = :call_id
"""

_LATEST_REPORT = """
    SELECT CAST(r.content AS text) AS content
    FROM session_report r JOIN voice_session s ON s.call_id = r.call_id
    WHERE s.user_id = CAST(:user_id AS uuid) AND r.status = 'ready'
    ORDER BY s.started_at DESC, s.call_id DESC
    LIMIT 1
"""


def _moment(micros: int | None) -> dt.datetime | None:
    return None if micros is None else from_epoch_micros(micros)


def _iso(moment: dt.datetime | None) -> str | None:
    return None if moment is None else moment.isoformat()


class SqlAccountRepository:
    def __init__(self, client: SqlClient) -> None:
        self._client = client

    def picture_key(self, user_id: UUID) -> str | None:
        rows = self._client.execute(_LOAD_PICTURE, {"user_id": str(user_id)})
        key: str | None = rows[0]["picture_key"] if rows else None
        return key

    def set_picture_key(self, user_id: UUID, key: str | None) -> None:
        self._client.execute(_SAVE_PICTURE, {"user_id": str(user_id), "picture_key": key})

    def delete(self, user_id: UUID, at: dt.datetime) -> None:
        self._client.execute(
            _DELETE_USER,
            {
                "user_id": str(user_id),
                "deleted_at": at.isoformat(),
                "forget_before": (at - DELETION_MEMORY).isoformat(),
            },
        )

    def is_deleted(self, user_id: UUID) -> bool:
        return bool(self._client.execute(_IS_DELETED, {"user_id": str(user_id)}))

    def restore(self, user_id: UUID) -> None:
        self._client.execute(_FORGET_DELETION, {"user_id": str(user_id)})


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
                "persona_id": str(session.persona_id) if session.persona_id else None,
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
            persona_id=UUID(row["persona_id"]) if row["persona_id"] else None,
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


def _persona_fields(persona: Persona) -> dict[str, Any]:
    return {
        "role": persona.role,
        "name": persona.name,
        "gender": persona.gender,
        "age": persona.age,
        "origin": persona.origin,
        "tagline": persona.tagline,
        "backstory": persona.backstory,
        "look": persona.look,
        "voice": persona.voice,
        "occupation": persona.occupation,
        "personality": persona.personality,
        "teaching": persona.teaching,
    }


class SqlPersonaRepository:
    def __init__(self, client: SqlClient) -> None:
        self._client = client

    def add(self, user_id: UUID, language: str, personas: Sequence[Persona]) -> None:
        if not personas:
            return
        payload = [{"id": str(persona.id), **_persona_fields(persona)} for persona in personas]
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
                occupation=row["occupation"],
                personality=json.loads(row["personality"]),
                teaching=json.loads(row["teaching"]),
            )
            for row in rows
        ]

    def update(self, user_id: UUID, persona: Persona) -> bool:
        rows = self._client.execute(
            _UPDATE_PERSONA,
            {
                "id": str(persona.id),
                "user_id": str(user_id),
                "persona": json.dumps(_persona_fields(persona)),
            },
        )
        return bool(rows)

    def remove(self, user_id: UUID, persona_id: UUID) -> bool:
        rows = self._client.execute(
            _REMOVE_PERSONA, {"id": str(persona_id), "user_id": str(user_id)}
        )
        return bool(rows)


class SqlDraftLog:
    def __init__(self, client: SqlClient) -> None:
        self._client = client

    def reserve(self, user_id: UUID, day: dt.date, limit: int) -> bool:
        if limit < 1:
            return False
        rows = self._client.execute(
            _RESERVE_DRAFT, {"user_id": str(user_id), "day": day.isoformat(), "limit": limit}
        )
        return bool(rows)


def _conversation(row: dict[str, Any]) -> Conversation:
    return Conversation(
        id=row["call_id"],
        persona_id=UUID(row["persona_id"]) if row["persona_id"] else None,
        started_at=from_epoch_micros(row["started_at"]),
        ended_at=_moment(row["ended_at"]),
        seconds=row["seconds"] or 0,
        learner_turns=row["learner_turns"],
    )


class SqlConversationRepository:
    def __init__(self, client: SqlClient) -> None:
        self._client = client

    def listed(self, user_id: UUID, limit: int, before: dt.datetime | None) -> list[Conversation]:
        rows = self._client.execute(
            _LIST_CONVERSATIONS,
            {"user_id": str(user_id), "limit": limit, "before": _iso(before)},
        )
        return [_conversation(row) for row in rows]

    def get(self, user_id: UUID, call_id: str) -> Conversation | None:
        rows = self._client.execute(
            _LOAD_CONVERSATION, {"user_id": str(user_id), "call_id": call_id}
        )
        return _conversation(rows[0]) if rows else None

    def turns(self, call_id: str) -> list[Turn]:
        rows = self._client.execute(_LIST_TURNS, {"call_id": call_id})
        return [Turn(row["speaker"], row["text"]) for row in rows]

    def partner_history(self, user_id: UUID) -> dict[UUID, PartnerHistory]:
        rows = self._client.execute(_PARTNER_HISTORY, {"user_id": str(user_id)})
        return {
            UUID(row["persona_id"]): PartnerHistory(
                conversations=row["conversations"], last_at=from_epoch_micros(row["last_at"])
            )
            for row in rows
        }

    def days(self, user_id: UUID, timezone: str | None, now: dt.datetime) -> ActivityDays:
        rows = self._client.execute(
            _PRACTICE_DAYS,
            {"user_id": str(user_id), "timezone": timezone, "now": now.isoformat()},
        )
        return ActivityDays(
            today=dt.date.fromisoformat(rows[0]["today"]),
            days=tuple(
                DayActivity(dt.date.fromisoformat(row["day"]), row["seconds"], row["conversations"])
                for row in rows
                if row["day"] is not None
            ),
        )


def _report(document: dict[str, Any]) -> Report:
    """A report from the document `dataclasses.asdict` made of it."""
    return Report(
        target=document["target"],
        language=document["language"],
        summary=document["summary"],
        mistakes=tuple(Mistake(**mistake) for mistake in document["mistakes"]),
        rewrites=tuple(Rewrite(**rewrite) for rewrite in document["rewrites"]),
        words=tuple(Word(**word) for word in document["words"]),
        wins=tuple(document["wins"]),
        next_steps=tuple(document["next_steps"]),
        stats=Stats(**document["stats"]),
    )


class SqlReportRepository:
    def __init__(self, client: SqlClient) -> None:
        self._client = client

    def request(
        self, call_id: str, at: dt.datetime, *, stale_before: dt.datetime, max_requests: int
    ) -> bool:
        rows = self._client.execute(
            _REQUEST_REPORT,
            {
                "call_id": call_id,
                "requested_at": at.isoformat(),
                "stale_before": stale_before.isoformat(),
                "max_requests": max_requests,
            },
        )
        return bool(rows)

    def claim(self, call_id: str, at: dt.datetime) -> bool:
        return bool(self._client.execute(_CLAIM_REPORT, {"call_id": call_id, "at": at.isoformat()}))

    def written(self, call_id: str, status: Status, report: Report | None) -> None:
        content = None if report is None else json.dumps(dataclasses.asdict(report))
        self._client.execute(
            _WRITE_REPORT, {"call_id": call_id, "status": status, "content": content}
        )

    def load(self, call_id: str) -> StoredReport | None:
        rows = self._client.execute(_LOAD_REPORT, {"call_id": call_id})
        if not rows:
            return None
        row = rows[0]
        return StoredReport(
            status=row["status"],
            requested_at=from_epoch_micros(row["requested_at"]),
            report=_report(json.loads(row["content"])) if row["content"] else None,
        )

    def latest(self, user_id: UUID) -> Report | None:
        rows = self._client.execute(_LATEST_REPORT, {"user_id": str(user_id)})
        return _report(json.loads(rows[0]["content"])) if rows else None
