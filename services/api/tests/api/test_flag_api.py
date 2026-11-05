"""Reporting an AI turn or a correction (spec §6.21.3, §16.1) and the owner's review queue."""

from konvami_api.api.app import Services
from tests.api.conftest import OTHER_USER, OWNER, USER, Call
from tests.api.test_report_api import ANALYSIS, REVIEW, talked
from tests.fakes import InMemoryVoiceSessionRepository, ScriptedTextModel

FLAGS = "/v1/conversations/rtc_1/flags"


def reported(
    call: Call,
    text_model: ScriptedTextModel,
    calls: InMemoryVoiceSessionRepository,
    services: Services,
) -> None:
    """`rtc_1` with its report: a confirmed Perfekt mistake (0), an unconfirmed dative one (1)."""
    talked(call, text_model, calls)
    call("POST", "/v1/conversations/rtc_1/report")
    text_model.answers += [ANALYSIS, REVIEW]
    services.reports.write("rtc_1")


def test_a_partner_line_can_be_reported_and_is_listed(
    call: Call, text_model: ScriptedTextModel, calls: InMemoryVoiceSessionRepository
) -> None:
    talked(call, text_model, calls)

    response = call("PUT", FLAGS, {"kind": "turn", "index": 2, "reason": "wrong", "note": " hm "})

    assert response.status == 200
    assert {key: response.body[key] for key in ("kind", "index", "reason", "note", "status")} == {
        "kind": "turn",
        "index": 2,
        "reason": "wrong",
        "note": "hm",
        "status": "open",
    }
    assert call("GET", FLAGS).body["flags"] == [response.body]


def test_reporting_a_line_again_changes_the_reason_and_keeps_one_flag(
    call: Call, text_model: ScriptedTextModel, calls: InMemoryVoiceSessionRepository
) -> None:
    talked(call, text_model, calls)
    first = call("PUT", FLAGS, {"kind": "turn", "index": 0, "reason": "wrong"})

    second = call("PUT", FLAGS, {"kind": "turn", "index": 0, "reason": "offensive"})

    assert second.body["id"] == first.body["id"]
    assert [flag["reason"] for flag in call("GET", FLAGS).body["flags"]] == ["offensive"]


def test_only_a_partners_line_can_be_reported_as_a_turn(
    call: Call, text_model: ScriptedTextModel, calls: InMemoryVoiceSessionRepository
) -> None:
    talked(call, text_model, calls)

    learner_line = call("PUT", FLAGS, {"kind": "turn", "index": 1, "reason": "wrong"})
    past_the_end = call("PUT", FLAGS, {"kind": "turn", "index": 9, "reason": "wrong"})

    assert (learner_line.status, learner_line.body["error"]["code"]) == (404, "not_found")
    assert past_the_end.status == 404


def test_i_didnt_say_that_is_for_corrections_only(
    call: Call,
    text_model: ScriptedTextModel,
    calls: InMemoryVoiceSessionRepository,
    services: Services,
) -> None:
    reported(call, text_model, calls, services)

    on_turn = call("PUT", FLAGS, {"kind": "turn", "index": 0, "reason": "not_said"})
    on_correction = call("PUT", FLAGS, {"kind": "correction", "index": 0, "reason": "not_said"})

    assert (on_turn.status, on_turn.body["error"]["code"]) == (422, "invalid_value")
    assert on_correction.status == 200


def test_a_correction_the_report_does_not_have_cannot_be_reported(
    call: Call, text_model: ScriptedTextModel, calls: InMemoryVoiceSessionRepository
) -> None:
    talked(call, text_model, calls)

    response = call("PUT", FLAGS, {"kind": "correction", "index": 0, "reason": "wrong"})

    assert response.status == 404


def test_a_note_that_is_too_long_is_refused(
    call: Call, text_model: ScriptedTextModel, calls: InMemoryVoiceSessionRepository
) -> None:
    talked(call, text_model, calls)

    response = call(
        "PUT", FLAGS, {"kind": "turn", "index": 0, "reason": "other", "note": "x" * 501}
    )

    assert response.status == 422


def test_a_conversation_of_another_learner_cannot_be_reported(
    call: Call, text_model: ScriptedTextModel, calls: InMemoryVoiceSessionRepository
) -> None:
    talked(call, text_model, calls)

    response = call(
        "PUT", FLAGS, {"kind": "turn", "index": 0, "reason": "wrong"}, subject=OTHER_USER
    )

    assert response.status == 404
    assert call("GET", FLAGS, subject=OTHER_USER).status == 404


def test_a_learner_cannot_read_the_queue_or_close_a_flag(call: Call) -> None:
    queue = call("GET", "/v1/owner/flags")
    close = call("PUT", f"/v1/owner/flags/{USER}", {"status": "dismissed"})

    assert (queue.status, queue.body["error"]["code"]) == (403, "not_owner")
    assert close.status == 403


def test_the_owner_reads_open_flags_with_the_flagged_text_and_closes_them(
    call: Call,
    text_model: ScriptedTextModel,
    calls: InMemoryVoiceSessionRepository,
    services: Services,
) -> None:
    reported(call, text_model, calls, services)
    call("PUT", FLAGS, {"kind": "turn", "index": 2, "reason": "offensive"})
    call("PUT", FLAGS, {"kind": "correction", "index": 1, "reason": "wrong"})

    queue = call("GET", "/v1/owner/flags", subject=OWNER).body["flags"]
    unsure = ANALYSIS["mistakes"][1]

    assert {flag["kind"]: flag["excerpt"] for flag in queue} == {
        "turn": "Oh, schön! Was hast du in Berlin gemacht?",
        "correction": f"{unsure['original']} → {unsure['corrected']}",
    }
    assert "userId" not in queue[0]

    closed = call("PUT", f"/v1/owner/flags/{queue[0]['id']}", {"status": "resolved"}, subject=OWNER)

    assert closed.status == 200
    assert (closed.body["status"], closed.body["resolvedAt"] is not None) == ("resolved", True)
    assert len(call("GET", "/v1/owner/flags", subject=OWNER).body["flags"]) == 1
    everything = call("GET", "/v1/owner/flags?status=resolved", subject=OWNER).body["flags"]
    assert [flag["id"] for flag in everything] == [queue[0]["id"]]


def test_closing_a_flag_that_does_not_exist_is_not_found(call: Call) -> None:
    missing = "99999999-9999-4999-8999-999999999999"

    response = call("PUT", f"/v1/owner/flags/{missing}", {"status": "dismissed"}, subject=OWNER)

    assert response.status == 404
