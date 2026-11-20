"""A report for the learner's human teacher (6.23): a period's conversations, confirmed mistakes
by kind, grammar topics and level evidence."""

from datetime import timedelta

import pytest

from konvami_api.domain.grammar_map import Mastery
from konvami_api.domain.levels import LevelFit
from konvami_api.domain.reports import Mistake, TopicUse
from konvami_api.domain.teacher_report import MAX_EXAMPLES, TeacherReportError
from tests.world import NOON, USER, World


def mistake(category: str, original: str, *, certain: bool = True) -> Mistake:
    return Mistake(1, original, original.upper(), "Pourquoi.", category, "noticeable", certain)


@pytest.fixture
def world() -> World:
    world = World()
    world.onboard()
    return world


def test_a_period_shows_its_conversations_minutes_and_confirmed_mistakes(world: World) -> None:
    lena = world.personas.partners(USER)[0]
    old = world.talk(lena, at=NOON - timedelta(days=20), minutes=4)
    world.reported(old, mistakes=(mistake("word_order", "weil ich bin müde"),))
    recent = world.talk(lena, at=NOON - timedelta(days=2), minutes=6)
    world.reported(
        recent,
        mistakes=(
            mistake("case", "mit der Mann"),
            mistake("case", "für dem Kind"),
            mistake("word_order", "dann ich gehe"),
            mistake("gender", "das Tisch", certain=False),
        ),
        level_fit=LevelFit("at", "above", "at"),
        usage=(TopicUse("dative_prepositions", 3, 1),),
    )

    week = world.teacher_report.report(USER, 7)

    assert [c.id for c in week.conversations] == [recent]
    assert week.seconds == 360
    assert [(k.category, k.count) for k in week.mistakes] == [("case", 2), ("word_order", 1)]
    assert week.mistakes[0].examples[0].original in {"mit der Mann", "für dem Kind"}
    assert [f.fit for f in week.fits] == [LevelFit("at", "above", "at")]
    assert week.level == "A2"
    assert all(t.mastery.state is not Mastery.NOT_STARTED for t in week.topics)

    month = world.teacher_report.report(USER, 30)
    assert [c.id for c in month.conversations] == [recent, old]
    assert {k.category: k.count for k in month.mistakes}["word_order"] == 2


def test_a_kind_shows_only_a_few_of_its_examples(world: World) -> None:
    lena = world.personas.partners(USER)[0]
    call_id = world.talk(lena, at=NOON - timedelta(days=1))
    world.reported(call_id, mistakes=tuple(mistake("case", f"Satz {n}") for n in range(6)))

    kinds = world.teacher_report.report(USER, 7).mistakes

    assert kinds[0].count == 6
    assert len(kinds[0].examples) == MAX_EXAMPLES


def test_only_the_offered_periods_can_be_asked_for(world: World) -> None:
    with pytest.raises(TeacherReportError) as refused:
        world.teacher_report.report(USER, 365)
    assert refused.value.code == "invalid_value"
