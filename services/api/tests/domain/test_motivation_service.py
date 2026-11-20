"""Motivation as a learner meets it: the streak, quests, milestones and moments, recap and pause."""

from datetime import UTC, datetime, timedelta

import pytest

from konvami_api.domain.levels import LevelFit
from konvami_api.domain.motivation import (
    MotivationError,
    QuestKind,
    RepairOffer,
    SpeakingEvent,
)
from tests.world import USER, World

# Friday 9 October 2026, the day the learner joins. The default habit is four days: Monday,
# Tuesday, Thursday and Saturday.
JOINED = datetime(2026, 10, 9, 12, tzinfo=UTC)


def at(day: int, hour: int = 12) -> datetime:
    """A moment in October 2026."""
    return datetime(2026, 10, day, hour, tzinfo=UTC)


@pytest.fixture
def world() -> World:
    world = World(now=JOINED)
    world.onboard()
    return world


def test_any_speaking_counts_and_a_missed_day_can_be_repaired(world: World) -> None:
    lena = world.personas.partners(USER)[0]
    world.talk(lena, at=at(10))  # Saturday
    world.talk(lena, at=at(12))  # Monday; Tuesday 13th (planned) goes by in silence
    world.clock.now = at(14)

    streak = world.motivation.streak(USER, None)
    assert streak.days == 2
    assert streak.repair == RepairOffer(missed=at(13).date(), until=at(15).date())

    # A pen-pal reply is speaking too, and it repairs the missed day.
    world.motivation_store.events[USER] = [SpeakingEvent("pen_pal_reply", at(14, 9))]
    streak = world.motivation.streak(USER, None)
    assert (streak.days, streak.repair, streak.repaired) == (3, None, (at(14).date(),))


def test_the_weeks_quests_are_chosen_once_and_ticked_from_what_was_done(world: World) -> None:
    lena = world.personas.partners(USER)[0]
    world.clock.now = at(12, 8)  # Monday
    first = world.motivation.view(USER, None).quests
    assert len(first.quests) == 3

    world.talk(lena, at=at(12, 9), minutes=9)
    world.talk(lena, at=at(13, 9))
    world.talk(lena, at=at(15, 9))
    world.motivation_store.events[USER] = [
        SpeakingEvent("drill", at(13, 10)),
        SpeakingEvent("drill", at(13, 11)),
        SpeakingEvent("drill", at(13, 12)),
    ]
    world.clock.now = at(15, 12)

    view = world.motivation.view(USER, None)
    assert [q.kind for q in view.quests.quests] == [q.kind for q in first.quests]
    done = {q.kind for q in view.quests.quests if q.done}
    assert done == {q.kind for q in first.quests} & {
        QuestKind.LONG_CALL,
        QuestKind.TALK_DAYS,
        QuestKind.SOUND_DRILLS,
    }
    assert {c.id for c in view.celebrations if c.kind == "quest"} == {k.value for k in done}


def test_a_moment_is_celebrated_once(world: World) -> None:
    lena = world.personas.partners(USER)[0]
    world.talk(lena, at=at(9, 13))
    world.clock.now = at(9, 14)

    view = world.motivation.view(USER, None)
    first = next(m for m in view.milestones if m.id == "first_conversation")
    assert first.reached_at == at(9, 14)
    assert ("milestone", "first_conversation") in {(c.kind, c.id) for c in view.celebrations}

    world.motivation.celebrate(USER, "milestone", "first_conversation")
    after = world.motivation.view(USER, None)
    assert "first_conversation" not in {c.id for c in after.celebrations}
    with pytest.raises(MotivationError):
        world.motivation.celebrate(USER, "milestone", "first_conversation")
    with pytest.raises(MotivationError):
        world.motivation.celebrate(USER, "badge", "x")


def test_milestones_reached_before_they_were_dated_are_not_news(world: World) -> None:
    lena = world.personas.partners(USER)[0]
    world.talk(lena, at=at(9, 13))
    # The first look at motivation comes days after joining.
    world.clock.now = at(14)

    view = world.motivation.view(USER, None)
    first = next(m for m in view.milestones if m.id == "first_conversation")
    assert first.reached
    assert first.reached_at is None
    assert not [c for c in view.celebrations if c.kind == "milestone"]


def test_after_a_quiet_week_today_welcomes_the_learner_back(world: World) -> None:
    lena = world.personas.partners(USER)[0]
    world.talk(lena, at=at(10))
    world.clock.now = at(20)

    welcome = world.motivation.view(USER, None).welcome_back
    assert welcome is not None
    assert (welcome.days, welcome.partner_id) == (10, lena.id)

    world.clock.now = at(13)
    assert world.motivation.view(USER, None).welcome_back is None


def test_the_monday_recap_says_what_last_week_held(world: World) -> None:
    lena = world.personas.partners(USER)[0]
    world.talk(lena, at=at(12), minutes=6)
    world.talk(lena, at=at(14), minutes=4)
    world.clock.now = at(19, 8)  # the next Monday

    view = world.motivation.view(USER, None)
    assert view.fresh_start
    assert view.recap is not None
    assert (view.recap.week, view.recap.minutes, view.recap.conversations) == (
        at(12).date(),
        10,
        2,
    )
    assert view.recap.speaking_days == 2

    world.clock.now = at(22)  # Thursday: the recap is over
    later = world.motivation.view(USER, None)
    assert later.recap is None
    assert not later.fresh_start


def test_reminders_pause_for_a_month_and_resume(world: World) -> None:
    until = world.motivation.pause_reminders(USER, 30)
    assert until == JOINED + timedelta(days=30)
    assert world.motivation.reminders_paused(USER)
    assert world.motivation.view(USER, None).reminders_paused_until == until

    world.motivation.pause_reminders(USER, None)
    assert not world.motivation.reminders_paused(USER)
    with pytest.raises(MotivationError):
        world.motivation.pause_reminders(USER, 90)


def test_the_next_level_comes_into_view(world: World) -> None:
    lena = world.personas.partners(USER)[0]
    up = LevelFit("above", "above", "at")
    for day in (10, 12):
        call = world.talk(lena, at=at(day))
        world.reported(call, level_fit=up)
    world.clock.now = at(13)

    outlook = world.motivation.view(USER, None).outlook
    assert outlook is not None
    assert (outlook.level, outlook.next, outlook.pointing, outlook.counted) == ("A2", "B1", 2, 2)
