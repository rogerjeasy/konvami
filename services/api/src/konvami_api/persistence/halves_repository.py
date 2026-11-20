# ruff: noqa: S608 - the f-strings only join this module's own column lists; values are parameters.
"""Two Halves' storage on PostgreSQL (section 7; `domain/halves.py`, migration 0290)."""

import datetime as dt
import json
from typing import Any
from uuid import UUID

from konvami_api.domain.halves import (
    Block,
    Case,
    Correction,
    Duo,
    Invite,
    Move,
    Nudge,
    Profile,
    RecapLine,
    Report,
    SafetyCounts,
    SeatState,
    Strike,
    Ticket,
)
from konvami_api.domain.halves_cases import template_document, template_from
from konvami_api.persistence.sql import SqlClient, epoch_micros, from_epoch_micros


def _iso(value: dt.datetime | None) -> str | None:
    return value.isoformat() if value is not None else None


def _time(value: Any) -> dt.datetime | None:
    return from_epoch_micros(int(value)) if value is not None else None


def _uuid(value: Any) -> UUID | None:
    return UUID(value) if value else None


_PROFILE = f"""SELECT CAST(user_id AS text) AS user_id, codename, native_language, place, band,
    veil_default, paused, consent_version, {epoch_micros("consent_at")} AS consent_at, strikes,
    suspended FROM halves_profile"""

_CASE = f"""SELECT CAST(id AS text) AS id, template_id, mode, status,
    {epoch_micros("created_at")} AS created_at, {epoch_micros("ended_at")} AS ended_at, season,
    CAST(recaps AS text) AS recaps, recap_status, CAST(custom_template AS text) AS custom_template
    FROM halves_case"""

_SEATS = f"""SELECT CAST(case_id AS text) AS case_id, seat, CAST(user_id AS text) AS user_id,
    stand_in, speaks, hears, CAST(final_answers AS text) AS final_answers, again,
    {epoch_micros("last_active")} AS last_active FROM halves_seat"""

_MOVE = f"""SELECT CAST(id AS text) AS id, CAST(case_id AS text) AS case_id, seat, round,
    CAST(user_id AS text) AS user_id, status, transcript,
    {epoch_micros("created_at")} AS created_at,
    audio_key, veil_key, veiled, CAST(reasons AS text) AS reasons,
    {epoch_micros("delivered_at")} AS delivered_at, reaction, CAST(answers AS text) AS answers,
    CAST(corrections AS text) AS corrections, attempts, hidden,
    {epoch_micros("delete_after")} AS delete_after, CAST(bridge AS text) AS bridge,
    {epoch_micros("decided_at")} AS decided_at FROM halves_move"""

_INVITE = f"""SELECT code, CAST(user_id AS text) AS user_id, template_id,
    {epoch_micros("created_at")} AS created_at, {epoch_micros("expires_at")} AS expires_at
    FROM halves_invite"""

_REPORT = f"""SELECT CAST(id AS text) AS id, CAST(reporter AS text) AS reporter,
    CAST(move_id AS text) AS move_id, reason, note, status,
    {epoch_micros("created_at")} AS created_at, {epoch_micros("resolved_at")} AS resolved_at
    FROM halves_report"""

_TICKET = f"""SELECT CAST(user_id AS text) AS user_id, {epoch_micros("created_at")} AS created_at,
    {epoch_micros("search_until")} AS search_until, remind,
    {epoch_micros("ai_offered_at")} AS ai_offered_at FROM halves_ticket"""

_NUDGE = f"""SELECT CAST(id AS text) AS id, CAST(move_id AS text) AS move_id,
    CAST(user_id AS text) AS user_id, text, status, {epoch_micros("created_at")} AS created_at,
    attempts, reason, {epoch_micros("delivered_at")} AS delivered_at FROM halves_nudge"""


def _profile(row: dict[str, Any]) -> Profile:
    return Profile(
        user_id=UUID(row["user_id"]),
        codename=row["codename"],
        native_language=row["native_language"],
        place=row["place"],
        band=row["band"],
        veil_default=bool(row["veil_default"]),
        paused=bool(row["paused"]),
        consent_version=int(row["consent_version"]),
        consent_at=from_epoch_micros(int(row["consent_at"])),
        strikes=int(row["strikes"]),
        suspended=bool(row["suspended"]),
    )


def _seat(row: dict[str, Any]) -> SeatState:
    return SeatState(
        seat=row["seat"],
        user_id=_uuid(row["user_id"]),
        stand_in=row["stand_in"],
        speaks=row["speaks"],
        hears=row["hears"],
        final_answers=tuple(int(n) for n in json.loads(row["final_answers"])),
        again=row["again"],
        last_active=_time(row["last_active"]),
    )


def _case(row: dict[str, Any], seats: list[SeatState]) -> Case:
    by_seat = {seat.seat: seat for seat in seats}
    recaps = {
        seat: tuple(
            RecapLine(line["speaker"], line["text"], line.get("audio_key")) for line in lines
        )
        for seat, lines in json.loads(row["recaps"]).items()
    }
    return Case(
        id=UUID(row["id"]),
        template_id=row["template_id"],
        mode=row["mode"],
        status=row["status"],
        created_at=from_epoch_micros(int(row["created_at"])),
        seats=(by_seat["A"], by_seat["B"]),
        ended_at=_time(row["ended_at"]),
        season=row["season"],
        recaps=recaps,
        recap_status=row["recap_status"],
        custom=(
            template_from(json.loads(row["custom_template"]))
            if row.get("custom_template")
            else None
        ),
    )


def _move(row: dict[str, Any]) -> Move:
    return Move(
        id=UUID(row["id"]),
        case_id=UUID(row["case_id"]),
        seat=row["seat"],
        round=int(row["round"]),
        user_id=_uuid(row["user_id"]),
        status=row["status"],
        transcript=row["transcript"],
        created_at=from_epoch_micros(int(row["created_at"])),
        audio_key=row["audio_key"],
        veil_key=row["veil_key"],
        veiled=bool(row["veiled"]),
        reasons=tuple(json.loads(row["reasons"])),
        delivered_at=_time(row["delivered_at"]),
        reaction=row["reaction"],
        answers=tuple(int(n) for n in json.loads(row["answers"])),
        corrections=tuple(Correction(**item) for item in json.loads(row["corrections"])),
        attempts=int(row["attempts"]),
        hidden=bool(row["hidden"]),
        delete_after=_time(row["delete_after"]),
        bridge=dict(json.loads(row["bridge"] or "{}")),
        decided_at=_time(row["decided_at"]),
    )


def _invite(row: dict[str, Any]) -> Invite:
    return Invite(
        code=row["code"],
        user_id=UUID(row["user_id"]),
        template_id=row["template_id"],
        created_at=from_epoch_micros(int(row["created_at"])),
        expires_at=from_epoch_micros(int(row["expires_at"])),
    )


def _ticket(row: dict[str, Any]) -> Ticket:
    return Ticket(
        user_id=UUID(row["user_id"]),
        created_at=from_epoch_micros(int(row["created_at"])),
        until=from_epoch_micros(int(row["search_until"])),
        remind=bool(row["remind"]),
        ai_offered_at=_time(row["ai_offered_at"]),
    )


def _nudge(row: dict[str, Any]) -> Nudge:
    return Nudge(
        id=UUID(row["id"]),
        move_id=UUID(row["move_id"]),
        user_id=UUID(row["user_id"]),
        text=row["text"],
        status=row["status"],
        created_at=from_epoch_micros(int(row["created_at"])),
        attempts=int(row["attempts"]),
        reason=row["reason"],
        delivered_at=_time(row["delivered_at"]),
    )


def _report(row: dict[str, Any]) -> Report:
    return Report(
        id=UUID(row["id"]),
        reporter=UUID(row["reporter"]),
        move_id=UUID(row["move_id"]),
        reason=row["reason"],
        note=row["note"],
        status=row["status"],
        created_at=from_epoch_micros(int(row["created_at"])),
        resolved_at=_time(row["resolved_at"]),
    )


class SqlHalvesRepository:
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
            """INSERT INTO halves_profile (user_id, codename, native_language, place, band,
                veil_default, paused, consent_version, consent_at, strikes, suspended)
            VALUES (CAST(:user_id AS uuid), :codename, :native, :place, :band, :veil, :paused,
                :version, CAST(:consent_at AS timestamptz), :strikes, :suspended)
            ON CONFLICT (user_id) DO UPDATE SET codename = EXCLUDED.codename,
                native_language = EXCLUDED.native_language, place = EXCLUDED.place,
                band = EXCLUDED.band, veil_default = EXCLUDED.veil_default,
                paused = EXCLUDED.paused, consent_version = EXCLUDED.consent_version,
                consent_at = EXCLUDED.consent_at, strikes = EXCLUDED.strikes,
                suspended = EXCLUDED.suspended""",
            {
                "user_id": str(profile.user_id),
                "codename": profile.codename,
                "native": profile.native_language,
                "place": profile.place,
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
            "DELETE FROM halves_profile WHERE user_id = CAST(:user_id AS uuid)",
            {"user_id": str(user_id)},
        )

    # --- Cases

    def _with_seats(self, rows: list[dict[str, Any]]) -> list[Case]:
        if not rows:
            return []
        ids = [row["id"] for row in rows]
        seats: dict[str, list[SeatState]] = {}
        for seat_row in self._client.execute(
            f"{_SEATS} WHERE CAST(case_id AS text) IN (SELECT value FROM "
            "jsonb_array_elements_text(CAST(:ids AS jsonb)))",
            {"ids": json.dumps(ids)},
        ):
            seats.setdefault(seat_row["case_id"], []).append(_seat(seat_row))
        return [_case(row, seats[row["id"]]) for row in rows if len(seats.get(row["id"], [])) == 2]

    def case(self, case_id: UUID) -> Case | None:
        rows = self._client.execute(f"{_CASE} WHERE id = CAST(:id AS uuid)", {"id": str(case_id)})
        found = self._with_seats(rows)
        return found[0] if found else None

    def save_case(self, case: Case) -> None:
        recaps = {
            seat: [
                {"speaker": line.speaker, "text": line.text, "audio_key": line.audio_key}
                for line in lines
            ]
            for seat, lines in case.recaps.items()
        }
        self._client.execute(
            """INSERT INTO halves_case (id, template_id, mode, status, created_at, ended_at, season,
                recaps, recap_status, custom_template)
            VALUES (CAST(:id AS uuid), :template_id, :mode, :status,
                CAST(:created_at AS timestamptz), CAST(:ended_at AS timestamptz), :season,
                CAST(:recaps AS jsonb), :recap_status, CAST(:custom AS jsonb))
            ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, ended_at = EXCLUDED.ended_at,
                recaps = EXCLUDED.recaps, recap_status = EXCLUDED.recap_status""",
            {
                "id": str(case.id),
                "template_id": case.template_id,
                "mode": case.mode,
                "status": case.status,
                "created_at": case.created_at.isoformat(),
                "ended_at": _iso(case.ended_at),
                "season": case.season,
                "recaps": json.dumps(recaps, ensure_ascii=False),
                "recap_status": case.recap_status,
                "custom": (
                    json.dumps(template_document(case.custom), ensure_ascii=False)
                    if case.custom
                    else None
                ),
            },
        )
        for seat in case.seats:
            if seat.user_id is not None:
                self._learner(seat.user_id)
            self._client.execute(
                """INSERT INTO halves_seat (case_id, seat, user_id, stand_in, speaks, hears,
                    final_answers, again, last_active)
                VALUES (CAST(:case_id AS uuid), :seat,
                    (SELECT id FROM app_user WHERE id = CAST(:user_id AS uuid)), :stand_in,
                    :speaks, :hears, CAST(:final_answers AS jsonb), :again,
                    CAST(:last_active AS timestamptz))
                ON CONFLICT (case_id, seat) DO UPDATE SET user_id = EXCLUDED.user_id,
                    stand_in = EXCLUDED.stand_in, final_answers = EXCLUDED.final_answers,
                    again = EXCLUDED.again, last_active = EXCLUDED.last_active""",
                {
                    "case_id": str(case.id),
                    "seat": seat.seat,
                    "user_id": str(seat.user_id) if seat.user_id else None,
                    "stand_in": seat.stand_in,
                    "speaks": seat.speaks,
                    "hears": seat.hears,
                    "final_answers": json.dumps(list(seat.final_answers)),
                    "again": seat.again,
                    "last_active": _iso(seat.last_active),
                },
            )

    def cases_of(self, user_id: UUID, limit: int) -> list[Case]:
        rows = self._client.execute(
            f"{_CASE} WHERE id IN (SELECT case_id FROM halves_seat "
            "WHERE user_id = CAST(:user_id AS uuid)) ORDER BY created_at DESC LIMIT :limit",
            {"user_id": str(user_id), "limit": limit},
        )
        return self._with_seats(rows)

    def open_cases(self, limit: int) -> list[Case]:
        rows = self._client.execute(
            f"{_CASE} WHERE status = 'open' ORDER BY created_at LIMIT :limit", {"limit": limit}
        )
        return self._with_seats(rows)

    # --- Moves

    def move(self, move_id: UUID) -> Move | None:
        rows = self._client.execute(f"{_MOVE} WHERE id = CAST(:id AS uuid)", {"id": str(move_id)})
        return _move(rows[0]) if rows else None

    def save_move(self, move: Move) -> None:
        corrections = [
            {
                "original": c.original,
                "corrected": c.corrected,
                "explanation": c.explanation,
                "certain": c.certain,
            }
            for c in move.corrections
        ]
        self._client.execute(
            """INSERT INTO halves_move (id, case_id, seat, round, user_id, status, transcript,
                created_at, audio_key, veil_key, veiled, reasons, delivered_at, reaction, answers,
                corrections, attempts, hidden, delete_after, bridge, decided_at)
            VALUES (CAST(:id AS uuid), CAST(:case_id AS uuid), :seat, :round,
                CAST(:user_id AS uuid), :status, :transcript, CAST(:created_at AS timestamptz),
                :audio_key, :veil_key, :veiled, CAST(:reasons AS jsonb),
                CAST(:delivered_at AS timestamptz), :reaction, CAST(:answers AS jsonb),
                CAST(:corrections AS jsonb), :attempts, :hidden, CAST(:delete_after AS timestamptz),
                CAST(:bridge AS jsonb), CAST(:decided_at AS timestamptz))
            ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status,
                transcript = EXCLUDED.transcript, audio_key = EXCLUDED.audio_key,
                veil_key = EXCLUDED.veil_key, veiled = EXCLUDED.veiled, reasons = EXCLUDED.reasons,
                delivered_at = EXCLUDED.delivered_at, reaction = EXCLUDED.reaction,
                answers = EXCLUDED.answers, corrections = EXCLUDED.corrections,
                attempts = EXCLUDED.attempts, hidden = EXCLUDED.hidden,
                delete_after = EXCLUDED.delete_after, bridge = EXCLUDED.bridge,
                decided_at = EXCLUDED.decided_at""",
            {
                "id": str(move.id),
                "case_id": str(move.case_id),
                "seat": move.seat,
                "round": move.round,
                "user_id": str(move.user_id) if move.user_id else None,
                "status": move.status,
                "transcript": move.transcript,
                "created_at": move.created_at.isoformat(),
                "audio_key": move.audio_key,
                "veil_key": move.veil_key,
                "veiled": move.veiled,
                "reasons": json.dumps(list(move.reasons)),
                "delivered_at": _iso(move.delivered_at),
                "reaction": move.reaction,
                "answers": json.dumps(list(move.answers)),
                "corrections": json.dumps(corrections, ensure_ascii=False),
                "attempts": move.attempts,
                "hidden": move.hidden,
                "delete_after": _iso(move.delete_after),
                "bridge": json.dumps(dict(move.bridge), ensure_ascii=False),
                "decided_at": _iso(move.decided_at),
            },
        )

    def moves_of(self, case_id: UUID) -> list[Move]:
        rows = self._client.execute(
            f"{_MOVE} WHERE case_id = CAST(:case_id AS uuid) ORDER BY created_at, id",
            {"case_id": str(case_id)},
        )
        return [_move(row) for row in rows]

    def moves_by(self, user_id: UUID) -> list[Move]:
        rows = self._client.execute(
            f"{_MOVE} WHERE user_id = CAST(:user_id AS uuid) ORDER BY created_at",
            {"user_id": str(user_id)},
        )
        return [_move(row) for row in rows]

    def moves_since(self, user_id: UUID, since: dt.datetime) -> int:
        rows = self._client.execute(
            "SELECT count(*) AS made FROM halves_move WHERE user_id = CAST(:user_id AS uuid) "
            "AND created_at >= CAST(:since AS timestamptz)",
            {"user_id": str(user_id), "since": since.isoformat()},
        )
        return int(rows[0]["made"])

    def held(self, limit: int) -> list[Move]:
        rows = self._client.execute(
            f"{_MOVE} WHERE status = 'held' ORDER BY created_at DESC LIMIT :limit",
            {"limit": limit},
        )
        return [_move(row) for row in rows]

    def stale_checks(self, before: dt.datetime, limit: int) -> list[Move]:
        rows = self._client.execute(
            f"{_MOVE} WHERE status = 'checking' AND created_at < CAST(:before AS timestamptz) "
            "ORDER BY created_at LIMIT :limit",
            {"before": before.isoformat(), "limit": limit},
        )
        return [_move(row) for row in rows]

    def expired(self, now: dt.datetime, limit: int) -> list[Move]:
        rows = self._client.execute(
            f"{_MOVE} WHERE delete_after <= CAST(:now AS timestamptz) AND status <> 'held' "
            "AND (transcript <> '' "
            "OR audio_key IS NOT NULL OR veil_key IS NOT NULL) ORDER BY delete_after LIMIT :limit",
            {"now": now.isoformat(), "limit": limit},
        )
        return [_move(row) for row in rows]

    # --- Invites

    def invite(self, code: str) -> Invite | None:
        rows = self._client.execute(f"{_INVITE} WHERE code = :code", {"code": code})
        return _invite(rows[0]) if rows else None

    def note_wrong_code(self, user_id: UUID, day: dt.date, limit: int) -> bool:
        if limit < 1:
            return False
        self._learner(user_id)
        rows = self._client.execute(
            """INSERT INTO halves_redeem_day (user_id, day, wrong)
            VALUES (CAST(:user_id AS uuid), CAST(:day AS date), 1)
            ON CONFLICT (user_id, day) DO UPDATE SET wrong = halves_redeem_day.wrong + 1
                WHERE halves_redeem_day.wrong < :limit
            RETURNING wrong""",
            {"user_id": str(user_id), "day": day.isoformat(), "limit": limit},
        )
        return bool(rows)

    def wrong_codes(self, user_id: UUID, day: dt.date) -> int:
        rows = self._client.execute(
            "SELECT wrong FROM halves_redeem_day"
            " WHERE user_id = CAST(:user_id AS uuid) AND day = CAST(:day AS date)",
            {"user_id": str(user_id), "day": day.isoformat()},
        )
        return int(rows[0]["wrong"]) if rows else 0

    def invite_of(self, user_id: UUID) -> Invite | None:
        rows = self._client.execute(
            f"{_INVITE} WHERE user_id = CAST(:user_id AS uuid)", {"user_id": str(user_id)}
        )
        return _invite(rows[0]) if rows else None

    def save_invite(self, invite: Invite) -> None:
        self._learner(invite.user_id)
        self._client.execute(
            """INSERT INTO halves_invite (code, user_id, template_id, created_at, expires_at)
            VALUES (:code, CAST(:user_id AS uuid), :template_id, CAST(:created_at AS timestamptz),
                CAST(:expires_at AS timestamptz))
            ON CONFLICT (user_id) DO UPDATE SET code = EXCLUDED.code,
                template_id = EXCLUDED.template_id, created_at = EXCLUDED.created_at,
                expires_at = EXCLUDED.expires_at""",
            {
                "code": invite.code,
                "user_id": str(invite.user_id),
                "template_id": invite.template_id,
                "created_at": invite.created_at.isoformat(),
                "expires_at": invite.expires_at.isoformat(),
            },
        )

    def delete_invite(self, code: str) -> None:
        self._client.execute("DELETE FROM halves_invite WHERE code = :code", {"code": code})

    def delete_expired_invites(self, now: dt.datetime) -> None:
        self._client.execute(
            "DELETE FROM halves_invite WHERE expires_at <= CAST(:now AS timestamptz)",
            {"now": now.isoformat()},
        )

    # --- Blocks

    def blocks_of(self, user_id: UUID) -> list[Block]:
        rows = self._client.execute(
            "SELECT CAST(id AS text) AS id, CAST(blocker AS text) AS blocker, "
            "CAST(blocked AS text) AS blocked, codename, "
            f"{epoch_micros('created_at')} AS created_at FROM halves_block "
            "WHERE blocker = CAST(:user_id AS uuid) ORDER BY created_at",
            {"user_id": str(user_id)},
        )
        return [
            Block(
                UUID(row["id"]),
                UUID(row["blocker"]),
                UUID(row["blocked"]),
                row["codename"],
                from_epoch_micros(int(row["created_at"])),
            )
            for row in rows
        ]

    def blocked(self, one: UUID, other: UUID) -> bool:
        rows = self._client.execute(
            "SELECT 1 AS one FROM halves_block WHERE (blocker = CAST(:a AS uuid) AND "
            "blocked = CAST(:b AS uuid)) OR (blocker = CAST(:b AS uuid) AND "
            "blocked = CAST(:a AS uuid))",
            {"a": str(one), "b": str(other)},
        )
        return bool(rows)

    def add_block(self, block: Block) -> None:
        self._learner(block.blocker)
        self._learner(block.blocked)
        self._client.execute(
            """INSERT INTO halves_block (id, blocker, blocked, codename, created_at)
            VALUES (CAST(:id AS uuid), CAST(:blocker AS uuid), CAST(:blocked AS uuid), :codename,
                CAST(:at AS timestamptz))
            ON CONFLICT (blocker, blocked) DO NOTHING""",
            {
                "id": str(block.id),
                "blocker": str(block.blocker),
                "blocked": str(block.blocked),
                "codename": block.codename,
                "at": block.created_at.isoformat(),
            },
        )

    def remove_block(self, user_id: UUID, block_id: UUID) -> None:
        self._client.execute(
            "DELETE FROM halves_block WHERE id = CAST(:id AS uuid) "
            "AND blocker = CAST(:user_id AS uuid)",
            {"id": str(block_id), "user_id": str(user_id)},
        )

    # --- Duos

    def duos_of(self, user_id: UUID) -> list[Duo]:
        rows = self._client.execute(
            "SELECT CAST(id AS text) AS id, CAST(user_a AS text) AS user_a, "
            f"CAST(user_b AS text) AS user_b, {epoch_micros('created_at')} AS created_at "
            "FROM halves_duo WHERE user_a = CAST(:user_id AS uuid) "
            "OR user_b = CAST(:user_id AS uuid) ORDER BY created_at",
            {"user_id": str(user_id)},
        )
        return [
            Duo(
                UUID(row["id"]),
                UUID(row["user_a"]),
                UUID(row["user_b"]),
                from_epoch_micros(int(row["created_at"])),
            )
            for row in rows
        ]

    def add_duo(self, duo: Duo) -> None:
        first, second = sorted((duo.user_a, duo.user_b), key=str)
        self._learner(first)
        self._learner(second)
        self._client.execute(
            """INSERT INTO halves_duo (id, user_a, user_b, created_at)
            VALUES (CAST(:id AS uuid), CAST(:a AS uuid), CAST(:b AS uuid), CAST(:at AS timestamptz))
            ON CONFLICT (user_a, user_b) DO NOTHING""",
            {
                "id": str(duo.id),
                "a": str(first),
                "b": str(second),
                "at": duo.created_at.isoformat(),
            },
        )

    def remove_duo(self, user_id: UUID, other: UUID) -> None:
        first, second = sorted((user_id, other), key=str)
        self._client.execute(
            "DELETE FROM halves_duo WHERE user_a = CAST(:a AS uuid) AND user_b = CAST(:b AS uuid)",
            {"a": str(first), "b": str(second)},
        )

    # --- Reports

    def add_report(self, report: Report) -> None:
        self._client.execute(
            """INSERT INTO halves_report (id, reporter, move_id, reason, note, status, created_at)
            VALUES (CAST(:id AS uuid), CAST(:reporter AS uuid), CAST(:move_id AS uuid), :reason,
                :note, :status, CAST(:at AS timestamptz))""",
            {
                "id": str(report.id),
                "reporter": str(report.reporter),
                "move_id": str(report.move_id),
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
            "UPDATE halves_report SET status = :status, "
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

    # --- Searches (7.3)

    def ticket(self, user_id: UUID) -> Ticket | None:
        rows = self._client.execute(
            f"{_TICKET} WHERE user_id = CAST(:user_id AS uuid)", {"user_id": str(user_id)}
        )
        return _ticket(rows[0]) if rows else None

    def save_ticket(self, ticket: Ticket) -> None:
        self._learner(ticket.user_id)
        self._client.execute(
            """INSERT INTO halves_ticket (user_id, created_at, search_until, remind, ai_offered_at)
            VALUES (CAST(:user_id AS uuid), CAST(:created_at AS timestamptz),
                CAST(:until AS timestamptz), :remind, CAST(:offered AS timestamptz))
            ON CONFLICT (user_id) DO UPDATE SET created_at = EXCLUDED.created_at,
                search_until = EXCLUDED.search_until, remind = EXCLUDED.remind,
                ai_offered_at = EXCLUDED.ai_offered_at""",
            {
                "user_id": str(ticket.user_id),
                "created_at": ticket.created_at.isoformat(),
                "until": ticket.until.isoformat(),
                "remind": ticket.remind,
                "offered": _iso(ticket.ai_offered_at),
            },
        )

    def delete_ticket(self, user_id: UUID) -> None:
        self._client.execute(
            "DELETE FROM halves_ticket WHERE user_id = CAST(:user_id AS uuid)",
            {"user_id": str(user_id)},
        )

    def tickets(self, limit: int) -> list[Ticket]:
        rows = self._client.execute(
            f"{_TICKET} ORDER BY created_at, user_id LIMIT :limit", {"limit": limit}
        )
        return [_ticket(row) for row in rows]

    # --- Nudges (7.7, 7.9)

    def add_nudge(self, nudge: Nudge) -> bool:
        rows = self._client.execute(
            """INSERT INTO halves_nudge (id, move_id, user_id, text, status, created_at, attempts)
            VALUES (CAST(:id AS uuid), CAST(:move_id AS uuid), CAST(:user_id AS uuid), :text,
                :status, CAST(:at AS timestamptz), :attempts)
            ON CONFLICT (move_id, user_id) DO NOTHING RETURNING CAST(id AS text) AS id""",
            {
                "id": str(nudge.id),
                "move_id": str(nudge.move_id),
                "user_id": str(nudge.user_id),
                "text": nudge.text,
                "status": nudge.status,
                "at": nudge.created_at.isoformat(),
                "attempts": nudge.attempts,
            },
        )
        return bool(rows)

    def nudge(self, nudge_id: UUID) -> Nudge | None:
        rows = self._client.execute(f"{_NUDGE} WHERE id = CAST(:id AS uuid)", {"id": str(nudge_id)})
        return _nudge(rows[0]) if rows else None

    def save_nudge(self, nudge: Nudge) -> None:
        self._client.execute(
            "UPDATE halves_nudge SET status = :status, attempts = :attempts, reason = :reason, "
            "delivered_at = CAST(:delivered_at AS timestamptz) WHERE id = CAST(:id AS uuid)",
            {
                "id": str(nudge.id),
                "status": nudge.status,
                "attempts": nudge.attempts,
                "reason": nudge.reason,
                "delivered_at": _iso(nudge.delivered_at),
            },
        )

    def nudges_of(self, move_id: UUID) -> list[Nudge]:
        rows = self._client.execute(
            f"{_NUDGE} WHERE move_id = CAST(:move_id AS uuid) ORDER BY created_at",
            {"move_id": str(move_id)},
        )
        return [_nudge(row) for row in rows]

    def held_nudges(self, limit: int) -> list[Nudge]:
        rows = self._client.execute(
            f"{_NUDGE} WHERE status = 'held' ORDER BY created_at DESC LIMIT :limit",
            {"limit": limit},
        )
        return [_nudge(row) for row in rows]

    def delete_nudges_by(self, user_id: UUID) -> None:
        self._client.execute(
            "DELETE FROM halves_nudge WHERE user_id = CAST(:user_id AS uuid) AND status <> 'held'",
            {"user_id": str(user_id)},
        )

    def stale_nudges(self, before: dt.datetime, limit: int) -> list[Nudge]:
        rows = self._client.execute(
            f"{_NUDGE} WHERE status = 'checking' AND created_at < CAST(:before AS timestamptz) "
            "ORDER BY created_at LIMIT :limit",
            {"before": before.isoformat(), "limit": limit},
        )
        return [_nudge(row) for row in rows]

    # --- Strikes and the owner's numbers (6.15)

    def add_strike(self, strike: Strike) -> None:
        self._learner(strike.user_id)
        self._client.execute(
            """INSERT INTO halves_strike (id, user_id, kind, reason, move_id, at)
            VALUES (CAST(:id AS uuid), CAST(:user_id AS uuid), :kind, :reason,
                (SELECT id FROM halves_move WHERE id = CAST(:move_id AS uuid)),
                CAST(:at AS timestamptz))""",
            {
                "id": str(strike.id),
                "user_id": str(strike.user_id),
                "kind": strike.kind,
                "reason": strike.reason,
                "move_id": str(strike.move_id) if strike.move_id else None,
                "at": strike.at.isoformat(),
            },
        )

    def strikes_of(self, user_id: UUID) -> list[Strike]:
        rows = self._client.execute(
            "SELECT CAST(id AS text) AS id, CAST(user_id AS text) AS user_id, kind, reason, "
            f"CAST(move_id AS text) AS move_id, {epoch_micros('at')} AS at FROM halves_strike "
            "WHERE user_id = CAST(:user_id AS uuid) ORDER BY at",
            {"user_id": str(user_id)},
        )
        return [
            Strike(
                UUID(row["id"]),
                UUID(row["user_id"]),
                row["kind"],
                row["reason"],
                _uuid(row["move_id"]),
                from_epoch_micros(int(row["at"])),
            )
            for row in rows
        ]

    def counts(self, since: dt.datetime) -> SafetyCounts:
        at = {"since": since.isoformat()}
        moves = self._client.execute(
            "SELECT count(*) AS moves, count(*) FILTER (WHERE reasons <> CAST('[]' AS jsonb) "
            "AND status IN ('held', 'removed')) AS held FROM halves_move "
            "WHERE user_id IS NOT NULL AND created_at >= CAST(:since AS timestamptz)",
            at,
        )[0]
        reports = self._client.execute(
            "SELECT count(*) AS made FROM halves_report "
            "WHERE created_at >= CAST(:since AS timestamptz)",
            at,
        )[0]
        cases = self._client.execute(
            "SELECT count(*) AS made FROM halves_case "
            "WHERE created_at >= CAST(:since AS timestamptz)",
            at,
        )[0]
        blocks = self._client.execute(
            "SELECT count(*) AS made FROM halves_block "
            "WHERE created_at >= CAST(:since AS timestamptz)",
            at,
        )[0]
        hours = self._client.execute(
            "SELECT CAST(EXTRACT(EPOCH FROM decided_at - created_at) AS double precision) / 3600 "
            "AS hours FROM halves_move "
            "WHERE decided_at IS NOT NULL AND created_at >= CAST(:since AS timestamptz) "
            "UNION ALL SELECT "
            "CAST(EXTRACT(EPOCH FROM resolved_at - created_at) AS double precision) / 3600 "
            "AS hours FROM halves_report WHERE resolved_at IS NOT NULL "
            "AND created_at >= CAST(:since AS timestamptz)",
            at,
        )
        nudges = self._client.execute(
            "SELECT count(*) AS made, count(*) FILTER (WHERE status = 'dropped') AS dropped "
            "FROM halves_nudge WHERE created_at >= CAST(:since AS timestamptz)",
            at,
        )[0]
        return SafetyCounts(
            moves=int(moves["moves"]),
            held=int(moves["held"]),
            reports=int(reports["made"]),
            cases=int(cases["made"]),
            blocks=int(blocks["made"]),
            decision_hours=tuple(float(row["hours"]) for row in hours),
            nudges=int(nudges["made"]),
            nudges_dropped=int(nudges["dropped"]),
        )
