"""Radio Konvami stand-ins for tests: the repository in memory, a starter that records its jobs
and a brain whose answers a test decides."""

import datetime as dt
from collections.abc import Mapping, Sequence
from uuid import UUID

from konvami_api.domain.halves import Band, Correction
from konvami_api.domain.radio import Call, Episode, Profile, Report, Script


class InMemoryRadioRepository:
    def __init__(self) -> None:
        self.profiles: dict[UUID, Profile] = {}
        self.episodes_by_id: dict[UUID, Episode] = {}
        self.calls: dict[UUID, Call] = {}
        self.cards: dict[tuple[UUID, UUID, int], str] = {}
        self.reports: dict[UUID, Report] = {}
        self.retries: dict[tuple[UUID, dt.date], int] = {}
        self.strike_log: list[tuple[UUID, UUID | None, dt.datetime]] = []

    def profile(self, user_id: UUID) -> Profile | None:
        return self.profiles.get(user_id)

    def save_profile(self, profile: Profile) -> None:
        self.profiles[profile.user_id] = profile

    def delete_profile(self, user_id: UUID) -> None:
        self.profiles.pop(user_id, None)

    def episode(self, episode_id: UUID) -> Episode | None:
        return self.episodes_by_id.get(episode_id)

    def episode_on(self, language: str, day: dt.date) -> Episode | None:
        return next(
            (e for e in self.episodes_by_id.values() if e.language == language and e.day == day),
            None,
        )

    def add_episode(self, episode: Episode) -> Episode:
        found = self.episode_on(episode.language, episode.day)
        if found is not None:
            return found
        self.episodes_by_id[episode.id] = episode
        return episode

    def save_episode(self, episode: Episode) -> None:
        self.episodes_by_id[episode.id] = episode

    def episodes(self, language: str, since: dt.date, statuses: Sequence[str]) -> list[Episode]:
        found = [
            e
            for e in self.episodes_by_id.values()
            if e.language == language and e.day >= since and e.status in statuses
        ]
        return sorted(found, key=lambda e: e.day, reverse=True)

    def episodes_in(self, statuses: Sequence[str], limit: int) -> list[Episode]:
        return [e for e in self.episodes_by_id.values() if e.status in statuses][:limit]

    def expired_episodes(self, now: dt.datetime, limit: int) -> list[Episode]:
        return [
            e
            for e in self.episodes_by_id.values()
            if e.delete_after is not None and e.delete_after <= now and e.status != "expired"
        ][:limit]

    def call(self, call_id: UUID) -> Call | None:
        return self.calls.get(call_id)

    def save_call(self, call: Call) -> None:
        self.calls[call.id] = call

    def calls_of(self, episode_id: UUID) -> list[Call]:
        return sorted(
            (c for c in self.calls.values() if c.episode_id == episode_id),
            key=lambda c: c.created_at,
        )

    def calls_by(self, user_id: UUID) -> list[Call]:
        return sorted(
            (c for c in self.calls.values() if c.user_id == user_id),
            key=lambda c: c.created_at,
            reverse=True,
        )

    def calls_since(self, user_id: UUID, since: dt.datetime) -> int:
        return sum(1 for c in self.calls_by(user_id) if c.created_at >= since)

    def held(self, limit: int) -> list[Call]:
        return [c for c in self.calls.values() if c.status == "held"][:limit]

    def stale_checks(self, before: dt.datetime, limit: int) -> list[Call]:
        return [c for c in self.calls.values() if c.status == "checking" and c.created_at < before][
            :limit
        ]

    def expired_calls(self, now: dt.datetime, limit: int) -> list[Call]:
        return [
            c
            for c in self.calls.values()
            if c.delete_after is not None
            and c.delete_after <= now
            and (c.transcript or c.audio_key or c.veil_key)
        ][:limit]

    def applause(self, episode_id: UUID) -> Mapping[tuple[int, str], int]:
        counts: dict[tuple[int, str], int] = {}
        for (_, episode, segment), card in self.cards.items():
            if episode == episode_id:
                counts[(segment, card)] = counts.get((segment, card), 0) + 1
        return counts

    def applause_of(self, user_id: UUID, episode_id: UUID) -> Mapping[int, str]:
        return {
            segment: card
            for (user, episode, segment), card in self.cards.items()
            if user == user_id and episode == episode_id
        }

    def set_applause(self, user_id: UUID, episode_id: UUID, segment: int, card: str | None) -> None:
        if card is None:
            self.cards.pop((user_id, episode_id, segment), None)
        else:
            self.cards[(user_id, episode_id, segment)] = card

    def delete_applause(self, user_id: UUID) -> None:
        for key in [k for k in self.cards if k[0] == user_id]:
            del self.cards[key]

    def add_report(self, report: Report) -> None:
        self.reports[report.id] = report

    def report(self, report_id: UUID) -> Report | None:
        return self.reports.get(report_id)

    def save_report(self, report: Report) -> None:
        self.reports[report.id] = report

    def open_reports(self, limit: int) -> list[Report]:
        return [r for r in self.reports.values() if r.status == "open"][:limit]

    def reported(self, user_id: UUID, episode_id: UUID) -> frozenset[int]:
        return frozenset(
            r.segment
            for r in self.reports.values()
            if r.reporter == user_id and r.episode_id == episode_id
        )

    def note_retry(self, user_id: UUID, day: dt.date, limit: int) -> bool:
        count = self.retries.get((user_id, day), 0)
        if count >= limit:
            return False
        self.retries[(user_id, day)] = count + 1
        return True

    def add_strike(self, user_id: UUID, call_id: UUID | None, at: dt.datetime) -> None:
        self.strike_log.append((user_id, call_id, at))

    def strikes(self, user_id: UUID) -> int:
        return sum(1 for user, _, _ in self.strike_log if user == user_id)


class RecordingRadioStarter:
    def __init__(self) -> None:
        self.jobs: list[tuple[str, UUID]] = []
        self.fail = False

    def start(self, job: str, item_id: UUID) -> None:
        if self.fail:
            raise RuntimeError("the worker could not be started")
        self.jobs.append((job, item_id))


class FakeBrain:
    """Passes every call unless told otherwise, writes nothing (the service's own words are
    used) unless a test gives a screening or a script, and speaks every line."""

    def __init__(self) -> None:
        # The labels the next checks answer: a tuple holds the call, None cannot check.
        self.labels: list[tuple[str, ...] | None] = []
        self.veil_fails = False
        self.corrections: tuple[Correction, ...] = ()
        self.screening: list[UUID] | None = None
        self.written: Script | None = None
        self.ai_words: str | None = None
        self.mute = False
        self.checked: list[tuple[UUID, Band, str]] = []
        self.spoken: list[tuple[str, str]] = []
        self.payers: list[UUID | None] = []

    def check(self, call: Call, band: Band, language: str, question: str) -> tuple[str, ...] | None:
        self.checked.append((call.id, band, question))
        return self.labels.pop(0) if self.labels else ()

    def veil(self, call: Call) -> str | None:
        if self.veil_fails:
            return None
        return f"radio/{call.user_id}/{call.episode_id}/{call.id}-veil.mp3"

    def correct(self, call: Call, target: str, explanation: str) -> tuple[Correction, ...]:
        return self.corrections

    def screen(
        self, question: str, language: str, calls: Sequence[Call], most: int, payer: UUID | None
    ) -> list[UUID] | None:
        self.payers.append(payer)
        return self.screening

    def ai_call(self, question: str, language: str, name: str, payer: UUID | None) -> str | None:
        return self.ai_words

    def script(
        self,
        question: str,
        language: str,
        callers: Sequence[tuple[str, bool, str]],
        payer: UUID | None,
    ) -> Script | None:
        return self.written

    def speak(self, payer: UUID | None, voice: str, text: str, key: str) -> str | None:
        if self.mute:
            return None
        self.spoken.append((voice, text))
        return key
