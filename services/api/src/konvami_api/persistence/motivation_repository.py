"""Motivation on PostgreSQL: a week's quests, dated milestones and paused reminders (spec §6.15).

Speaking outside conversations is read from where it is already kept: pen-pal replies
(`penpal_note`), pronunciation drills (`pronunciation_drill`) and "Say it better" tries
(`retry_attempt`).
"""

import datetime as dt
import json
from collections.abc import Sequence
from typing import cast
from uuid import UUID

from konvami_api.domain.motivation import (
    EventKind,
    QuestKind,
    QuestPick,
    Reached,
    SpeakingEvent,
    StoredQuest,
)
from konvami_api.persistence.sql import SqlClient, epoch_micros, from_epoch_micros

_ENSURE_USER = """
    owner AS (
        INSERT INTO app_user (id) VALUES (CAST(:user_id AS uuid)) ON CONFLICT (id) DO NOTHING
    )
"""

_EVENTS = f"""
    SELECT kind, {epoch_micros("at")} AS at, right_ FROM (
        SELECT 'pen_pal_reply' AS kind, created_at AS at, true AS right_
        FROM penpal_note
        WHERE user_id = CAST(:user_id AS uuid) AND sender = 'learner'
            AND created_at >= CAST(:since AS timestamptz)
        UNION ALL
        SELECT 'drill', drilled_at, true
        FROM pronunciation_drill
        WHERE user_id = CAST(:user_id AS uuid) AND drilled_at >= CAST(:since AS timestamptz)
        UNION ALL
        SELECT 'retry', attempted_at, was_right
        FROM retry_attempt
        WHERE user_id = CAST(:user_id AS uuid) AND attempted_at >= CAST(:since AS timestamptz)
    ) AS spoken
    ORDER BY at
"""

_QUESTS = f"""
    SELECT quest, target, {epoch_micros("done_at")} AS done_at,
           {epoch_micros("celebrated_at")} AS celebrated_at
    FROM weekly_quest
    WHERE user_id = CAST(:user_id AS uuid) AND week = CAST(:week AS date)
    ORDER BY position
"""

# All or nothing: a week that has quests keeps them (two devices opening Today at once).
_CHOOSE = f"""
    WITH {_ENSURE_USER}
    INSERT INTO weekly_quest (user_id, week, quest, position, target, chosen_at)
    SELECT CAST(:user_id AS uuid), CAST(:week AS date), q.quest, q.position, q.target,
           CAST(:at AS timestamptz)
    FROM jsonb_to_recordset(CAST(:quests AS jsonb)) AS q(quest text, position int, target int)
    WHERE NOT EXISTS (
        SELECT 1 FROM weekly_quest
        WHERE user_id = CAST(:user_id AS uuid) AND week = CAST(:week AS date)
    )
    ON CONFLICT DO NOTHING
"""

_QUEST_DONE = """
    UPDATE weekly_quest SET done_at = CAST(:at AS timestamptz)
    WHERE user_id = CAST(:user_id AS uuid) AND week = CAST(:week AS date) AND quest = :quest
        AND done_at IS NULL
"""

_COMPLETED_WEEKS = """
    SELECT count(*) AS weeks FROM (
        SELECT week FROM weekly_quest WHERE user_id = CAST(:user_id AS uuid)
        GROUP BY week HAVING bool_and(done_at IS NOT NULL)
    ) AS done
"""

_REACHED = f"""
    SELECT milestone, {epoch_micros("reached_at")} AS reached_at, backfilled,
           {epoch_micros("celebrated_at")} AS celebrated_at
    FROM milestone_reached WHERE user_id = CAST(:user_id AS uuid)
"""

_REACH = f"""
    WITH {_ENSURE_USER}
    INSERT INTO milestone_reached (user_id, milestone, reached_at, backfilled, celebrated_at)
    SELECT CAST(:user_id AS uuid), m.milestone, CAST(:at AS timestamptz), :backfilled,
           CASE WHEN :backfilled THEN CAST(:at AS timestamptz) END
    FROM jsonb_to_recordset(CAST(:ids AS jsonb)) AS m(milestone text)
    ON CONFLICT (user_id, milestone) DO NOTHING
"""

# A quest is celebrated in the week it was done: the latest week that has it done.
_CELEBRATE_QUEST = """
    UPDATE weekly_quest SET celebrated_at = CAST(:at AS timestamptz)
    WHERE user_id = CAST(:user_id AS uuid) AND quest = :key AND done_at IS NOT NULL
        AND celebrated_at IS NULL
        AND week = (
            SELECT max(week) FROM weekly_quest
            WHERE user_id = CAST(:user_id AS uuid) AND quest = :key AND done_at IS NOT NULL
        )
    RETURNING quest
"""

_CELEBRATE_MILESTONE = """
    UPDATE milestone_reached SET celebrated_at = CAST(:at AS timestamptz)
    WHERE user_id = CAST(:user_id AS uuid) AND milestone = :key AND celebrated_at IS NULL
    RETURNING milestone
"""

_PAUSE = f"""
    WITH {_ENSURE_USER}
    INSERT INTO reminder_pause (user_id, paused_until)
    VALUES (CAST(:user_id AS uuid), CAST(:until AS timestamptz))
    ON CONFLICT (user_id) DO UPDATE SET paused_until = EXCLUDED.paused_until
"""

_RESUME = "DELETE FROM reminder_pause WHERE user_id = CAST(:user_id AS uuid)"

_PAUSED_UNTIL = f"""
    SELECT {epoch_micros("paused_until")} AS until
    FROM reminder_pause WHERE user_id = CAST(:user_id AS uuid)
"""


def _moment(micros: int | None) -> dt.datetime | None:
    return None if micros is None else from_epoch_micros(int(micros))


def _json(items: Sequence[object]) -> str:
    return json.dumps(items)


# A quest a later version stopped offering is left out rather than failing the week.
_KINDS = frozenset(kind.value for kind in QuestKind)


class SqlMotivationRepository:
    def __init__(self, client: SqlClient) -> None:
        self._client = client

    def speaking_events(self, user_id: UUID, since: dt.datetime) -> list[SpeakingEvent]:
        rows = self._client.execute(_EVENTS, {"user_id": str(user_id), "since": since.isoformat()})
        return [
            SpeakingEvent(
                cast(EventKind, row["kind"]), from_epoch_micros(int(row["at"])), bool(row["right_"])
            )
            for row in rows
        ]

    def quests(self, user_id: UUID, week: dt.date) -> list[StoredQuest]:
        rows = self._client.execute(_QUESTS, {"user_id": str(user_id), "week": week.isoformat()})
        return [
            StoredQuest(
                QuestKind(row["quest"]),
                int(row["target"]),
                _moment(row["done_at"]),
                _moment(row["celebrated_at"]),
            )
            for row in rows
            if row["quest"] in _KINDS
        ]

    def choose(
        self, user_id: UUID, week: dt.date, picks: Sequence[QuestPick], at: dt.datetime
    ) -> None:
        self._client.execute(
            _CHOOSE,
            {
                "user_id": str(user_id),
                "week": week.isoformat(),
                "at": at.isoformat(),
                "quests": _json(
                    [
                        {"quest": pick.kind.value, "position": i, "target": pick.target}
                        for i, pick in enumerate(picks)
                    ]
                ),
            },
        )

    def quest_done(self, user_id: UUID, week: dt.date, kind: str, at: dt.datetime) -> None:
        self._client.execute(
            _QUEST_DONE,
            {
                "user_id": str(user_id),
                "week": week.isoformat(),
                "quest": kind,
                "at": at.isoformat(),
            },
        )

    def completed_weeks(self, user_id: UUID) -> int:
        rows = self._client.execute(_COMPLETED_WEEKS, {"user_id": str(user_id)})
        return int(rows[0]["weeks"]) if rows else 0

    def reached(self, user_id: UUID) -> dict[str, Reached]:
        rows = self._client.execute(_REACHED, {"user_id": str(user_id)})
        return {
            str(row["milestone"]): Reached(
                from_epoch_micros(int(row["reached_at"])),
                bool(row["backfilled"]),
                _moment(row["celebrated_at"]),
            )
            for row in rows
        }

    def reach(self, user_id: UUID, ids: Sequence[str], at: dt.datetime, backfilled: bool) -> None:
        if not ids:
            return
        self._client.execute(
            _REACH,
            {
                "user_id": str(user_id),
                "at": at.isoformat(),
                "backfilled": backfilled,
                "ids": _json([{"milestone": milestone} for milestone in ids]),
            },
        )

    def celebrated(self, user_id: UUID, kind: str, key: str, at: dt.datetime) -> bool:
        sql = _CELEBRATE_QUEST if kind == "quest" else _CELEBRATE_MILESTONE
        rows = self._client.execute(
            sql, {"user_id": str(user_id), "key": key, "at": at.isoformat()}
        )
        return bool(rows)

    def pause_reminders(self, user_id: UUID, until: dt.datetime | None) -> None:
        if until is None:
            self._client.execute(_RESUME, {"user_id": str(user_id)})
        else:
            self._client.execute(_PAUSE, {"user_id": str(user_id), "until": until.isoformat()})

    def reminders_paused_until(self, user_id: UUID) -> dt.datetime | None:
        rows = self._client.execute(_PAUSED_UNTIL, {"user_id": str(user_id)})
        return from_epoch_micros(int(rows[0]["until"])) if rows else None
