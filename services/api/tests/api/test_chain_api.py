"""The story chain over HTTP (section 9): joining, a story with AI characters from the first line
to the radio play, a held line in the owner's queue, a friend's code, and who reaches what."""

import base64
from dataclasses import replace
from uuid import UUID

from konvami_api.api.app import Services
from tests.api.conftest import OTHER_USER, OWNER, USER, Call, Response
from tests.api.test_api import ESSENTIALS, onboarded
from tests.chain_fake import FakeNarrator, RecordingChainStarter
from tests.fakes import FakeAccountDirectory, ScriptedTextModel, ScriptedTranscriber

AUDIO = base64.b64encode(b"\x00\x01" * 400).decode()
JOIN = {"veilDefault": False, "voiceConsent": True}
AI = {"seats": [{"kind": "ai"}, {"kind": "ai"}, {"kind": "ai"}]}


def adults(directory: FakeAccountDirectory) -> None:
    for user in (USER, OTHER_USER):
        account = directory.accounts[UUID(user)]
        directory.accounts[UUID(user)] = replace(account, age_bracket="25-34", voice_consent=True)


def run(services: Services, starter: RecordingChainStarter) -> None:
    """Does what the worker would."""
    while starter.jobs:
        job, item = starter.jobs.pop(0)
        if job == "check":
            services.chain.check(item)
        elif job == "ai":
            services.chain.play_ai(item)
        elif job == "opening":
            services.chain.speak_opening(item)
        else:
            services.chain.make_play(item)


def onboard_other(call: Call, text_model: ScriptedTextModel) -> None:
    def as_other(method: str, path: str, body: object = None) -> Response:
        return call(method, path, body, subject=OTHER_USER)

    as_other("PATCH", "/v1/profile", {"changes": ESSENTIALS})
    as_other("POST", "/v1/onboarding/essentials/confirm")
    as_other("POST", "/v1/placement/skip")
    text_model.answers.append({"personas": []})
    as_other("POST", "/v1/personas/starter")
    as_other("POST", "/v1/onboarding/partners/confirm")
    as_other("POST", "/v1/onboarding/complete")


def test_the_hub_says_whether_it_is_open_and_lists_the_openings(call: Call) -> None:
    hub = call("GET", "/v1/chain")
    assert hub.status == 200
    assert hub.body["available"] is True
    assert hub.body["profile"] is None
    assert len(hub.body["openings"]) == 6
    assert (hub.body["lines"], hub.body["lineSeconds"]) == (8, 45)


def test_joining_needs_the_voice_sharing_consent(call: Call) -> None:
    refused = call("PUT", "/v1/chain/profile", {**JOIN, "voiceConsent": False})
    assert (refused.status, refused.body["error"]["code"]) == (403, "consent_required")
    joined = call("PUT", "/v1/chain/profile", JOIN)
    assert joined.body["profile"]["band"] == "minor"
    changed = call("PATCH", "/v1/chain/profile", {"veilDefault": True})
    assert changed.body["profile"]["veilDefault"] is True


def test_a_story_with_ai_characters_from_the_first_line_to_the_radio_play(
    call: Call,
    services: Services,
    text_model: ScriptedTextModel,
    chain_transcriber: ScriptedTranscriber,
    chain_starter: RecordingChainStarter,
) -> None:
    onboarded(call, text_model)
    call("PUT", "/v1/chain/profile", JOIN)
    started = call("POST", "/v1/chain/stories", {"openingId": "night-train", **AI})
    assert started.status == 200
    story_id = started.body["id"]
    run(services, chain_starter)
    story = call("GET", f"/v1/chain/stories/{story_id}").body
    assert story["myTurn"] is True
    assert story["before"]["kind"] == "narrator"
    assert story["before"]["hasAudio"] is True
    assert call("GET", f"/v1/chain/stories/{story_id}/opening/audio").status == 200

    for words in ("Ich sehe einen Mann mit einem Hut", "Der Mann hat den Koffer gestohlen"):
        chain_transcriber.answers.append(words)
        sent = call(
            "POST", f"/v1/chain/stories/{story_id}/lines", {"audio": AUDIO, "format": "m4a"}
        )
        assert sent.body["status"] == "checking"
        run(services, chain_starter)

    story = call("GET", f"/v1/chain/stories/{story_id}").body
    assert story["status"] == "done"
    lines = [p for p in story["play"] if p["kind"] == "line"]
    assert len(lines) == 8
    assert lines[0]["mine"] is True
    assert lines[1]["ai"] is True
    assert call("GET", f"/v1/chain/lines/{lines[1]['lineId']}/audio").status == 200
    reacted = call("POST", f"/v1/chain/stories/{story_id}/reaction", {"reaction": "laughed"})
    assert reacted.body["reactions"]["laughed"] == 1
    assert reacted.body["myReaction"] == "laughed"


def test_a_held_line_reaches_the_owners_queue(
    call: Call,
    services: Services,
    text_model: ScriptedTextModel,
    chain_transcriber: ScriptedTranscriber,
    chain_starter: RecordingChainStarter,
    chain_narrator: FakeNarrator,
) -> None:
    onboarded(call, text_model)
    call("PUT", "/v1/chain/profile", JOIN)
    story_id = call("POST", "/v1/chain/stories", AI).body["id"]
    chain_narrator.labels.append(("romance",))
    chain_transcriber.answers.append("Du hast eine sehr schöne Stimme")
    line = call("POST", f"/v1/chain/stories/{story_id}/lines", {"audio": AUDIO, "format": "m4a"})
    run(services, chain_starter)
    mine = call("GET", f"/v1/chain/stories/{story_id}").body["mine"][0]
    assert (mine["status"], mine["reasons"]) == ("held", ["romance"])
    assert call("GET", "/v1/chain/queue").status == 403
    queue = call("GET", "/v1/chain/queue", subject=OWNER).body["items"]
    assert [(i["kind"], i["moveId"]) for i in queue] == [("held", line.body["id"])]
    decided = call(
        "POST", f"/v1/chain/queue/held/{line.body['id']}", {"action": "remove"}, subject=OWNER
    )
    assert decided.status == 204
    assert call("GET", "/v1/chain").body["profile"]["strikes"] == 1


def test_a_friend_takes_a_seat_by_code_hears_the_line_before_and_reports_it(
    call: Call,
    services: Services,
    text_model: ScriptedTextModel,
    directory: FakeAccountDirectory,
    chain_transcriber: ScriptedTranscriber,
    chain_starter: RecordingChainStarter,
) -> None:
    adults(directory)
    onboarded(call, text_model)
    text_model.answers.clear()
    onboard_other(call, text_model)
    call("PUT", "/v1/chain/profile", JOIN)
    call("PUT", "/v1/chain/profile", JOIN, subject=OTHER_USER)
    seats = {"seats": [{"kind": "friend"}, {"kind": "ai"}, {"kind": "ai"}]}
    story = call("POST", "/v1/chain/stories", seats).body
    code = story["inviteCode"]
    assert story["canFill"] is True
    joined = call("POST", "/v1/chain/invites/redeem", {"code": code.lower()}, subject=OTHER_USER)
    assert joined.status == 200
    assert joined.body["mySeat"] == 2

    chain_transcriber.answers.append("Ich sehe einen Mann mit einem Hut")
    line = call("POST", f"/v1/chain/stories/{story['id']}/lines", {"audio": AUDIO, "format": "m4a"})
    run(services, chain_starter)
    theirs = call("GET", f"/v1/chain/stories/{story['id']}", subject=OTHER_USER).body
    assert theirs["myTurn"] is True
    assert theirs["before"]["id"] == line.body["id"]
    reported = call(
        "POST",
        f"/v1/chain/lines/{line.body['id']}/report",
        {"reason": "harassment"},
        subject=OTHER_USER,
    )
    assert reported.body["before"]["hidden"] is True
    blocked = call(
        "POST", f"/v1/chain/stories/{story['id']}/block", {"seat": 1}, subject=OTHER_USER
    )
    assert blocked.status == 200
    assert call("GET", f"/v1/chain/stories/{story['id']}").status == 404


def test_minors_play_with_ai_characters_only(call: Call, text_model: ScriptedTextModel) -> None:
    onboarded(call, text_model)
    call("PUT", "/v1/chain/profile", JOIN)
    seats = {"seats": [{"kind": "friend"}, {"kind": "ai"}, {"kind": "ai"}]}
    refused = call("POST", "/v1/chain/stories", seats)
    assert (refused.status, refused.body["error"]["code"]) == (403, "adults_only")
    missing = call("POST", "/v1/chain/invites/redeem", {"code": "ZZZZZZ"})
    assert (missing.status, missing.body["error"]["code"]) == (404, "not_found")


def test_a_learner_reaches_only_their_own_stories(
    call: Call,
    services: Services,
    text_model: ScriptedTextModel,
    chain_transcriber: ScriptedTranscriber,
    chain_starter: RecordingChainStarter,
) -> None:
    onboarded(call, text_model)
    call("PUT", "/v1/chain/profile", JOIN)
    story_id = call("POST", "/v1/chain/stories", AI).body["id"]
    chain_transcriber.answers.append("Ich sehe einen Mann mit einem Hut")
    line = call("POST", f"/v1/chain/stories/{story_id}/lines", {"audio": AUDIO, "format": "m4a"})
    run(services, chain_starter)
    call("PUT", "/v1/chain/profile", JOIN, subject=OTHER_USER)
    line_id = line.body["id"]
    elsewhere: list[tuple[str, str, object]] = [
        ("GET", f"/v1/chain/stories/{story_id}", None),
        ("POST", f"/v1/chain/stories/{story_id}/lines", {"audio": AUDIO, "format": "m4a"}),
        ("POST", f"/v1/chain/stories/{story_id}/fill", None),
        ("POST", f"/v1/chain/stories/{story_id}/invite", None),
        ("POST", f"/v1/chain/stories/{story_id}/reaction", {"reaction": "loved"}),
        ("POST", f"/v1/chain/stories/{story_id}/leave", None),
        ("POST", f"/v1/chain/stories/{story_id}/block", {"seat": 1}),
        ("GET", f"/v1/chain/stories/{story_id}/opening/audio", None),
        ("GET", f"/v1/chain/stories/{story_id}/play/0/audio", None),
        ("GET", f"/v1/chain/lines/{line_id}/audio", None),
        ("POST", f"/v1/chain/lines/{line_id}/report", {"reason": "other"}),
        ("POST", f"/v1/chain/lines/{line_id}/corrections/0/card", None),
        (
            "POST",
            f"/v1/chain/lines/{line_id}/corrections/0/retry",
            {"audio": AUDIO, "format": "m4a"},
        ),
    ]
    for method, path, body in elsewhere:
        response = call(method, path, body, subject=OTHER_USER)
        assert response.status == 404, (method, path)
    assert call("POST", f"/v1/chain/lines/{line_id}/report", {"reason": "other"}).status == 404


def test_every_story_chain_route_needs_a_signed_in_learner(call: Call, services: Services) -> None:
    from konvami_api.api.app import create_app

    any_id = "00000000-0000-4000-8000-000000000002"
    paths = create_app(services).openapi()["paths"]
    routes = [
        (method.upper(), path)
        for path, operations in paths.items()
        if path.startswith("/v1/chain")
        for method in operations
    ]
    assert len(routes) >= 22
    for method, path in routes:
        target = (
            path.replace("{story_id}", any_id)
            .replace("{line_id}", any_id)
            .replace("{block_id}", any_id)
            .replace("{item_id}", any_id)
            .replace("{kind}", "held")
            .replace("{index}", "0")
        )
        response = call(method, target, {}, subject=None)
        assert response.status == 401, (method, path)


def test_the_last_token_of_a_deleted_account_cannot_play(call: Call) -> None:
    call("PUT", "/v1/chain/profile", JOIN)
    call("DELETE", "/v1/account")
    for method, path, body in [
        ("PUT", "/v1/chain/profile", JOIN),
        ("POST", "/v1/chain/stories", AI),
        ("DELETE", "/v1/chain/profile", None),
    ]:
        assert call(method, path, body).status == 401, (method, path)
