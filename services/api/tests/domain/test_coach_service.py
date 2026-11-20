"""The Coach on the in-memory world: its facts come from the real services, its day is kept,
the model words it in the background, and the learner's answers change what comes next."""

from datetime import UTC, date, datetime, timedelta

import pytest

from konvami_api.domain.accounts import Account
from konvami_api.domain.coach import MAX_WORDINGS, Kind
from konvami_api.domain.costs import ChargeRecord, Feature
from konvami_api.domain.onboarding import OnboardingError
from konvami_api.domain.reports import Mistake
from konvami_api.domain.text import TextModelError
from tests.world import USER, World

DAY = timedelta(days=1)
# A Friday morning in Zurich.
NOW = datetime(2026, 11, 20, 9, 0, tzinfo=UTC)
ZURICH = "Europe/Zurich"


def dative() -> Mistake:
    return Mistake(1, "mit der Bus", "mit dem Bus", "datif", "case_dative", "noticeable", True)


def learner_with_a_pattern() -> World:
    """A learner who said the same dative wrong in each of their last three conversations."""
    world = World(NOW - 10 * DAY)
    lena, _ = world.onboard()
    for days_ago in (6, 4, 2):
        world.reported(world.talk(lena, at=NOW - days_ago * DAY), mistakes=(dative(),))
    world.clock.now = NOW
    return world


def wording_for(world: World) -> dict[str, object]:
    """A model answer that words the day's first suggestion with numbers from its facts."""
    first = world.coach.view(USER, ZURICH).suggestions[0]
    return {
        "suggestions": [
            {
                "id": str(first.id),
                "title": "Une petite leçon sur le datif",
                "why": "Tu as dit « mit der Bus » dans 3 conversations : on s'y met ?",
            }
        ]
    }


def test_before_entering_the_app_there_is_no_coach() -> None:
    world = World(NOW)
    with pytest.raises(OnboardingError):
        world.coach.view(USER, ZURICH)


def test_a_learner_with_a_pattern_is_suggested_a_lesson_on_it() -> None:
    world = learner_with_a_pattern()

    view = world.coach.view(USER, ZURICH)

    first = view.suggestions[0]
    assert first.kind is Kind.RECURRING_MISTAKE
    assert first.evidence["said"] == "mit der Bus"
    assert first.action.type == "lesson"
    assert first.action.topic == "dative"
    assert view.brief.day == date(2026, 11, 20)
    assert Kind.RECURRING_MISTAKE in {s.kind for s in view.brief.holding_back}
    assert len(view.suggestions) <= 3


def test_the_day_is_kept_and_the_model_words_it_once_in_the_background() -> None:
    world = learner_with_a_pattern()

    first = world.coach.view(USER, ZURICH)
    again = world.coach.view(USER, ZURICH)

    assert first.brief.wording == "pending"
    assert world.coach_starter.started == [(USER, date(2026, 11, 20))]
    assert [s.id for s in again.suggestions] == [s.id for s in first.suggestions]


def test_the_worker_words_the_suggestions_and_meters_it() -> None:
    world = learner_with_a_pattern()
    world.text.answers.append(wording_for(world))

    world.coach.phrase(USER, date(2026, 11, 20))
    view = world.coach.view(USER, ZURICH)

    assert view.brief.wording == "model"
    assert view.suggestions[0].title == "Une petite leçon sur le datif"
    task = world.text.tasks[-1]
    assert task.charge is not None
    assert task.charge.feature is Feature.COACH
    assert "French" in task.instructions
    assert "mit der Bus" in task.content
    # The model reads the topic's name, not its id.
    assert '"topic": "Dative"' in task.content


def test_a_wording_that_invents_a_number_keeps_the_apps_words() -> None:
    world = learner_with_a_pattern()
    first = world.coach.view(USER, ZURICH).suggestions[0]
    world.text.answers.append(
        {"suggestions": [{"id": str(first.id), "title": "Leçon", "why": "Tu as fait 12 fautes."}]}
    )

    world.coach.phrase(USER, date(2026, 11, 20))
    view = world.coach.view(USER, ZURICH)

    assert view.brief.wording == "template"
    assert view.suggestions[0].title is None


def test_a_failing_model_keeps_the_apps_words() -> None:
    world = learner_with_a_pattern()
    world.coach.view(USER, ZURICH)
    world.text.answers.append(TextModelError())

    world.coach.phrase(USER, date(2026, 11, 20))

    assert world.coach.view(USER, ZURICH).brief.wording == "template"


def test_without_consent_nothing_is_worded() -> None:
    world = learner_with_a_pattern()
    world.accounts.accounts[USER] = Account("Amara", "fr", voice_consent=False)

    view = world.coach.view(USER, ZURICH)

    assert view.brief.wording == "template"
    assert world.coach_starter.started == []
    assert view.suggestions


def test_past_the_months_spend_target_nothing_is_worded() -> None:
    world = learner_with_a_pattern()
    world.charges.add(
        ChargeRecord(USER, Feature.REPORT, "openai", "gpt-6.1-sol", {}, 160, True, NOW)
    )

    view = world.coach.view(USER, ZURICH)

    assert view.brief.wording == "template"
    assert world.coach_starter.started == []


def test_a_new_report_finds_again_and_words_again_a_few_times_a_day_at_most() -> None:
    world = learner_with_a_pattern()
    lena = world.personas.partners(USER)[0]
    world.coach.view(USER, ZURICH)
    world.text.answers.append(TextModelError())
    world.coach.phrase(USER, date(2026, 11, 20))

    for hour in range(1, MAX_WORDINGS + 2):
        world.clock.now = NOW + timedelta(hours=hour)
        world.reported(world.talk(lena, at=world.clock.now - timedelta(minutes=10)))
        world.coach.view(USER, ZURICH)
        if world.coach_store.brief(USER, "de", date(2026, 11, 20)).wording == "pending":  # type: ignore[union-attr]
            world.text.answers.append(TextModelError())
            world.coach.phrase(USER, date(2026, 11, 20))

    assert len(world.coach_starter.started) == MAX_WORDINGS


def test_not_now_hides_a_suggestion_for_the_day_and_the_next_one_takes_its_place() -> None:
    world = learner_with_a_pattern()
    shown = world.coach.view(USER, ZURICH).suggestions
    first = shown[0]

    world.coach.respond(USER, first.id, "snoozed", None)
    after = world.coach.view(USER, ZURICH).suggestions

    assert first.id not in {s.id for s in after}


def test_not_for_me_keeps_a_kind_away_on_the_next_days() -> None:
    world = learner_with_a_pattern()
    first = world.coach.view(USER, ZURICH).suggestions[0]
    world.coach.respond(USER, first.id, "dismissed", "not_interested")

    world.clock.now = NOW + DAY
    later = world.coach.view(USER, ZURICH)

    assert Kind.RECURRING_MISTAKE not in {s.kind for s in later.suggestions}
    # It still shows as what holds the learner back: the coach only stops suggesting it.
    assert Kind.RECURRING_MISTAKE in {s.kind for s in later.brief.holding_back}


def test_do_it_is_kept_and_an_unknown_suggestion_is_refused() -> None:
    from uuid import uuid4

    from konvami_api.domain.coach import CoachError

    world = learner_with_a_pattern()
    first = world.coach.view(USER, ZURICH).suggestions[0]

    world.coach.respond(USER, first.id, "accepted", None)

    assert world.coach.view(USER, ZURICH).suggestions[0].status == "accepted"
    with pytest.raises(CoachError):
        world.coach.respond(USER, uuid4(), "accepted", None)


def test_earlier_suggestions_are_settled_and_kept_in_history() -> None:
    world = learner_with_a_pattern()
    first = world.coach.view(USER, ZURICH).suggestions[0]
    world.coach.respond(USER, first.id, "accepted", None)
    lena = world.personas.partners(USER)[0]
    # Three conversations without the mistake: it no longer comes back.
    for hours in (2, 4, 6):
        world.reported(world.talk(lena, at=NOW + DAY + timedelta(hours=hours)))

    world.clock.now = NOW + 2 * DAY
    view = world.coach.view(USER, ZURICH)

    settled = next(s for s in view.history if s.id == first.id)
    assert settled.outcome == "resolved"
    assert settled.acted is True


def test_the_coachs_topic_comes_first_in_a_call_without_one_of_its_own() -> None:
    world = learner_with_a_pattern()
    world.coach.view(USER, ZURICH)

    assert world.coach.focus_topic(USER, date(2026, 11, 20)) == "dative"
    plan = world.planner.plan(USER, today=date(2026, 11, 20))
    assert plan.focus[0].topic == "dative"


def test_a_close_exam_without_a_simulation_leads_today() -> None:
    world = World(NOW - 10 * DAY)
    world.onboard(exam={"type": "goethe", "target_level": "B1", "date": "2026-11-28"})
    lena = world.personas.partners(USER)[0]
    world.reported(world.talk(lena, at=NOW - 2 * DAY))
    world.clock.now = NOW

    view = world.coach.view(USER, ZURICH)

    assert view.suggestions[0].kind is Kind.EXAM_NEAR
    assert view.leads
    assert view.suggestions[0].action.type == "exam"


def test_a_suggestion_can_be_read_for_a_reminder() -> None:
    world = learner_with_a_pattern()
    shown = world.coach.view(USER, ZURICH).suggestions

    assert world.coach.top(USER, ZURICH) == shown[0]
