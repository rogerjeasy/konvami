"""Two Halves stand-ins for tests: the repository in memory, a starter that records its jobs and
a brain whose answers a test decides."""

import datetime as dt
from collections.abc import Callable, Mapping, Sequence
from uuid import UUID

from konvami_api.domain.halves import (
    Band,
    Block,
    Case,
    Correction,
    Duo,
    Invite,
    Move,
    Profile,
    RecapLine,
    Report,
    SeatState,
)
from konvami_api.domain.halves_check import heard_option


class InMemoryHalvesRepository:
    def __init__(self) -> None:
        self.profiles: dict[UUID, Profile] = {}
        self.cases: dict[UUID, Case] = {}
        self.moves: dict[UUID, Move] = {}
        self.invites: dict[str, Invite] = {}
        self.blocks: dict[UUID, Block] = {}
        self.duos: dict[UUID, Duo] = {}
        self.reports: dict[UUID, Report] = {}
        self.wrong: dict[tuple[UUID, dt.date], int] = {}

    def profile(self, user_id: UUID) -> Profile | None:
        return self.profiles.get(user_id)

    def save_profile(self, profile: Profile) -> None:
        self.profiles[profile.user_id] = profile

    def delete_profile(self, user_id: UUID) -> None:
        self.profiles.pop(user_id, None)

    def case(self, case_id: UUID) -> Case | None:
        return self.cases.get(case_id)

    def save_case(self, case: Case) -> None:
        self.cases[case.id] = case

    def cases_of(self, user_id: UUID, limit: int) -> list[Case]:
        found = [c for c in self.cases.values() if any(s.user_id == user_id for s in c.seats)]
        return sorted(found, key=lambda c: c.created_at, reverse=True)[:limit]

    def open_cases(self, limit: int) -> list[Case]:
        return [c for c in self.cases.values() if c.status == "open"][:limit]

    def move(self, move_id: UUID) -> Move | None:
        return self.moves.get(move_id)

    def save_move(self, move: Move) -> None:
        self.moves[move.id] = move

    def moves_of(self, case_id: UUID) -> list[Move]:
        return sorted(
            (m for m in self.moves.values() if m.case_id == case_id), key=lambda m: m.created_at
        )

    def moves_by(self, user_id: UUID) -> list[Move]:
        return [m for m in self.moves.values() if m.user_id == user_id]

    def moves_since(self, user_id: UUID, since: dt.datetime) -> int:
        return sum(1 for m in self.moves_by(user_id) if m.created_at >= since)

    def held(self, limit: int) -> list[Move]:
        return [m for m in self.moves.values() if m.status == "held"][:limit]

    def stale_checks(self, before: dt.datetime, limit: int) -> list[Move]:
        return [m for m in self.moves.values() if m.status == "checking" and m.created_at < before][
            :limit
        ]

    def expired(self, now: dt.datetime, limit: int) -> list[Move]:
        return [
            m
            for m in self.moves.values()
            if m.delete_after is not None
            and m.delete_after <= now
            and (m.transcript or m.audio_key or m.veil_key)
        ][:limit]

    def invite(self, code: str) -> Invite | None:
        return self.invites.get(code)

    def note_wrong_code(self, user_id: UUID, day: dt.date, limit: int) -> bool:
        count = self.wrong.get((user_id, day), 0)
        if limit < 1 or count >= limit:
            return False
        self.wrong[(user_id, day)] = count + 1
        return True

    def wrong_codes(self, user_id: UUID, day: dt.date) -> int:
        return self.wrong.get((user_id, day), 0)

    def invite_of(self, user_id: UUID) -> Invite | None:
        return next((i for i in self.invites.values() if i.user_id == user_id), None)

    def save_invite(self, invite: Invite) -> None:
        for code in [c for c, i in self.invites.items() if i.user_id == invite.user_id]:
            del self.invites[code]
        self.invites[invite.code] = invite

    def delete_invite(self, code: str) -> None:
        self.invites.pop(code, None)

    def delete_expired_invites(self, now: dt.datetime) -> None:
        for code in [c for c, i in self.invites.items() if i.expires_at <= now]:
            del self.invites[code]

    def blocks_of(self, user_id: UUID) -> list[Block]:
        return [b for b in self.blocks.values() if b.blocker == user_id]

    def blocked(self, one: UUID, other: UUID) -> bool:
        return any({b.blocker, b.blocked} == {one, other} for b in self.blocks.values())

    def add_block(self, block: Block) -> None:
        if not any(
            b.blocker == block.blocker and b.blocked == block.blocked for b in self.blocks.values()
        ):
            self.blocks[block.id] = block

    def remove_block(self, user_id: UUID, block_id: UUID) -> None:
        block = self.blocks.get(block_id)
        if block is not None and block.blocker == user_id:
            del self.blocks[block_id]

    def duos_of(self, user_id: UUID) -> list[Duo]:
        return [d for d in self.duos.values() if user_id in (d.user_a, d.user_b)]

    def add_duo(self, duo: Duo) -> None:
        if not any({d.user_a, d.user_b} == {duo.user_a, duo.user_b} for d in self.duos.values()):
            self.duos[duo.id] = duo

    def remove_duo(self, user_id: UUID, other: UUID) -> None:
        for key in [k for k, d in self.duos.items() if {d.user_a, d.user_b} == {user_id, other}]:
            del self.duos[key]

    def add_report(self, report: Report) -> None:
        self.reports[report.id] = report

    def report(self, report_id: UUID) -> Report | None:
        return self.reports.get(report_id)

    def save_report(self, report: Report) -> None:
        self.reports[report.id] = report

    def open_reports(self, limit: int) -> list[Report]:
        return [r for r in self.reports.values() if r.status == "open"][:limit]


class RecordingHalvesStarter:
    def __init__(self) -> None:
        self.jobs: list[tuple[str, UUID]] = []
        self.fail = False

    def start(self, job: str, item_id: UUID) -> None:
        if self.fail:
            raise RuntimeError("the worker could not be started")
        self.jobs.append((job, item_id))


class FakeBrain:
    """Delivers everything unless told otherwise; the stand-in understands what was said (by
    the words of the options) and says its clue as written."""

    def __init__(self, clock: Callable[[], dt.datetime]) -> None:
        self.clock = clock
        # The labels the next checks answer: a tuple holds the move, None cannot check.
        self.labels: list[tuple[str, ...] | None] = []
        self.veil_fails = False
        self.corrections: tuple[Correction, ...] = ()
        # The option the stand-in picks next; None: the one the message names.
        self.picks: list[int] = []
        self.checked: list[tuple[UUID, Band]] = []
        self.said: list[str] = []

    def check(self, move: Move, band: Band, language: str) -> tuple[str, ...] | None:
        self.checked.append((move.id, band))
        return self.labels.pop(0) if self.labels else ()

    def veil(self, move: Move) -> str | None:
        if self.veil_fails:
            return None
        return f"halves/{move.user_id}/{move.case_id}/{move.id}-veil.mp3"

    def correct(self, move: Move, target: str, explanation: str) -> tuple[Correction, ...]:
        return self.corrections

    def understand(
        self, move: Move, question: str, options: Sequence[str], case: Case
    ) -> tuple[int, str]:
        if self.picks:
            return self.picks.pop(0), "again_slower"
        return heard_option(move.transcript, options), "got_it"

    def say(self, case: Case, seat: SeatState, text: str, voice: str, move_id: UUID) -> Move:
        self.said.append(text)
        from konvami_api.domain.halves_cases import template, text_in

        found = template(case.template_id)
        number = next(
            c.round
            for c in (found.clues if found else ())
            if c.seat == seat.seat and text_in(c.says, seat.speaks) == text
        )
        return Move(
            id=move_id,
            case_id=case.id,
            seat=seat.seat,
            round=number,
            user_id=None,
            status="delivered",
            transcript=text,
            created_at=self.clock(),
            audio_key=f"halves/cases/{case.id}/{move_id}.mp3",
            delivered_at=self.clock(),
        )

    def recap(
        self, case: Case, seat: SeatState, voices: Mapping[str, tuple[str, str]]
    ) -> tuple[RecapLine, ...]:
        return (
            RecapLine("A", f"{voices['A'][0]}: fertig!", f"halves/r/{case.id}/{seat.seat}-0.mp3"),
            RecapLine("B", f"{voices['B'][0]}: bravo!", None),
        )
