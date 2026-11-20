"""Motivation's rules: the streak, the next level, the quests and the milestones."""

import datetime as dt

from konvami_api.domain.levels import LevelFit, LevelPoint
from konvami_api.domain.motivation import (
    LONG_CALL_SECONDS,
    MilestoneNumbers,
    QuestContext,
    QuestKind,
    RepairOffer,
    SpeakingEvent,
    WeekFacts,
    choose_quests,
    improved_kinds,
    level_outlook,
    level_ups,
    milestones,
    quest_progress,
    speaking_streak,
)
from konvami_api.domain.conversations import Conversation
from konvami_api.domain.profile import Source

# Monday 2 November 2026; a habit of Monday, Tuesday, Thursday and Saturday.
MON = dt.date(2026, 11, 2)
PLANNED = (0, 1, 3, 5)


def day(offset: int) -> dt.date:
    return MON + dt.timedelta(days=offset)


def days(*offsets: int) -> set[dt.date]:
    return {day(o) for o in offsets}


# --- The streak ----------------------------------------------------------------------------------


def test_no_speaking_is_no_streak() -> None:
    streak = speaking_streak(set(), PLANNED, day(0))
    assert (streak.days, streak.longest, streak.repair) == (0, 0, None)
    assert streak.planned_today


def test_days_the_plan_left_free_never_break_the_streak() -> None:
    # Spoke Monday, Tuesday, Thursday; Wednesday was a rest day.
    streak = speaking_streak(days(0, 1, 3), PLANNED, day(3))
    assert streak.days == 3
    assert streak.spoke_today


def test_today_still_open_does_not_break_the_streak() -> None:
    streak = speaking_streak(days(0, 1), PLANNED, day(3))
    assert streak.days == 2
    assert streak.repair is None


def test_a_missed_planned_day_can_be_repaired_by_speaking_within_two_days() -> None:
    # Thursday (planned) missed; spoke on Friday: repaired.
    streak = speaking_streak(days(0, 1, 4), PLANNED, day(4))
    assert streak.days == 3
    assert streak.repaired == (day(4),)


def test_a_missed_day_offers_its_repair_while_the_window_is_open() -> None:
    streak = speaking_streak(days(0, 1), PLANNED, day(4))
    assert streak.days == 2
    assert streak.repair == RepairOffer(missed=day(3), until=day(5))


def test_without_a_repair_in_time_the_streak_starts_again_quietly() -> None:
    # Thursday missed and nothing until Sunday (three days later).
    streak = speaking_streak(days(0, 1, 6), PLANNED, day(6))
    assert streak.days == 1
    assert streak.longest == 2
    assert streak.repair is None


def test_one_repair_a_week() -> None:
    # Monday and Thursday planned. Missed Monday 9th, repaired on Tuesday 10th; missed Thursday
    # 12th and spoke on Friday 13th, but the week's repair is used, so the run ends once the
    # window closes, and starts again on Monday 16th.
    streak = speaking_streak(days(5, 8, 11, 14), (0, 3), day(14))
    assert streak.repaired == (day(8),)
    assert (streak.days, streak.longest) == (1, 3)


def test_two_planned_days_missed_in_a_row_end_the_run() -> None:
    streak = speaking_streak(days(0, 7), (0, 1, 2, 3, 4, 5, 6), day(7))
    assert streak.days == 1


def test_days_before_joining_were_never_planned() -> None:
    streak = speaking_streak(days(4, 5), PLANNED, day(5), started=day(4))
    assert streak.days == 2


# --- The next level ------------------------------------------------------------------------------

UP = LevelFit("above", "above", "at")
LEVEL = LevelFit("at", "at", "at")
DOWN = LevelFit("below", "below", "at")
UNCLEAR = LevelFit("unclear", "unclear", "at")


def test_the_next_level_shows_how_many_conversations_point_up() -> None:
    outlook = level_outlook("A2", [UP, LEVEL, UP, UNCLEAR, UP])
    assert outlook is not None
    assert (outlook.next, outlook.pointing, outlook.counted, outlook.needed) == ("B1", 3, 4, 5)


def test_no_outlook_while_nothing_points_up_or_at_the_top() -> None:
    assert level_outlook("A2", [LEVEL, DOWN]) is None
    assert level_outlook("C2", [UP, UP]) is None
    assert level_outlook("A2", []) is None


def test_only_the_last_five_counted_conversations_count() -> None:
    outlook = level_outlook("B1", [LEVEL, LEVEL, LEVEL, LEVEL, LEVEL, UP, UP])
    assert outlook is None


def test_level_ups_count_the_engines_steps_up() -> None:
    at = dt.datetime(2026, 11, 1, tzinfo=dt.UTC)
    history = [
        LevelPoint(at, "A2", Source.ASKED),
        LevelPoint(at, "B1", Source.MEASURED),
        LevelPoint(at, "A2", Source.MEASURED),
        LevelPoint(at, "B2", Source.ASKED),
    ]
    assert level_ups(history) == 1


# --- Quests --------------------------------------------------------------------------------------


def context(**changes: object) -> QuestContext:
    base = {
        "habit_days": 4,
        "plan_review": True,
        "plan_role_play": True,
        "corrections": True,
        "words_due": True,
        "pen_pal": True,
        "quiet_partner": True,
    }
    return QuestContext(**{**base, **changes})  # type: ignore[arg-type]


def test_three_quests_one_from_each_group() -> None:
    picks = choose_quests(context(), MON)
    assert len(picks) == 3
    kinds = [p.kind for p in picks]
    assert kinds[0] in (QuestKind.REVIEW_CALL, QuestKind.ROLE_PLAY_GOAL)
    assert kinds[1] in (
        QuestKind.SAY_IT_BETTER,
        QuestKind.USE_WORD,
        QuestKind.PEN_PAL,
        QuestKind.QUIET_PARTNER,
    )
    assert kinds[2] in (QuestKind.TALK_DAYS, QuestKind.SOUND_DRILLS, QuestKind.LONG_CALL)


def test_the_same_week_gives_the_same_quests_and_weeks_take_turns() -> None:
    assert choose_quests(context(), MON) == choose_quests(context(), MON)
    weeks = {choose_quests(context(), MON + dt.timedelta(weeks=w)) for w in range(4)}
    assert len(weeks) > 1


def test_a_new_learner_still_gets_three_quests() -> None:
    picks = choose_quests(
        context(
            plan_review=False,
            plan_role_play=False,
            corrections=False,
            words_due=False,
            pen_pal=False,
            quiet_partner=False,
            habit_days=2,
        ),
        MON,
    )
    assert {p.kind for p in picks} == {
        QuestKind.TALK_DAYS,
        QuestKind.SOUND_DRILLS,
        QuestKind.LONG_CALL,
    }
    talk = next(p for p in picks if p.kind is QuestKind.TALK_DAYS)
    assert talk.target == 2


def conversation(n: int, **changes: object) -> Conversation:
    at = dt.datetime(2026, 11, 2, 9, tzinfo=dt.UTC) + dt.timedelta(hours=n)
    base: dict[str, object] = {
        "id": f"rtc_{n}",
        "persona_id": None,
        "started_at": at,
        "ended_at": at + dt.timedelta(minutes=5),
        "seconds": 300,
        "learner_turns": 3,
    }
    return Conversation(**{**base, **changes})  # type: ignore[arg-type]


def test_quest_progress_is_read_from_what_the_learner_did() -> None:
    now = dt.datetime(2026, 11, 3, tzinfo=dt.UTC)
    facts = WeekFacts(
        conversations=(
            conversation(1, seconds=LONG_CALL_SECONDS),
            conversation(2, review=True),
            conversation(3, scenario="doctor", goals_reached=("book",)),
            conversation(4, scenario="doctor"),
            # Opened and closed: not practice.
            conversation(5, learner_turns=0, review=True),
        ),
        speaking_days=frozenset(days(0, 1)),
        events=(
            SpeakingEvent("retry", now, right=True),
            SpeakingEvent("retry", now, right=False),
            SpeakingEvent("drill", now),
            SpeakingEvent("pen_pal_reply", now),
        ),
        word_calls=1,
        quiet_partner_calls=0,
    )
    assert quest_progress(QuestKind.TALK_DAYS, facts) == 2
    assert quest_progress(QuestKind.LONG_CALL, facts) == 1
    assert quest_progress(QuestKind.REVIEW_CALL, facts) == 1
    assert quest_progress(QuestKind.ROLE_PLAY_GOAL, facts) == 1
    assert quest_progress(QuestKind.SAY_IT_BETTER, facts) == 1
    assert quest_progress(QuestKind.SOUND_DRILLS, facts) == 1
    assert quest_progress(QuestKind.PEN_PAL, facts) == 1
    assert quest_progress(QuestKind.USE_WORD, facts) == 1
    assert quest_progress(QuestKind.QUIET_PARTNER, facts) == 0


# --- Milestones and the recap --------------------------------------------------------------------


def test_milestones_include_quests_repairs_and_levels() -> None:
    found = {
        m.id: m
        for m in milestones(
            MilestoneNumbers(
                conversations=6,
                seconds=3600,
                longest_seconds=600,
                longest_streak_days=8,
                most_words=40,
                cards=2,
                reviews=10,
                quest_weeks=1,
                repairs=1,
                level_ups=0,
            )
        )
    }
    assert found["first_quest_week"].reached
    assert found["streak_repaired"].reached
    assert not found["level_up"].reached
    assert found["month_streak"].current == 8
    assert found["hour_of_talking"].reached


def test_the_recap_names_the_mistakes_that_came_up_less() -> None:
    last = MON
    before = MON - dt.timedelta(weeks=1)
    counts = {
        "word_order": {before: 5, last: 2},
        "articles": {before: 3, last: 3},
        "verb_endings": {before: 1, last: 0},
        "cases": {last: 4},
    }
    assert improved_kinds(counts, last) == ("word_order", "verb_endings")
