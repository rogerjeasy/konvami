"""Video avatars over HTTP (spec §6.20 P2): what is on offer, picking a face for a partner with
the agreement to the vendor, and a session for a call."""

from uuid import UUID

from tests.api.conftest import Call
from tests.api.test_api import onboarded
from tests.fakes import ScriptedTextModel

FACES = [{"id": "anna-01", "name": "Anna"}, {"id": "ben-02", "name": "Ben"}]


def test_the_faces_on_offer_are_listed_with_what_the_learner_may_do(call: Call) -> None:
    response = call("GET", "/v1/video-avatars")

    assert response.status == 200
    assert response.body == {
        "offered": True,
        "vendor": "facely",
        "consent": False,
        "allowed": True,
        "faces": FACES,
        "chosen": [],
    }


def test_a_face_needs_the_agreement_and_is_then_used_for_the_partners_calls(
    call: Call, text_model: ScriptedTextModel
) -> None:
    lena = onboarded(call, text_model)[0]["id"]
    path = f"/v1/video-avatars/personas/{lena}"

    refused = call("PUT", path, {"faceId": "anna-01"})
    picked = call("PUT", path, {"faceId": "anna-01", "agreed": True})
    session = call("POST", "/v1/video-avatars/sessions", {"personaId": lena})

    assert refused.status == 403
    assert refused.body == {"error": {"code": "consent_needed", "field": None}}
    assert picked.status == 200
    assert picked.body["consent"] is True
    assert picked.body["chosen"] == [{"personaId": lena, "faceId": "anna-01"}]
    assert session.status == 200
    assert session.body["session"]["connectUrl"] == "https://stream.example/session"


def test_a_partner_without_a_face_draws_its_portrait(
    call: Call, text_model: ScriptedTextModel
) -> None:
    lena = onboarded(call, text_model)[0]["id"]

    response = call("POST", "/v1/video-avatars/sessions", {"personaId": lena})

    assert response.status == 200
    assert response.body == {"session": None}


def test_unknown_faces_and_partners_are_refused(call: Call, text_model: ScriptedTextModel) -> None:
    lena = onboarded(call, text_model)[0]["id"]

    unknown_face = call(
        "PUT", f"/v1/video-avatars/personas/{lena}", {"faceId": "nobody", "agreed": True}
    )
    unknown_partner = call("PUT", f"/v1/video-avatars/personas/{UUID(int=9)}", {"faceId": None})

    assert unknown_face.status == 422
    assert unknown_partner.status == 404
