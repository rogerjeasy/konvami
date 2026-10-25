"""The grammar map (spec §6.8): every topic of a language pack, and how well the learner has it,
from the evidence of their conversations."""

from dataclasses import replace
from datetime import UTC, datetime, timedelta

import pytest

from konvami_api.domain.catalog import CATALOG, CEFR_LEVELS
from konvami_api.domain.grammar_map import (
    Evidence,
    GrammarMapError,
    Mastery,
    Trend,
    mastery,
)
from konvami_api.domain.grammar_topics import GERMAN_MAP
from konvami_api.domain.reports import Mistake, TopicUse
from tests.world import OTHER_USER, USER, World

NOON = datetime(2026, 10, 9, 12, 0, tzinfo=UTC)


def used(uses: int, wrong: int, days_ago: int = 1) -> Evidence:
    return Evidence(at=NOON - timedelta(days=days_ago), uses=uses, wrong=wrong)


def test_the_german_map_has_topics_from_a1_up_each_with_what_a_partner_needs() -> None:
    pack = CATALOG.available_pack("de")
    assert pack is not None
    topics = pack.grammar_map
    ids = [topic.id for topic in topics]

    assert len(ids) == len(set(ids)) >= 30
    assert {topic.level for topic in topics} >= {"A1", "A2", "B1", "B2"}
    # Easiest first, so the map reads as a path.
    levels = [CEFR_LEVELS.index(topic.level) for topic in topics]
    assert levels == sorted(levels)
    for topic in topics:
        assert topic.title, topic.id
        assert "?" in topic.elicit, topic.id
        assert topic.examples, topic.id
        assert all(category in pack.error_categories for category in topic.categories), topic.id
    # Every kind of mistake that is a structure belongs to a topic.
    covered = {category for topic in topics for category in topic.categories}
    assert covered >= set(pack.error_categories) - {"lexical_choice", "vocabulary_false_friend"}


def test_a_topic_is_found_by_its_id() -> None:
    pack = CATALOG.available_pack("de")
    assert pack is not None

    dative = pack.topic("dative")

    assert dative is not None
    assert dative.categories == ("case_dative",)
    assert pack.topic("klingon") is None


def test_a_topic_never_used_is_not_started() -> None:
    assert mastery(()).state is Mastery.NOT_STARTED


def test_a_few_uses_are_too_little_to_judge() -> None:
    assert mastery((used(2, 0), used(1, 0, days_ago=3))).state is Mastery.INTRODUCED


def test_mostly_wrong_uses_mean_it_is_being_practised() -> None:
    found = mastery((used(4, 2), used(3, 2, days_ago=3)))

    assert found.state is Mastery.PRACTISING
    assert (found.uses, found.correct, found.conversations) == (7, 3, 2)


def test_mostly_right_uses_mean_mostly_correct() -> None:
    assert mastery((used(5, 1), used(5, 1, days_ago=3))).state is Mastery.MOSTLY_CORRECT


def test_mastered_needs_many_right_uses_over_several_conversations() -> None:
    few_conversations = (used(6, 0), used(6, 0, days_ago=3))
    many = (used(4, 0), used(4, 0, days_ago=3), used(4, 1, days_ago=6))

    assert mastery(few_conversations).state is Mastery.MOSTLY_CORRECT
    assert mastery(many).state is Mastery.MASTERED


def test_recent_conversations_count_more_than_old_ones() -> None:
    # Wrong for a long time, right lately: the learner has learnt it.
    learnt = (used(4, 0), used(4, 0, days_ago=2), used(4, 4, days_ago=9), used(4, 4, days_ago=12))

    assert mastery(learnt).accuracy > 0.5


def test_only_the_last_conversations_count() -> None:
    old_mistakes = tuple(used(3, 3, days_ago=30 + day) for day in range(5))
    recent = tuple(used(3, 0, days_ago=day) for day in range(1, 9))

    assert mastery(recent + old_mistakes).state is Mastery.MASTERED


def test_a_trend_shows_once_there_is_enough_to_compare() -> None:
    improving = (used(4, 0), used(4, 0, days_ago=2), used(4, 3, days_ago=5), used(4, 3, days_ago=8))
    slipping = (used(4, 3), used(4, 3, days_ago=2), used(4, 0, days_ago=5), used(4, 0, days_ago=8))
    steady = (used(4, 1), used(4, 1, days_ago=2), used(4, 1, days_ago=5), used(4, 1, days_ago=8))

    assert mastery(improving).trend is Trend.IMPROVING
    assert mastery(slipping).trend is Trend.SLIPPING
    assert mastery(steady).trend is Trend.STEADY
    assert mastery(improving[:3]).trend is None


def test_the_last_use_is_remembered() -> None:
    assert mastery(
        (used(1, 0, days_ago=5), used(2, 0, days_ago=2))
    ).last_used_at == NOON - timedelta(days=2)


# --- The learner's map ---------------------------------------------------------------------------


def reported(world: World, *usage: TopicUse, days_ago: int = 1, mistakes=(), target="de") -> str:  # type: ignore[no-untyped-def]
    lena = world.personas.partners(USER)[0]
    call_id = world.talk(lena, at=world.clock() - timedelta(days=days_ago))
    world.reported(call_id, target=target, usage=usage, mistakes=mistakes)
    return call_id


def state(world: World, topic: str) -> Mastery:
    found = next(t for t in world.grammar.map(USER).topics if t.topic.id == topic)
    return found.mastery.state


def test_a_new_learner_has_every_topic_still_ahead() -> None:
    world = World()
    world.onboard()

    learner_map = world.grammar.map(USER)

    assert learner_map.language == "de"
    assert learner_map.level == "A2"
    assert {t.mastery.state for t in learner_map.topics} == {Mastery.NOT_STARTED}
    assert len(learner_map.topics) == len(GERMAN_MAP)


def test_the_map_follows_what_the_reports_counted() -> None:
    world = World()
    world.onboard()
    reported(world, TopicUse("perfekt", 4, 0), TopicUse("dative", 3, 2), days_ago=3)
    reported(world, TopicUse("perfekt", 4, 0), TopicUse("dative", 2, 1), days_ago=2)
    reported(world, TopicUse("perfekt", 4, 1), days_ago=1)

    assert state(world, "perfekt") is Mastery.MASTERED
    assert state(world, "dative") is Mastery.PRACTISING
    assert state(world, "plural") is Mastery.NOT_STARTED


def test_reports_of_another_language_or_learner_do_not_count() -> None:
    world = World()
    world.onboard()
    world.onboard(OTHER_USER)
    reported(world, TopicUse("perfekt", 4, 0), target="it")

    assert state(world, "perfekt") is Mastery.NOT_STARTED
    assert {t.mastery.state for t in world.grammar.map(OTHER_USER).topics} == {Mastery.NOT_STARTED}


DATIVE = Mistake(
    1, "mit der Bus", "mit dem Bus", "« mit » + datif.", "case_dative", "noticeable", True
)


def test_a_topic_page_shows_the_learners_own_mistakes_on_it_newest_first() -> None:
    world = World()
    world.onboard()
    older = reported(world, TopicUse("dative", 2, 1), days_ago=4, mistakes=(DATIVE,))
    unsure = replace(
        DATIVE, original="bei meine Freundin", corrected="bei meiner Freundin", certain=False
    )
    perfekt = replace(
        DATIVE, original="habe gefahren", corrected="bin gefahren", category="perfekt_auxiliary"
    )
    newer = reported(world, TopicUse("dative", 2, 1), days_ago=1, mistakes=(perfekt, unsure))

    page = world.grammar.topic(USER, "dative")

    assert page.state.topic.id == "dative"
    assert page.state.mastery.uses == 4
    assert [(m.call_id, m.original, m.certain) for m in page.mistakes] == [
        (newer, "bei meine Freundin", False),
        (older, "mit der Bus", True),
    ]
    assert page.mistakes[1].corrected == "mit dem Bus"
    # Typical learner mistakes from the grammar notes, beside the topic's own examples.
    assert "Ich fahre mit der Bus." in page.typical_mistakes
    assert "Ich fahre mit dem Bus." in page.state.topic.examples


def test_a_topic_the_language_does_not_have_is_not_found() -> None:
    world = World()
    world.onboard()

    with pytest.raises(GrammarMapError) as raised:
        world.grammar.topic(USER, "klingon")

    assert raised.value.code == "not_found"
