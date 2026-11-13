import json

from konvami_api.domain.exam_centre import ExamTools
from konvami_api.domain.live_call import LiveCall, Send, Speak, Spoken, TurnAudio
from tests.domain.test_live_call import function_call
from tests.world import USER, World


def tools() -> ExamTools:
    world = World()
    world.onboard()
    return ExamTools(world.exams.speaking_exam(USER, "goethe_b1"), candidate=True)


def test_candidate_tool_validates_a_short_spoken_turn() -> None:
    examiner = tools()
    assert "speak_candidate" in {item["name"] for item in examiner.definitions()}
    for invalid in (None, 1, "", "  ", "a" * 1201):
        result = examiner.run("speak_candidate", {"text": invalid})
        assert result.output["done"] is False
        assert result.candidate is None
    result = examiner.run("speak_candidate", {"text": "Wie wäre es mit Samstag?"})
    assert result.output.get("done") is not True
    assert result.candidate == "Wie wäre es mit Samstag?"
    assert result.silent


def test_candidate_speaks_once_without_an_examiner_continuation_and_can_be_interrupted() -> None:
    call = LiveCall(tools(), max_seconds=600, wrap_up_seconds=45, goodbye_grace_seconds=8)
    event = {
        "type": "response.done",
        "response": {
            "status": "completed",
            "output": [function_call("speak_candidate", json.dumps({"text": "Am Samstag?"}))],
        },
    }
    actions = call.handle(event, 1)
    speech = [action for action in actions if isinstance(action, Speak)]
    assert len(speech) == 1
    assert speech[0].role == "candidate"
    assert not any(
        isinstance(action, Send) and action.event["type"] == "response.create" for action in actions
    )
    assert len(call.turns) == 1
    assert call.handle(event, 2) == []
    call.handle({"type": "input_audio_buffer.speech_started"}, 3)
    assert (
        call.spoken(
            Spoken(speech[0].item_id, speech[0].text, TurnAudio("a.wav", 2000), "https://clip"), 4
        )
        == []
    )
