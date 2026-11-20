# ruff: noqa: S608 - the f-strings only join this module's own column lists; values are parameters.
"""Radio Konvami's storage on PostgreSQL (section 8; `domain/radio.py`, migration 0310)."""

import datetime as dt
import json
from collections.abc import Mapping, Sequence
from typing import Any
from uuid import UUID

from konvami_api.domain.halves import Correction
from konvami_api.domain.radio import Call, Episode, Profile, Report, Segment
from konvami_api.persistence.sql import SqlClient, epoch_micros, from_epoch_micros


def _iso(value: dt.datetime | None) -> str | None:
    return value.isoformat() if value is not None else None


def _time(value: Any) -> dt.datetime | None:
    return from_epoch_micros(int(value)) if value is not None else None


def _statuses(statuses: Sequence[str]) -> str:
    return json.dumps(list(statuses))


_IN_STATUSES = "status IN (SELECT value FROM jsonb_array_elements_text(CAST(:statuses AS jsonb)))"

_PROFILE = f"""SELECT CAST(user_id AS text) AS user_id, codename, band, veil_default,
    consent_version, {epoch_micros("consent_at")} AS consent_at FROM radio_profile"""

_EPISODE = f"""SELECT CAST(id AS text) AS id, language, CAST(day AS text) AS day, prompt_id,
    status, {epoch_micros("created_at")} AS created_at, CAST(opened_by AS text) AS opened_by,
    {epoch_micros("built_at")} AS built_at, attempts,
    {epoch_micros("delete_after")} AS delete_after FROM radio_episode"""

_SEGMENTS = """SELECT CAST(episode_id AS text) AS episode_id, position, kind, speaker, ai, words,
    audio_key, CAST(call_id AS text) AS call_id, removed FROM radio_segment"""

_CALL = f"""SELECT CAST(id AS text) AS id, CAST(episode_id AS text) AS episode_id,
    CAST(user_id AS text) AS user_id, status, transcript,
    {epoch_micros("created_at")} AS created_at, audio_key, veil_key, veiled, broadcast,
    CAST(reasons AS text) AS reasons, CAST(corrections AS text) AS corrections, attempts,
    {epoch_micros("aired_at")} AS aired_at, {epoch_micros("delete_after")} AS delete_after,
    hidden FROM radio_call"""

_REPORT = f"""SELECT CAST(id AS text) AS id, CAST(reporter AS text) AS reporter,
    CAST(episode_id AS text) AS episode_id, position, reason, note, status,
    {epoch_micros("created_at")} AS created_at, {epoch_micros("resolved_at")} AS resolved_at
    FROM radio_report"""


def _profile(row: dict[str, Any]) -> Profile:
    return Profile(
        user_id=UUID(row["user_id"]),
        codename=row["codename"],
        band=row["band"],
        veil_default=bool(row["veil_default"]),
        consent_version=int(row["consent_version"]),
        consent_at=_time(row["consent_at"]),
    )


def _segment(row: dict[str, Any]) -> Segment:
    return Segment(
        index=int(row["position"]),
        kind=row["kind"],
        speaker=row["speaker"],
        ai=bool(row["ai"]),
        text=row["words"],
        audio_key=row["audio_key"],
        call_id=UUID(row["call_id"]) if row["call_id"] else None,
        removed=bool(row["removed"]),
    )


def _episode(row: dict[str, Any], segments: Sequence[Segment]) -> Episode:
    return Episode(
        id=UUID(row["id"]),
        language=row["language"],
        day=dt.date.fromisoformat(row["day"]),
        prompt_id=row["prompt_id"],
        status=row["status"],
        created_at=from_epoch_micros(int(row["created_at"])),
        opened_by=UUID(row["opened_by"]) if row["opened_by"] else None,
        segments=tuple(sorted(segments, key=lambda s: s.index)),
        built_at=_time(row["built_at"]),
        attempts=int(row["attempts"]),
        delete_after=_time(row["delete_after"]),
    )


def _call(row: dict[str, Any]) -> Call:
    return Call(
        id=UUID(row["id"]),
        episode_id=UUID(row["episode_id"]),
        user_id=UUID(row["user_id"]),
        status=row["status"],
        transcript=row["transcript"],
        created_at=from_epoch_micros(int(row["created_at"])),
        audio_key=row["audio_key"],
        veil_key=row["veil_key"],
        veiled=bool(row["veiled"]),
        broadcast=bool(row["broadcast"]),
        reasons=tuple(json.loads(row["reasons"])),
        corrections=tuple(Correction(**item) for item in json.loads(row["corrections"])),
        attempts=int(row["attempts"]),
        aired_at=_time(row["aired_at"]),
        delete_after=_time(row["delete_after"]),
        hidden=bool(row["hidden"]),
    )


def _report(row: dict[str, Any]) -> Report:
    return Report(
        id=UUID(row["id"]),
        reporter=UUID(row["reporter"]),
        episode_id=UUID(row["episode_id"]),
        segment=int(row["position"]),
        reason=row["reason"],
        note=row["note"],
        status=row["status"],
        created_at=from_epoch_micros(int(row["created_at"])),
        resolved_at=_time(row["resolved_at"]),
    )


class SqlRadioRepository:
    def __init__(self, client: SqlClient) -> None:
        self._client = client

    def _learner(self, user_id: UUID) -> None:
        # Every table refers to the learner's row, which a learner who never stored anything
        # does not have yet.
        self._client.execute(
            "INSERT INTO app_user (id) VALUES (CAST(:id AS uuid)) ON CONFLICT (id) DO NOTHING",
            {"id": str(user_id)},
        )

    # --- Profiles

    def profile(self, user_id: UUID) -> Profile | None:
        rows = self._client.execute(
            f"{_PROFILE} WHERE user_id = CAST(:user_id AS uuid)", {"user_id": str(user_id)}
        )
        return _profile(rows[0]) if rows else None

    def save_profile(self, profile: Profile) -> None:
        self._learner(profile.user_id)
        self._client.execute(
            """INSERT INTO radio_profile (user_id, codename, band, veil_default, consent_version,
                consent_at)
            VALUES (CAST(:user_id AS uuid), :codename, :band, :veil, :version,
                CAST(:consent_at AS timestamptz))
            ON CONFLICT (user_id) DO UPDATE SET codename = EXCLUDED.codename,
                band = EXCLUDED.band, veil_default = EXCLUDED.veil_default,
                consent_version = EXCLUDED.consent_version, consent_at = EXCLUDED.consent_at""",
            {
                "user_id": str(profile.user_id),
                "codename": profile.codename,
                "band": profile.band,
                "veil": profile.veil_default,
                "version": profile.consent_version,
                "consent_at": _iso(profile.consent_at),
            },
        )

    def delete_profile(self, user_id: UUID) -> None:
        self._client.execute(
            "DELETE FROM radio_profile WHERE user_id = CAST(:user_id AS uuid)",
            {"user_id": str(user_id)},
        )

    # --- Episodes

    def _with_segments(self, rows: list[dict[str, Any]]) -> list[Episode]:
        if not rows:
            return []
        segments: dict[str, list[Segment]] = {}
        for row in self._client.execute(
            f"{_SEGMENTS} WHERE CAST(episode_id AS text) IN (SELECT value FROM "
            "jsonb_array_elements_text(CAST(:ids AS jsonb)))",
            {"ids": json.dumps([row["id"] for row in rows])},
        ):
            segments.setdefault(row["episode_id"], []).append(_segment(row))
        return [_episode(row, segments.get(row["id"], [])) for row in rows]

    def episode(self, episode_id: UUID) -> Episode | None:
        found = self._with_segments(
            self._client.execute(
                f"{_EPISODE} WHERE id = CAST(:id AS uuid)", {"id": str(episode_id)}
            )
        )
        return found[0] if found else None

    def episode_on(self, language: str, day: dt.date) -> Episode | None:
        found = self._with_segments(
            self._client.execute(
                f"{_EPISODE} WHERE language = :language AND day = CAST(:day AS date)",
                {"language": language, "day": day.isoformat()},
            )
        )
        return found[0] if found else None

    def add_episode(self, episode: Episode) -> Episode:
        if episode.opened_by is not None:
            self._learner(episode.opened_by)
        self._client.execute(
            """INSERT INTO radio_episode (id, language, day, prompt_id, status, created_at,
                opened_by, built_at, attempts, delete_after)
            VALUES (CAST(:id AS uuid), :language, CAST(:day AS date), :prompt_id, :status,
                CAST(:created_at AS timestamptz), CAST(:opened_by AS uuid),
                CAST(:built_at AS timestamptz), :attempts, CAST(:delete_after AS timestamptz))
            ON CONFLICT (language, day) DO NOTHING""",
            self._episode_values(episode),
        )
        found = self.episode_on(episode.language, episode.day)
        return found if found is not None else episode

    @staticmethod
    def _episode_values(episode: Episode) -> dict[str, Any]:
        return {
            "id": str(episode.id),
            "language": episode.language,
            "day": episode.day.isoformat(),
            "prompt_id": episode.prompt_id,
            "status": episode.status,
            "created_at": episode.created_at.isoformat(),
            "opened_by": str(episode.opened_by) if episode.opened_by else None,
            "built_at": _iso(episode.built_at),
            "attempts": episode.attempts,
            "delete_after": _iso(episode.delete_after),
        }

    def save_episode(self, episode: Episode) -> None:
        self._client.execute(
            """UPDATE radio_episode SET status = :status, built_at = CAST(:built_at AS timestamptz),
                attempts = :attempts, delete_after = CAST(:delete_after AS timestamptz)
            WHERE id = CAST(:id AS uuid)""",
            self._episode_values(episode),
        )
        # The playlist in place of what was stored; a segment whose call is gone is not written.
        self._client.execute(
            "DELETE FROM radio_segment WHERE episode_id = CAST(:id AS uuid)",
            {"id": str(episode.id)},
        )
        for segment in episode.segments:
            self._client.execute(
                """INSERT INTO radio_segment (episode_id, position, kind, speaker, ai, words,
                    audio_key, call_id, removed)
                SELECT CAST(:episode_id AS uuid), :position, :kind, :speaker, :ai, :words,
                    :audio_key, CAST(:call_id AS uuid), :removed
                WHERE CAST(:call_id AS uuid) IS NULL
                    OR EXISTS (SELECT 1 FROM radio_call WHERE id = CAST(:call_id AS uuid))""",
                {
                    "episode_id": str(episode.id),
                    "position": segment.index,
                    "kind": segment.kind,
                    "speaker": segment.speaker,
                    "ai": segment.ai,
                    "words": segment.text,
                    "audio_key": segment.audio_key,
                    "call_id": str(segment.call_id) if segment.call_id else None,
                    "removed": segment.removed,
                },
            )

    def episodes(self, language: str, since: dt.date, statuses: Sequence[str]) -> list[Episode]:
        return self._with_segments(
            self._client.execute(
                f"{_EPISODE} WHERE language = :language AND day >= CAST(:since AS date) "
                f"AND {_IN_STATUSES} ORDER BY day DESC",
                {"language": language, "since": since.isoformat(), "statuses": _statuses(statuses)},
            )
        )

    def episodes_in(self, statuses: Sequence[str], limit: int) -> list[Episode]:
        return self._with_segments(
            self._client.execute(
                f"{_EPISODE} WHERE {_IN_STATUSES} ORDER BY day LIMIT :limit",
                {"statuses": _statuses(statuses), "limit": limit},
            )
        )

    def expired_episodes(self, now: dt.datetime, limit: int) -> list[Episode]:
        return self._with_segments(
            self._client.execute(
                f"{_EPISODE} WHERE delete_after <= CAST(:now AS timestamptz) "
                "AND status <> 'expired' ORDER BY delete_after LIMIT :limit",
                {"now": now.isoformat(), "limit": limit},
            )
        )

    # --- Calls

    def call(self, call_id: UUID) -> Call | None:
        rows = self._client.execute(f"{_CALL} WHERE id = CAST(:id AS uuid)", {"id": str(call_id)})
        return _call(rows[0]) if rows else None

    def save_call(self, call: Call) -> None:
        if call.user_id is None:
            return
        self._learner(call.user_id)
        corrections = [
            {
                "original": c.original,
                "corrected": c.corrected,
                "explanation": c.explanation,
                "certain": c.certain,
            }
            for c in call.corrections
        ]
        self._client.execute(
            """INSERT INTO radio_call (id, episode_id, user_id, status, transcript, created_at,
                audio_key, veil_key, veiled, broadcast, reasons, corrections, attempts, aired_at,
                delete_after, hidden)
            VALUES (CAST(:id AS uuid), CAST(:episode_id AS uuid), CAST(:user_id AS uuid), :status,
                :transcript, CAST(:created_at AS timestamptz), :audio_key, :veil_key, :veiled,
                :broadcast, CAST(:reasons AS jsonb), CAST(:corrections AS jsonb), :attempts,
                CAST(:aired_at AS timestamptz), CAST(:delete_after AS timestamptz), :hidden)
            ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status,
                transcript = EXCLUDED.transcript, audio_key = EXCLUDED.audio_key,
                veil_key = EXCLUDED.veil_key, veiled = EXCLUDED.veiled,
                reasons = EXCLUDED.reasons, corrections = EXCLUDED.corrections,
                attempts = EXCLUDED.attempts, aired_at = EXCLUDED.aired_at,
                delete_after = EXCLUDED.delete_after, hidden = EXCLUDED.hidden""",
            {
                "id": str(call.id),
                "episode_id": str(call.episode_id),
                "user_id": str(call.user_id),
                "status": call.status,
                "transcript": call.transcript,
                "created_at": call.created_at.isoformat(),
                "audio_key": call.audio_key,
                "veil_key": call.veil_key,
                "veiled": call.veiled,
                "broadcast": call.broadcast,
                "reasons": json.dumps(list(call.reasons)),
                "corrections": json.dumps(corrections, ensure_ascii=False),
                "attempts": call.attempts,
                "aired_at": _iso(call.aired_at),
                "delete_after": _iso(call.delete_after),
                "hidden": call.hidden,
            },
        )

    def _calls(self, where: str, params: Mapping[str, Any]) -> list[Call]:
        return [_call(row) for row in self._client.execute(f"{_CALL} {where}", dict(params))]

    def calls_of(self, episode_id: UUID) -> list[Call]:
        return self._calls(
            "WHERE episode_id = CAST(:id AS uuid) ORDER BY created_at", {"id": str(episode_id)}
        )

    def calls_by(self, user_id: UUID) -> list[Call]:
        return self._calls(
            "WHERE user_id = CAST(:id AS uuid) ORDER BY created_at DESC", {"id": str(user_id)}
        )

    def calls_since(self, user_id: UUID, since: dt.datetime) -> int:
        rows = self._client.execute(
            "SELECT count(*) AS n FROM radio_call WHERE user_id = CAST(:id AS uuid) "
            "AND created_at >= CAST(:since AS timestamptz)",
            {"id": str(user_id), "since": since.isoformat()},
        )
        return int(rows[0]["n"]) if rows else 0

    def held(self, limit: int) -> list[Call]:
        return self._calls(
            "WHERE status = 'held' ORDER BY created_at DESC LIMIT :limit", {"limit": limit}
        )

    def stale_checks(self, before: dt.datetime, limit: int) -> list[Call]:
        return self._calls(
            "WHERE status = 'checking' AND created_at < CAST(:before AS timestamptz) "
            "ORDER BY created_at LIMIT :limit",
            {"before": before.isoformat(), "limit": limit},
        )

    def expired_calls(self, now: dt.datetime, limit: int) -> list[Call]:
        return self._calls(
            "WHERE delete_after <= CAST(:now AS timestamptz) AND (transcript <> '' "
            "OR audio_key IS NOT NULL OR veil_key IS NOT NULL) ORDER BY delete_after LIMIT :limit",
            {"now": now.isoformat(), "limit": limit},
        )

    # --- Applause

    def applause(self, episode_id: UUID) -> Mapping[tuple[int, str], int]:
        rows = self._client.execute(
            "SELECT position, card, count(*) AS n FROM radio_applause "
            "WHERE episode_id = CAST(:id AS uuid) GROUP BY position, card",
            {"id": str(episode_id)},
        )
        return {(int(row["position"]), row["card"]): int(row["n"]) for row in rows}

    def applause_of(self, user_id: UUID, episode_id: UUID) -> Mapping[int, str]:
        rows = self._client.execute(
            "SELECT position, card FROM radio_applause WHERE user_id = CAST(:user AS uuid) "
            "AND episode_id = CAST(:id AS uuid)",
            {"user": str(user_id), "id": str(episode_id)},
        )
        return {int(row["position"]): row["card"] for row in rows}

    def set_applause(self, user_id: UUID, episode_id: UUID, segment: int, card: str | None) -> None:
        params: dict[str, str | int | None] = {
            "user": str(user_id),
            "id": str(episode_id),
            "position": segment,
            "card": card,
        }
        if card is None:
            self._client.execute(
                "DELETE FROM radio_applause WHERE user_id = CAST(:user AS uuid) "
                "AND episode_id = CAST(:id AS uuid) AND position = :position",
                params,
            )
            return
        self._learner(user_id)
        self._client.execute(
            """INSERT INTO radio_applause (user_id, episode_id, position, card)
            VALUES (CAST(:user AS uuid), CAST(:id AS uuid), :position, :card)
            ON CONFLICT (user_id, episode_id, position) DO UPDATE SET card = EXCLUDED.card""",
            params,
        )

    def delete_applause(self, user_id: UUID) -> None:
        self._client.execute(
            "DELETE FROM radio_applause WHERE user_id = CAST(:user AS uuid)",
            {"user": str(user_id)},
        )

    # --- Reports

    def add_report(self, report: Report) -> None:
        self._learner(report.reporter)
        self._client.execute(
            """INSERT INTO radio_report (id, reporter, episode_id, position, reason, note, status,
                created_at, resolved_at)
            VALUES (CAST(:id AS uuid), CAST(:reporter AS uuid), CAST(:episode_id AS uuid),
                :position, :reason, :note, :status, CAST(:created_at AS timestamptz),
                CAST(:resolved_at AS timestamptz))""",
            self._report_values(report),
        )

    @staticmethod
    def _report_values(report: Report) -> dict[str, Any]:
        return {
            "id": str(report.id),
            "reporter": str(report.reporter),
            "episode_id": str(report.episode_id),
            "position": report.segment,
            "reason": report.reason,
            "note": report.note,
            "status": report.status,
            "created_at": report.created_at.isoformat(),
            "resolved_at": _iso(report.resolved_at),
        }

    def report(self, report_id: UUID) -> Report | None:
        rows = self._client.execute(
            f"{_REPORT} WHERE id = CAST(:id AS uuid)", {"id": str(report_id)}
        )
        return _report(rows[0]) if rows else None

    def save_report(self, report: Report) -> None:
        self._client.execute(
            """UPDATE radio_report SET status = :status,
                resolved_at = CAST(:resolved_at AS timestamptz) WHERE id = CAST(:id AS uuid)""",
            self._report_values(report),
        )

    def open_reports(self, limit: int) -> list[Report]:
        rows = self._client.execute(
            f"{_REPORT} WHERE status = 'open' ORDER BY created_at DESC LIMIT :limit",
            {"limit": limit},
        )
        return [_report(row) for row in rows]

    def reported(self, user_id: UUID, episode_id: UUID) -> frozenset[int]:
        rows = self._client.execute(
            "SELECT position FROM radio_report WHERE reporter = CAST(:user AS uuid) "
            "AND episode_id = CAST(:id AS uuid)",
            {"user": str(user_id), "id": str(episode_id)},
        )
        return frozenset(int(row["position"]) for row in rows)

    def note_retry(self, user_id: UUID, day: dt.date, limit: int) -> bool:
        if limit < 1:
            return False
        self._learner(user_id)
        rows = self._client.execute(
            """INSERT INTO radio_retry_day (user_id, day, tries)
            VALUES (CAST(:user_id AS uuid), CAST(:day AS date), 1)
            ON CONFLICT (user_id, day) DO UPDATE SET tries = radio_retry_day.tries + 1
                WHERE radio_retry_day.tries < :limit
            RETURNING tries""",
            {"user_id": str(user_id), "day": day.isoformat(), "limit": limit},
        )
        return bool(rows)

    def add_strike(self, user_id: UUID, call_id: UUID | None, at: dt.datetime) -> None:
        self._learner(user_id)
        self._client.execute(
            """INSERT INTO radio_strike (user_id, call_id, at)
            VALUES (CAST(:user_id AS uuid), CAST(:call_id AS uuid), CAST(:at AS timestamptz))""",
            {
                "user_id": str(user_id),
                "call_id": str(call_id) if call_id else None,
                "at": at.isoformat(),
            },
        )

    def strikes(self, user_id: UUID) -> int:
        rows = self._client.execute(
            "SELECT count(*) AS n FROM radio_strike WHERE user_id = CAST(:user_id AS uuid)",
            {"user_id": str(user_id)},
        )
        return int(rows[0]["n"]) if rows else 0
