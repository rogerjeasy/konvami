"""Memory over HTTP: what the "What my buddy knows" screen reads and changes (spec §6.11)."""

from datetime import date, datetime
from typing import Any
from uuid import UUID

import pytest

from konvami_api.domain.memories import MAX_MEMORIES, Memory, memory_key
from tests.api.conftest import OTHER_USER, USER, Call
from tests.api.test_api import NOON, onboarded
from tests.fakes import InMemoryMemoryRepository, ScriptedTextModel

FIRST_ID = "eeeeeeee-eeee-4eee-8eee-000000000001"
SECOND_ID = "eeeeeeee-eeee-4eee-8eee-000000000002"


def kept(
    store: InMemoryMemoryRepository,
    number: int,
    text: str,
    *,
    user: str = USER,
    at: datetime = NOON,
    **fields: Any,
) -> None:
    """A memory in storage, as the worker writes it down after a conversation."""
    memory = Memory(
        id=UUID(f"eeeeeeee-eeee-4eee-8eee-{number:012d}"),
        kind=fields.get("kind", "fact"),
        text=text,
        day=fields.get("day"),
        importance=2,
        persona_id=fields.get("persona_id"),
        source_call_id=None,
        created_at=at,
        updated_at=at,
    )
    assert store.add(UUID(user), memory_key(text), memory, MAX_MEMORIES)


def test_a_learner_reads_what_their_partners_know(
    call: Call, memory_store: InMemoryMemoryRepository
) -> None:
    kept(memory_store, 1, "Has a job interview.", kind="event", day=date(2026, 10, 16))

    response = call("GET", "/v1/memories")

    assert response.status == 200
    assert response.body == {
        "enabled": True,
        "avoidTopics": [],
        "memories": [
            {
                "id": FIRST_ID,
                "kind": "event",
                "text": "Has a job interview.",
                "day": "2026-10-16",
                "partnerId": None,
                "partnerName": None,
                "createdAt": "2026-10-09T12:00:00Z",
                "updatedAt": "2026-10-09T12:00:00Z",
            }
        ],
    }


def test_a_learner_reads_only_their_own_memories(
    call: Call, memory_store: InMemoryMemoryRepository
) -> None:
    kept(memory_store, 1, "Lives in Zurich.")

    assert call("GET", "/v1/memories", subject=OTHER_USER).body["memories"] == []


def test_what_belongs_to_a_partner_carries_their_name(
    call: Call, text_model: ScriptedTextModel, memory_store: InMemoryMemoryRepository
) -> None:
    lena, _ = onboarded(call, text_model)
    kept(
        memory_store,
        1,
        "Lena told about her cat.",
        kind="relationship",
        persona_id=UUID(lena["id"]),
    )
    kept(memory_store, 2, "Lives in Zurich.")

    by_text = {memory["text"]: memory for memory in call("GET", "/v1/memories").body["memories"]}

    assert (
        by_text["Lena told about her cat."]["partnerId"],
        by_text["Lena told about her cat."]["partnerName"],
    ) == (lena["id"], "Lena")
    assert by_text["Lives in Zurich."]["partnerName"] is None


def test_what_belonged_to_a_partner_who_is_not_listed_has_no_name(
    call: Call, memory_store: InMemoryMemoryRepository
) -> None:
    # A learner who has no partners (any more) in the language they are learning now.
    gone = UUID("aaaaaaaa-aaaa-4aaa-8aaa-000000000009")
    kept(memory_store, 1, "Lena told about her cat.", kind="relationship", persona_id=gone)

    (memory,) = call("GET", "/v1/memories").body["memories"]

    assert (memory["partnerId"], memory["partnerName"]) == (str(gone), None)


def test_memory_is_turned_off_and_on(call: Call, memory_store: InMemoryMemoryRepository) -> None:
    kept(memory_store, 1, "Lives in Zurich.")

    off = call("PATCH", "/v1/memories", {"enabled": False})

    assert off.status == 200
    assert off.body["enabled"] is False
    # Turning it off deletes nothing.
    assert [memory["id"] for memory in off.body["memories"]] == [FIRST_ID]
    assert call("GET", "/v1/memories").body["enabled"] is False
    assert call("PATCH", "/v1/memories", {"enabled": True}).body["enabled"] is True


def test_topics_are_put_off_limits(call: Call) -> None:
    named = call("PATCH", "/v1/memories", {"avoidTopics": [" Politics ", "my ex"]})

    assert named.status == 200
    assert named.body["avoidTopics"] == ["Politics", "my ex"]
    # A setting that is not named is left as it is.
    assert call("PATCH", "/v1/memories", {"enabled": False}).body["avoidTopics"] == [
        "Politics",
        "my ex",
    ]
    assert call("PATCH", "/v1/memories", {"avoidTopics": []}).body["avoidTopics"] == []


@pytest.mark.parametrize(
    ("body", "error"),
    [
        (
            {"avoidTopics": ["Politics", "politics"]},
            {"code": "invalid_value", "field": "avoid_topics"},
        ),
        ({"avoidTopics": ["   "]}, {"code": "invalid_value", "field": "avoid_topics"}),
        ({"avoidTopics": ["x" * 61]}, {"code": "invalid_request", "field": None}),
        (
            {"avoidTopics": [f"topic {n}" for n in range(11)]},
            {"code": "invalid_request", "field": None},
        ),
        ({"avoidTopics": "politics"}, {"code": "invalid_request", "field": None}),
        ({"enabled": "no"}, {"code": "invalid_request", "field": None}),
        ({"memories": []}, {"code": "invalid_request", "field": None}),
    ],
)
def test_settings_that_cannot_be_kept_are_refused(
    call: Call, body: dict[str, Any], error: dict[str, Any]
) -> None:
    call("PATCH", "/v1/memories", {"avoidTopics": ["Politics"]})

    response = call("PATCH", "/v1/memories", body)

    assert (response.status, response.body) == (422, {"error": error})
    assert call("GET", "/v1/memories").body["avoidTopics"] == ["Politics"]


def test_a_memory_is_put_in_the_learners_own_words(
    call: Call, memory_store: InMemoryMemoryRepository
) -> None:
    kept(memory_store, 1, "Has a job interview.", kind="event", day=date(2026, 10, 16))

    response = call("PATCH", f"/v1/memories/{FIRST_ID}", {"text": "  Interview at Planzer.  "})

    assert response.status == 200
    assert response.body == {
        "id": FIRST_ID,
        "kind": "event",
        "text": "Interview at Planzer.",
        "day": "2026-10-16",
        "partnerId": None,
        "partnerName": None,
        "createdAt": "2026-10-09T12:00:00Z",
        "updatedAt": "2026-10-09T12:00:00Z",
    }
    assert call("GET", "/v1/memories").body["memories"] == [response.body]


def test_an_event_is_moved_to_another_day_or_loses_its_day(
    call: Call, memory_store: InMemoryMemoryRepository
) -> None:
    kept(memory_store, 1, "Has a job interview.", kind="event", day=date(2026, 10, 16))

    moved = call("PATCH", f"/v1/memories/{FIRST_ID}", {"day": "2026-10-23"})

    assert (moved.body["day"], moved.body["text"]) == ("2026-10-23", "Has a job interview.")
    assert call("PATCH", f"/v1/memories/{FIRST_ID}", {"day": None}).body["day"] is None


@pytest.mark.parametrize(
    ("memory", "body", "status", "code"),
    [
        (FIRST_ID, {"text": "   "}, 422, "invalid_value"),
        (FIRST_ID, {"text": "x" * 201}, 422, "invalid_request"),
        (FIRST_ID, {"text": None}, 422, "invalid_request"),
        (FIRST_ID, {"text": "Likes football!"}, 409, "duplicate"),
        # Only an event is on a day.
        (FIRST_ID, {"day": "2026-10-23"}, 422, "invalid_value"),
        (FIRST_ID, {"day": "next Friday"}, 422, "invalid_request"),
        (FIRST_ID, {"kind": "event"}, 422, "invalid_request"),
        ("eeeeeeee-eeee-4eee-8eee-000000000009", {"text": "Lives in Bern."}, 404, "not_found"),
        ("not-an-id", {"text": "Lives in Bern."}, 422, "invalid_request"),
    ],
)
def test_a_change_that_cannot_be_made_is_refused_with_the_reason(
    call: Call,
    memory_store: InMemoryMemoryRepository,
    memory: str,
    body: dict[str, Any],
    status: int,
    code: str,
) -> None:
    kept(memory_store, 1, "Lives in Zurich.")
    kept(memory_store, 2, "Likes football.")

    response = call("PATCH", f"/v1/memories/{memory}", body)

    assert (response.status, response.body["error"]["code"]) == (status, code)
    assert {m["text"] for m in call("GET", "/v1/memories").body["memories"]} == {
        "Lives in Zurich.",
        "Likes football.",
    }


def test_a_memory_is_forgotten(call: Call, memory_store: InMemoryMemoryRepository) -> None:
    kept(memory_store, 1, "Lives in Zurich.")
    kept(memory_store, 2, "Likes football.")

    response = call("DELETE", f"/v1/memories/{FIRST_ID}")

    assert response.status == 200
    assert [memory["id"] for memory in response.body["memories"]] == [SECOND_ID]
    assert call("DELETE", f"/v1/memories/{FIRST_ID}").status == 404


def test_nobody_changes_or_forgets_what_is_someone_elses(
    call: Call, memory_store: InMemoryMemoryRepository
) -> None:
    kept(memory_store, 1, "Lives in Zurich.")

    changed = call("PATCH", f"/v1/memories/{FIRST_ID}", {"text": "Mine now."}, subject=OTHER_USER)
    removed = call("DELETE", f"/v1/memories/{FIRST_ID}", subject=OTHER_USER)

    assert (changed.status, removed.status) == (404, 404)
    assert [memory["text"] for memory in call("GET", "/v1/memories").body["memories"]] == [
        "Lives in Zurich."
    ]


def test_memories_are_for_signed_in_learners(call: Call) -> None:
    assert call("GET", "/v1/memories", subject=None).status == 401
