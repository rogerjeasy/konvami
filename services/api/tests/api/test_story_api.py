"""Listening stories over HTTP (5.29): the series, asking for an episode, listening to it to the
end and answering its questions out loud."""

import base64
from uuid import UUID

from konvami_api.api.app import Services
from tests.api.conftest import OTHER_USER, Call
from tests.api.test_api import onboarded
from tests.fakes import ScriptedTextModel, ScriptedTranscriber
from tests.story_fake import RecordingStoryStarter

AUDIO = base64.b64encode(b"\x00\x01" * 400).decode()
EPISODE = {
    "title": "Lenas Wohnung",
    "summary": "Lena visits a flat; the landlord is Herr Keller.",
    "lines": [
        {"speaker": 0, "text": "Heute sehe ich eine Wohnung."},
        {"speaker": 0, "text": "Sie ist klein, aber hell."},
        {"speaker": 0, "text": "Der Vermieter heißt Herr Keller."},
        {"speaker": 0, "text": "Morgen rufe ich ihn an."},
    ],
    "questions": [{"question": "Wie heißt der Vermieter?", "answer": "Herr Keller"}],
    "words_used": [],
}


def made(
    call: Call,
    text_model: ScriptedTextModel,
    services: Services,
    story_starter: RecordingStoryStarter,
) -> str:
    """A learner with one ready episode: its id."""
    onboarded(call, text_model)
    text_model.answers.clear()
    asked = call("POST", "/v1/stories", {})
    assert asked.status == 200, asked.body
    assert asked.body["status"] == "pending"
    assert story_starter.started == [UUID(asked.body["id"])]
    text_model.answers.append(EPISODE)
    services.stories.write(UUID(asked.body["id"]))
    return str(asked.body["id"])


def test_an_episode_is_asked_for_written_in_the_background_and_played_line_by_line(
    call: Call,
    text_model: ScriptedTextModel,
    services: Services,
    story_starter: RecordingStoryStarter,
) -> None:
    episode_id = made(call, text_model, services, story_starter)

    episode = call("GET", f"/v1/stories/{episode_id}")

    assert episode.status == 200
    body = episode.body
    assert (body["number"], body["status"], body["title"]) == (1, "ready", "Lenas Wohnung")
    assert body["names"] == ["Lena"]
    assert [line["speaker"] for line in body["lines"]] == [0, 0, 0, 0]
    assert all(line["audioUrl"] for line in body["lines"])
    assert body["questions"] == [{"question": "Wie heißt der Vermieter?", "answer": "Herr Keller"}]
    assert not body["listened"]
    series = call("GET", "/v1/stories")
    assert series.status == 200
    assert [e["title"] for e in series.body["episodes"]] == ["Lenas Wohnung"]
    assert series.body["leftToday"] == series.body["perDay"] - 1
    assert series.body["available"]


def test_listening_to_the_end_and_answering_out_loud(
    call: Call,
    text_model: ScriptedTextModel,
    services: Services,
    story_starter: RecordingStoryStarter,
    story_transcriber: ScriptedTranscriber,
) -> None:
    episode_id = made(call, text_model, services, story_starter)
    story_transcriber.answers.append("Er heißt Herr Keller.")

    listened = call("POST", f"/v1/stories/{episode_id}/listened")
    answered = call(
        "POST",
        f"/v1/stories/{episode_id}/answers/0",
        {"audio": AUDIO, "format": "m4a", "durationMs": 1500},
    )

    assert listened.status == 200
    assert listened.body["listened"]
    assert answered.status == 200
    assert answered.body == {"question": 0, "heard": "Er heißt Herr Keller.", "right": True}
    assert call("GET", f"/v1/stories/{episode_id}").body["answers"] == [answered.body]


def test_a_second_episode_waits_for_the_first_and_others_cannot_see_it(
    call: Call,
    text_model: ScriptedTextModel,
    services: Services,
    story_starter: RecordingStoryStarter,
) -> None:
    onboarded(call, text_model)
    text_model.answers.clear()
    pending = call("POST", "/v1/stories", {})

    again = call("POST", "/v1/stories", {})
    theirs = call("GET", f"/v1/stories/{pending.body['id']}", subject=OTHER_USER)

    assert again.status == 409
    assert again.body["error"]["code"] == "pending"
    assert theirs.status == 404


def test_a_cast_that_is_not_the_learners_is_refused(
    call: Call, text_model: ScriptedTextModel
) -> None:
    onboarded(call, text_model)

    refused = call("POST", "/v1/stories", {"cast": [str(UUID(int=5))]})

    assert refused.status == 422
    assert refused.body["error"]["code"] == "invalid_value"


def test_an_answer_to_a_question_the_episode_does_not_have_is_not_found(
    call: Call,
    text_model: ScriptedTextModel,
    services: Services,
    story_starter: RecordingStoryStarter,
) -> None:
    episode_id = made(call, text_model, services, story_starter)

    missing = call(
        "POST",
        f"/v1/stories/{episode_id}/answers/3",
        {"audio": AUDIO, "format": "m4a"},
    )

    assert missing.status == 404
