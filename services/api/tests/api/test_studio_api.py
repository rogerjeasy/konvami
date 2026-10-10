"""Persona Studio over HTTP: partners a learner makes, changes, copies and listens to."""

from typing import Any

import pytest

from konvami_api.domain.speech import SpeechError
from konvami_api.domain.text import TextModelError
from tests.api.conftest import OTHER_USER, Call
from tests.api.test_api import ESSENTIALS
from tests.fakes import FakeSpeechModel, InMemoryFileStore, ScriptedTextModel

LOOK = {
    "skin": "honey",
    "hair": "bob",
    "hairColor": "auburn",
    "top": "amber",
    "backdrop": "sand",
    "glasses": True,
    "beard": False,
}
PERSONALITY = {
    "warmth": 5,
    "playfulness": 2,
    "talkativeness": 4,
    "curiosity": 3,
    "humour": 1,
    "formOfAddress": "formal",
    "style": "stories",
}
TEACHING = {
    "correctionTiming": "immediate",
    "strictness": "everything",
    "explanationUsage": "never",
    "level": "B1",
    "focus": "Dativ und Perfekt",
    "speed": 0.9,
}
GRETA: dict[str, Any] = {
    "role": "teacher",
    "name": "Greta",
    "gender": "female",
    "age": 30,
    "origin": "Hamburg",
    "occupation": "Marketing-Managerin",
    "tagline": "Friendly and precise, loves sailing",
    "backstory": "Greta arbeitet im Marketing in Hamburg und segelt jedes Wochenende.",
    "look": LOOK,
    "voice": "coral",
    "personality": PERSONALITY,
    "teaching": TEACHING,
}
# The same persona as the text model writes it (the domain's own field names).
WRITTEN = {
    **GRETA,
    "look": {**{k: v for k, v in LOOK.items() if k != "hairColor"}, "hair_color": "auburn"},
    "personality": {
        **{k: v for k, v in PERSONALITY.items() if k != "formOfAddress"},
        "form_of_address": "formal",
    },
    "teaching": {
        "correction_timing": "immediate",
        "strictness": "everything",
        "explanation_usage": "never",
        "level": "B1",
        "focus": "Dativ und Perfekt",
        "speed": 0.9,
    },
}


@pytest.fixture
def in_app(call: Call, text_model: ScriptedTextModel) -> list[dict[str, Any]]:
    """A learner who finished onboarding with Lena and Jonas. Returns the two partners."""
    call("PATCH", "/v1/profile", {"changes": ESSENTIALS})
    call("POST", "/v1/onboarding/essentials/confirm")
    call("POST", "/v1/placement/skip")
    text_model.answers.append(TextModelError())
    partners: list[dict[str, Any]] = call("POST", "/v1/personas/starter").body["personas"]
    call("POST", "/v1/onboarding/partners/confirm")
    call("POST", "/v1/onboarding/complete")
    return partners


def test_a_partner_is_shown_with_everything_the_studio_can_change(
    call: Call, in_app: list[dict[str, Any]]
) -> None:
    lena = in_app[0]

    assert lena == {
        "id": lena["id"],
        "role": "buddy",
        "name": "Lena",
        "gender": "female",
        "age": 27,
        "origin": "Leipzig",
        "occupation": "",
        "tagline": None,
        "backstory": lena["backstory"],
        "look": lena["look"],
        "voice": "marin",
        # What a buddy does until the learner says otherwise.
        "personality": {
            "warmth": 3,
            "playfulness": 3,
            "talkativeness": 3,
            "curiosity": 3,
            "humour": 3,
            "formOfAddress": "auto",
            "style": "questions",
        },
        "teaching": {
            "correctionTiming": "recast",
            "strictness": "meaning",
            "explanationUsage": None,
            "level": None,
            "focus": None,
            "speed": None,
        },
    }
    assert "Grafikerin" in lena["backstory"]


def test_a_learner_adds_a_partner(call: Call, in_app: list[dict[str, Any]]) -> None:
    response = call("POST", "/v1/personas", GRETA)

    assert response.status == 200
    assert response.body == {"id": response.body["id"], **GRETA}
    listed = call("GET", "/v1/personas").body["personas"]
    assert [p["name"] for p in listed] == ["Lena", "Jonas", "Greta"]
    assert listed[2] == response.body


def test_a_partner_needs_only_who_they_are(call: Call, in_app: list[dict[str, Any]]) -> None:
    essentials = {
        k: v
        for k, v in GRETA.items()
        if k not in ("occupation", "tagline", "personality", "teaching")
    }

    response = call("POST", "/v1/personas", essentials)

    assert response.status == 200
    assert (response.body["occupation"], response.body["tagline"]) == ("", None)
    assert response.body["teaching"]["correctionTiming"] == "immediate"
    assert response.body["personality"]["style"] == "questions"


@pytest.mark.parametrize(
    "change",
    [{"age": 12}, {"voice": "darth"}, {"name": "   "}, {"teaching": {**TEACHING, "speed": 3}}],
)
def test_a_partner_that_breaks_a_rule_is_refused(
    call: Call, in_app: list[dict[str, Any]], change: dict[str, Any]
) -> None:
    response = call("POST", "/v1/personas", {**GRETA, **change})

    assert response.status == 422
    assert response.body["error"]["code"] in ("invalid_value", "invalid_request")
    assert len(call("GET", "/v1/personas").body["personas"]) == 2


def test_the_thirteenth_partner_is_refused(call: Call, in_app: list[dict[str, Any]]) -> None:
    for number in range(10):
        call("POST", "/v1/personas", {**GRETA, "name": f"Greta {number}"})

    response = call("POST", "/v1/personas", GRETA)

    assert response.status == 409
    assert response.body == {"error": {"code": "too_many", "field": None}}


def test_a_partner_cannot_be_added_before_a_language_is_chosen(call: Call) -> None:
    response = call("POST", "/v1/personas", GRETA)

    assert response.status == 409
    assert response.body == {"error": {"code": "no_language", "field": None}}


def test_any_part_of_a_partner_can_be_changed(call: Call, in_app: list[dict[str, Any]]) -> None:
    lena = in_app[0]

    response = call(
        "PATCH",
        f"/v1/personas/{lena['id']}",
        {"age": 31, "voice": "coral", "occupation": "Lehrerin", "teaching": TEACHING},
    )

    assert response.status == 200
    assert response.body == {
        **lena,
        "age": 31,
        "voice": "coral",
        "occupation": "Lehrerin",
        "teaching": TEACHING,
    }
    assert call("GET", "/v1/personas").body["personas"][0] == response.body


def test_settings_are_handed_back_to_the_role_with_null(
    call: Call, in_app: list[dict[str, Any]]
) -> None:
    greta = call("POST", "/v1/personas", GRETA).body

    response = call("PATCH", f"/v1/personas/{greta['id']}", {"teaching": None})

    assert response.status == 200
    assert response.body["teaching"]["strictness"] == "important"
    assert response.body["teaching"]["focus"] is None
    # What was not named stays.
    assert response.body["personality"] == PERSONALITY


def test_a_tagline_is_cleared_with_null(call: Call, in_app: list[dict[str, Any]]) -> None:
    greta = call("POST", "/v1/personas", GRETA).body

    response = call("PATCH", f"/v1/personas/{greta['id']}", {"tagline": None})

    assert response.body["tagline"] is None


def test_a_partner_is_copied(call: Call, in_app: list[dict[str, Any]]) -> None:
    lena = in_app[0]

    response = call("POST", f"/v1/personas/{lena['id']}/duplicate")

    assert response.status == 200
    assert response.body == {**lena, "id": response.body["id"], "name": "Lena 2"}
    assert response.body["id"] != lena["id"]
    assert [p["name"] for p in call("GET", "/v1/personas").body["personas"]] == [
        "Lena",
        "Jonas",
        "Lena 2",
    ]


def test_someone_elses_partner_cannot_be_copied(call: Call, in_app: list[dict[str, Any]]) -> None:
    response = call("POST", f"/v1/personas/{in_app[0]['id']}/duplicate", subject=OTHER_USER)

    assert response.status == 404


def test_templates_are_complete_partners_without_an_id(
    call: Call, in_app: list[dict[str, Any]]
) -> None:
    response = call("GET", "/v1/personas/templates")

    assert response.status == 200
    templates = response.body["templates"]
    assert [t["name"] for t in templates[:3]] == ["Lena", "Jonas", "Frau Weber"]
    assert all(set(t) == set(GRETA) for t in templates)
    mara = next(t for t in templates if t["name"] == "Mara")
    assert mara["personality"]["style"] == "debate"
    # A template can be sent back as it is to add the partner.
    assert call("POST", "/v1/personas", mara).status == 200


def test_a_partner_is_drafted_from_a_description(
    call: Call, in_app: list[dict[str, Any]], text_model: ScriptedTextModel
) -> None:
    text_model.answers.append(WRITTEN)

    response = call(
        "POST",
        "/v1/personas/draft",
        {"description": "A friendly woman from Hamburg who works in marketing"},
    )

    assert response.status == 200
    assert response.body == GRETA
    assert len(call("GET", "/v1/personas").body["personas"]) == 2


def test_a_draft_that_could_not_be_written_asks_to_try_again(
    call: Call, in_app: list[dict[str, Any]], text_model: ScriptedTextModel
) -> None:
    text_model.answers.append(TextModelError("timeout"))

    response = call("POST", "/v1/personas/draft", {"description": "A friendly woman from Hamburg"})

    assert response.status == 503
    assert response.body == {"error": {"code": "writer_unavailable", "field": None}}


def test_the_twenty_first_draft_of_a_day_is_refused(
    call: Call, in_app: list[dict[str, Any]], text_model: ScriptedTextModel
) -> None:
    text_model.answers.extend([WRITTEN] * 20)
    for _ in range(20):
        call("POST", "/v1/personas/draft", {"description": "A friendly woman from Hamburg"})

    response = call("POST", "/v1/personas/draft", {"description": "A friendly woman from Hamburg"})

    assert response.status == 429
    assert response.body == {"error": {"code": "draft_limit", "field": None}}


@pytest.mark.parametrize("description", ["hi", "x" * 501])
def test_a_description_that_is_too_short_or_too_long_is_refused(
    call: Call, in_app: list[dict[str, Any]], description: str
) -> None:
    response = call("POST", "/v1/personas/draft", {"description": description})

    assert response.status == 422


def test_a_voice_sample_is_an_address_to_play(
    call: Call, in_app: list[dict[str, Any]], files: InMemoryFileStore
) -> None:
    response = call("GET", "/v1/voices/coral/sample")

    assert response.status == 200
    [key] = files.keys()
    assert response.body == {"url": f"https://files.test/{key}?expires=3600"}
    assert files.files[key] == (b"mp3:coral", "audio/mpeg")


def test_an_unknown_voice_has_no_sample(call: Call, in_app: list[dict[str, Any]]) -> None:
    response = call("GET", "/v1/voices/darth/sample")

    assert response.status == 422
    assert response.body == {"error": {"code": "invalid_request", "field": None}}


def test_a_sample_that_cannot_be_spoken_asks_to_try_again(
    call: Call, in_app: list[dict[str, Any]], speech: FakeSpeechModel
) -> None:
    speech.fail = SpeechError("timeout")

    response = call("GET", "/v1/voices/coral/sample")

    assert response.status == 503
    assert response.body == {"error": {"code": "voice_unavailable", "field": None}}
