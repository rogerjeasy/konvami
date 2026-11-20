# ruff: noqa: S608 - the f-strings only join this module's own column lists; values are parameters.
"""The story chain's storage on PostgreSQL (section 9; `domain/chain.py`, migration 0320)."""

import datetime as dt
import json
from typing import Any
from uuid import UUID

from konvami_api.domain.chain import ChainInvite, ChainProfile, ChainSeat, Line, Segment, Story
from konvami_api.domain.halves import Correction, Report
from konvami_api.persistence.sql import SqlClient, epoch_micros, from_epoch_micros


def _iso(value: dt.datetime | None) -> str | None:
    return value.isoformat() if value is not None else None


def _time(value: Any) -> dt.datetime | None:
    return from_epoch_micros(int(value)) if value is not None else None


def _uuid(value: Any) -> UUID | None:
    return UUID(value) if value else None


_PROFILE = f"""SELECT CAST(user_id AS text) AS user_id, codename, band, veil_default, paused,
    consent_version, {epoch_micros("consent_at")} AS consent_at, strikes, suspended
    FROM chain_profile"""

_STORY = f"""SELECT CAST(id AS text) AS id, opening_id, language, level, mode,
    CAST(host AS text) AS host, status, {epoch_micros("created_at")} AS created_at,
    {epoch_micros("turn_since")} AS turn_since, {epoch_micros("ended_at")} AS ended_at,
    CAST(play AS text) AS play, play_status, CAST(reactions AS text) AS reactions, opening_key
    FROM chain_story"""

_SEATS = """SELECT CAST(story_id AS text) AS story_id, seat, CAST(user_id AS text) AS user_id,
    ai_name, host, removed FROM chain_seat"""

_LINE = f"""SELECT CAST(id AS text) AS id, CAST(story_id AS text) AS story_id, position, seat,
    CAST(user_id AS text) AS user_id, ai_name, status, transcript,
    {epoch_micros("created_at")} AS created_at, audio_key, veil_key, veiled,
    CAST(reasons AS text) AS reasons, {epoch_micros("delivered_at")} AS delivered_at, recap,
    CAST(corrections AS text) AS corrections, attempts, CAST(hidden_for AS text) AS hidden_for,
    {epoch_micros("delete_after")} AS delete_after FROM chain_line"""

_INVITE = f"""SELECT code, CAST(user_id AS text) AS user_id, CAST(story_id AS text) AS story_id,
    {epoch_micros("created_at")} AS created_at, {epoch_micros("expires_at")} AS expires_at
    FROM chain_invite"""

_REPORT = f"""SELECT CAST(id AS text) AS id, CAST(reporter AS text) AS reporter,
    CAST(line_id AS text) AS line_id, reason, note, status,
    {epoch_micros("created_at")} AS created_at, {epoch_micros("resolved_at")} AS resolved_at
    FROM chain_report"""


def _profile(row: dict[str, Any]) -> ChainProfile:
    return ChainProfile(
        user_id=UUID(row["user_id"]),
        codename=row["codename"],
        band=row["band"],
        veil_default=bool(row["veil_default"]),
        paused=bool(row["paused"]),
        consent_version=int(row["consent_version"]),
        consent_at=from_epoch_micros(int(row["consent_at"])),
        strikes=int(row["strikes"]),
        suspended=bool(row["suspended"]),
    )


def _seat(row: dict[str, Any]) -> ChainSeat:
    return ChainSeat(
        seat=int(row["seat"]),
        user_id=_uuid(row["user_id"]),
        ai_name=row["ai_name"],
        host=bool(row["host"]),
        removed=bool(row["removed"]),
    )


def _segment(item: dict[str, Any]) -> Segment:
    return Segment(
        kind=item["kind"],
        text=item.get("text", ""),
        audio_key=item.get("audio_key"),
        position=int(item.get("position", 0)),
        line_id=_uuid(item.get("line_id")),
    )


def _story(row: dict[str, Any], seats: list[ChainSeat]) -> Story:
    return Story(
        id=UUID(row["id"]),
        opening_id=row["opening_id"],
        language=row["language"],
        level=row["level"],
        mode=row["mode"],
        host=_uuid(row["host"]),
        status=row["status"],
        created_at=from_epoch_micros(int(row["created_at"])),
        seats=tuple(sorted(seats, key=lambda s: s.seat)),
        turn_since=from_epoch_micros(int(row["turn_since"])),
        ended_at=_time(row["ended_at"]),
        play=tuple(_segment(item) for item in json.loads(row["play"])),
        play_status=row["play_status"],
        reactions=json.loads(row["reactions"]),
        opening_key=row["opening_key"],
    )


def _line(row: dict[str, Any]) -> Line:
    return Line(
        id=UUID(row["id"]),
        story_id=UUID(row["story_id"]),
        position=int(row["position"]),
        seat=int(row["seat"]),
        user_id=_uuid(row["user_id"]),
        status=row["status"],
        transcript=row["transcript"],
        created_at=from_epoch_micros(int(row["created_at"])),
        ai_name=row["ai_name"],
        audio_key=row["audio_key"],
        veil_key=row["veil_key"],
        veiled=bool(row["veiled"]),
        reasons=tuple(json.loads(row["reasons"])),
        delivered_at=_time(row["delivered_at"]),
        recap=row["recap"],
        corrections=tuple(Correction(**item) for item in json.loads(row["corrections"])),
        attempts=int(row["attempts"]),
        hidden_for=tuple(UUID(item) for item in json.loads(row["hidden_for"])),
        delete_after=_time(row["delete_after"]),
    )


def _invite(row: dict[str, Any]) -> ChainInvite:
    return ChainInvite(
        code=row["code"],
        user_id=UUID(row["user_id"]),
        story_id=UUID(row["story_id"]),
        created_at=from_epoch_micros(int(row["created_at"])),
        expires_at=from_epoch_micros(int(row["expires_at"])),
    )


def _report(row: dict[str, Any]) -> Report:
    return Report(
        id=UUID(row["id"]),
        reporter=UUID(row["reporter"]),
        move_id=UUID(row["line_id"]),
        reason=row["reason"],
        note=row["note"],
        status=row["status"],
        created_at=from_epoch_micros(int(row["created_at"])),
        resolved_at=_time(row["resolved_at"]),
    )


class SqlChainRepository:
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

    def profile(self, user_id: UUID) -> ChainProfile | None:
        rows = self._client.execute(
            f"{_PROFILE} WHERE user_id = CAST(:user_id AS uuid)", {"user_id": str(user_id)}
        )
        return _profile(rows[0]) if rows else None

    def save_profile(self, profile: ChainProfile) -> None:
        self._learner(profile.user_id)
        self._client.execute(
            """INSERT INTO chain_profile (user_id, codename, band, veil_default, paused,
                consent_version, consent_at, strikes, suspended)
            VALUES (CAST(:user_id AS uuid), :codename, :band, :veil, :paused, :version,
                CAST(:consent_at AS timestamptz), :strikes, :suspended)
            ON CONFLICT (user_id) DO UPDATE SET codename = EXCLUDED.codename,
                band = EXCLUDED.band, veil_default = EXCLUDED.veil_default,
                paused = EXCLUDED.paused, consent_version = EXCLUDED.consent_version,
                consent_at = EXCLUDED.consent_at, strikes = EXCLUDED.strikes,
                suspended = EXCLUDED.suspended""",
            {
                "user_id": str(profile.user_id),
                "codename": profile.codename,
                "band": profile.band,
                "veil": profile.veil_default,
                "paused": profile.paused,
                "version": profile.consent_version,
                "consent_at": profile.consent_at.isoformat(),
                "strikes": profile.strikes,
                "suspended": profile.suspended,
            },
        )

    def delete_profile(self, user_id: UUID) -> None:
        self._client.execute(
            "DELETE FROM chain_profile WHERE user_id = CAST(:user_id AS uuid)",
            {"user_id": str(user_id)},
        )

    # --- Stories

    def _with_seats(self, rows: list[dict[str, Any]]) -> list[Story]:
        if not rows:
            return []
        ids = [row["id"] for row in rows]
        seats: dict[str, list[ChainSeat]] = {}
        for seat_row in self._client.execute(
            f"{_SEATS} WHERE CAST(story_id AS text) IN (SELECT value FROM "
            "jsonb_array_elements_text(CAST(:ids AS jsonb)))",
            {"ids": json.dumps(ids)},
        ):
            seats.setdefault(seat_row["story_id"], []).append(_seat(seat_row))
        return [_story(row, seats[row["id"]]) for row in rows if len(seats.get(row["id"], [])) == 4]

    def story(self, story_id: UUID) -> Story | None:
        rows = self._client.execute(f"{_STORY} WHERE id = CAST(:id AS uuid)", {"id": str(story_id)})
        found = self._with_seats(rows)
        return found[0] if found else None

    def save_story(self, story: Story) -> None:
        play = [
            {
                "kind": s.kind,
                "text": s.text,
                "audio_key": s.audio_key,
                "position": s.position,
                "line_id": str(s.line_id) if s.line_id else None,
            }
            for s in story.play
        ]
        if story.host is not None:
            self._learner(story.host)
        self._client.execute(
            """INSERT INTO chain_story (id, opening_id, language, level, mode, host, status,
                created_at, turn_since, ended_at, play, play_status, reactions, opening_key)
            VALUES (CAST(:id AS uuid), :opening_id, :language, :level, :mode,
                (SELECT id FROM app_user WHERE id = CAST(:host AS uuid)), :status,
                CAST(:created_at AS timestamptz), CAST(:turn_since AS timestamptz),
                CAST(:ended_at AS timestamptz), CAST(:play AS jsonb), :play_status,
                CAST(:reactions AS jsonb), :opening_key)
            ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status,
                turn_since = EXCLUDED.turn_since, ended_at = EXCLUDED.ended_at,
                play = EXCLUDED.play, play_status = EXCLUDED.play_status,
                reactions = EXCLUDED.reactions, opening_key = EXCLUDED.opening_key""",
            {
                "id": str(story.id),
                "opening_id": story.opening_id,
                "language": story.language,
                "level": story.level,
                "mode": story.mode,
                "host": str(story.host) if story.host else None,
                "status": story.status,
                "created_at": story.created_at.isoformat(),
                "turn_since": story.turn_since.isoformat(),
                "ended_at": _iso(story.ended_at),
                "play": json.dumps(play, ensure_ascii=False),
                "play_status": story.play_status,
                "reactions": json.dumps(dict(story.reactions)),
                "opening_key": story.opening_key,
            },
        )
        for seat in story.seats:
            if seat.user_id is not None:
                self._learner(seat.user_id)
            self._client.execute(
                """INSERT INTO chain_seat (story_id, seat, user_id, ai_name, host, removed)
                VALUES (CAST(:story_id AS uuid), :seat,
                    (SELECT id FROM app_user WHERE id = CAST(:user_id AS uuid)), :ai_name, :host,
                    :removed)
                ON CONFLICT (story_id, seat) DO UPDATE SET user_id = EXCLUDED.user_id,
                    ai_name = EXCLUDED.ai_name, host = EXCLUDED.host,
                    removed = EXCLUDED.removed""",
                {
                    "story_id": str(story.id),
                    "seat": seat.seat,
                    "user_id": str(seat.user_id) if seat.user_id else None,
                    "ai_name": seat.ai_name,
                    "host": seat.host,
                    "removed": seat.removed,
                },
            )

    def stories_of(self, user_id: UUID, limit: int) -> list[Story]:
        rows = self._client.execute(
            f"{_STORY} WHERE id IN (SELECT story_id FROM chain_seat "
            "WHERE user_id = CAST(:user_id AS uuid)) ORDER BY created_at DESC LIMIT :limit",
            {"user_id": str(user_id), "limit": limit},
        )
        return self._with_seats(rows)

    def unfinished(self, limit: int) -> list[Story]:
        rows = self._client.execute(
            f"{_STORY} WHERE status <> 'done' ORDER BY created_at LIMIT :limit", {"limit": limit}
        )
        return self._with_seats(rows)

    def ended_before(self, before: dt.datetime, limit: int) -> list[Story]:
        rows = self._client.execute(
            f"{_STORY} WHERE status = 'done' AND ended_at < CAST(:before AS timestamptz) "
            "AND (play <> CAST('[]' AS jsonb) OR opening_key IS NOT NULL) "
            "ORDER BY ended_at LIMIT :limit",
            {"before": before.isoformat(), "limit": limit},
        )
        return self._with_seats(rows)

    # --- Lines

    def line(self, line_id: UUID) -> Line | None:
        rows = self._client.execute(f"{_LINE} WHERE id = CAST(:id AS uuid)", {"id": str(line_id)})
        return _line(rows[0]) if rows else None

    def save_line(self, line: Line) -> None:
        corrections = [
            {
                "original": c.original,
                "corrected": c.corrected,
                "explanation": c.explanation,
                "certain": c.certain,
            }
            for c in line.corrections
        ]
        self._client.execute(
            """INSERT INTO chain_line (id, story_id, position, seat, user_id, ai_name, status,
                transcript, created_at, audio_key, veil_key, veiled, reasons, delivered_at, recap,
                corrections, attempts, hidden_for, delete_after)
            VALUES (CAST(:id AS uuid), CAST(:story_id AS uuid), :position, :seat,
                CAST(:user_id AS uuid), :ai_name, :status, :transcript,
                CAST(:created_at AS timestamptz), :audio_key, :veil_key, :veiled,
                CAST(:reasons AS jsonb), CAST(:delivered_at AS timestamptz), :recap,
                CAST(:corrections AS jsonb), :attempts, CAST(:hidden_for AS jsonb),
                CAST(:delete_after AS timestamptz))
            ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status,
                transcript = EXCLUDED.transcript, audio_key = EXCLUDED.audio_key,
                veil_key = EXCLUDED.veil_key, veiled = EXCLUDED.veiled, reasons = EXCLUDED.reasons,
                delivered_at = EXCLUDED.delivered_at, recap = EXCLUDED.recap,
                corrections = EXCLUDED.corrections, attempts = EXCLUDED.attempts,
                hidden_for = EXCLUDED.hidden_for, delete_after = EXCLUDED.delete_after""",
            {
                "id": str(line.id),
                "story_id": str(line.story_id),
                "position": line.position,
                "seat": line.seat,
                "user_id": str(line.user_id) if line.user_id else None,
                "ai_name": line.ai_name,
                "status": line.status,
                "transcript": line.transcript,
                "created_at": line.created_at.isoformat(),
                "audio_key": line.audio_key,
                "veil_key": line.veil_key,
                "veiled": line.veiled,
                "reasons": json.dumps(list(line.reasons)),
                "delivered_at": _iso(line.delivered_at),
                "recap": line.recap,
                "corrections": json.dumps(corrections, ensure_ascii=False),
                "attempts": line.attempts,
                "hidden_for": json.dumps([str(u) for u in line.hidden_for]),
                "delete_after": _iso(line.delete_after),
            },
        )

    def lines_of(self, story_id: UUID) -> list[Line]:
        rows = self._client.execute(
            f"{_LINE} WHERE story_id = CAST(:story_id AS uuid) ORDER BY created_at, id",
            {"story_id": str(story_id)},
        )
        return [_line(row) for row in rows]

    def lines_by(self, user_id: UUID) -> list[Line]:
        rows = self._client.execute(
            f"{_LINE} WHERE user_id = CAST(:user_id AS uuid) ORDER BY created_at",
            {"user_id": str(user_id)},
        )
        return [_line(row) for row in rows]

    def lines_since(self, user_id: UUID, since: dt.datetime) -> int:
        rows = self._client.execute(
            "SELECT count(*) AS made FROM chain_line WHERE user_id = CAST(:user_id AS uuid) "
            "AND created_at >= CAST(:since AS timestamptz)",
            {"user_id": str(user_id), "since": since.isoformat()},
        )
        return int(rows[0]["made"])

    def held(self, limit: int) -> list[Line]:
        rows = self._client.execute(
            f"{_LINE} WHERE status = 'held' ORDER BY created_at DESC LIMIT :limit",
            {"limit": limit},
        )
        return [_line(row) for row in rows]

    def stale_checks(self, before: dt.datetime, limit: int) -> list[Line]:
        rows = self._client.execute(
            f"{_LINE} WHERE status = 'checking' AND created_at < CAST(:before AS timestamptz) "
            "ORDER BY created_at LIMIT :limit",
            {"before": before.isoformat(), "limit": limit},
        )
        return [_line(row) for row in rows]

    def expired(self, now: dt.datetime, limit: int) -> list[Line]:
        rows = self._client.execute(
            f"{_LINE} WHERE delete_after <= CAST(:now AS timestamptz) AND (transcript <> '' "
            "OR audio_key IS NOT NULL OR veil_key IS NOT NULL) ORDER BY delete_after LIMIT :limit",
            {"now": now.isoformat(), "limit": limit},
        )
        return [_line(row) for row in rows]

    # --- Invites

    def invite(self, code: str) -> ChainInvite | None:
        rows = self._client.execute(f"{_INVITE} WHERE code = :code", {"code": code})
        return _invite(rows[0]) if rows else None

    def invite_for(self, story_id: UUID) -> ChainInvite | None:
        rows = self._client.execute(
            f"{_INVITE} WHERE story_id = CAST(:story_id AS uuid)", {"story_id": str(story_id)}
        )
        return _invite(rows[0]) if rows else None

    def save_invite(self, invite: ChainInvite) -> None:
        self._learner(invite.user_id)
        self._client.execute(
            """INSERT INTO chain_invite (code, user_id, story_id, created_at, expires_at)
            VALUES (:code, CAST(:user_id AS uuid), CAST(:story_id AS uuid),
                CAST(:created_at AS timestamptz), CAST(:expires_at AS timestamptz))
            ON CONFLICT (story_id) DO UPDATE SET code = EXCLUDED.code,
                user_id = EXCLUDED.user_id, created_at = EXCLUDED.created_at,
                expires_at = EXCLUDED.expires_at""",
            {
                "code": invite.code,
                "user_id": str(invite.user_id),
                "story_id": str(invite.story_id),
                "created_at": invite.created_at.isoformat(),
                "expires_at": invite.expires_at.isoformat(),
            },
        )

    def delete_invite(self, code: str) -> None:
        self._client.execute("DELETE FROM chain_invite WHERE code = :code", {"code": code})

    def delete_expired_invites(self, now: dt.datetime) -> None:
        self._client.execute(
            "DELETE FROM chain_invite WHERE expires_at <= CAST(:now AS timestamptz)",
            {"now": now.isoformat()},
        )

    # --- Reports

    def add_report(self, report: Report) -> None:
        self._client.execute(
            """INSERT INTO chain_report (id, reporter, line_id, reason, note, status, created_at)
            VALUES (CAST(:id AS uuid), CAST(:reporter AS uuid), CAST(:line_id AS uuid), :reason,
                :note, :status, CAST(:at AS timestamptz))""",
            {
                "id": str(report.id),
                "reporter": str(report.reporter),
                "line_id": str(report.move_id),
                "reason": report.reason,
                "note": report.note,
                "status": report.status,
                "at": report.created_at.isoformat(),
            },
        )

    def report(self, report_id: UUID) -> Report | None:
        rows = self._client.execute(
            f"{_REPORT} WHERE id = CAST(:id AS uuid)", {"id": str(report_id)}
        )
        return _report(rows[0]) if rows else None

    def save_report(self, report: Report) -> None:
        self._client.execute(
            "UPDATE chain_report SET status = :status, "
            "resolved_at = CAST(:resolved_at AS timestamptz) WHERE id = CAST(:id AS uuid)",
            {
                "id": str(report.id),
                "status": report.status,
                "resolved_at": _iso(report.resolved_at),
            },
        )

    def open_reports(self, limit: int) -> list[Report]:
        rows = self._client.execute(
            f"{_REPORT} WHERE status = 'open' ORDER BY created_at DESC LIMIT :limit",
            {"limit": limit},
        )
        return [_report(row) for row in rows]

    def reserve_retry(self, user_id: UUID, day: dt.date, limit: int) -> bool:
        if limit < 1:
            return False
        self._learner(user_id)
        rows = self._client.execute(
            """INSERT INTO chain_retry_day (user_id, day, tries)
            VALUES (CAST(:user_id AS uuid), CAST(:day AS date), 1)
            ON CONFLICT (user_id, day) DO UPDATE SET tries = chain_retry_day.tries + 1
                WHERE chain_retry_day.tries < :limit
            RETURNING tries""",
            {"user_id": str(user_id), "day": day.isoformat(), "limit": limit},
        )
        return bool(rows)
