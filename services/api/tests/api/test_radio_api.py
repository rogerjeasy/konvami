"""Radio Konvami over HTTP (section 8): joining, calling in, the show built and heard, applause,
reports, one's own call, and the owner's queue."""

import base64
from dataclasses import replace
from datetime import date
from uuid import UUID

from konvami_api.api.app import Services
from konvami_api.domain.halves import Correction
from konvami_api.domain.radio import air_time
from tests.api.conftest import OTHER_USER, OWNER, USER, Call
from tests.api.test_api import onboarded
from tests.fakes import FakeAccountDirectory, FixedClock, ScriptedTextModel, ScriptedTranscriber
from tests.radio_fake import FakeBrain, RecordingRadioStarter

AUDIO = base64.b64encode(b"\x00\x01" * 400).decode()
JOIN = {"veilDefault": True, "voiceConsent": True}
CALLED = "Einmal bin ich im Zug eingeschlafen und war in Basel."


def adults(directory: FakeAccountDirectory, *users: str) -> None:
    for user in users or (USER, OTHER_USER):
        account = directory.accounts[UUID(user)]
        directory.accounts[UUID(user)] = replace(account, age_bracket="25-34", voice_consent=True)


def run(services: Services, starter: RecordingRadioStarter) -> None:
    """Does what the worker would."""
    while starter.jobs:
        job, item = starter.jobs.pop(0)
        if job == "check":
            services.radio.check(item)
        else:
            services.radio.build(item)


def aired_show(
    call: Call,
    services: Services,
    text_model: ScriptedTextModel,
    directory: FakeAccountDirectory,
    transcriber: ScriptedTranscriber,
    starter: RecordingRadioStarter,
    clock: FixedClock,
) -> tuple[str, str]:
    """A learner calls in and the show airs: the call's and the show's ids."""
    adults(directory)
    onboarded(call, text_model)
    call("PUT", "/v1/radio/profile", JOIN)
    transcriber.answers.append(CALLED)
    sent = call("POST", "/v1/radio/calls", {"audio": AUDIO, "format": "m4a", "durationMs": 9000})
    assert sent.status == 200
    run(services, starter)
    hub = call("GET", "/v1/radio").body
    clock.now = air_time(date.fromisoformat(hub["nextShow"]["day"]))
    services.radio.tick()
    run(services, starter)
    return sent.body["id"], hub["nextShow"]["episodeId"]


def test_the_hub_says_whether_it_is_open(call: Call, text_model: ScriptedTextModel) -> None:
    onboarded(call, text_model)
    hub = call("GET", "/v1/radio")
    assert hub.status == 200
    assert hub.body["available"] is True
    assert hub.body["profile"] is None
    assert hub.body["callSeconds"] == 45
    assert hub.body["nextShow"]["question"]


def test_an_adult_joins_with_the_voice_sharing_consent(
    call: Call, directory: FakeAccountDirectory, text_model: ScriptedTextModel
) -> None:
    adults(directory, USER)
    onboarded(call, text_model)
    refused = call("PUT", "/v1/radio/profile", {**JOIN, "voiceConsent": False})
    assert (refused.status, refused.body["error"]["code"]) == (403, "consent_required")
    joined = call("PUT", "/v1/radio/profile", JOIN)
    assert joined.body["profile"]["agreed"] is True
    changed = call("PATCH", "/v1/radio/profile", {"veilDefault": False})
    assert changed.body["profile"]["veilDefault"] is False


def test_a_call_is_checked_aired_applauded_and_kept_private_for_its_caller(
    call: Call,
    services: Services,
    text_model: ScriptedTextModel,
    directory: FakeAccountDirectory,
    radio_transcriber: ScriptedTranscriber,
    radio_starter: RecordingRadioStarter,
    radio_brain: FakeBrain,
    clock: FixedClock,
) -> None:
    radio_brain.corrections = (Correction("war in Basel", "bin in Basel aufgewacht", "…", True),)
    call_id, episode_id = aired_show(
        call, services, text_model, directory, radio_transcriber, radio_starter, clock
    )
    show = call("GET", f"/v1/radio/episodes/{episode_id}")
    assert show.status == 200
    segments = show.body["segments"]
    mine = next(s for s in segments if s["mine"])
    assert mine["kind"] == "call"
    assert mine["ai"] is False
    assert mine["text"] == CALLED
    assert any(s["kind"] == "ai_call" and s["ai"] for s in segments)
    assert call("GET", f"/v1/radio/episodes/{episode_id}/segments/0/audio").body["url"]

    clapped = call(
        "POST",
        f"/v1/radio/episodes/{episode_id}/segments/{mine['index']}/applause",
        {"card": "bravo"},
        subject=OTHER_USER,
    )
    assert (
        next(s for s in clapped.body["segments"] if s["index"] == mine["index"])["applause"][
            "bravo"
        ]
        == 1
    )

    own = call("GET", f"/v1/radio/calls/{call_id}").body
    assert own["status"] == "aired"
    assert own["corrections"][0]["certain"] is True
    assert call("GET", f"/v1/radio/calls/{call_id}", subject=OTHER_USER).status == 404
    assert call("GET", "/v1/radio/episodes").body["episodes"][0]["mine"] is True
    assert call("GET", "/v1/radio").body["aired"]["id"] == episode_id

    radio_transcriber.answers.append("Ich bin in Basel aufgewacht")
    retried = call(
        "POST", f"/v1/radio/calls/{call_id}/corrections/0/retry", {"audio": AUDIO, "format": "m4a"}
    )
    assert retried.body["right"] is True
    card = call("POST", f"/v1/radio/calls/{call_id}/corrections/0/card")
    assert card.body["front"] == "bin in Basel aufgewacht"


def test_a_report_hides_the_call_and_the_owner_takes_it_off_air(
    call: Call,
    services: Services,
    text_model: ScriptedTextModel,
    directory: FakeAccountDirectory,
    radio_transcriber: ScriptedTranscriber,
    radio_starter: RecordingRadioStarter,
    clock: FixedClock,
) -> None:
    call_id, episode_id = aired_show(
        call, services, text_model, directory, radio_transcriber, radio_starter, clock
    )
    index = next(
        s["index"]
        for s in call("GET", f"/v1/radio/episodes/{episode_id}").body["segments"]
        if s["mine"]
    )
    reported = call(
        "POST",
        f"/v1/radio/episodes/{episode_id}/segments/{index}/report",
        {"reason": "hate", "note": "rude"},
        subject=OTHER_USER,
    )
    assert next(s for s in reported.body["segments"] if s["index"] == index)["hidden"] is True
    assert call("GET", "/v1/radio/queue").status == 403
    queue = call("GET", "/v1/radio/queue", subject=OWNER).body["items"]
    assert [(i["kind"], i["note"], i["transcript"]) for i in queue] == [("report", "rude", CALLED)]
    decided = call(
        "POST", f"/v1/radio/queue/report/{queue[0]['id']}", {"action": "remove"}, subject=OWNER
    )
    assert decided.status == 204
    assert call("GET", "/v1/radio").body["strikes"] == 1
    assert call("GET", f"/v1/radio/calls/{call_id}").body["status"] == "removed"
    assert call("POST", f"/v1/radio/episodes/{episode_id}/pull", subject=OWNER).status == 204
    assert call("GET", f"/v1/radio/episodes/{episode_id}").status == 404


def test_a_call_needs_joining_and_leaving_deletes_the_calls(
    call: Call,
    services: Services,
    text_model: ScriptedTextModel,
    directory: FakeAccountDirectory,
    radio_transcriber: ScriptedTranscriber,
    radio_starter: RecordingRadioStarter,
) -> None:
    adults(directory, USER)
    onboarded(call, text_model)
    refused = call("POST", "/v1/radio/calls", {"audio": AUDIO, "format": "m4a"})
    assert (refused.status, refused.body["error"]["code"]) == (409, "not_joined")
    call("PUT", "/v1/radio/profile", JOIN)
    too_long = call(
        "POST", "/v1/radio/calls", {"audio": AUDIO, "format": "m4a", "durationMs": 60000}
    )
    assert (too_long.status, too_long.body["error"]["code"]) == (422, "too_long")
    radio_transcriber.answers.append(CALLED)
    sent = call("POST", "/v1/radio/calls", {"audio": AUDIO, "format": "m4a"}).body
    run(services, radio_starter)
    assert call("DELETE", "/v1/radio/profile").status == 204
    assert call("GET", "/v1/radio").body["profile"] is None
    assert call("GET", f"/v1/radio/calls/{sent['id']}").body["transcript"] == ""


def test_every_radio_route_needs_a_signed_in_learner(call: Call, services: Services) -> None:
    from konvami_api.api.app import create_app

    any_id = "00000000-0000-4000-8000-000000000002"
    paths = create_app(services).openapi()["paths"]
    routes = [
        (method.upper(), path)
        for path, operations in paths.items()
        if path.startswith("/v1/radio")
        for method in operations
    ]
    assert len(routes) >= 18
    for method, path in routes:
        target = (
            path.replace("{episode_id}", any_id)
            .replace("{call_id}", any_id)
            .replace("{item_id}", any_id)
            .replace("{kind}", "held")
            .replace("{index}", "0")
        )
        response = call(method, target, {}, subject=None)
        assert response.status == 401, (method, path)


def test_the_last_token_of_a_deleted_account_cannot_call_in(call: Call) -> None:
    call("DELETE", "/v1/account")
    for method, path, body in [
        ("PUT", "/v1/radio/profile", JOIN),
        ("POST", "/v1/radio/calls", {"audio": AUDIO, "format": "m4a"}),
        ("DELETE", "/v1/radio/profile", None),
    ]:
        response = call(method, path, body)
        assert response.status == 401, (method, path)
