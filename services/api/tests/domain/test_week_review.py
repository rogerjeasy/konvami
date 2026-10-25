"""The weekly report (spec §6.12, §6.15): how last week went, in numbers and in a few words."""

import json
from datetime import UTC, date, datetime, timedelta

import pytest

from konvami_api.domain.accounts import Account
from konvami_api.domain.costs import Feature
from konvami_api.domain.grammar_map import Mastery
from konvami_api.domain.live_call import Turn
from konvami_api.domain.plan import PlanWord, SessionPlan
from konvami_api.domain.profile import Change, Origin, Source
from konvami_api.domain.reports import Mistake, TopicUse, Word
from konvami_api.domain.text import TextModelError
from konvami_api.domain.week_review import MAX_REQUESTS, WeekReviewError
from tests.world import USER, World

# A Monday morning: last week ran from Monday 5 to Sunday 11 October.
NEXT_MONDAY = datetime(2026, 10, 12, 9, 0, tzinfo=UTC)
LAST_WEEK = date(2026, 10, 5)
DAY = timedelta(days=1)
ZURICH = "Europe/Zurich"
WRITTEN = {"text": "Diese Woche hast du 25 Minuten gesprochen. Weiter so!"}


def at(day: date, hour: int = 9) -> datetime:
    return datetime(day.year, day.month, day.day, hour, tzinfo=UTC)


def dative_mistake() -> Mistake:
    return Mistake(1, "mit der Bus", "mit dem Bus", "datif", "case_dative", "noticeable", True)


def world_with_a_week() -> World:
    """A learner who talked twice last week (a review conversation and a role-play, 25 minutes
    in all) and once the week before (10 minutes)."""
    world = World(at(LAST_WEEK - 14 * DAY))
    lena, _ = world.onboard()
    world.clock.now = NEXT_MONDAY
    world.reported(
        world.talk(lena, at=at(LAST_WEEK - 5 * DAY), minutes=10),
        mistakes=(dative_mistake(), dative_mistake()),
        usage=(TopicUse("dative", 4, 3),),
    )
    world.reported(
        world.talk(
            lena, at=at(LAST_WEEK + DAY), minutes=10, plan=SessionPlan(language="de", review=True)
        ),
        mistakes=(dative_mistake(),),
        usage=(TopicUse("dative", 6, 1),),
    )
    world.reported(
        world.talk(lena, at=at(LAST_WEEK + 3 * DAY), minutes=15, scenario="doctor"),
        usage=(TopicUse("dative", 6, 0),),
    )
    return world


def test_a_week_without_practice_has_no_report() -> None:
    world = World(NEXT_MONDAY)
    world.onboard()

    assert world.week_reviews.last_week(USER, ZURICH) is None


def test_last_weeks_numbers_against_its_plan_and_the_week_before() -> None:
    world = world_with_a_week()

    review = world.week_reviews.last_week(USER, ZURICH)

    assert review is not None
    assert (review.status, review.text) == ("none", None)
    numbers = review.numbers
    assert numbers.week == LAST_WEEK
    assert (numbers.minutes, numbers.planned_minutes, numbers.previous_minutes) == (25, 40, 10)
    assert (numbers.days, numbers.planned_days) == (2, 4)
    assert (numbers.conversations, numbers.role_plays, numbers.reviews) == (2, 1, 1)
    assert (numbers.mistakes, numbers.previous_mistakes) == (1, 2)


def test_the_weeks_topics_say_whether_they_moved() -> None:
    world = world_with_a_week()

    numbers = world.week_reviews.last_week(USER, ZURICH).numbers  # type: ignore[union-attr]

    dative = next(move for move in numbers.topics if move.topic == "dative")
    assert (dative.before, dative.after) == (Mastery.PRACTISING, Mastery.MOSTLY_CORRECT)
    assert dative.moved


def test_cards_reviewed_last_week_are_counted() -> None:
    world = world_with_a_week()
    lena = world.personas.partners(USER)[0]
    call_id = world.talk(lena, at=at(LAST_WEEK - 6 * DAY))
    world.reported(call_id, words=(Word("der Termin", "le rendez-vous", None),))
    world.clock.now = at(LAST_WEEK - 6 * DAY, 12)
    card = world.cards.save(USER, call_id, "word", 0)
    world.clock.now = at(LAST_WEEK + 2 * DAY)
    world.cards.review(USER, card.id, "good")
    world.clock.now = NEXT_MONDAY

    numbers = world.week_reviews.last_week(USER, ZURICH).numbers  # type: ignore[union-attr]

    assert numbers.cards_reviewed == 1


def test_saved_words_brought_into_the_weeks_conversations_and_used_are_counted() -> None:
    world = world_with_a_week()
    words = (
        PlanWord("der Termin", "le rendez-vous", "card-1"),
        PlanWord("umsteigen", "changer de train", "card-2"),
    )
    lena = world.personas.partners(USER)[0]
    world.talk(
        lena,
        at=at(LAST_WEEK + 5 * DAY),
        plan=SessionPlan(language="de", words=words),
        turns=(Turn("persona", "Hast du heute Zeit?"), Turn("learner", "Ich habe einen Termin.")),
    )

    numbers = world.week_reviews.last_week(USER, ZURICH).numbers  # type: ignore[union-attr]

    assert (numbers.words_used, numbers.words_planned) == (1, 2)


def test_a_level_that_changed_during_the_week_is_in_its_numbers() -> None:
    world = world_with_a_week()
    world.clock.now = at(LAST_WEEK + 4 * DAY)
    world.profiles.apply(
        USER, [Change("starting_level", "B1")], source=Source.MEASURED, origin=Origin.SYSTEM
    )
    world.clock.now = NEXT_MONDAY

    numbers = world.week_reviews.last_week(USER, ZURICH).numbers  # type: ignore[union-attr]

    assert (numbers.level_before, numbers.level_after) == ("A2", "B1")


def test_asking_for_the_report_keeps_its_numbers_and_starts_the_writer_once() -> None:
    world = world_with_a_week()

    asked = world.week_reviews.request(USER, ZURICH, LAST_WEEK)
    again = world.week_reviews.request(USER, ZURICH, LAST_WEEK)

    assert (asked.status, again.status) == ("pending", "pending")
    assert world.week_starter.started == [(USER, LAST_WEEK)]
    assert asked.numbers == world.week_reviews.last_week(USER, ZURICH).numbers  # type: ignore[union-attr]


@pytest.mark.parametrize("week", [LAST_WEEK - 7 * DAY, LAST_WEEK + 7 * DAY])
def test_only_last_weeks_report_can_be_asked_for(week: date) -> None:
    world = world_with_a_week()

    with pytest.raises(WeekReviewError) as refused:
        world.week_reviews.request(USER, ZURICH, week)

    assert refused.value.code == "not_found"


def test_a_week_without_practice_cannot_be_reported_on() -> None:
    world = World(NEXT_MONDAY)
    world.onboard()

    with pytest.raises(WeekReviewError) as refused:
        world.week_reviews.request(USER, ZURICH, LAST_WEEK)

    assert refused.value.code == "nothing_to_report"


def test_the_report_needs_the_learners_agreement_to_the_ai_provider() -> None:
    world = world_with_a_week()
    world.accounts.accounts[USER] = Account("Amara", "fr", voice_consent=False)

    with pytest.raises(WeekReviewError) as refused:
        world.week_reviews.request(USER, ZURICH, LAST_WEEK)

    assert refused.value.code == "consent_required"


def test_the_partner_writes_a_few_sentences_in_the_learners_explanation_language() -> None:
    world = world_with_a_week()
    world.week_reviews.request(USER, ZURICH, LAST_WEEK)
    world.text.answers.append(WRITTEN)

    world.week_reviews.write(USER, LAST_WEEK)

    (task,) = world.text.tasks[-1:]
    assert task.model == "gpt-6-luna"
    assert "Lena" in task.instructions
    assert "French" in task.instructions
    content = json.loads(task.content)
    # Readable to the model: what each number is, and states as words, not ids.
    assert (content["minutes_spoken"], content["minutes_planned"]) == (25, 40)
    assert content["grammar_topics"][0] == {
        "topic": "Dative",
        "when_the_week_began": "practising",
        "when_it_ended": "mostly correct",
    }
    assert content["confirmed_mistakes"] == 1
    assert "saved_words_used" in content
    # Topic names come in English: the model is told to name them in the learner's language.
    assert "as a learner would in French" in task.instructions
    assert task.charge is not None
    assert task.charge.feature is Feature.WEEK_REVIEW
    review = world.week_reviews.last_week(USER, ZURICH)
    assert review is not None
    assert (review.status, review.text) == ("ready", WRITTEN["text"])


def test_a_report_that_could_not_be_written_can_be_asked_for_again_a_few_times() -> None:
    world = world_with_a_week()
    for _ in range(MAX_REQUESTS):
        world.week_reviews.request(USER, ZURICH, LAST_WEEK)
        world.text.answers.append(TextModelError())
        world.week_reviews.write(USER, LAST_WEEK)

    review = world.week_reviews.request(USER, ZURICH, LAST_WEEK)

    assert review.status == "failed"
    assert len(world.week_starter.started) == MAX_REQUESTS


def test_listening_speaks_the_report_in_the_partners_voice_once() -> None:
    world = world_with_a_week()
    world.week_reviews.request(USER, ZURICH, LAST_WEEK)
    world.text.answers.append(WRITTEN)
    world.week_reviews.write(USER, LAST_WEEK)
    lena = world.personas.partners(USER)[0]

    first = world.week_reviews.audio(USER, LAST_WEEK)
    second = world.week_reviews.audio(USER, LAST_WEEK)

    assert first == second
    (spoken,) = world.speech.tasks
    assert (spoken.voice, spoken.text) == (lena.voice, WRITTEN["text"])
    assert spoken.charge is not None
    assert spoken.charge.feature is Feature.WEEK_AUDIO
    assert any(key.startswith(f"users/{USER}/weeks/") for key in world.files.files)


def test_a_report_still_being_written_cannot_be_listened_to() -> None:
    world = world_with_a_week()
    world.week_reviews.request(USER, ZURICH, LAST_WEEK)

    with pytest.raises(WeekReviewError) as refused:
        world.week_reviews.audio(USER, LAST_WEEK)

    assert refused.value.code == "not_found"
