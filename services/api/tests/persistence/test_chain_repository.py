"""The story chain's storage, in memory and on PostgreSQL: both keep the same things."""

from datetime import UTC, date, datetime, timedelta
from uuid import UUID

import pytest

from konvami_api.domain.chain import (
    ChainInvite,
    ChainProfile,
    ChainRepository,
    ChainSeat,
    Line,
    Segment,
    Story,
)
from konvami_api.domain.halves import Correction, Report
from konvami_api.persistence.chain_repository import SqlChainRepository
from tests.chain_fake import InMemoryChainRepository

USER = UUID("11111111-1111-4111-8111-111111111111")
OTHER = UUID("22222222-2222-4222-8222-222222222222")
STORY = UUID("33333333-3333-4333-8333-333333333333")
LINE = UUID("44444444-4444-4444-8444-444444444444")
NOON = datetime(2026, 11, 20, 12, 0, tzinfo=UTC)


@pytest.fixture(params=["memory", "postgres"])
def store(request: pytest.FixtureRequest) -> ChainRepository:
    if request.param == "memory":
        return InMemoryChainRepository()
    return SqlChainRepository(request.getfixturevalue("db"))


def story(**changes: object) -> Story:
    made = Story(
        STORY,
        "night-train",
        "de",
        "A2",
        "friends",
        USER,
        "open",
        NOON,
        (
            ChainSeat(1, USER),
            ChainSeat(2, OTHER, host=True),
            ChainSeat(3, None, "Max", host=True),
            ChainSeat(4, None),
        ),
        NOON,
    )
    return Story(**{**made.__dict__, **changes})


def line(**changes: object) -> Line:
    made = Line(
        LINE,
        STORY,
        1,
        1,
        USER,
        "delivered",
        "Ich sehe einen Mann",
        NOON,
        audio_key="halves/x.m4a",
        veiled=True,
        veil_key="halves/x-veil.mp3",
        reasons=("on_task",),
        delivered_at=NOON,
        recap="Ein Mann ist im Zug.",
        corrections=(Correction("einen Mann", "einen Mann", "ok", False),),
        attempts=1,
        hidden_for=(OTHER,),
    )
    return Line(**{**made.__dict__, **changes})


def test_a_profile_is_kept_changed_and_deleted(store: ChainRepository) -> None:
    profile = ChainProfile(USER, "Linde-7", "adult", True, False, 1, NOON, strikes=1)
    store.save_profile(profile)
    assert store.profile(USER) == profile
    store.save_profile(ChainProfile(USER, "Iris-3", "adult", False, True, 1, NOON))
    assert store.profile(USER) == ChainProfile(USER, "Iris-3", "adult", False, True, 1, NOON)
    store.delete_profile(USER)
    assert store.profile(USER) is None


def test_a_story_keeps_its_seats_play_and_reactions(store: ChainRepository) -> None:
    store.save_story(story())
    assert store.story(STORY) == story()
    done = story(
        status="done",
        ended_at=NOON,
        play=(
            Segment("narrator", "Es war einmal.", "a.mp3", 0),
            Segment("line", "", None, 1, LINE),
        ),
        play_status="ready",
        reactions={str(USER): "laughed"},
        opening_key="a.mp3",
        seats=(
            ChainSeat(1, USER),
            ChainSeat(2, OTHER, "Lena", host=True, removed=True),
            ChainSeat(3, None, "Max", host=True),
            ChainSeat(4, None, "Pia"),
        ),
    )
    store.save_story(done)
    assert store.story(STORY) == done
    assert store.stories_of(OTHER, 10) == [done]
    assert store.unfinished(10) == []
    assert store.ended_before(NOON + timedelta(days=31), 10) == [done]
    assert store.ended_before(NOON, 10) == []


def test_lines_are_kept_found_and_counted(store: ChainRepository) -> None:
    store.save_story(story())
    store.save_line(line())
    assert store.line(LINE) == line()
    assert store.lines_of(STORY) == [line()]
    assert store.lines_by(USER) == [line()]
    assert store.lines_since(USER, NOON - timedelta(hours=1)) == 1
    store.save_line(line(status="held"))
    assert store.held(10) == [line(status="held")]
    store.save_line(line(status="checking"))
    assert store.stale_checks(NOON + timedelta(minutes=6), 10) == [line(status="checking")]
    store.save_line(line(delete_after=NOON))
    assert store.expired(NOON, 10) == [line(delete_after=NOON)]


def test_an_invite_belongs_to_one_story(store: ChainRepository) -> None:
    store.save_story(story())
    first = ChainInvite("ABCDEFGHJK", USER, STORY, NOON, NOON + timedelta(days=7))
    store.save_invite(first)
    assert store.invite("ABCDEFGHJK") == first
    second = ChainInvite("MNPQRSTUVW", USER, STORY, NOON, NOON + timedelta(days=7))
    store.save_invite(second)
    assert store.invite("ABCDEFGHJK") is None
    assert store.invite_for(STORY) == second
    store.delete_expired_invites(NOON + timedelta(days=8))
    assert store.invite_for(STORY) is None


def test_reports_and_retry_counts(store: ChainRepository) -> None:
    store.save_story(story())
    store.save_line(line())
    report = Report(UUID(int=7), OTHER, LINE, "harassment", "rude", "open", NOON)
    store.add_report(report)
    assert store.open_reports(10) == [report]
    closed = Report(UUID(int=7), OTHER, LINE, "harassment", "rude", "removed", NOON, NOON)
    store.save_report(closed)
    assert store.report(UUID(int=7)) == closed
    assert store.open_reports(10) == []
    day = date(2026, 11, 20)
    assert store.reserve_retry(USER, day, 2)
    assert store.reserve_retry(USER, day, 2)
    assert not store.reserve_retry(USER, day, 2)
