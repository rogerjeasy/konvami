"""Two Halves over HTTP (section 7): joining, a case against the AI, a move checked and heard,
the board, a friend's code, reporting and the owner's queue."""

import base64
from dataclasses import replace
from uuid import UUID

from konvami_api.api.app import Services
from tests.api.conftest import OTHER_USER, OWNER, USER, Call, Response
from tests.api.test_api import ESSENTIALS, onboarded
from tests.fakes import FakeAccountDirectory, ScriptedTextModel, ScriptedTranscriber
from tests.halves_fake import FakeBrain, RecordingHalvesStarter

AUDIO = base64.b64encode(b"\x00\x01" * 400).decode()
JOIN = {"nativeLanguage": "fr", "place": "city:Lyon", "veilDefault": False, "voiceConsent": True}


def adults(directory: FakeAccountDirectory) -> None:
    for user in (USER, OTHER_USER):
        account = directory.accounts[UUID(user)]
        directory.accounts[UUID(user)] = replace(account, age_bracket="25-34", voice_consent=True)


def run(services: Services, starter: RecordingHalvesStarter) -> None:
    """Does what the worker would."""
    while starter.jobs:
        job, item = starter.jobs.pop(0)
        if job == "check":
            services.halves.check(item)
        elif job == "ai":
            services.halves.play(item)
        else:
            services.halves.write_recap(item)


def test_the_hub_says_whether_it_is_open_and_offers_the_join_choices(call: Call) -> None:
    hub = call("GET", "/v1/halves")
    assert hub.status == 200
    assert hub.body["available"] is True
    assert hub.body["profile"] is None
    assert "Zürich" in hub.body["cities"]
    assert hub.body["nativeLanguages"] == ["de", "en", "fr", "it", "other"]


def test_joining_needs_the_voice_sharing_consent(call: Call) -> None:
    refused = call("PUT", "/v1/halves/profile", {**JOIN, "voiceConsent": False})
    assert (refused.status, refused.body["error"]["code"]) == (403, "consent_required")
    joined = call("PUT", "/v1/halves/profile", JOIN)
    assert joined.status == 200
    assert joined.body["profile"]["band"] == "minor"
    changed = call("PATCH", "/v1/halves/profile", {"clearPlace": True, "veilDefault": True})
    assert changed.body["profile"]["place"] is None
    assert changed.body["profile"]["veilDefault"] is True


def test_a_case_against_the_ai_a_move_checked_and_the_clue_answered(
    call: Call,
    services: Services,
    text_model: ScriptedTextModel,
    halves_transcriber: ScriptedTranscriber,
    halves_starter: RecordingHalvesStarter,
) -> None:
    onboarded(call, text_model)
    call("PUT", "/v1/halves/profile", JOIN)
    started = call("POST", "/v1/halves/cases", {"templateId": "lost_cello"})
    assert started.status == 200
    case_id = started.body["id"]
    assert started.body["partner"] == {"name": "Julien", "ai": True, "place": None}
    run(services, halves_starter)

    halves_transcriber.answers.append("Ein Schaffner hat um 14 Uhr 20 einen Kasten gesehen")
    sent = call("POST", f"/v1/halves/cases/{case_id}/moves", {"audio": AUDIO, "format": "m4a"})
    assert sent.status == 200
    assert sent.body["status"] == "checking"
    run(services, halves_starter)

    case = call("GET", f"/v1/halves/cases/{case_id}").body
    first = case["rounds"][0]
    assert first["mine"]["status"] == "delivered"
    assert first["mine"]["understood"] is True
    theirs = first["theirs"]
    assert theirs["question"] == "Où Inès a-t-elle changé de train ?"
    audio = call("GET", f"/v1/halves/moves/{theirs['id']}/audio")
    assert audio.status == 200
    assert audio.body["url"].startswith("https://files.test/halves/")

    answered = call("POST", f"/v1/halves/moves/{theirs['id']}/answer", {"option": 1})
    assert answered.body["rounds"][0]["theirs"]["solution"] == 1
    assert answered.body["recordRound"] == 2
    again = call("POST", f"/v1/halves/moves/{theirs['id']}/answer", {"option": 1})
    assert (again.status, again.body["error"]["code"]) == (409, "answered")
    hub = call("GET", "/v1/halves").body
    assert [c["next"] for c in hub["cases"]] == ["record"]


def test_a_held_move_reaches_the_owners_queue_and_the_owner_decides(
    call: Call,
    services: Services,
    text_model: ScriptedTextModel,
    halves_transcriber: ScriptedTranscriber,
    halves_starter: RecordingHalvesStarter,
    halves_brain: FakeBrain,
) -> None:
    onboarded(call, text_model)
    call("PUT", "/v1/halves/profile", JOIN)
    case_id = call("POST", "/v1/halves/cases", {"templateId": "lost_cello"}).body["id"]
    run(services, halves_starter)
    halves_brain.labels.append(("romance",))
    halves_transcriber.answers.append("Du hast eine sehr schöne Stimme")
    move = call("POST", f"/v1/halves/cases/{case_id}/moves", {"audio": AUDIO, "format": "m4a"})
    run(services, halves_starter)
    mine = call("GET", f"/v1/halves/cases/{case_id}").body["rounds"][0]["mine"]
    assert (mine["status"], mine["reasons"]) == ("held", ["romance"])

    assert call("GET", "/v1/halves/queue").status == 403
    queue = call("GET", "/v1/halves/queue", subject=OWNER).body["items"]
    assert [(item["kind"], item["moveId"]) for item in queue] == [("held", move.body["id"])]
    decided = call(
        "POST", f"/v1/halves/queue/held/{move.body['id']}", {"action": "remove"}, subject=OWNER
    )
    assert decided.status == 204
    assert call("GET", "/v1/halves").body["profile"]["strikes"] == 1


def test_a_friend_redeems_a_code_reports_a_move_and_blocks(
    call: Call,
    services: Services,
    text_model: ScriptedTextModel,
    directory: FakeAccountDirectory,
    halves_transcriber: ScriptedTranscriber,
    halves_starter: RecordingHalvesStarter,
) -> None:
    adults(directory)
    onboarded(call, text_model)
    text_model.answers.clear()

    # The friend is onboarded the same way, as the other learner: both learn German, so they
    # play in same-language mode.
    def as_other(method: str, path: str, body: object = None) -> Response:
        return call(method, path, body, subject=OTHER_USER)

    as_other("PATCH", "/v1/profile", {"changes": ESSENTIALS})
    as_other("POST", "/v1/onboarding/essentials/confirm")
    as_other("POST", "/v1/placement/skip")
    text_model.answers.append({"personas": []})
    as_other("POST", "/v1/personas/starter")
    as_other("POST", "/v1/onboarding/partners/confirm")
    as_other("POST", "/v1/onboarding/complete")

    call("PUT", "/v1/halves/profile", JOIN)
    as_other("PUT", "/v1/halves/profile", {**JOIN, "nativeLanguage": "it"})
    invite = call("POST", "/v1/halves/invites", {"templateId": "museum_postcard"})
    assert invite.status == 200
    case = as_other("POST", "/v1/halves/invites/redeem", {"code": invite.body["code"].lower()})
    assert case.status == 200
    case_id = case.body["id"]
    assert case.body["partner"]["ai"] is False

    halves_transcriber.answers.append("Die Karte wurde 1952 in Basel abgeschickt")
    move = call("POST", f"/v1/halves/cases/{case_id}/moves", {"audio": AUDIO, "format": "m4a"})
    run(services, halves_starter)
    reported = as_other(
        "POST", f"/v1/halves/moves/{move.body['id']}/report", {"reason": "harassment"}
    )
    assert reported.body["rounds"][0]["theirs"]["hidden"] is True
    queue = call("GET", "/v1/halves/queue", subject=OWNER).body["items"]
    assert [item["kind"] for item in queue] == ["report"]
    blocked = as_other("POST", f"/v1/halves/cases/{case_id}/block")
    assert blocked.body["partner"]["ai"] is True
    hub = as_other("GET", "/v1/halves").body
    assert len(hub["blocks"]) == 1
    assert as_other("DELETE", f"/v1/halves/blocks/{hub['blocks'][0]['id']}").status == 204


def test_minors_cannot_invite_and_wrong_codes_are_not_found(
    call: Call, text_model: ScriptedTextModel
) -> None:
    onboarded(call, text_model)
    call("PUT", "/v1/halves/profile", JOIN)
    refused = call("POST", "/v1/halves/invites", {})
    assert (refused.status, refused.body["error"]["code"]) == (403, "adults_only")
    missing = call("POST", "/v1/halves/invites/redeem", {"code": "ZZZZZZ"})
    assert (missing.status, missing.body["error"]["code"]) == (404, "not_found")


def test_leaving_deletes_the_profile(call: Call) -> None:
    call("PUT", "/v1/halves/profile", JOIN)
    assert call("DELETE", "/v1/halves/profile").status == 204
    assert call("GET", "/v1/halves").body["profile"] is None
    assert call("GET", "/v1/halves/cases/00000000-0000-4000-8000-000000000000").body["error"][
        "code"
    ] == ("not_joined")
