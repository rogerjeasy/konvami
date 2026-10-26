"""The repositories on PostgreSQL. Each write is one statement, so it is atomic without a
transaction (see `sql.py`); the owning `app_user` row is created on a user's first write.
"""

import dataclasses
import datetime as dt
import json
from collections.abc import Sequence
from typing import Any
from uuid import UUID

from konvami_api.domain import memories
from konvami_api.domain.accounts import DELETION_MEMORY
from konvami_api.domain.cards import Card, CardTotals, Kind, WordDetails
from konvami_api.domain.conversations import (
    ActivityDays,
    Conversation,
    DayActivity,
    PartnerHistory,
)
from konvami_api.domain.costs import (
    ChargeRecord,
    DaySpend,
    LearnerSpend,
    Level,
    Share,
    Spending,
)
from konvami_api.domain.exam_centre import Simulation, SimulationResult
from konvami_api.domain.exam_centre import Status as ExamStatus
from konvami_api.domain.exams import PartScore
from konvami_api.domain.fsrs import Memory, Rating
from konvami_api.domain.levels import LevelFit, LevelStep
from konvami_api.domain.live_call import Turn, TurnAudio
from konvami_api.domain.onboarding import OnboardingState, PlacementStatus
from konvami_api.domain.personas import Persona
from konvami_api.domain.placement import PlacementResult
from konvami_api.domain.plan import SessionPlan
from konvami_api.domain.profile import ChangeRecord, FieldValue, Origin, Profile, Source
from konvami_api.domain.reports import (
    Mistake,
    Report,
    ReportEntry,
    ReportTotals,
    Rewrite,
    Stats,
    Status,
    StoredReport,
    TopicUse,
    WeekMistakes,
    Word,
)
from konvami_api.domain.tutor import Example, TutorAnswer, TutorQuestion
from konvami_api.domain.voice import CallPurpose, FinishedCall, VoiceSession
from konvami_api.domain.week_review import Status as WeekStatus
from konvami_api.domain.week_review import StoredReview, WeekNumbers
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

_FIELD_CHANGES = f"""
    SELECT scope, field, CAST(old_value AS text) AS old_value, CAST(new_value AS text) AS new_value,
           source, origin, {epoch_micros("changed_at")} AS changed_at
    FROM profile_change
    WHERE user_id = CAST(:user_id AS uuid) AND scope = :scope AND field = :field
    ORDER BY id
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

_RESERVE_QUESTION = f"""
    WITH {_ENSURE_USER}
    INSERT INTO tutor_day (user_id, day, questions)
    VALUES (CAST(:user_id AS uuid), CAST(:day AS date), 1)
    ON CONFLICT (user_id, day) DO UPDATE SET questions = tutor_day.questions + 1
        WHERE tutor_day.questions < :limit
    RETURNING questions
"""

_RESERVE_RETRY = f"""
    WITH {_ENSURE_USER}
    INSERT INTO retry_day (user_id, day, attempts)
    VALUES (CAST(:user_id AS uuid), CAST(:day AS date), 1)
    ON CONFLICT (user_id, day) DO UPDATE SET attempts = retry_day.attempts + 1
        WHERE retry_day.attempts < :limit
    RETURNING attempts
"""

_RESERVE_ANSWER = f"""
    WITH {_ENSURE_USER}
    INSERT INTO voice_answer_day (user_id, day, answers)
    VALUES (CAST(:user_id AS uuid), CAST(:day AS date), 1)
    ON CONFLICT (user_id, day) DO UPDATE SET answers = voice_answer_day.answers + 1
        WHERE voice_answer_day.answers < :limit
    RETURNING answers
"""

_RETRY_ATTEMPTED = f"""
    WITH {_ENSURE_USER}
    INSERT INTO retry_attempt (user_id, call_id, mistake_index, attempted_at, was_right)
    VALUES (CAST(:user_id AS uuid), :call_id, :index, CAST(:at AS timestamptz), :right)
"""

_RETRIES_OF_CALL = """
    SELECT mistake_index, bool_or(was_right) AS right
    FROM retry_attempt
    WHERE user_id = CAST(:user_id AS uuid) AND call_id = :call_id
    GROUP BY mistake_index
"""

_SAVE_QUESTION = f"""
    WITH {_ENSURE_USER}
    INSERT INTO tutor_question (id, user_id, asked_at, question, answer, source)
    VALUES (CAST(:id AS uuid), CAST(:user_id AS uuid), CAST(:asked_at AS timestamptz), :question,
            CAST(:answer AS jsonb), :source)
"""

_LIST_QUESTIONS = f"""
    SELECT CAST(id AS text) AS id, {epoch_micros("asked_at")} AS asked_at, question,
           CAST(answer AS text) AS answer, source
    FROM tutor_question
    WHERE user_id = CAST(:user_id AS uuid)
    ORDER BY asked_at DESC, id DESC
    LIMIT :limit
"""

_START_SESSION = f"""
    WITH {_ENSURE_USER}
    INSERT INTO voice_session
        (call_id, user_id, purpose, model, started_at, persona_id, scenario, max_seconds, plan)
    VALUES (:call_id, CAST(:user_id AS uuid), :purpose, :model, CAST(:started_at AS timestamptz),
            CAST(:persona_id AS uuid), :scenario, CAST(:max_seconds AS integer),
            CAST(:plan AS jsonb))
"""

_LOAD_SESSION = f"""
    SELECT call_id, CAST(user_id AS text) AS user_id, purpose, model,
           {epoch_micros("started_at")} AS started_at, CAST(persona_id AS text) AS persona_id,
           scenario, max_seconds, CAST(plan AS text) AS plan
    FROM voice_session
    WHERE call_id = :call_id
"""

_GOALS_REACHED = """
    UPDATE voice_session SET goals_reached = CAST(:goals AS jsonb) WHERE call_id = :call_id
"""

# Grants and counts in one statement: the learner's row for the week is locked while it is
# raised, so calls started together are granted from what the other left (migration 0016).
# In SET, `voice_week.seconds` is the value before this grant.
_RESERVE_SECONDS = f"""
    WITH {_ENSURE_USER}
    INSERT INTO voice_week (user_id, week, seconds, last_grant)
    VALUES (CAST(:user_id AS uuid), CAST(:week AS date), LEAST(:most, :weekly),
            LEAST(:most, :weekly))
    ON CONFLICT (user_id, week) DO UPDATE
        SET seconds = voice_week.seconds + LEAST(:most, :weekly - voice_week.seconds),
            last_grant = LEAST(:most, :weekly - voice_week.seconds)
        WHERE :weekly - voice_week.seconds >= :least
    RETURNING last_grant AS granted
"""

_RELEASE_SECONDS = """
    UPDATE voice_week SET seconds = GREATEST(0, seconds - :seconds)
    WHERE user_id = CAST(:user_id AS uuid) AND week = CAST(:week AS date)
"""

_SECONDS_USED = """
    SELECT seconds FROM voice_week
    WHERE user_id = CAST(:user_id AS uuid) AND week = CAST(:week AS date)
"""

# Ends the call and stores its turns together, once: an unknown call, or one already ended,
# updates no row, so no turn is inserted either and the first transcript stays. Says whether
# this ended the call.
_FINISH_SESSION = """
    WITH done AS (
        UPDATE voice_session
        SET ended_at = CAST(:ended_at AS timestamptz),
            outcome = :outcome,
            usage = CAST(:usage AS jsonb)
        WHERE call_id = :call_id AND ended_at IS NULL
        RETURNING call_id
    ),
    said AS (
        INSERT INTO voice_turn (call_id, position, speaker, text, audio_key, audio_ms, verbatim)
        SELECT done.call_id, turn.position, turn.item ->> 'speaker', turn.item ->> 'text',
               turn.item ->> 'audio_key', CAST(turn.item ->> 'audio_ms' AS integer),
               turn.item ->> 'verbatim'
        FROM done,
             jsonb_array_elements(CAST(:turns AS jsonb)) WITH ORDINALITY AS turn (item, position)
        ON CONFLICT (call_id, position) DO NOTHING
    )
    SELECT CAST(count(*) AS integer) AS ended FROM done
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
           ) AS learner_turns,
           s.scenario, CAST(s.goals_reached AS text) AS goals_reached,
           COALESCE(CAST(s.plan ->> 'review' AS boolean), false) AS review
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
    SELECT speaker, text, audio_key, audio_ms, verbatim
    FROM voice_turn WHERE call_id = :call_id ORDER BY position
"""

_SET_VERBATIM = """
    UPDATE voice_turn SET verbatim = :text WHERE call_id = :call_id AND audio_key = :key
"""

_FORGET_RECORDINGS = """
    UPDATE voice_turn SET audio_key = NULL, audio_ms = NULL
    WHERE call_id = :call_id AND audio_key IS NOT NULL
"""

_FORGET_ALL_RECORDINGS = """
    UPDATE voice_turn t SET audio_key = NULL, audio_ms = NULL
    FROM voice_session s
    WHERE t.call_id = s.call_id AND s.user_id = CAST(:user_id AS uuid)
      AND t.audio_key IS NOT NULL
"""

_PARTNER_HISTORY = f"""
    SELECT CAST(s.persona_id AS text) AS persona_id,
           CAST(count(*) AS integer) AS conversations,
           {epoch_micros("max(s.started_at)")} AS last_at
    FROM voice_session s
    WHERE {_COUNTED} AND s.persona_id IS NOT NULL
    GROUP BY s.persona_id
"""

# The learner's time zone as the database knows it; a name it does not know counts as UTC.
_ZONE = """
    zone AS (
        SELECT COALESCE(
            (SELECT name FROM pg_timezone_names WHERE name = :timezone), 'UTC'
        ) AS name
    )
"""

# One week of conversations, Monday to Sunday in the learner's time zone.
_WEEK_CONVERSATIONS = f"""
    WITH {_ZONE}
    {_CONVERSATION}, zone
    WHERE {_COUNTED}
      AND CAST(s.started_at AT TIME ZONE zone.name AS date) >= CAST(:monday AS date)
      AND CAST(s.started_at AT TIME ZONE zone.name AS date) < CAST(:monday AS date) + 7
    ORDER BY s.started_at DESC, s.call_id DESC
"""

# A review is asked for again only once its writing failed or was lost, and a few times at most.
_REQUEST_WEEK_REVIEW = f"""
    WITH {_ENSURE_USER}
    INSERT INTO week_review
        (user_id, language, week, status, numbers, text, partner, voice, requested_at, requests)
    VALUES (CAST(:user_id AS uuid), :language, CAST(:week AS date), 'pending',
            CAST(:numbers AS jsonb), NULL, :partner, :voice,
            CAST(:requested_at AS timestamptz), 1)
    ON CONFLICT (user_id, language, week) DO UPDATE
        SET status = 'pending', numbers = EXCLUDED.numbers, text = NULL,
            partner = EXCLUDED.partner, voice = EXCLUDED.voice,
            requested_at = EXCLUDED.requested_at, requests = week_review.requests + 1
        WHERE week_review.requests < :max_requests
          AND (
              week_review.status = 'failed'
              OR (
                  week_review.status = 'pending'
                  AND week_review.requested_at < CAST(:stale_before AS timestamptz)
              )
          )
    RETURNING week
"""

_WRITE_WEEK_REVIEW = """
    UPDATE week_review SET status = :status, text = :text
    WHERE user_id = CAST(:user_id AS uuid) AND language = :language AND week = CAST(:week AS date)
"""

_LOAD_WEEK_REVIEW = f"""
    SELECT status, CAST(numbers AS text) AS numbers, text, partner, voice,
           {epoch_micros("requested_at")} AS requested_at
    FROM week_review
    WHERE user_id = CAST(:user_id AS uuid) AND language = :language AND week = CAST(:week AS date)
"""

_START_SIMULATION = f"""
    WITH {_ENSURE_USER}
    INSERT INTO exam_simulation
        (call_id, user_id, language, exam, cards, voice, started_at, status, requested_at,
         requests, result)
    VALUES (:call_id, CAST(:user_id AS uuid), :language, :exam, CAST(:cards AS jsonb), :voice,
            CAST(:started_at AS timestamptz), 'pending', CAST(:requested_at AS timestamptz), 1,
            NULL)
    ON CONFLICT (call_id) DO NOTHING
"""

_REQUEST_SCORE = """
    UPDATE exam_simulation
    SET status = 'pending', requested_at = CAST(:at AS timestamptz), requests = requests + 1,
        result = NULL
    WHERE call_id = :call_id AND requests < :max_requests
      AND (
          status = 'failed'
          OR (status = 'pending' AND requested_at < CAST(:stale_before AS timestamptz))
      )
    RETURNING call_id
"""

_WRITE_SCORE = """
    UPDATE exam_simulation SET status = :status, result = CAST(:result AS jsonb)
    WHERE call_id = :call_id
"""

_SIMULATION = f"""
    SELECT call_id, exam, CAST(cards AS text) AS cards, voice,
           {epoch_micros("started_at")} AS started_at, status,
           {epoch_micros("requested_at")} AS requested_at, CAST(result AS text) AS result
    FROM exam_simulation
"""

_LOAD_SIMULATION = f"""
    {_SIMULATION} WHERE call_id = :call_id AND user_id = CAST(:user_id AS uuid)
"""

_LIST_SIMULATIONS = f"""
    {_SIMULATION} WHERE user_id = CAST(:user_id AS uuid) AND language = :language
    ORDER BY started_at DESC, call_id DESC LIMIT :limit
"""

_COUNT_SIMULATIONS = """
    SELECT CAST(count(*) AS integer) AS done FROM exam_simulation
    WHERE user_id = CAST(:user_id AS uuid) AND exam = :exam
"""

# Days are cut in the learner's time zone, by the database, which knows every zone's rules. A
# name it does not know counts as UTC. Always one row at least, so `today` is always there; its
# other columns are null when the learner has not practised yet.
_PRACTICE_DAYS = f"""
    WITH {_ZONE},
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

_CARD_COLUMNS = f"""
    CAST(id AS text) AS id, kind, front, back, note, explained_in, source_call_id,
    {epoch_micros("created_at")} AS created_at, {epoch_micros("due_at")} AS due_at,
    {epoch_micros("reviewed_at")} AS reviewed_at, stability, difficulty, reviews, lapses,
    CAST(details AS text) AS details
"""
_CARD = f"""
    SELECT {_CARD_COLUMNS}
    FROM card
"""

# A learner's cards in one language.
_DECK = "user_id = CAST(:user_id AS uuid) AND language = :language"

# The oldest word cards without their forms, claimed for one worker in the same statement: a
# card another worker claimed lately is skipped (SKIP LOCKED keeps two at once from waiting).
_CLAIM_FOR_DETAILS = f"""
    UPDATE card SET details_claimed_at = CAST(:at AS timestamptz)
    WHERE id IN (
        SELECT id FROM card
        WHERE {_DECK} AND kind = 'word' AND details IS NULL
          AND (details_claimed_at IS NULL
               OR details_claimed_at <= CAST(:stale_before AS timestamptz))
        ORDER BY created_at, id
        LIMIT :limit
        FOR UPDATE SKIP LOCKED
    )
    RETURNING {_CARD_COLUMNS}
"""

_SET_DETAILS = """
    UPDATE card SET details = CAST(:details AS jsonb)
    WHERE id = CAST(:id AS uuid) AND user_id = CAST(:user_id AS uuid)
"""

# The limit bounds storage, not money: two requests at the same moment could both count one
# card too few and leave the deck one over, which harms nobody.
_ADD_CARD = f"""
    WITH {_ENSURE_USER}
    INSERT INTO card
        (id, user_id, language, kind, front_key, front, back, note, explained_in,
         source_call_id, created_at, due_at)
    SELECT CAST(:id AS uuid), CAST(:user_id AS uuid), :language, :kind, :front_key, :front,
           :back, CAST(:note AS text), :explained_in, CAST(:source_call_id AS text),
           CAST(:created_at AS timestamptz), CAST(:due_at AS timestamptz)
    WHERE (SELECT count(*) FROM card WHERE {_DECK}) < :limit
    ON CONFLICT (user_id, language, kind, front_key) DO NOTHING
    RETURNING id
"""

_CARD_BY_KEY = f"{_CARD} WHERE {_DECK} AND kind = :kind AND front_key = :front_key"

_CARD_BY_ID = f"{_CARD} WHERE id = CAST(:id AS uuid) AND user_id = CAST(:user_id AS uuid)"

_LIST_CARDS = f"""
    {_CARD}
    WHERE {_DECK}
      AND (CAST(:before AS timestamptz) IS NULL OR created_at < CAST(:before AS timestamptz))
    ORDER BY created_at DESC, id DESC
    LIMIT :limit
"""

_DUE_CARDS = f"""
    {_CARD}
    WHERE {_DECK} AND due_at <= CAST(:now AS timestamptz)
    ORDER BY due_at, created_at, id
    LIMIT :limit
"""

_COUNT_CARDS = f"""
    SELECT CAST(count(*) AS integer) AS total,
           CAST(count(*) FILTER (WHERE due_at <= CAST(:now AS timestamptz)) AS integer) AS due
    FROM card
    WHERE {_DECK}
"""

# The review is stored only while the card still has the number of reviews it was read with,
# and logged in the same statement: a rating sent twice at once counts once.
_REVIEW_CARD = """
    WITH done AS (
        UPDATE card
        SET due_at = CAST(:due_at AS timestamptz),
            reviewed_at = CAST(:reviewed_at AS timestamptz),
            stability = CAST(:stability AS double precision),
            difficulty = CAST(:difficulty AS double precision),
            reviews = :reviews, lapses = :lapses
        WHERE id = CAST(:id AS uuid) AND user_id = CAST(:user_id AS uuid)
          AND reviews = :reviews_before
        RETURNING id, reviews, reviewed_at
    )
    INSERT INTO card_review (card_id, position, reviewed_at, rating)
    SELECT id, reviews, reviewed_at, :rating FROM done
    RETURNING card_id
"""

_REMOVE_CARD = """
    DELETE FROM card WHERE id = CAST(:id AS uuid) AND user_id = CAST(:user_id AS uuid)
    RETURNING id
"""

_KNOWN_CARDS = """
    SELECT c.kind, c.front_key
    FROM card c
    JOIN jsonb_array_elements(CAST(:keys AS jsonb)) AS wanted (item)
      ON c.kind = wanted.item ->> 'kind' AND c.front_key = wanted.item ->> 'key'
    WHERE c.user_id = CAST(:user_id AS uuid) AND c.language = :language
"""

_LONGEST_CONVERSATION = f"""
    SELECT CAST(COALESCE(max({_SECONDS}), 0) AS integer) AS seconds
    FROM voice_session s
    WHERE {_COUNTED}
"""

# Reports with their calls, as `r` and `s`, and the condition that picks a learner's ready
# reports of conversations in one language.
_REPORT_CALLS = "session_report r JOIN voice_session s ON s.call_id = r.call_id"
_READY_REPORTS = """
    s.user_id = CAST(:user_id AS uuid) AND r.status = 'ready'
    AND r.content ->> 'target' = :language
"""

_REPORT_HISTORY = f"""
    SELECT r.call_id, {epoch_micros("s.started_at")} AS started_at,
           CAST(r.content AS text) AS content
    FROM {_REPORT_CALLS}
    WHERE {_READY_REPORTS}
    ORDER BY s.started_at DESC, s.call_id DESC
    LIMIT :limit
"""

# Weeks begin on Monday and are cut in the learner's time zone, like days (see `_ZONE`). The
# mistakes are counted by the database: the reports themselves would be megabytes to read.
_MISTAKES_BY_WEEK = f"""
    WITH {_ZONE},
    found AS (
        SELECT CAST(date_trunc('week', s.started_at AT TIME ZONE zone.name) AS date) AS week,
               mistake.item ->> 'category' AS category
        FROM zone,
             {_REPORT_CALLS}
             CROSS JOIN LATERAL jsonb_array_elements(r.content -> 'mistakes') AS mistake (item)
        WHERE {_READY_REPORTS}
          AND CAST(mistake.item ->> 'certain' AS boolean)
    )
    SELECT to_char(week, 'YYYY-MM-DD') AS week, category, CAST(count(*) AS integer) AS count
    FROM found
    WHERE week >= CAST(:since AS date)
    GROUP BY week, category
"""

_LEARNER_WORDS = "CAST(r.content #>> '{stats,learner_words}' AS integer)"
_PARTNER_WORDS = "CAST(r.content #>> '{stats,partner_words}' AS integer)"
_RECENT_REPORT = "s.started_at >= CAST(:since AS timestamptz)"

_REPORT_TOTALS = f"""
    SELECT CAST(COALESCE(sum({_LEARNER_WORDS}) FILTER (WHERE {_RECENT_REPORT}), 0) AS integer)
               AS learner_words,
           CAST(COALESCE(sum({_PARTNER_WORDS}) FILTER (WHERE {_RECENT_REPORT}), 0) AS integer)
               AS partner_words,
           CAST(COALESCE(max({_LEARNER_WORDS}), 0) AS integer) AS most_words
    FROM {_REPORT_CALLS}
    WHERE {_READY_REPORTS}
"""

_LEVEL_FITS = f"""
    SELECT CAST(r.content -> 'level_fit' AS text) AS level_fit
    FROM {_REPORT_CALLS}
    WHERE {_READY_REPORTS} AND {_RECENT_REPORT}
      AND jsonb_typeof(r.content -> 'level_fit') = 'object'
    ORDER BY s.started_at DESC, s.call_id DESC
"""

_STEPPED = """
    INSERT INTO level_step (call_id, language, before_level, after_level, stepped_at)
    VALUES (:call_id, :language, :before, :after, CAST(:at AS timestamptz))
    ON CONFLICT (call_id) DO UPDATE
        SET language = EXCLUDED.language, before_level = EXCLUDED.before_level,
            after_level = EXCLUDED.after_level, stepped_at = EXCLUDED.stepped_at
"""

_LEVEL_STEP = f"""
    SELECT l.call_id, l.language, l.before_level, l.after_level,
           {epoch_micros("l.stepped_at")} AS stepped_at
    FROM level_step l JOIN voice_session s ON s.call_id = l.call_id
    WHERE l.call_id = :call_id AND s.user_id = CAST(:user_id AS uuid)
"""

_RECENT_REVIEW = "v.reviewed_at >= CAST(:since AS timestamptz)"

_CARD_TOTALS = f"""
    SELECT CAST(count(DISTINCT c.id) FILTER (WHERE c.reviews > 0) AS integer) AS learned,
           CAST(count(v.card_id) FILTER (WHERE {_RECENT_REVIEW}) AS integer) AS reviews,
           CAST(
               count(v.card_id) FILTER (WHERE {_RECENT_REVIEW} AND v.rating <> 'again')
               AS integer
           ) AS remembered,
           CAST(count(v.card_id) AS integer) AS reviews_ever
    FROM card c LEFT JOIN card_review v ON v.card_id = c.id
    WHERE c.user_id = CAST(:user_id AS uuid) AND c.language = :language
"""

_MEMORY = f"""
    SELECT CAST(id AS text) AS id, CAST(persona_id AS text) AS persona_id, kind, text,
           to_char(day, 'YYYY-MM-DD') AS day, importance, source_call_id, ask,
           {epoch_micros("created_at")} AS created_at, {epoch_micros("updated_at")} AS updated_at
    FROM memory
"""

# The index on a learner's words (migration 0011) refuses the same memory twice; any conflict
# stores nothing. The limit bounds storage, as for cards: one over at the same moment harms
# nobody.
_ADD_MEMORY = f"""
    WITH {_ENSURE_USER}
    INSERT INTO memory
        (id, user_id, persona_id, kind, text_key, text, day, importance, source_call_id, ask,
         created_at, updated_at)
    SELECT CAST(:id AS uuid), CAST(:user_id AS uuid), CAST(:persona_id AS uuid), :kind,
           :text_key, :text, CAST(:day AS date), :importance, CAST(:source_call_id AS text),
           CAST(:ask AS text), CAST(:created_at AS timestamptz), CAST(:updated_at AS timestamptz)
    WHERE (SELECT count(*) FROM memory WHERE user_id = CAST(:user_id AS uuid)) < :limit
    ON CONFLICT DO NOTHING
    RETURNING id
"""

# Not when another of the learner's memories has these words already (for the same partner,
# or for all of them): checked here, so that the answer is False rather than an error.
_REPLACE_MEMORY = """
    UPDATE memory
    SET persona_id = CAST(:persona_id AS uuid), kind = :kind, text_key = :text_key,
        text = :text, day = CAST(:day AS date), importance = :importance,
        source_call_id = CAST(:source_call_id AS text), ask = CAST(:ask AS text),
        updated_at = CAST(:updated_at AS timestamptz)
    WHERE id = CAST(:id AS uuid) AND user_id = CAST(:user_id AS uuid)
      AND NOT EXISTS (
          SELECT 1
          FROM memory other
          WHERE other.user_id = CAST(:user_id AS uuid) AND other.id <> CAST(:id AS uuid)
            AND other.text_key = :text_key
            AND other.persona_id IS NOT DISTINCT FROM CAST(:persona_id AS uuid)
      )
    RETURNING id
"""

_LIST_MEMORIES = f"""
    {_MEMORY}
    WHERE user_id = CAST(:user_id AS uuid)
    ORDER BY created_at DESC, id DESC
"""

_MEMORY_BY_ID = f"{_MEMORY} WHERE id = CAST(:id AS uuid) AND user_id = CAST(:user_id AS uuid)"

_REMOVE_MEMORY = """
    DELETE FROM memory WHERE id = CAST(:id AS uuid) AND user_id = CAST(:user_id AS uuid)
    RETURNING id
"""

# Allowing a call to be read is a write for its learner, so it begins like every other one
# (see `_REQUEST_REPORT`). A call that is there already, allowed or taken, stays as it is.
_ALLOW_MEMORIES = """
    WITH call AS (
        SELECT call_id, user_id FROM voice_session WHERE call_id = :call_id
    ),
    owner AS (
        INSERT INTO app_user (id) SELECT user_id FROM call ON CONFLICT (id) DO NOTHING
    )
    INSERT INTO memory_extraction (call_id, state, started_at)
    SELECT call_id, 'allowed', CAST(:at AS timestamptz) FROM call
    ON CONFLICT (call_id) DO NOTHING
"""

# Only a call that was allowed can be taken (migration 0012), and of several workers at once
# one gets its row back.
_CLAIM_MEMORIES = """
    UPDATE memory_extraction
    SET state = 'taken', started_at = CAST(:at AS timestamptz)
    WHERE call_id = :call_id AND state = 'allowed'
    RETURNING call_id
"""

_RELEASE_MEMORIES = """
    UPDATE memory_extraction SET state = 'allowed' WHERE call_id = :call_id AND state = 'taken'
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

    def changes(self, user_id: UUID, scope: str, field: str) -> list[ChangeRecord]:
        rows = self._client.execute(
            _FIELD_CHANGES, {"user_id": str(user_id), "scope": scope, "field": field}
        )
        return [
            ChangeRecord(
                scope=row["scope"],
                field=row["field"],
                old_value=None if row["old_value"] is None else json.loads(row["old_value"]),
                new_value=json.loads(row["new_value"]),
                source=Source(row["source"]),
                origin=Origin(row["origin"]),
                changed_at=from_epoch_micros(row["changed_at"]),
            )
            for row in rows
        ]


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
                "scenario": session.scenario,
                "max_seconds": session.max_seconds,
                "plan": json.dumps(session.plan.document()) if session.plan else None,
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
            scenario=row["scenario"],
            max_seconds=row["max_seconds"],
            plan=SessionPlan.from_document(json.loads(row["plan"])) if row["plan"] else None,
        )

    def goals_reached(self, call_id: str, goals: tuple[str, ...]) -> None:
        self._client.execute(_GOALS_REACHED, {"call_id": call_id, "goals": json.dumps(goals)})

    def reserve_seconds(
        self, user_id: UUID, week: dt.date, weekly: int, least: int, most: int
    ) -> int:
        # A first grant of the week inserts the row: it must leave at least `least` too.
        if weekly < least:
            return 0
        rows = self._client.execute(
            _RESERVE_SECONDS,
            {
                "user_id": str(user_id),
                "week": week.isoformat(),
                "weekly": weekly,
                "least": least,
                "most": most,
            },
        )
        return int(rows[0]["granted"]) if rows else 0

    def release_seconds(self, user_id: UUID, week: dt.date, seconds: int) -> None:
        self._client.execute(
            _RELEASE_SECONDS,
            {"user_id": str(user_id), "week": week.isoformat(), "seconds": seconds},
        )

    def seconds_used(self, user_id: UUID, week: dt.date) -> int:
        rows = self._client.execute(
            _SECONDS_USED, {"user_id": str(user_id), "week": week.isoformat()}
        )
        return int(rows[0]["seconds"]) if rows else 0

    def finish(self, call_id: str, result: FinishedCall) -> bool:
        turns = [
            {
                "speaker": turn.speaker,
                "text": turn.text,
                "audio_key": turn.audio.key if turn.audio else None,
                "audio_ms": turn.audio.milliseconds if turn.audio else None,
                # Written during the call by the Live Error Spotter; the pass after it skips it.
                "verbatim": turn.verbatim,
            }
            for turn in result.turns
        ]
        rows = self._client.execute(
            _FINISH_SESSION,
            {
                "call_id": call_id,
                "ended_at": result.ended_at.isoformat(),
                "outcome": result.outcome,
                "usage": json.dumps(dict(result.usage)),
                "turns": json.dumps(turns),
            },
        )
        return bool(rows[0]["ended"])


class SqlRecordingRepository:
    def __init__(self, client: SqlClient) -> None:
        self._client = client

    def set_verbatim(self, call_id: str, key: str, text: str) -> None:
        self._client.execute(_SET_VERBATIM, {"call_id": call_id, "key": key, "text": text})

    def forget(self, call_id: str) -> None:
        self._client.execute(_FORGET_RECORDINGS, {"call_id": call_id})

    def forget_all(self, user_id: UUID) -> None:
        self._client.execute(_FORGET_ALL_RECORDINGS, {"user_id": str(user_id)})


class SqlAnswerAllowance:
    """The cards a learner answered out loud each day (voice review)."""

    def __init__(self, client: SqlClient) -> None:
        self._client = client

    def reserve(self, user_id: UUID, day: dt.date, limit: int) -> bool:
        if limit < 1:
            return False
        rows = self._client.execute(
            _RESERVE_ANSWER, {"user_id": str(user_id), "day": day.isoformat(), "limit": limit}
        )
        return bool(rows)


class SqlRetryRepository:
    def __init__(self, client: SqlClient) -> None:
        self._client = client

    def reserve(self, user_id: UUID, day: dt.date, limit: int) -> bool:
        if limit < 1:
            return False
        rows = self._client.execute(
            _RESERVE_RETRY, {"user_id": str(user_id), "day": day.isoformat(), "limit": limit}
        )
        return bool(rows)

    def attempted(
        self, user_id: UUID, call_id: str, index: int, at: dt.datetime, right: bool
    ) -> None:
        self._client.execute(
            _RETRY_ATTEMPTED,
            {
                "user_id": str(user_id),
                "call_id": call_id,
                "index": index,
                "at": at.isoformat(),
                "right": right,
            },
        )

    def of_conversation(self, user_id: UUID, call_id: str) -> dict[int, bool]:
        rows = self._client.execute(_RETRIES_OF_CALL, {"user_id": str(user_id), "call_id": call_id})
        return {int(row["mistake_index"]): bool(row["right"]) for row in rows}


class SqlTutorRepository:
    def __init__(self, client: SqlClient) -> None:
        self._client = client

    def reserve(self, user_id: UUID, day: dt.date, limit: int) -> bool:
        if limit < 1:
            return False
        rows = self._client.execute(
            _RESERVE_QUESTION, {"user_id": str(user_id), "day": day.isoformat(), "limit": limit}
        )
        return bool(rows)

    def save(self, user_id: UUID, question: TutorQuestion) -> None:
        answer = question.answer
        self._client.execute(
            _SAVE_QUESTION,
            {
                "id": str(question.id),
                "user_id": str(user_id),
                "asked_at": question.asked_at.isoformat(),
                "question": question.question,
                "answer": json.dumps(
                    {
                        "explanation": answer.explanation,
                        "examples": [dataclasses.asdict(example) for example in answer.examples],
                        "topic": answer.topic,
                        "unsure": answer.unsure,
                    }
                ),
                "source": question.source,
            },
        )

    def listed(self, user_id: UUID, limit: int) -> list[TutorQuestion]:
        rows = self._client.execute(_LIST_QUESTIONS, {"user_id": str(user_id), "limit": limit})
        return [_tutor_question(row) for row in rows]


def _tutor_question(row: dict[str, Any]) -> TutorQuestion:
    answer = json.loads(row["answer"])
    return TutorQuestion(
        id=UUID(row["id"]),
        asked_at=from_epoch_micros(row["asked_at"]),
        question=row["question"],
        answer=TutorAnswer(
            explanation=answer["explanation"],
            examples=tuple(Example(**example) for example in answer["examples"]),
            topic=answer["topic"],
            unsure=answer["unsure"],
        ),
        source=row["source"],
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
        scenario=row["scenario"],
        goals_reached=tuple(json.loads(row["goals_reached"])) if row["goals_reached"] else (),
        review=row["review"],
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
        return [
            Turn(
                row["speaker"],
                row["text"],
                audio=TurnAudio(row["audio_key"], row["audio_ms"]) if row["audio_key"] else None,
                verbatim=row["verbatim"],
            )
            for row in rows
        ]

    def week(self, user_id: UUID, timezone: str | None, monday: dt.date) -> list[Conversation]:
        rows = self._client.execute(
            _WEEK_CONVERSATIONS,
            {"user_id": str(user_id), "timezone": timezone, "monday": monday.isoformat()},
        )
        return [_conversation(row) for row in rows]

    def longest(self, user_id: UUID) -> int:
        rows = self._client.execute(_LONGEST_CONVERSATION, {"user_id": str(user_id)})
        seconds: int = rows[0]["seconds"]
        return seconds

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
        level_fit=LevelFit(**document["level_fit"]) if document.get("level_fit") else None,
        usage=tuple(TopicUse(**use) for use in document.get("usage", [])),
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

    def history(self, user_id: UUID, language: str, limit: int) -> list[ReportEntry]:
        rows = self._client.execute(
            _REPORT_HISTORY, {"user_id": str(user_id), "language": language, "limit": limit}
        )
        return [
            ReportEntry(
                row["call_id"],
                from_epoch_micros(row["started_at"]),
                _report(json.loads(row["content"])),
            )
            for row in rows
        ]

    def mistakes_by_week(
        self, user_id: UUID, language: str, timezone: str | None, since: dt.date
    ) -> list[WeekMistakes]:
        rows = self._client.execute(
            _MISTAKES_BY_WEEK,
            {
                "user_id": str(user_id),
                "language": language,
                "timezone": timezone,
                "since": since.isoformat(),
            },
        )
        return [
            WeekMistakes(dt.date.fromisoformat(row["week"]), row["category"], row["count"])
            for row in rows
        ]

    def level_fits(self, user_id: UUID, language: str, since: dt.datetime) -> list[LevelFit]:
        rows = self._client.execute(
            _LEVEL_FITS,
            {"user_id": str(user_id), "language": language, "since": since.isoformat()},
        )
        return [LevelFit(**json.loads(row["level_fit"])) for row in rows]

    def totals(self, user_id: UUID, language: str, since: dt.datetime) -> ReportTotals:
        rows = self._client.execute(
            _REPORT_TOTALS,
            {"user_id": str(user_id), "language": language, "since": since.isoformat()},
        )
        row = rows[0]
        return ReportTotals(row["learner_words"], row["partner_words"], row["most_words"])


class SqlWeekReviewRepository:
    def __init__(self, client: SqlClient) -> None:
        self._client = client

    def request(
        self,
        user_id: UUID,
        language: str,
        review: StoredReview,
        *,
        stale_before: dt.datetime,
        max_requests: int,
    ) -> bool:
        rows = self._client.execute(
            _REQUEST_WEEK_REVIEW,
            {
                "user_id": str(user_id),
                "language": language,
                "week": review.numbers.week.isoformat(),
                "numbers": json.dumps(review.numbers.document()),
                "partner": review.partner,
                "voice": review.voice,
                "requested_at": review.requested_at.isoformat(),
                "stale_before": stale_before.isoformat(),
                "max_requests": max_requests,
            },
        )
        return bool(rows)

    def written(
        self, user_id: UUID, language: str, week: dt.date, status: WeekStatus, text: str | None
    ) -> None:
        self._client.execute(
            _WRITE_WEEK_REVIEW,
            {
                "user_id": str(user_id),
                "language": language,
                "week": week.isoformat(),
                "status": status,
                "text": text,
            },
        )

    def load(self, user_id: UUID, language: str, week: dt.date) -> StoredReview | None:
        rows = self._client.execute(
            _LOAD_WEEK_REVIEW,
            {"user_id": str(user_id), "language": language, "week": week.isoformat()},
        )
        if not rows:
            return None
        row = rows[0]
        return StoredReview(
            status=row["status"],
            numbers=WeekNumbers.from_document(json.loads(row["numbers"])),
            text=row["text"],
            requested_at=from_epoch_micros(row["requested_at"]),
            partner=row["partner"],
            voice=row["voice"],
        )


def _simulation(row: dict[str, Any]) -> Simulation:
    result = json.loads(row["result"]) if row["result"] else None
    return Simulation(
        call_id=row["call_id"],
        exam=row["exam"],
        cards=tuple(json.loads(row["cards"])),
        started_at=from_epoch_micros(row["started_at"]),
        status=row["status"],
        requested_at=from_epoch_micros(row["requested_at"]),
        result=SimulationResult(
            parts=tuple(PartScore(**part) for part in result["parts"]),
            summary=result["summary"],
            pass_share=result["pass_share"],
        )
        if result
        else None,
        voice=row["voice"],
    )


class SqlExamRepository:
    def __init__(self, client: SqlClient) -> None:
        self._client = client

    def started(self, user_id: UUID, language: str, simulation: Simulation) -> None:
        self._client.execute(
            _START_SIMULATION,
            {
                "call_id": simulation.call_id,
                "user_id": str(user_id),
                "language": language,
                "exam": simulation.exam,
                "cards": json.dumps(list(simulation.cards)),
                "voice": simulation.voice,
                "started_at": simulation.started_at.isoformat(),
                "requested_at": simulation.requested_at.isoformat(),
            },
        )

    def request(
        self, call_id: str, at: dt.datetime, *, stale_before: dt.datetime, max_requests: int
    ) -> bool:
        rows = self._client.execute(
            _REQUEST_SCORE,
            {
                "call_id": call_id,
                "at": at.isoformat(),
                "stale_before": stale_before.isoformat(),
                "max_requests": max_requests,
            },
        )
        return bool(rows)

    def written(self, call_id: str, status: ExamStatus, result: SimulationResult | None) -> None:
        document = None if result is None else json.dumps(dataclasses.asdict(result))
        self._client.execute(
            _WRITE_SCORE, {"call_id": call_id, "status": status, "result": document}
        )

    def load(self, user_id: UUID, call_id: str) -> Simulation | None:
        rows = self._client.execute(_LOAD_SIMULATION, {"call_id": call_id, "user_id": str(user_id)})
        return _simulation(rows[0]) if rows else None

    def listed(self, user_id: UUID, language: str, limit: int) -> list[Simulation]:
        rows = self._client.execute(
            _LIST_SIMULATIONS, {"user_id": str(user_id), "language": language, "limit": limit}
        )
        return [_simulation(row) for row in rows]

    def count(self, user_id: UUID, exam: str) -> int:
        rows = self._client.execute(_COUNT_SIMULATIONS, {"user_id": str(user_id), "exam": exam})
        done: int = rows[0]["done"]
        return done


class SqlLevelRepository:
    def __init__(self, client: SqlClient) -> None:
        self._client = client

    def stepped(self, user_id: UUID, step: LevelStep) -> None:
        self._client.execute(
            _STEPPED,
            {
                "call_id": step.call_id,
                "language": step.language,
                "before": step.before,
                "after": step.after,
                "at": step.at.isoformat(),
            },
        )

    def step(self, user_id: UUID, call_id: str) -> LevelStep | None:
        rows = self._client.execute(_LEVEL_STEP, {"call_id": call_id, "user_id": str(user_id)})
        if not rows:
            return None
        row = rows[0]
        return LevelStep(
            call_id=row["call_id"],
            language=row["language"],
            before=row["before_level"],
            after=row["after_level"],
            at=from_epoch_micros(row["stepped_at"]),
        )


def _card(row: dict[str, Any]) -> Card:
    learned = row["stability"] is not None
    return Card(
        id=UUID(row["id"]),
        kind=row["kind"],
        front=row["front"],
        back=row["back"],
        note=row["note"],
        explained_in=row["explained_in"],
        source_call_id=row["source_call_id"],
        created_at=from_epoch_micros(row["created_at"]),
        due_at=from_epoch_micros(row["due_at"]),
        reviewed_at=_moment(row["reviewed_at"]),
        memory=Memory(float(row["stability"]), float(row["difficulty"])) if learned else None,
        reviews=row["reviews"],
        lapses=row["lapses"],
        details=WordDetails(**json.loads(row["details"])) if row.get("details") else None,
    )


class SqlCardRepository:
    def __init__(self, client: SqlClient) -> None:
        self._client = client

    def claim_for_details(
        self, user_id: UUID, language: str, at: dt.datetime, stale_before: dt.datetime, limit: int
    ) -> list[Card]:
        rows = self._client.execute(
            _CLAIM_FOR_DETAILS,
            {
                "user_id": str(user_id),
                "language": language,
                "at": at.isoformat(),
                "stale_before": stale_before.isoformat(),
                "limit": limit,
            },
        )
        return sorted((_card(row) for row in rows), key=lambda c: (c.created_at, str(c.id)))

    def set_details(self, user_id: UUID, card_id: UUID, details: WordDetails) -> None:
        self._client.execute(
            _SET_DETAILS,
            {
                "id": str(card_id),
                "user_id": str(user_id),
                "details": json.dumps(dataclasses.asdict(details)),
            },
        )

    def add(self, user_id: UUID, language: str, key: str, card: Card, limit: int) -> bool:
        rows = self._client.execute(
            _ADD_CARD,
            {
                "id": str(card.id),
                "user_id": str(user_id),
                "language": language,
                "kind": card.kind,
                "front_key": key,
                "front": card.front,
                "back": card.back,
                "note": card.note,
                "explained_in": card.explained_in,
                "source_call_id": card.source_call_id,
                "created_at": card.created_at.isoformat(),
                "due_at": card.due_at.isoformat(),
                "limit": limit,
            },
        )
        return bool(rows)

    def by_key(self, user_id: UUID, language: str, kind: Kind, key: str) -> Card | None:
        rows = self._client.execute(
            _CARD_BY_KEY,
            {"user_id": str(user_id), "language": language, "kind": kind, "front_key": key},
        )
        return _card(rows[0]) if rows else None

    def get(self, user_id: UUID, card_id: UUID) -> Card | None:
        rows = self._client.execute(_CARD_BY_ID, {"id": str(card_id), "user_id": str(user_id)})
        return _card(rows[0]) if rows else None

    def listed(
        self, user_id: UUID, language: str, limit: int, before: dt.datetime | None
    ) -> list[Card]:
        rows = self._client.execute(
            _LIST_CARDS,
            {
                "user_id": str(user_id),
                "language": language,
                "limit": limit,
                "before": _iso(before),
            },
        )
        return [_card(row) for row in rows]

    def due(self, user_id: UUID, language: str, now: dt.datetime, limit: int) -> list[Card]:
        rows = self._client.execute(
            _DUE_CARDS,
            {"user_id": str(user_id), "language": language, "now": now.isoformat(), "limit": limit},
        )
        return [_card(row) for row in rows]

    def counts(self, user_id: UUID, language: str, now: dt.datetime) -> tuple[int, int]:
        rows = self._client.execute(
            _COUNT_CARDS, {"user_id": str(user_id), "language": language, "now": now.isoformat()}
        )
        return rows[0]["total"], rows[0]["due"]

    def reviewed(self, user_id: UUID, card: Card, rating: Rating, reviews_before: int) -> bool:
        memory = card.memory
        rows = self._client.execute(
            _REVIEW_CARD,
            {
                "id": str(card.id),
                "user_id": str(user_id),
                "due_at": card.due_at.isoformat(),
                "reviewed_at": _iso(card.reviewed_at),
                "stability": memory.stability if memory else None,
                "difficulty": memory.difficulty if memory else None,
                "reviews": card.reviews,
                "lapses": card.lapses,
                "reviews_before": reviews_before,
                "rating": rating,
            },
        )
        return bool(rows)

    def remove(self, user_id: UUID, card_id: UUID) -> bool:
        rows = self._client.execute(_REMOVE_CARD, {"id": str(card_id), "user_id": str(user_id)})
        return bool(rows)

    def known(
        self, user_id: UUID, language: str, keys: Sequence[tuple[Kind, str]]
    ) -> set[tuple[str, str]]:
        if not keys:
            return set()
        wanted = json.dumps([{"kind": kind, "key": key} for kind, key in keys])
        rows = self._client.execute(
            _KNOWN_CARDS, {"user_id": str(user_id), "language": language, "keys": wanted}
        )
        return {(row["kind"], row["front_key"]) for row in rows}

    def totals(self, user_id: UUID, language: str, since: dt.datetime) -> CardTotals:
        rows = self._client.execute(
            _CARD_TOTALS,
            {"user_id": str(user_id), "language": language, "since": since.isoformat()},
        )
        row = rows[0]
        return CardTotals(row["learned"], row["reviews"], row["remembered"], row["reviews_ever"])


def _memory(row: dict[str, Any]) -> memories.Memory:
    return memories.Memory(
        id=UUID(row["id"]),
        kind=row["kind"],
        text=row["text"],
        day=dt.date.fromisoformat(row["day"]) if row["day"] else None,
        importance=row["importance"],
        persona_id=UUID(row["persona_id"]) if row["persona_id"] else None,
        source_call_id=row["source_call_id"],
        created_at=from_epoch_micros(row["created_at"]),
        updated_at=from_epoch_micros(row["updated_at"]),
        ask=row["ask"],
    )


def _memory_fields(user_id: UUID, key: str, memory: memories.Memory) -> dict[str, Any]:
    return {
        "id": str(memory.id),
        "user_id": str(user_id),
        "persona_id": str(memory.persona_id) if memory.persona_id else None,
        "kind": memory.kind,
        "text_key": key,
        "text": memory.text,
        "day": memory.day.isoformat() if memory.day else None,
        "importance": memory.importance,
        "source_call_id": memory.source_call_id,
        "ask": memory.ask,
        "updated_at": memory.updated_at.isoformat(),
    }


class SqlMemoryRepository:
    def __init__(self, client: SqlClient) -> None:
        self._client = client

    def allow(self, call_id: str, at: dt.datetime) -> None:
        self._client.execute(_ALLOW_MEMORIES, {"call_id": call_id, "at": at.isoformat()})

    def claim(self, call_id: str, at: dt.datetime) -> bool:
        rows = self._client.execute(_CLAIM_MEMORIES, {"call_id": call_id, "at": at.isoformat()})
        return bool(rows)

    def release(self, call_id: str) -> None:
        self._client.execute(_RELEASE_MEMORIES, {"call_id": call_id})

    def add(self, user_id: UUID, key: str, memory: memories.Memory, limit: int) -> bool:
        fields = _memory_fields(user_id, key, memory)
        rows = self._client.execute(
            _ADD_MEMORY, {**fields, "created_at": memory.created_at.isoformat(), "limit": limit}
        )
        return bool(rows)

    def replace(self, user_id: UUID, key: str, memory: memories.Memory) -> bool:
        return bool(self._client.execute(_REPLACE_MEMORY, _memory_fields(user_id, key, memory)))

    def listed(self, user_id: UUID) -> list[memories.Memory]:
        rows = self._client.execute(_LIST_MEMORIES, {"user_id": str(user_id)})
        return [_memory(row) for row in rows]

    def get(self, user_id: UUID, memory_id: UUID) -> memories.Memory | None:
        rows = self._client.execute(_MEMORY_BY_ID, {"id": str(memory_id), "user_id": str(user_id)})
        return _memory(rows[0]) if rows else None

    def remove(self, user_id: UUID, memory_id: UUID) -> bool:
        rows = self._client.execute(_REMOVE_MEMORY, {"id": str(memory_id), "user_id": str(user_id)})
        return bool(rows)


# The learner is named only while their account exists (`app_user`); a deleted one's request
# still counts, without them.
_ADD_CHARGE = """
    INSERT INTO usage_charge (user_id, feature, provider, model, units, usd, priced, charged_at)
    VALUES ((SELECT id FROM app_user WHERE id = CAST(:user_id AS uuid)), :feature, :provider,
            :model, CAST(:units AS jsonb), CAST(:usd AS numeric), :priced,
            CAST(:at AS timestamptz))
"""

_RANGE = """
    charged_at >= CAST(:since AS timestamptz) AND charged_at < CAST(:until AS timestamptz)
"""

_TOTAL_CHARGES = f"""
    SELECT CAST(COALESCE(sum(usd), 0) AS double precision) AS usd
    FROM usage_charge
    WHERE {_RANGE}
"""

# The owner's view in one statement: each part is a JSON array, most spent first.
_SPENDING = f"""
    WITH spent AS (SELECT * FROM usage_charge WHERE {_RANGE})
    SELECT
        (SELECT CAST(COALESCE(sum(usd), 0) AS double precision) FROM spent) AS total,
        (SELECT CAST(count(*) AS integer) FROM spent WHERE NOT priced) AS unpriced,
        (SELECT CAST(COALESCE(jsonb_agg(jsonb_build_array(day, usd) ORDER BY day), '[]')
                     AS text)
         FROM (SELECT to_char(charged_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day,
                      CAST(sum(usd) AS double precision) AS usd
               FROM spent GROUP BY 1) AS days) AS days,
        (SELECT CAST(COALESCE(jsonb_agg(jsonb_build_array(feature, usd, requests)
                                        ORDER BY usd DESC, feature), '[]') AS text)
         FROM (SELECT feature, CAST(sum(usd) AS double precision) AS usd,
                      count(*) AS requests
               FROM spent GROUP BY feature) AS features) AS features,
        (SELECT CAST(COALESCE(jsonb_agg(jsonb_build_array(provider, usd, requests)
                                        ORDER BY usd DESC, provider), '[]') AS text)
         FROM (SELECT provider, CAST(sum(usd) AS double precision) AS usd,
                      count(*) AS requests
               FROM spent GROUP BY provider) AS providers) AS providers,
        (SELECT CAST(COALESCE(jsonb_agg(jsonb_build_array(user_id, usd, requests, seconds)
                                        ORDER BY usd DESC, user_id), '[]') AS text)
         FROM (SELECT CAST(user_id AS text) AS user_id,
                      CAST(sum(usd) AS double precision) AS usd, count(*) AS requests,
                      CAST(COALESCE(sum(CAST(units ->> 'call_seconds' AS double precision)), 0)
                           AS integer) AS seconds
               FROM spent WHERE user_id IS NOT NULL
               GROUP BY user_id
               ORDER BY usd DESC, user_id
               LIMIT :top) AS learners) AS learners
"""

_FIRST_ALERT = """
    INSERT INTO spend_alert (month, level) VALUES (CAST(:month AS date), :level)
    ON CONFLICT (month, level) DO NOTHING
    RETURNING 1 AS first
"""

_FORGET_ALERT = """
    DELETE FROM spend_alert WHERE month = CAST(:month AS date) AND level = :level
"""


def _range(since: dt.datetime, until: dt.datetime) -> dict[str, str]:
    return {"since": since.isoformat(), "until": until.isoformat()}


class SqlChargeRepository:
    def __init__(self, client: SqlClient) -> None:
        self._client = client

    def add(self, record: ChargeRecord) -> None:
        self._client.execute(
            _ADD_CHARGE,
            {
                "user_id": str(record.user_id) if record.user_id else None,
                "feature": record.feature.value,
                "provider": record.provider,
                "model": record.model,
                "units": json.dumps(dict(record.units)),
                # As text: a float parameter would lose digits on the way to numeric.
                "usd": repr(record.usd),
                "priced": record.priced,
                "at": record.at.isoformat(),
            },
        )

    def total(self, since: dt.datetime, until: dt.datetime) -> float:
        rows = self._client.execute(_TOTAL_CHARGES, _range(since, until))
        return float(rows[0]["usd"])

    def spending(self, since: dt.datetime, until: dt.datetime, top: int) -> Spending:
        [row] = self._client.execute(_SPENDING, {**_range(since, until), "top": top})
        return Spending(
            total_usd=float(row["total"]),
            unpriced=int(row["unpriced"]),
            days=tuple(
                DaySpend(dt.date.fromisoformat(day), float(usd))
                for day, usd in json.loads(row["days"])
            ),
            features=_shares(row["features"]),
            providers=_shares(row["providers"]),
            learners=tuple(
                LearnerSpend(UUID(user_id), float(usd), int(requests), int(seconds))
                for user_id, usd, requests, seconds in json.loads(row["learners"])
            ),
        )


def _shares(raw: str) -> tuple[Share, ...]:
    return tuple(Share(key, float(usd), int(requests)) for key, usd, requests in json.loads(raw))


class SqlAlertLog:
    def __init__(self, client: SqlClient) -> None:
        self._client = client

    def first(self, month: dt.date, level: Level) -> bool:
        rows = self._client.execute(
            _FIRST_ALERT, {"month": month.isoformat(), "level": level.value}
        )
        return bool(rows)

    def forget(self, month: dt.date, level: Level) -> None:
        self._client.execute(_FORGET_ALERT, {"month": month.isoformat(), "level": level.value})
