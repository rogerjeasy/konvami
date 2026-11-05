"""Pen-pal voice notes over HTTP (spec §6.16): the settings, a thread, asking a partner for a note,
answering with a voice note, and trying again."""

import base64
from typing import Any
from uuid import UUID

from konvami_api.api.app import Services
from konvami_api.domain.text import TextModelError
from tests.api.conftest import OTHER_USER, Call
from tests.api.test_api import onboarded
from tests.fakes import (
    RecordingPenPalStarter,
    ScriptedTextModel,
    ScriptedTranscriber,
)

AUDIO = base64.b64encode(b"\x00\x01" * 400).decode()
NOTE = {"text": "Hallo! Heute habe ich Kuchen gebacken. Und du?", "hook": "own_day"}
SAID = "Ich habe gestern ein Film gesehen und er war sehr gut"
ANSWER: dict[str, Any] = {
    "reply": "Das klingt schön! Welchen Film hast du gesehen?",
    "correction_lead": "Kleine Korrektur:",
    "corrections": [
        {
            "original": "ein Film",
            "corrected": "einen Film",
            "spoken": "Man sagt: einen Film gesehen.",
            "explanation": "After sehen, the accusative: einen.",
            "category": "other",
        }
    ],
    "memories": [],
}
REVIEW = {"mistakes": [{"id": 0, "verdict": "correct"}], "rewrites": []}


def lena(call: Call, text_model: ScriptedTextModel) -> str:
    partners = onboarded(call, text_model)
    text_model.answers.clear()
    return str(partners[0]["id"])


def test_a_new_learner_has_the_defaults_and_an_empty_thread_per_partner(
    call: Call, text_model: ScriptedTextModel
) -> None:
    partners = onboarded(call, text_model)

    overview = call("GET", "/v1/pen-pal")

    assert overview.status == 200
    assert overview.body["settings"] == {
        "enabled": False,
        "perWeek": 3,
        "quietFrom": 21,
        "quietTo": 8,
        "timezone": "UTC",
    }
    assert [(t["personaId"], t["last"], t["unread"]) for t in overview.body["threads"]] == [
        (partner["id"], None, 0) for partner in partners
    ]


def test_the_learner_turns_it_on_and_chooses_when(
    call: Call, text_model: ScriptedTextModel
) -> None:
    lena(call, text_model)

    saved = call(
        "PUT",
        "/v1/pen-pal/settings",
        {"enabled": True, "perWeek": 5, "quietFrom": 22, "timezone": "Europe/Zurich"},
    )

    assert saved.status == 200
    assert saved.body == {
        "enabled": True,
        "perWeek": 5,
        "quietFrom": 22,
        "quietTo": 8,
        "timezone": "Europe/Zurich",
    }
    assert call("GET", "/v1/pen-pal").body["settings"] == saved.body


def test_a_setting_out_of_range_is_refused(call: Call, text_model: ScriptedTextModel) -> None:
    lena(call, text_model)

    refused = call("PUT", "/v1/pen-pal/settings", {"perWeek": 12})

    assert (refused.status, refused.body) == (
        422,
        {"error": {"code": "invalid_value", "field": None}},
    )


def test_a_note_asked_for_is_written_in_the_background_then_listened_to(
    call: Call,
    text_model: ScriptedTextModel,
    services: Services,
    pen_pal_starter: RecordingPenPalStarter,
) -> None:
    partner = lena(call, text_model)

    asked = call("POST", f"/v1/pen-pal/{partner}/notes")

    assert asked.status == 200
    assert (asked.body["status"], asked.body["sender"], asked.body["text"]) == (
        "pending",
        "partner",
        "",
    )
    assert pen_pal_starter.started == [UUID(asked.body["id"])]
    text_model.answers.append(NOTE)
    services.pen_pal.write(UUID(asked.body["id"]))

    thread = call("GET", f"/v1/pen-pal/{partner}")
    assert thread.status == 200
    [note] = thread.body["notes"]
    assert (note["status"], note["text"]) == ("ready", NOTE["text"])
    assert note["audioUrl"].startswith("https://files.test/users/")
    assert thread.body["unread"] == 1

    opened = call("POST", f"/v1/pen-pal/{partner}/opened")
    assert opened.status == 200
    assert [t["unread"] for t in opened.body["threads"]] == [0, 0]


def test_a_voice_note_is_written_down_and_answered_with_a_checked_correction(
    call: Call,
    text_model: ScriptedTextModel,
    services: Services,
    pen_pal_transcriber: ScriptedTranscriber,
) -> None:
    partner = lena(call, text_model)
    pen_pal_transcriber.answers.append(SAID)

    sent = call(
        "POST",
        f"/v1/pen-pal/{partner}/replies",
        {"audio": AUDIO, "format": "m4a", "durationMs": 4200},
    )

    assert sent.status == 200
    assert sent.body["heard"]["text"] == SAID
    assert sent.body["answer"]["status"] == "pending"
    text_model.answers += [ANSWER, REVIEW]
    services.pen_pal.write(UUID(sent.body["answer"]["id"]))

    notes = call("GET", f"/v1/pen-pal/{partner}").body["notes"]
    assert [(n["sender"], n["status"]) for n in notes] == [
        ("learner", "ready"),
        ("partner", "ready"),
    ]
    answer = notes[1]
    assert answer["replyTo"] == sent.body["heard"]["id"]
    assert answer["text"].endswith("Kleine Korrektur: Man sagt: einen Film gesehen.")
    assert answer["corrections"] == [
        {
            "original": "ein Film",
            "corrected": "einen Film",
            "explanation": "After sehen, the accusative: einen.",
            "category": "other",
            "certain": True,
        }
    ]


def test_a_voice_note_that_is_not_audio_is_refused(
    call: Call, text_model: ScriptedTextModel
) -> None:
    partner = lena(call, text_model)

    refused = call(
        "POST", f"/v1/pen-pal/{partner}/replies", {"audio": "not base64!", "format": "m4a"}
    )

    assert (refused.status, refused.body) == (
        422,
        {"error": {"code": "invalid_value", "field": None}},
    )


def test_a_cough_is_not_answered(
    call: Call, text_model: ScriptedTextModel, pen_pal_transcriber: ScriptedTranscriber
) -> None:
    partner = lena(call, text_model)
    pen_pal_transcriber.answers.append("Äh")

    refused = call("POST", f"/v1/pen-pal/{partner}/replies", {"audio": AUDIO, "format": "m4a"})

    assert (refused.status, refused.body) == (422, {"error": {"code": "too_short", "field": None}})


def test_an_answer_that_failed_can_be_tried_again(
    call: Call,
    text_model: ScriptedTextModel,
    services: Services,
    pen_pal_transcriber: ScriptedTranscriber,
    pen_pal_starter: RecordingPenPalStarter,
) -> None:
    partner = lena(call, text_model)
    pen_pal_transcriber.answers.append(SAID)
    sent = call("POST", f"/v1/pen-pal/{partner}/replies", {"audio": AUDIO, "format": "m4a"})
    answer_id = sent.body["answer"]["id"]
    text_model.answers.append(TextModelError("down"))
    services.pen_pal.write(UUID(answer_id))

    failed = call("GET", f"/v1/pen-pal/{partner}").body["notes"][1]
    assert failed["status"] == "failed"

    again = call("POST", f"/v1/pen-pal/notes/{answer_id}/retry")

    assert (again.status, again.body["status"]) == (200, "pending")
    assert pen_pal_starter.started[-1] == UUID(answer_id)


def test_another_learners_thread_and_notes_are_not_found(
    call: Call, text_model: ScriptedTextModel, services: Services
) -> None:
    partner = lena(call, text_model)
    asked = call("POST", f"/v1/pen-pal/{partner}/notes")

    thread = call("GET", f"/v1/pen-pal/{partner}", subject=OTHER_USER)
    retried = call("POST", f"/v1/pen-pal/notes/{asked.body['id']}/retry", subject=OTHER_USER)

    assert (thread.status, retried.status) == (404, 404)
    assert services.pen_pal is not None
