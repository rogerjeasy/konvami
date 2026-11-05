"""Feedback from the learner and the owner's inbox (spec §6.21.4)."""

from konvami_api.domain.feedback import MAX_FEEDBACK_PER_DAY, MAX_MESSAGE_LENGTH
from tests.api.conftest import OWNER, USER, Call

FEEDBACK = "/v1/feedback"
DEVICE = {"appVersion": "0.1.0", "platform": "ios", "osVersion": "19.1"}


def test_a_message_is_stored_without_the_device_unless_it_is_sent(call: Call) -> None:
    sent = call("POST", FEEDBACK, {"category": "idea", "message": "  A dark mode switch  "})
    inbox = call("GET", "/v1/owner/feedback", subject=OWNER).body["messages"]

    assert sent.status == 200
    assert sent.body["category"] == "idea"
    # The learner is told nothing of the message back, and the owner sees nobody's name.
    assert "message" not in sent.body
    assert [(m["message"], m["device"], m["status"]) for m in inbox] == [
        ("A dark mode switch", None, "open")
    ]
    assert "user_id" not in inbox[0]


def test_the_device_and_app_version_arrive_when_the_learner_sends_them(call: Call) -> None:
    call("POST", FEEDBACK, {"category": "bug", "message": "The call drops", "device": DEVICE})

    inbox = call("GET", "/v1/owner/feedback", subject=OWNER).body["messages"]

    assert inbox[0]["device"] == DEVICE


def test_an_empty_or_too_long_message_is_refused(call: Call) -> None:
    empty = call("POST", FEEDBACK, {"category": "bug", "message": "   "})
    long = call("POST", FEEDBACK, {"category": "bug", "message": "x" * (MAX_MESSAGE_LENGTH + 1)})

    assert empty.status == 422
    assert long.status == 422
    assert call("GET", "/v1/owner/feedback", subject=OWNER).body["messages"] == []


def test_a_learner_can_send_only_so_many_messages_a_day(call: Call) -> None:
    for number in range(MAX_FEEDBACK_PER_DAY):
        assert (
            call("POST", FEEDBACK, {"category": "other", "message": f"No. {number}"}).status == 200
        )

    over = call("POST", FEEDBACK, {"category": "other", "message": "One more"})

    assert (over.status, over.body["error"]["code"]) == (429, "feedback_limit")


def test_only_the_owner_reads_the_inbox(call: Call) -> None:
    call("POST", FEEDBACK, {"category": "bug", "message": "Hello"})

    inbox = call("GET", "/v1/owner/feedback")
    close = call("PUT", f"/v1/owner/feedback/{USER}", {"status": "done"})

    assert (inbox.status, inbox.body["error"]["code"]) == (403, "not_owner")
    assert close.status == 403


def test_the_owner_marks_a_message_done_and_opens_it_again(call: Call) -> None:
    call("POST", FEEDBACK, {"category": "bug", "message": "Hello"})
    message = call("GET", "/v1/owner/feedback", subject=OWNER).body["messages"][0]

    done = call("PUT", f"/v1/owner/feedback/{message['id']}", {"status": "done"}, subject=OWNER)
    open_list = call("GET", "/v1/owner/feedback", subject=OWNER).body["messages"]
    done_list = call("GET", "/v1/owner/feedback?status=done", subject=OWNER).body["messages"]
    reopened = call("PUT", f"/v1/owner/feedback/{message['id']}", {"status": "open"}, subject=OWNER)

    assert (done.body["status"], done.body["resolvedAt"] is not None) == ("done", True)
    assert open_list == []
    assert [m["id"] for m in done_list] == [message["id"]]
    assert (reopened.body["status"], reopened.body["resolvedAt"]) == ("open", None)
    missing = call("PUT", f"/v1/owner/feedback/{USER}", {"status": "done"}, subject=OWNER)
    assert missing.status == 404
