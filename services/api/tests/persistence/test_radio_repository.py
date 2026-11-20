"""Radio Konvami's storage, in memory and on PostgreSQL: both keep the same things."""

from dataclasses import replace
from datetime import UTC, date, datetime, timedelta
from uuid import UUID

import pytest

from konvami_api.domain.halves import Correction
from konvami_api.domain.radio import Call, Episode, Profile, RadioRepository, Report, Segment
from konvami_api.persistence.radio_repository import SqlRadioRepository
from tests.radio_fake import InMemoryRadioRepository

USER = UUID("11111111-1111-4111-8111-111111111111")
OTHER = UUID("22222222-2222-4222-8222-222222222222")
EPISODE = UUID("33333333-3333-4333-8333-333333333333")
CALL = UUID("44444444-4444-4444-8444-444444444444")
NOON = datetime(2026, 11, 20, 12, 0, tzinfo=UTC)
DAY = date(2026, 11, 20)
MONTH = timedelta(days=30)


@pytest.fixture(params=["memory", "postgres"])
def store(request: pytest.FixtureRequest) -> RadioRepository:
    if request.param == "memory":
        return InMemoryRadioRepository()
    return SqlRadioRepository(request.getfixturevalue("db"))


def episode(**changes: object) -> Episode:
    made = Episode(EPISODE, "de", DAY, "train_story", "open", NOON, USER, delete_after=NOON + MONTH)
    return replace(made, **changes)  # type: ignore[arg-type]


def call(**changes: object) -> Call:
    made = Call(
        CALL,
        EPISODE,
        USER,
        "ready",
        "Ich bin mit dem Zug gefahren.",
        NOON,
        audio_key="radio/a.m4a",
        veil_key="radio/a-veil.mp3",
        broadcast=True,
        reasons=("x",),
        corrections=(Correction("mit der Zug", "mit dem Zug", "masculine", True),),
        delete_after=NOON + MONTH,
    )
    return replace(made, **changes)  # type: ignore[arg-type]


def test_a_profile_is_kept_changed_and_deleted(store: RadioRepository) -> None:
    profile = Profile(USER, "Nova-7", "adult", True, 1, NOON)
    store.save_profile(profile)
    assert store.profile(USER) == profile
    store.save_profile(replace(profile, veil_default=False))
    assert store.profile(USER) == replace(profile, veil_default=False)
    store.delete_profile(USER)
    assert store.profile(USER) is None


def test_one_episode_a_day_and_language_with_its_playlist(store: RadioRepository) -> None:
    first = store.add_episode(episode())
    again = store.add_episode(episode(id=OTHER))
    assert again.id == EPISODE
    assert first.id == EPISODE
    store.save_call(call())
    segments = (
        Segment(0, "host", "Mia", True, "Hallo!", "radio/shows/0.mp3"),
        Segment(1, "call", "Nova-7", False, "Ich bin …", "radio/a-veil.mp3", call_id=CALL),
        Segment(2, "ai_call", "Klara", True, "Ich auch.", None, removed=True),
    )
    built = episode(status="ready", segments=segments, built_at=NOON, attempts=1)
    store.save_episode(built)
    assert store.episode(EPISODE) == built
    assert store.episode_on("de", DAY) == built
    assert [e.id for e in store.episodes("de", DAY, ("ready",))] == [EPISODE]
    assert store.episodes("fr", DAY, ("ready",)) == []
    assert [e.id for e in store.episodes_in(("ready",), 10)] == [EPISODE]
    assert [e.id for e in store.expired_episodes(NOON + MONTH * 2, 10)] == [EPISODE]


def test_calls_are_kept_listed_and_counted(store: RadioRepository) -> None:
    store.add_episode(episode())
    store.save_call(call())
    assert store.call(CALL) == call()
    store.save_call(call(status="held", hidden=True, attempts=2))
    assert store.call(CALL) == call(status="held", hidden=True, attempts=2)
    assert [c.id for c in store.calls_of(EPISODE)] == [CALL]
    assert [c.id for c in store.calls_by(USER)] == [CALL]
    assert store.calls_since(USER, NOON - timedelta(hours=1)) == 1
    assert [c.id for c in store.held(10)] == [CALL]
    assert [c.id for c in store.expired_calls(NOON + MONTH * 2, 10)] == [CALL]
    store.save_call(call(status="checking"))
    assert [c.id for c in store.stale_checks(NOON + timedelta(minutes=6), 10)] == [CALL]


def test_applause_is_one_card_per_listener_and_segment(store: RadioRepository) -> None:
    store.add_episode(episode())
    store.set_applause(USER, EPISODE, 1, "wow")
    store.set_applause(OTHER, EPISODE, 1, "wow")
    store.set_applause(USER, EPISODE, 1, "bravo")
    assert store.applause(EPISODE) == {(1, "wow"): 1, (1, "bravo"): 1}
    assert store.applause_of(USER, EPISODE) == {1: "bravo"}
    store.set_applause(OTHER, EPISODE, 1, None)
    store.delete_applause(USER)
    assert store.applause(EPISODE) == {}


def test_reports_retries_and_strikes(store: RadioRepository) -> None:
    store.add_episode(episode())
    report = Report(OTHER, USER, EPISODE, 1, "hate", "rude", "open", NOON)
    store.add_report(report)
    assert store.report(OTHER) == report
    assert store.reported(USER, EPISODE) == frozenset({1})
    assert [r.id for r in store.open_reports(10)] == [OTHER]
    store.save_report(replace(report, status="dismissed", resolved_at=NOON))
    assert store.open_reports(10) == []
    assert store.note_retry(USER, DAY, 2)
    assert store.note_retry(USER, DAY, 2)
    assert not store.note_retry(USER, DAY, 2)
    store.add_strike(USER, CALL, NOON)
    store.add_strike(USER, None, NOON)
    assert store.strikes(USER) == 2
    assert store.strikes(OTHER) == 0
