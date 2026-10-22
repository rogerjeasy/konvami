"""Ask-the-Tutor (spec §6.8, §12.3): accurate answers to a learner's questions, resting on the
language pack's grammar notes, as text, about a report's correction, and during a call."""

import json
from datetime import timedelta
from typing import Any

import pytest

from konvami_api.domain.accounts import Account
from konvami_api.domain.reports import Mistake
from konvami_api.domain.text import TextModelError
from konvami_api.domain.tutor import (
    MAX_QUESTION,
    QUESTIONS_PER_DAY,
    Example,
    TutorAnswer,
    TutorError,
)
from tests.world import NOON, OTHER_USER, USER, World

ANSWER: dict[str, Any] = {
    "explanation": "Après « mit », on met toujours le datif : der Bus devient dem Bus.",
    "examples": [
        {"text": "Ich fahre mit dem Bus.", "translation": "Je prends le bus."},
        {"text": "Ich spreche mit der Lehrerin.", "translation": "Je parle avec la prof."},
    ],
    "topic": "case_dative",
    "unsure": False,
}


@pytest.fixture
def world() -> World:
    world = World()
    world.onboard()
    # Onboarding asked the text model for partners: only the Tutor's requests count below.
    world.text.tasks.clear()
    return world


def asked(world: World, question: str = "Warum « mit dem Bus » ?", answer: Any = ANSWER) -> Any:
    world.text.answers.append(answer)
    return world.tutor.ask(USER, question)


def test_a_question_is_answered_and_kept(world: World) -> None:
    kept = asked(world)

    assert kept.question == "Warum « mit dem Bus » ?"
    assert kept.source == "text"
    assert kept.asked_at == NOON
    assert kept.answer == TutorAnswer(
        explanation="Après « mit », on met toujours le datif : der Bus devient dem Bus.",
        examples=(
            Example("Ich fahre mit dem Bus.", "Je prends le bus."),
            Example("Ich spreche mit der Lehrerin.", "Je parle avec la prof."),
        ),
        topic="case_dative",
        unsure=False,
    )
    assert world.tutor.history(USER) == [kept]


def test_the_tutor_rests_on_the_grammar_notes_and_knows_the_learner(world: World) -> None:
    asked(world)

    task = world.text.tasks[-1]
    content = json.loads(task.content)
    assert task.model == "gpt-6.1-sol"
    assert "German" in task.instructions
    assert "French" in task.instructions
    assert "notes" in task.instructions
    assert content["level"] == "A2"
    assert content["question"] == "Warum « mit dem Bus » ?"
    assert [note["topic"] for note in content["notes"]][:2] == ["article_gender", "case_accusative"]
    assert content["notes"][2]["right"][0] == "Ich fahre mit dem Bus."
    assert task.max_seconds is not None


def test_a_learner_who_wants_no_explanations_in_their_language_is_answered_in_german() -> None:
    world = World()
    world.onboard(usage="never")

    asked(world)

    instructions = world.text.tasks[-1].instructions
    assert "Write the explanation in simple German" in instructions


def test_a_topic_the_language_pack_does_not_know_is_not_kept(world: World) -> None:
    kept = asked(world, answer={**ANSWER, "topic": "quantum_grammar"})

    assert kept.answer.topic is None


def test_an_uncertain_answer_is_kept_as_uncertain(world: World) -> None:
    assert asked(world, answer={**ANSWER, "unsure": True}).answer.unsure is True


def test_the_newest_question_is_listed_first(world: World) -> None:
    first = asked(world, "Erste Frage?")
    world.clock.now = NOON + timedelta(minutes=3)

    second = asked(world, "Zweite Frage?")

    assert world.tutor.history(USER) == [second, first]
    assert world.tutor.history(OTHER_USER) == []


@pytest.mark.parametrize("question", ["", "   ", "x" * (MAX_QUESTION + 1)])
def test_an_empty_or_overlong_question_is_refused(world: World, question: str) -> None:
    with pytest.raises(TutorError) as error:
        world.tutor.ask(USER, question)

    assert error.value.code == "invalid_value"
    assert world.text.tasks == []


def test_a_learner_can_ask_only_so_many_questions_a_day(world: World) -> None:
    for number in range(QUESTIONS_PER_DAY):
        asked(world, f"Frage {number}?")

    with pytest.raises(TutorError) as error:
        asked(world)

    assert error.value.code == "tutor_limit"
    world.clock.now = NOON + timedelta(days=1)
    assert asked(world).source == "text"


def test_a_learner_who_withdrew_their_consent_is_not_sent_to_the_text_model(world: World) -> None:
    world.accounts.accounts[USER] = Account("Amara", "fr", voice_consent=False)

    with pytest.raises(TutorError) as error:
        world.tutor.ask(USER, "Warum?")

    assert error.value.code == "consent_required"
    assert world.text.tasks == []


def test_an_answer_that_cannot_be_had_is_reported_and_nothing_is_kept(world: World) -> None:
    with pytest.raises(TutorError) as error:
        asked(world, answer=TextModelError("timeout"))

    assert error.value.code == "unavailable"
    assert world.tutor.history(USER) == []


def test_without_a_model_there_is_no_tutor(world: World) -> None:
    world.tutor._model = ""

    with pytest.raises(TutorError) as error:
        world.tutor.ask(USER, "Warum?")

    assert error.value.code == "unavailable"


# --- About a report's correction --------------------------------------------------------------

BUS = Mistake(
    turn=1,
    original="mit der Bus",
    corrected="mit dem Bus",
    explanation="« mit » demande le datif.",
    category="case_dative",
    severity="minor",
    certain=True,
)


def reported(world: World) -> str:
    call_id = world.talk(
        None, at=NOON - timedelta(hours=1), learner_says=("Ich fahre mit der Bus.",)
    )
    world.reported(call_id, mistakes=(BUS,))
    return call_id


def test_a_correction_is_explained_from_the_report_itself(world: World) -> None:
    call_id = reported(world)
    world.text.answers.append(ANSWER)

    kept = world.tutor.explain_correction(USER, call_id, 0)

    assert kept.question == "mit der Bus → mit dem Bus"
    assert kept.source == "report"
    context = json.loads(world.text.tasks[-1].content)["correction"]
    assert context == {
        "learner_said": "Ich fahre mit der Bus.",
        "original": "mit der Bus",
        "corrected": "mit dem Bus",
        "report_explanation": "« mit » demande le datif.",
        "topic": "case_dative",
        "confirmed": True,
    }


@pytest.mark.parametrize(("user", "index"), [(USER, 1), (USER, -1), (OTHER_USER, 0)])
def test_only_a_correction_of_the_learners_own_report_is_explained(
    world: World, user: Any, index: int
) -> None:
    world.onboard(OTHER_USER)
    call_id = reported(world)
    world.text.tasks.clear()

    with pytest.raises(TutorError) as error:
        world.tutor.explain_correction(user, call_id, index)

    assert error.value.code == "not_found"
    assert world.text.tasks == []


# --- During a call ------------------------------------------------------------------------------


def test_in_a_call_the_partner_gets_a_short_answer_to_say(world: World) -> None:
    world.text.answers.append(ANSWER)

    said = world.tutor.in_call(USER, "Why dem?", "Ich fahre mit der Bus.")

    assert said == {
        "answered": True,
        "explanation": "Après « mit », on met toujours le datif : der Bus devient dem Bus.",
        "example": "Ich fahre mit dem Bus.",
        "example_translation": "Je prends le bus.",
    }
    task = world.text.tasks[-1]
    assert "spoken" in task.instructions
    assert json.loads(task.content)["about"] == "Ich fahre mit der Bus."
    assert world.tutor.history(USER)[0].source == "call"


def test_in_a_call_a_tutor_that_does_not_answer_lets_the_partner_go_on(world: World) -> None:
    world.text.answers.append(TextModelError("timeout"))

    assert world.tutor.in_call(USER, "Why dem?", None) == {
        "answered": False,
        "reason": "unavailable",
    }


def test_in_a_call_the_daily_limit_holds_too(world: World) -> None:
    for number in range(QUESTIONS_PER_DAY):
        asked(world, f"Frage {number}?")

    assert world.tutor.in_call(USER, "Why dem?", None) == {"answered": False, "reason": "limit"}
