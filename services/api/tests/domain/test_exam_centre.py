"""The exam centre on a whole backend (spec §6.13): a simulation from the centre to its score."""

import json
from datetime import timedelta
from typing import Any

import pytest

from konvami_api.domain.costs import Feature
from konvami_api.domain.exam_centre import MAX_REQUESTS, ExamError, ExamTools
from konvami_api.domain.live_call import Turn
from konvami_api.domain.scenarios import ScenarioError
from konvami_api.domain.text import TextModelError
from konvami_api.domain.voice import CallPurpose, FinishedCall
from tests.world import NOON, OTHER_USER, USER, World

GOETHE_B1 = {"type": "goethe", "target_level": "B1", "date": "2027-04-15"}
OFFER = "v=0 offer"
SAID = (
    Turn("persona", "Guten Tag. Wir beginnen mit Teil 1."),
    Turn("learner", "Ich schlage vor, dass wir die Feier am Freitag machen."),
    Turn("persona", "Gute Idee. Und wo?"),
    Turn("learner", "Vielleicht im Restaurant neben dem Büro, weil es dort ruhig ist."),
    Turn("learner", "Mein Thema ist Homeoffice. Ich arbeite zwei Tage pro Woche zu Hause."),
    Turn("learner", "Vielen Dank für Ihre Aufmerksamkeit."),
)


def scored(model_answer: str = "Ich würde vorschlagen …") -> dict[str, Any]:
    return {
        "parts": [
            {
                "part": part,
                "marks": {"task": 3, "coherence": 3, "vocabulary": 2, "grammar": 2},
                "feedback": "Tu as bien proposé une date et un lieu.",
                "model_answer": model_answer,
            }
            for part in ("teil_1", "teil_2", "teil_3")
        ],
        "summary": "Travaille la structure de ta présentation.",
    }


def learner(world: World) -> None:
    world.onboard(exam=GOETHE_B1)


def simulate(world: World, turns: tuple[Turn, ...] = SAID) -> str:
    """A whole simulation of the Goethe B1 test, as the broker and the worker record it."""
    started = world.voice.start(USER, CallPurpose.EXAM, OFFER, scenario="goethe_b1")
    call = world.voice.live_call(started.call_id)
    assert call is not None
    world.clock.now += timedelta(minutes=8)
    finished = FinishedCall(world.clock(), "closed", {"input_audio_tokens": 10}, turns)
    world.sessions.finish(started.call_id, finished)
    world.exam_script.concluded(USER, started.call_id, call.tools, finished)
    return started.call_id


def test_the_centre_names_the_learners_exam_and_its_speaking_test() -> None:
    world = World()
    learner(world)

    centre = world.exams.centre(USER)

    assert centre.exam is not None
    assert (centre.exam.type, centre.exam.target_level) == ("goethe", "B1")
    assert centre.suggested == "goethe_b1"
    assert "telc_b1" in {exam.id for exam in centre.formats}
    assert centre.simulations == ()
    assert centre.readiness == {}


def test_a_learner_without_an_exam_can_still_try_every_format() -> None:
    world = World()
    world.onboard()

    centre = world.exams.centre(USER)

    assert centre.exam is None
    assert centre.suggested is None
    assert len(centre.formats) == 6


def test_the_next_simulation_has_one_card_per_part_and_its_prep_time() -> None:
    world = World()
    learner(world)

    upcoming = world.exams.next(USER, "goethe_b1")

    assert upcoming.exam.prep_seconds == 15 * 60
    assert [card.id for card in upcoming.cards] == ["b1_1a", "b1_2a", "b1_3"]
    with pytest.raises(ScenarioError):
        world.exams.next(USER, "toefl")


def test_the_examiner_runs_the_parts_with_the_cards_and_does_not_help() -> None:
    world = World()
    learner(world)

    briefing = world.exam_script.prepare(
        USER, world.accounts.get(USER), NOON.date(), None, "goethe_b1"
    )

    text = briefing.instructions
    assert "Goethe-Zertifikat B1" in text
    assert "Eine Kollegin hört auf zu arbeiten" in text
    assert "begin_part" in text
    assert "end_exam" in text
    assert "Do not help" in text
    assert briefing.hearing is not None
    assert briefing.hearing.language == "de"
    assert briefing.plan is None


def test_the_examiners_tools_say_which_part_runs_and_end_the_test() -> None:
    world = World()
    learner(world)
    tools = world.exam_script.tools(USER, "goethe_b1")
    assert isinstance(tools, ExamTools)

    begun = tools.run("begin_part", {"part": "teil_2"})
    wrong = tools.run("begin_part", {"part": "teil_9"})
    ended = tools.run("end_exam", {})

    # The app follows the call's events and shows the part's card.
    assert begun.output == {"part": "teil_2", "seconds": 180}
    assert wrong.output == {"done": False, "reason": "invalid_value"}
    assert ended.finished
    assert ended.output == {"done": True}
    assert tools.parts == ["teil_2"]


def test_an_exam_call_is_timed_and_metered_as_an_exam() -> None:
    world = World()
    learner(world)

    started = world.voice.start(USER, CallPurpose.EXAM, OFFER, scenario="goethe_b1")

    assert started.max_seconds == 600
    assert started.plan is None
    assert world.provider.created[-1][1]["tools"][0]["name"] == "begin_part"


def test_after_the_call_the_simulation_is_scored_in_the_background() -> None:
    world = World()
    learner(world)

    call_id = simulate(world)

    simulation = world.exams.result(USER, call_id)
    assert simulation.status == "pending"
    assert simulation.exam == "goethe_b1"
    assert world.exam_starter.started == [call_id]


def test_the_scorer_judges_each_part_by_the_rubric_and_writes_a_model_answer() -> None:
    world = World()
    learner(world)
    call_id = simulate(world)
    world.text.answers.append(scored())

    world.exams.score(call_id)

    task = world.text.tasks[-1]
    assert task.model == "gpt-6.1-sol"
    assert "French" in task.instructions
    assert "familiar form of address" in task.instructions
    assert "task:" in task.instructions
    assert "coherence:" in task.instructions
    content = json.loads(task.content)
    assert content["parts"][0]["card"]["title"].startswith("Eine Kollegin")
    assert content["transcript"][1] == {
        "speaker": "learner",
        "text": "Ich schlage vor, dass wir die Feier am Freitag machen.",
    }
    assert task.charge is not None
    assert task.charge.feature is Feature.EXAM_SCORE
    simulation = world.exams.result(USER, call_id)
    assert simulation.status == "ready"
    assert simulation.result is not None
    assert [part.part for part in simulation.result.parts] == ["teil_1", "teil_2", "teil_3"]
    # 10 of 16 points in every part: 62.5 %, just past the 60 % the exam asks for.
    assert simulation.result.total == 0.625
    assert simulation.result.passed
    assert simulation.result.summary == "Travaille la structure de ta présentation."


def test_a_simulation_with_almost_nothing_said_is_not_scored() -> None:
    world = World()
    learner(world)
    call_id = simulate(world, (Turn("persona", "Guten Tag."), Turn("learner", "Hallo.")))

    world.exams.score(call_id)

    assert world.exams.result(USER, call_id).status == "too_short"
    assert not [t for t in world.text.tasks if t.charge and t.charge.feature is Feature.EXAM_SCORE]


def test_marks_out_of_range_or_parts_left_out_fail_the_scoring() -> None:
    world = World()
    learner(world)
    call_id = simulate(world)
    broken = scored()
    broken["parts"] = broken["parts"][:2]
    world.text.answers.append(broken)

    world.exams.score(call_id)

    assert world.exams.result(USER, call_id).status == "failed"


def test_a_failed_scoring_can_be_asked_for_again_a_few_times() -> None:
    world = World()
    learner(world)
    call_id = simulate(world)
    # Three attempts in all: the first, and two asked for again.
    for _ in range(MAX_REQUESTS - 1):
        world.text.answers.append(TextModelError())
        world.exams.score(call_id)
        world.exams.retry(USER, call_id)

    assert world.exams.result(USER, call_id).status == "pending"
    world.text.answers.append(TextModelError())
    world.exams.score(call_id)
    with pytest.raises(ExamError) as refused:
        world.exams.retry(USER, call_id)

    assert refused.value.code == "score_limit"


def test_scores_build_up_the_readiness_and_rotate_the_cards() -> None:
    world = World()
    learner(world)
    for marks in (1, 3):
        call_id = simulate(world)
        answer = scored()
        for part in answer["parts"]:
            part["marks"] = dict.fromkeys(part["marks"], marks)
        world.text.answers.append(answer)
        world.exams.score(call_id)

    centre = world.exams.centre(USER)

    assert [s.result.total for s in centre.simulations if s.result] == [0.75, 0.25]
    readiness = centre.readiness["goethe_b1"]
    assert (readiness.latest, readiness.change, readiness.passing) == (0.75, 0.5, True)
    assert [card.id for card in world.exams.next(USER, "goethe_b1").cards] == [
        "b1_1c",
        "b1_2c",
        "b1_3",
    ]


def test_a_model_answer_is_heard_in_the_examiners_voice_once() -> None:
    world = World()
    learner(world)
    call_id = simulate(world)
    world.text.answers.append(scored("Ich würde vorschlagen, dass wir am Freitag feiern."))
    world.exams.score(call_id)

    first = world.exams.audio(USER, call_id, "teil_1")
    again = world.exams.audio(USER, call_id, "teil_1")

    assert first == again
    (spoken,) = world.speech.tasks
    assert spoken.text == "Ich würde vorschlagen, dass wir am Freitag feiern."
    assert spoken.charge is not None
    assert spoken.charge.feature is Feature.EXAM_AUDIO
    with pytest.raises(ExamError):
        world.exams.audio(USER, call_id, "teil_9")


def test_a_simulation_is_the_learners_own() -> None:
    world = World()
    learner(world)
    call_id = simulate(world)
    world.onboard(OTHER_USER)

    with pytest.raises(ExamError) as missing:
        world.exams.result(OTHER_USER, call_id)

    assert missing.value.code == "not_found"
