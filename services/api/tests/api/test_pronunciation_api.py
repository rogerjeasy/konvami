"""The pronunciation lab over HTTP (spec §6.14)."""

from typing import Any

from konvami_api.domain.pronunciation import MAX_ATTEMPTS_PER_DAY
from tests.api.conftest import Call
from tests.api.test_api import onboarded
from tests.fakes import ScriptedTextModel, ScriptedTranscriber

AUDIO = "AAEAAQAB" * 40


def drill(call: Call, target: str, sound: str | None = "ue", kind: str = "word") -> dict[str, Any]:
    response = call(
        "POST",
        "/v1/pronunciation/attempts",
        {
            "drill": kind,
            "soundId": sound,
            "target": target,
            "recording": {"audio": AUDIO, "format": "m4a", "durationMs": 1500},
        },
    )
    body: dict[str, Any] = response.body
    return body


def test_the_sounds_are_listed_with_their_practice(
    call: Call, text_model: ScriptedTextModel
) -> None:
    onboarded(call, text_model)

    body = call("GET", "/v1/pronunciation/sounds").body

    first = body["sounds"][0]
    assert first["id"] == "ue"
    assert (first["tries"], first["right"], first["listening"]) == (0, 0, True)
    assert first["title"]
    assert first["tip"]


def test_one_sound_has_its_pairs_words_and_sentences(
    call: Call, text_model: ScriptedTextModel
) -> None:
    onboarded(call, text_model)

    body = call("GET", "/v1/pronunciation/sounds/ue").body

    assert {"first": "vier", "second": "für"} in body["pairs"]
    assert "Brücke" in body["words"]
    assert body["sound"]["pairs"] == len(body["pairs"])


def test_an_unknown_sound_is_not_found(call: Call, text_model: ScriptedTextModel) -> None:
    onboarded(call, text_model)

    response = call("GET", "/v1/pronunciation/sounds/click")

    assert (response.status, response.body["error"]["code"]) == (404, "not_found")


def test_a_drill_says_which_words_were_heard(
    call: Call, text_model: ScriptedTextModel, pronunciation_transcriber: ScriptedTranscriber
) -> None:
    onboarded(call, text_model)
    pronunciation_transcriber.answers.append("vier")

    body = drill(call, "vier für")

    assert body == {
        "assessment": None,
        "heard": "vier",
        "right": False,
        "words": [{"word": "vier", "ok": True}, {"word": "für", "ok": False}],
    }
    assert pronunciation_transcriber.tasks[0].seconds == 1.5
    words = call("GET", "/v1/pronunciation/words").body["words"]
    assert words == [{"word": "für", "soundId": "ue", "misses": 1}]


def test_a_drill_of_a_text_the_sound_does_not_have_is_refused(
    call: Call, text_model: ScriptedTextModel
) -> None:
    onboarded(call, text_model)

    response = call(
        "POST",
        "/v1/pronunciation/attempts",
        {
            "drill": "word",
            "soundId": "ue",
            "target": "Hund",
            "recording": {"audio": AUDIO, "format": "m4a"},
        },
    )

    assert (response.status, response.body["error"]["code"]) == (422, "invalid_value")


def test_a_recording_that_is_not_base64_is_refused(
    call: Call, text_model: ScriptedTextModel
) -> None:
    onboarded(call, text_model)

    response = call(
        "POST",
        "/v1/pronunciation/attempts",
        {
            "drill": "word",
            "soundId": "ue",
            "target": "für",
            "recording": {"audio": "not audio!", "format": "m4a"},
        },
    )

    assert (response.status, response.body["error"]["code"]) == (422, "invalid_value")


def test_a_word_is_played(call: Call, text_model: ScriptedTextModel) -> None:
    onboarded(call, text_model)

    response = call("GET", "/v1/pronunciation/audio?text=T%C3%BCr")

    assert response.status == 200
    assert response.body["url"]


def test_a_text_that_is_not_the_labs_is_not_played(
    call: Call, text_model: ScriptedTextModel
) -> None:
    onboarded(call, text_model)

    response = call("GET", "/v1/pronunciation/audio?text=anything")

    assert (response.status, response.body["error"]["code"]) == (404, "not_found")


def test_a_pick_is_right_when_it_is_the_word_played(
    call: Call, text_model: ScriptedTextModel
) -> None:
    onboarded(call, text_model)

    right = call(
        "POST", "/v1/pronunciation/picks", {"soundId": "ue", "played": "für", "chosen": "für"}
    )
    wrong = call(
        "POST", "/v1/pronunciation/picks", {"soundId": "ue", "played": "für", "chosen": "vier"}
    )

    assert (right.body, wrong.body) == ({"right": True}, {"right": False})
    assert call("GET", "/v1/pronunciation/sounds").body["sounds"][0]["tries"] == 2


def test_drills_past_the_days_limit_are_refused(
    call: Call, text_model: ScriptedTextModel, pronunciation_transcriber: ScriptedTranscriber
) -> None:
    onboarded(call, text_model)
    pronunciation_transcriber.answers += ["für"] * MAX_ATTEMPTS_PER_DAY
    for _ in range(MAX_ATTEMPTS_PER_DAY):
        drill(call, "für")

    response = call(
        "POST",
        "/v1/pronunciation/attempts",
        {
            "drill": "word",
            "soundId": "ue",
            "target": "für",
            "recording": {"audio": AUDIO, "format": "m4a"},
        },
    )

    assert (response.status, response.body["error"]["code"]) == (429, "drill_limit")
