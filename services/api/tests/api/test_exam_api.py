"""The exam centre over HTTP (spec §6.13): from the centre to a scored simulation."""

from datetime import timedelta
from typing import Any

from konvami_api.api.app import Services
from konvami_api.domain.live_call import Turn
from konvami_api.domain.voice import FinishedCall
from tests.api.conftest import Call
from tests.api.test_api import at_partners
from tests.fakes import (
    FakeSpeechModel,
    FixedClock,
    InMemoryVoiceSessionRepository,
    RecordingExamStarter,
    ScriptedTextModel,
)

EXAM = {"type": "goethe", "target_level": "B1", "date": "2027-04-15"}
SAID = (
    Turn("persona", "Wir beginnen mit Teil 1."),
    Turn("learner", "Ich schlage vor, dass wir am Freitag feiern."),
    Turn("learner", "Im Restaurant, weil es ruhig ist."),
    Turn("learner", "Vielen Dank für Ihre Aufmerksamkeit."),
)


def learner(call: Call, text_model: ScriptedTextModel) -> None:
    """A learner preparing for the Goethe B1, in the app."""
    at_partners(call, text_model)
    call("PATCH", "/v1/profile", {"changes": [{"field": "exam", "value": EXAM}]})
    text_model.answers[-1] = {"personas": []}
    call("POST", "/v1/personas/starter")
    call("POST", "/v1/onboarding/partners/confirm")
    call("POST", "/v1/onboarding/complete")


def simulated(
    call: Call,
    services: Services,
    calls: InMemoryVoiceSessionRepository,
    clock: FixedClock,
) -> str:
    started = call(
        "POST", "/v1/voice/calls", {"purpose": "exam", "sdp": "v=0 offer", "scenario": "goethe_b1"}
    )
    assert started.status == 200, started.body
    call_id: str = started.body["callId"]
    live = services.voice.live_call(call_id)
    assert live is not None
    clock.now += timedelta(minutes=8)
    finished = FinishedCall(clock(), "closed", {}, SAID)
    calls.finish(call_id, finished)
    # As the worker concludes the call.
    session = calls.get(call_id)
    assert session is not None
    services.exams.concluded(session.user_id, call_id, finished)
    return call_id


def scores() -> dict[str, Any]:
    return {
        "parts": [
            {
                "part": part,
                "marks": {"task": 4, "coherence": 3, "vocabulary": 3, "grammar": 2},
                "feedback": "Good suggestions.",
                "model_answer": "Ich schlage vor …",
            }
            for part in ("teil_1", "teil_2", "teil_3")
        ],
        "summary": "Work on your presentation's structure.",
    }


def test_the_centre_shows_the_learners_exam_and_the_formats(
    call: Call, text_model: ScriptedTextModel
) -> None:
    learner(call, text_model)

    centre = call("GET", "/v1/exams").body

    assert centre["exam"] == {"type": "goethe", "targetLevel": "B1", "date": "2027-04-15"}
    assert centre["suggested"] == "goethe_b1"
    b1 = next(exam for exam in centre["formats"] if exam["id"] == "goethe_b1")
    assert (b1["name"], b1["prepSeconds"], b1["passShare"]) == ("Goethe-Zertifikat B1", 900, 0.6)
    assert [part["kind"] for part in b1["parts"]] == [
        "plan_together",
        "present_topic",
        "feedback_questions",
    ]
    assert (centre["simulations"], centre["readiness"]) == ([], {})


def test_the_next_simulation_shows_its_cards(call: Call, text_model: ScriptedTextModel) -> None:
    learner(call, text_model)

    upcoming = call("GET", "/v1/exams/goethe_b1/next")
    unknown = call("GET", "/v1/exams/toefl/next")

    assert upcoming.body["exam"]["id"] == "goethe_b1"
    assert upcoming.body["cards"][0]["title"].startswith("Eine Kollegin")
    assert upcoming.body["cards"][0]["prompts"] == [
        "Wann?",
        "Wo?",
        "Essen und Getränke?",
        "Geschenk?",
    ]
    assert unknown.status == 404


def test_a_simulation_is_scored_then_read_with_its_parts_and_model_answers(
    call: Call,
    text_model: ScriptedTextModel,
    services: Services,
    calls: InMemoryVoiceSessionRepository,
    clock: FixedClock,
    exam_starter: RecordingExamStarter,
    speech: FakeSpeechModel,
) -> None:
    learner(call, text_model)
    call_id = simulated(call, services, calls, clock)

    pending = call("GET", f"/v1/exams/simulations/{call_id}").body
    text_model.answers.append(scores())
    services.exams.score(exam_starter.started[0])
    ready = call("GET", f"/v1/exams/simulations/{call_id}").body
    sound = call("GET", f"/v1/exams/simulations/{call_id}/parts/teil_1/audio")
    centre = call("GET", "/v1/exams").body

    assert (pending["status"], pending["result"]) == ("pending", None)
    assert ready["status"] == "ready"
    assert [card["id"] for card in ready["cards"]] == ["b1_1a", "b1_2a", "b1_3"]
    result = ready["result"]
    assert (result["total"], result["passed"]) == (0.75, True)
    assert result["parts"][0] == {
        "part": "teil_1",
        "marks": {"task": 4, "coherence": 3, "vocabulary": 3, "grammar": 2},
        "share": 0.75,
        "feedback": "Good suggestions.",
        "modelAnswer": "Ich schlage vor …",
    }
    assert sound.status == 200
    assert len(speech.tasks) == 1
    assert centre["simulations"][0] == {
        "callId": call_id,
        "exam": "goethe_b1",
        "startedAt": ready["startedAt"],
        "status": "ready",
        "total": 0.75,
        "passed": True,
    }
    assert centre["readiness"]["goethe_b1"]["latest"] == 0.75


def test_a_failed_score_can_be_asked_for_again(
    call: Call,
    text_model: ScriptedTextModel,
    services: Services,
    calls: InMemoryVoiceSessionRepository,
    clock: FixedClock,
) -> None:
    learner(call, text_model)
    call_id = simulated(call, services, calls, clock)
    text_model.answers.append({"parts": []})
    services.exams.score(call_id)

    again = call("POST", f"/v1/exams/simulations/{call_id}/score")

    assert again.body["status"] == "pending"


def test_another_learners_simulation_is_not_found(
    call: Call, text_model: ScriptedTextModel
) -> None:
    learner(call, text_model)

    assert call("GET", "/v1/exams/simulations/rtc_nobody").status == 404
