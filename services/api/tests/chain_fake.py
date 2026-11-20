"""Story-chain stand-ins for tests: the repository in memory, a starter that records its jobs and
a narrator whose answers a test decides."""

import datetime as dt
from collections.abc import Callable, Sequence
from uuid import UUID

from konvami_api.domain.chain import (
    ChainInvite,
    ChainProfile,
    ChainSeat,
    Line,
    Segment,
    Story,
)
from konvami_api.domain.halves import Band, Correction, Report


class InMemoryChainRepository:
    def __init__(self) -> None:
        self.profiles: dict[UUID, ChainProfile] = {}
        self.stories: dict[UUID, Story] = {}
        self.lines: dict[UUID, Line] = {}
        self.invites: dict[str, ChainInvite] = {}
        self.reports: dict[UUID, Report] = {}
        self.retries: dict[tuple[UUID, dt.date], int] = {}

    def profile(self, user_id: UUID) -> ChainProfile | None:
        return self.profiles.get(user_id)

    def save_profile(self, profile: ChainProfile) -> None:
        self.profiles[profile.user_id] = profile

    def delete_profile(self, user_id: UUID) -> None:
        self.profiles.pop(user_id, None)

    def story(self, story_id: UUID) -> Story | None:
        return self.stories.get(story_id)

    def save_story(self, story: Story) -> None:
        self.stories[story.id] = story

    def stories_of(self, user_id: UUID, limit: int) -> list[Story]:
        found = [s for s in self.stories.values() if any(x.user_id == user_id for x in s.seats)]
        return sorted(found, key=lambda s: s.created_at, reverse=True)[:limit]

    def unfinished(self, limit: int) -> list[Story]:
        return [s for s in self.stories.values() if s.status != "done"][:limit]

    def ended_before(self, before: dt.datetime, limit: int) -> list[Story]:
        return [
            s
            for s in self.stories.values()
            if s.status == "done"
            and s.ended_at is not None
            and s.ended_at < before
            and (s.play or s.opening_key)
        ][:limit]

    def line(self, line_id: UUID) -> Line | None:
        return self.lines.get(line_id)

    def save_line(self, line: Line) -> None:
        self.lines[line.id] = line

    def lines_of(self, story_id: UUID) -> list[Line]:
        return sorted(
            (x for x in self.lines.values() if x.story_id == story_id), key=lambda x: x.created_at
        )

    def lines_by(self, user_id: UUID) -> list[Line]:
        return [x for x in self.lines.values() if x.user_id == user_id]

    def lines_since(self, user_id: UUID, since: dt.datetime) -> int:
        return sum(1 for x in self.lines_by(user_id) if x.created_at >= since)

    def held(self, limit: int) -> list[Line]:
        return [x for x in self.lines.values() if x.status == "held"][:limit]

    def stale_checks(self, before: dt.datetime, limit: int) -> list[Line]:
        return [x for x in self.lines.values() if x.status == "checking" and x.created_at < before][
            :limit
        ]

    def expired(self, now: dt.datetime, limit: int) -> list[Line]:
        return [
            x
            for x in self.lines.values()
            if x.delete_after is not None
            and x.delete_after <= now
            and (x.transcript or x.audio_key or x.veil_key)
        ][:limit]

    def invite(self, code: str) -> ChainInvite | None:
        return self.invites.get(code)

    def invite_for(self, story_id: UUID) -> ChainInvite | None:
        return next((i for i in self.invites.values() if i.story_id == story_id), None)

    def save_invite(self, invite: ChainInvite) -> None:
        for code in [c for c, i in self.invites.items() if i.story_id == invite.story_id]:
            del self.invites[code]
        self.invites[invite.code] = invite

    def delete_invite(self, code: str) -> None:
        self.invites.pop(code, None)

    def delete_expired_invites(self, now: dt.datetime) -> None:
        for code in [c for c, i in self.invites.items() if i.expires_at <= now]:
            del self.invites[code]

    def add_report(self, report: Report) -> None:
        self.reports[report.id] = report

    def report(self, report_id: UUID) -> Report | None:
        return self.reports.get(report_id)

    def save_report(self, report: Report) -> None:
        self.reports[report.id] = report

    def open_reports(self, limit: int) -> list[Report]:
        return [r for r in self.reports.values() if r.status == "open"][:limit]

    def reserve_retry(self, user_id: UUID, day: dt.date, limit: int) -> bool:
        count = self.retries.get((user_id, day), 0)
        if count >= limit:
            return False
        self.retries[(user_id, day)] = count + 1
        return True


class RecordingChainStarter:
    def __init__(self) -> None:
        self.jobs: list[tuple[str, UUID]] = []
        self.fail = False

    def start(self, job: str, item_id: UUID) -> None:
        if self.fail:
            raise RuntimeError("the worker could not be started")
        self.jobs.append((job, item_id))


class FakeNarrator:
    """Delivers everything unless told otherwise; the AI characters say numbered lines and the
    narrator links each line."""

    def __init__(self, clock: Callable[[], dt.datetime]) -> None:
        self.clock = clock
        self.labels: list[tuple[str, ...] | None] = []
        self.veil_fails = False
        self.corrections: tuple[Correction, ...] = ()
        self.checked: list[tuple[UUID, Band]] = []
        self.recaps: list[int] = []

    def check(self, line: Line, band: Band, language: str) -> tuple[str, ...] | None:
        self.checked.append((line.id, band))
        return self.labels.pop(0) if self.labels else ()

    def veil(self, line: Line) -> str | None:
        if self.veil_fails:
            return None
        return f"halves/{line.user_id}/chain/{line.story_id}/{line.id}-veil.mp3"

    def correct(self, line: Line, target: str, explanation: str) -> tuple[Correction, ...]:
        return self.corrections

    def recap(self, story: Story, lines: Sequence[Line]) -> str:
        self.recaps.append(len(lines))
        return f"So far {len(lines)} lines."

    def speak_opening(self, story: Story) -> str | None:
        return f"halves/{story.host}/chain/{story.id}/opening.mp3"

    def go_on(self, story: Story, lines: Sequence[Line], seat: ChainSeat, voice: str) -> Line:
        position = len(lines) + 1
        return Line(
            id=UUID(int=position),
            story_id=story.id,
            position=position,
            seat=seat.seat,
            user_id=None,
            status="delivered",
            transcript=f"AI line number {position} goes on",
            created_at=self.clock(),
            ai_name=seat.ai_name,
            audio_key=f"halves/{story.host}/chain/{story.id}/ai-{position}.mp3",
            delivered_at=self.clock(),
        )

    def narrate(self, story: Story, lines: Sequence[Line]) -> tuple[Segment, ...]:
        return (
            Segment("narrator", "Once upon a time.", story.opening_key, 0),
            *(Segment("narrator", f"Link {x.position}.", None, x.position) for x in lines),
            Segment("narrator", "The end.", "ending.mp3", lines[-1].position if lines else 0),
        )
