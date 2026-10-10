from datetime import date, datetime, timedelta

import pytest

from konvami_api.domain.conversations import (
    ActivityDays,
    ConversationError,
    DayActivity,
    summarise,
)
from konvami_api.domain.live_call import Turn
from konvami_api.domain.voice import CallPurpose, FinishedCall, VoiceSession
from tests.world import NOON, OTHER_USER, USER, World

HOUR = timedelta(hours=1)
DAY = timedelta(days=1)
# NOON is Friday 9 October 2026; its week runs from Monday 5 to Sunday 11.
FRIDAY = date(2026, 10, 9)


def test_conversations_are_listed_newest_first_with_their_partner() -> None:
    world = World()
    lena, jonas = world.onboard()
    world.talk(lena, at=NOON - 2 * DAY, minutes=5)
    world.talk(jonas, at=NOON - DAY, minutes=8.5)

    page = world.conversations.listed(USER)

    assert [(c.partner.name if c.partner else None, c.seconds) for c in page.conversations] == [
        ("Jonas", 510),
        ("Lena", 300),
    ]
    assert page.conversations[0].started_at == NOON - DAY
    assert page.conversations[0].ended_at == NOON - DAY + timedelta(minutes=8.5)
    assert page.next is None


def test_only_finished_practice_in_which_the_learner_spoke_is_listed() -> None:
    world = World()
    lena, _ = world.onboard()
    world.onboard(OTHER_USER)
    kept = world.talk(lena, at=NOON - 3 * HOUR)
    world.talk(lena, at=NOON - 2 * HOUR, learner_says=())
    world.talk(lena, at=NOON - HOUR, ended=False)
    world.talk(lena, at=NOON - HOUR, user=OTHER_USER)
    world.sessions.started(
        VoiceSession("rtc_setup", USER, CallPurpose.ONBOARDING, "gpt-realtime-2.1", NOON - HOUR)
    )
    world.sessions.finish(
        "rtc_setup", FinishedCall(NOON, "finished", {}, (Turn("learner", "Bonjour"),))
    )

    assert [c.id for c in world.conversations.listed(USER).conversations] == [kept]


def test_a_long_list_is_read_page_by_page() -> None:
    world = World()
    lena, _ = world.onboard()
    ids = [world.talk(lena, at=NOON - n * HOUR) for n in range(1, 6)]

    first = world.conversations.listed(USER, limit=2)
    second = world.conversations.listed(USER, limit=2, before=first.next)
    third = world.conversations.listed(USER, limit=2, before=second.next)

    assert [c.id for c in first.conversations] == ids[:2]
    assert first.next == NOON - 2 * HOUR
    assert [c.id for c in second.conversations] == ids[2:4]
    assert [c.id for c in third.conversations] == ids[4:]
    assert third.next is None


@pytest.mark.parametrize(("asked", "served"), [(0, 1), (-3, 1), (500, 50)])
def test_a_page_has_between_one_and_fifty_conversations(asked: int, served: int) -> None:
    world = World()
    lena, _ = world.onboard()
    for n in range(1, 61):
        world.talk(lena, at=NOON - n * HOUR)

    assert len(world.conversations.listed(USER, limit=asked).conversations) == served


def test_a_transcript_has_what_each_side_said_in_order() -> None:
    world = World()
    lena, _ = world.onboard()
    call_id = world.talk(lena, at=NOON - HOUR, learner_says=("Hallo Lena!", "Mir geht's gut."))

    transcript = world.conversations.transcript(USER, call_id)

    assert transcript.conversation.partner == lena
    assert [(turn.speaker, turn.text) for turn in transcript.turns] == [
        ("persona", "Hallo! Wie geht's?"),
        ("learner", "Hallo Lena!"),
        ("learner", "Mir geht's gut."),
    ]


def test_a_conversation_that_is_still_being_saved_can_be_read_without_an_end() -> None:
    world = World()
    lena, _ = world.onboard()
    call_id = world.talk(lena, at=NOON - HOUR, ended=False)

    conversation = world.conversations.get(USER, call_id)

    assert (conversation.ended_at, conversation.seconds, conversation.learner_turns) == (None, 0, 0)
    assert conversation.partner == lena


def test_a_conversation_whose_partner_was_removed_is_kept_without_one() -> None:
    world = World()
    lena, _ = world.onboard()
    call_id = world.talk(lena, at=NOON - HOUR)
    world.personas.remove(USER, lena.id)

    assert world.conversations.get(USER, call_id).partner is None


def test_nobody_reads_someone_elses_conversation() -> None:
    world = World()
    lena, _ = world.onboard()
    world.onboard(OTHER_USER)
    call_id = world.talk(lena, at=NOON - HOUR)

    for read in (world.conversations.get, world.conversations.transcript):
        with pytest.raises(ConversationError) as error:
            read(OTHER_USER, call_id)
        assert error.value.code == "not_found"


def test_a_call_that_was_not_practice_is_not_a_conversation() -> None:
    world = World()
    world.onboard()
    world.sessions.started(
        VoiceSession("rtc_setup", USER, CallPurpose.ONBOARDING, "gpt-realtime-2.1", NOON - HOUR)
    )

    with pytest.raises(ConversationError):
        world.conversations.get(USER, "rtc_setup")
    with pytest.raises(ConversationError):
        world.conversations.get(USER, "rtc_unknown")


def test_each_partner_knows_how_often_and_when_they_last_talked() -> None:
    world = World()
    lena, jonas = world.onboard()
    world.talk(lena, at=NOON - 3 * DAY)
    world.talk(lena, at=NOON - DAY)
    world.talk(lena, at=NOON - HOUR, learner_says=())

    history = world.conversations.partner_history(USER)

    assert (history[lena.id].conversations, history[lena.id].last_at) == (2, NOON - DAY)
    assert jonas.id not in history


# --- Activity: the streak and the week -----------------------------------------------------------


def days(*entries: tuple[date, int]) -> ActivityDays:
    return ActivityDays(FRIDAY, tuple(DayActivity(day, seconds, 1) for day, seconds in entries))


def test_someone_who_has_never_talked_has_an_empty_week_and_no_streak() -> None:
    activity = summarise(days())

    assert (activity.streak_days, activity.practised_today) == (0, False)
    assert (activity.today_seconds, activity.week_seconds, activity.seconds) == (0, 0, 0)
    assert activity.conversations == 0
    assert [(d.day, d.seconds) for d in activity.week] == [
        (date(2026, 10, day), 0) for day in range(5, 12)
    ]


@pytest.mark.parametrize(
    ("talked_on", "streak", "today"),
    [
        ([9], 1, True),
        ([9, 8, 7], 3, True),
        # Today is not over: yesterday's streak still stands.
        ([8, 7], 2, False),
        ([9, 7, 6], 1, True),
        ([7, 6, 5], 0, False),
    ],
)
def test_a_streak_is_the_run_of_days_up_to_today_or_yesterday(
    talked_on: list[int], streak: int, today: bool
) -> None:
    activity = summarise(days(*[(date(2026, 10, day), 60) for day in talked_on]))

    assert (activity.streak_days, activity.practised_today) == (streak, today)


def test_a_streak_runs_across_months() -> None:
    run = [(FRIDAY - timedelta(days=n), 60) for n in range(40)]

    assert summarise(days(*run)).streak_days == 40


def test_the_week_runs_from_monday_to_sunday_and_leaves_out_last_week() -> None:
    activity = summarise(
        days(
            (date(2026, 10, 9), 600),
            (date(2026, 10, 5), 300),
            (date(2026, 10, 4), 900),
        )
    )

    assert [d.seconds for d in activity.week] == [300, 0, 0, 0, 600, 0, 0]
    assert (activity.today_seconds, activity.week_seconds, activity.seconds) == (600, 900, 1800)
    assert activity.conversations == 3


def test_days_follow_the_learners_time_zone() -> None:
    world = World()
    lena, _ = world.onboard()
    # 23:30 in UTC is already Friday in Zurich (UTC+2 in October).
    world.talk(lena, at=datetime(2026, 10, 8, 23, 30, tzinfo=NOON.tzinfo), minutes=10)

    zurich = world.conversations.activity(USER, "Europe/Zurich", NOON)
    utc = world.conversations.activity(USER, None, NOON)

    assert (zurich.today, zurich.practised_today, zurich.today_seconds) == (FRIDAY, True, 600)
    assert (utc.today, utc.practised_today, utc.streak_days) == (FRIDAY, False, 1)


def test_the_learners_today_can_be_a_day_ahead_of_utc() -> None:
    world = World()
    world.onboard()

    late = datetime(2026, 10, 9, 23, 30, tzinfo=NOON.tzinfo)

    assert world.conversations.activity(USER, "Europe/Zurich", late).today == date(2026, 10, 10)


def test_an_unknown_time_zone_counts_days_in_utc() -> None:
    world = World()
    world.onboard()

    assert world.conversations.activity(USER, "Mars/Olympus", NOON).today == FRIDAY
