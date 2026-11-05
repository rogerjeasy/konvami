"""The course companion over HTTP (spec §6.17): bringing a text, a page or a photo, reading what
was made of it, turning words into cards, and removing it."""

from typing import Any
from uuid import UUID

from konvami_api.domain.accounts import upload_folder
from konvami_api.domain.course_import import FetchedPage, PageFetchError
from tests.api.conftest import USER, Call
from tests.api.test_api import onboarded
from tests.fakes import FakePageFetcher, InMemoryFileStore, ScriptedTextModel

TEXT = "Sehr geehrter Herr Amara, bitte bringen Sie bis zum 15. März Ihren Mietvertrag mit."
ANSWER: dict[str, Any] = {
    "in_language": True,
    "genre": "letter",
    "level": "A2",
    "title": "Brief vom Amt",
    "transcript": "",
    "summary": "A letter from the office.",
    "vocabulary": [
        {"word": "der Mietvertrag", "meaning": "the rental contract"},
        {"word": "mitbringen", "meaning": "to bring along"},
    ],
    "grammar": [{"point": "Polite imperative", "explanation": "« bringen Sie »"}],
    "hard_sentences": [{"sentence": "bitte bringen Sie … mit.", "explanation": "Separable verb."}],
    "letter": {
        "sender": "Das Einwohnermeldeamt",
        "says": "Bring your contract.",
        "to_do": ["Bring the contract by 15 March"],
        "reply_goal": "Agree on an appointment.",
    },
}
FIRST_ID = "ffffffff-ffff-4fff-8fff-000000000001"
JPEG = b"\xff\xd8\xff\xe0" + b"\x00" * 64


def brought(call: Call, text_model: ScriptedTextModel, **extra: Any) -> Any:
    made, _ = brought_with_partner(call, text_model, **extra)
    return made


def brought_with_partner(
    call: Call, text_model: ScriptedTextModel, **extra: Any
) -> tuple[Any, dict[str, Any]]:
    _, partner = onboarded(call, text_model)
    text_model.answers.append(ANSWER)
    return call("POST", "/v1/imports", {"kind": "text", "text": TEXT, **extra}), partner


def test_a_text_is_worked_out_and_listed(call: Call, text_model: ScriptedTextModel) -> None:
    made = brought(call, text_model, textbook="Menschen A2", chapter="Lektion 5")

    assert made.status == 200
    assert made.body == {
        "id": FIRST_ID,
        "kind": "text",
        "genre": "letter",
        "title": "Brief vom Amt",
        "source": None,
        "textbook": "Menschen A2",
        "chapter": "Lektion 5",
        "level": "A2",
        "summary": "A letter from the office.",
        "text": TEXT,
        "vocabulary": [
            {"word": "der Mietvertrag", "meaning": "the rental contract", "inDeck": False},
            {"word": "mitbringen", "meaning": "to bring along", "inDeck": False},
        ],
        "grammar": [{"point": "Polite imperative", "explanation": "« bringen Sie »"}],
        "hardSentences": [
            {"sentence": "bitte bringen Sie … mit.", "explanation": "Separable verb."}
        ],
        "letter": {
            "sender": "Das Einwohnermeldeamt",
            "says": "Bring your contract.",
            "toDo": ["Bring the contract by 15 March"],
            "replyGoal": "Agree on an appointment.",
        },
        "explainedIn": "en",
        "createdAt": "2026-10-09T12:00:00Z",
    }
    listed = call("GET", "/v1/imports")
    assert listed.body is not None
    assert listed.body["limit"] == 30
    assert listed.body["imports"] == [
        {
            "id": FIRST_ID,
            "kind": "text",
            "genre": "letter",
            "title": "Brief vom Amt",
            "textbook": "Menschen A2",
            "chapter": "Lektion 5",
            "level": "A2",
            "words": 2,
            "createdAt": "2026-10-09T12:00:00Z",
        }
    ]
    assert call("GET", f"/v1/imports/{FIRST_ID}").body == made.body


def test_a_page_is_read_by_its_address(
    call: Call, text_model: ScriptedTextModel, pages: FakePageFetcher
) -> None:
    onboarded(call, text_model)
    pages.pages["https://example.org/a"] = FetchedPage("Seite", TEXT)
    text_model.answers.append(ANSWER)

    made = call("POST", "/v1/imports", {"kind": "link", "url": "https://example.org/a"})

    assert made.status == 200
    assert made.body is not None
    assert (made.body["kind"], made.body["source"]) == ("link", "https://example.org/a")


def test_a_page_that_may_not_be_visited_is_refused(
    call: Call, text_model: ScriptedTextModel, pages: FakePageFetcher
) -> None:
    onboarded(call, text_model)
    pages.pages["http://169.254.169.254/"] = PageFetchError("blocked")

    refused = call("POST", "/v1/imports", {"kind": "link", "url": "http://169.254.169.254/"})

    assert refused.status == 422
    assert refused.body == {"error": {"code": "blocked", "field": None}}


def test_a_photo_is_sent_with_a_form_then_read_and_deleted(
    call: Call, text_model: ScriptedTextModel, files: InMemoryFileStore
) -> None:
    onboarded(call, text_model)

    form = call("POST", "/v1/imports/upload")
    assert form.status == 200
    assert form.body is not None
    upload_id = form.body["uploadId"]
    files.save(f"{upload_folder(UUID(USER))}import-{upload_id}.jpg", JPEG, "image/jpeg")
    text_model.answers.append({**ANSWER, "transcript": TEXT})
    made = call("POST", "/v1/imports", {"kind": "photo", "uploadId": upload_id})

    assert made.status == 200
    assert made.body is not None
    assert (made.body["kind"], made.body["text"]) == ("photo", TEXT)
    assert files.keys() == []


def test_a_photo_nobody_sent_is_not_found(call: Call, text_model: ScriptedTextModel) -> None:
    onboarded(call, text_model)
    form = call("POST", "/v1/imports/upload")
    assert form.body is not None

    missing = call("POST", "/v1/imports", {"kind": "photo", "uploadId": form.body["uploadId"]})

    assert missing.status == 404
    assert missing.body == {"error": {"code": "upload_not_found", "field": None}}


def test_a_photo_without_its_upload_is_refused(call: Call, text_model: ScriptedTextModel) -> None:
    onboarded(call, text_model)

    assert call("POST", "/v1/imports", {"kind": "photo"}).status == 422


def test_text_that_is_too_short_is_refused(call: Call, text_model: ScriptedTextModel) -> None:
    onboarded(call, text_model)

    refused = call("POST", "/v1/imports", {"kind": "text", "text": "kurz"})

    assert refused.status == 422
    assert refused.body == {"error": {"code": "invalid_value", "field": None}}


def test_material_in_another_language_is_refused(call: Call, text_model: ScriptedTextModel) -> None:
    onboarded(call, text_model)
    text_model.answers.append({**ANSWER, "in_language": False})

    refused = call("POST", "/v1/imports", {"kind": "text", "text": TEXT})

    assert refused.status == 422
    assert refused.body == {"error": {"code": "not_in_language", "field": None}}


def test_a_word_becomes_a_flashcard(call: Call, text_model: ScriptedTextModel) -> None:
    brought(call, text_model)

    card = call("POST", f"/v1/imports/{FIRST_ID}/words/1/card")

    assert card.status == 200
    assert card.body is not None
    assert (card.body["kind"], card.body["front"], card.body["back"]) == (
        "word",
        "mitbringen",
        "to bring along",
    )
    detail = call("GET", f"/v1/imports/{FIRST_ID}").body
    assert detail is not None
    assert [word["inDeck"] for word in detail["vocabulary"]] == [False, True]


def test_a_word_that_is_not_there_is_not_found(call: Call, text_model: ScriptedTextModel) -> None:
    brought(call, text_model)

    assert call("POST", f"/v1/imports/{FIRST_ID}/words/5/card").status == 404


def test_an_import_can_be_removed(call: Call, text_model: ScriptedTextModel) -> None:
    brought(call, text_model)

    removed = call("DELETE", f"/v1/imports/{FIRST_ID}")

    assert removed.status == 200
    assert removed.body == {"imports": [], "limit": 30}
    assert call("GET", f"/v1/imports/{FIRST_ID}").status == 404
    assert call("DELETE", f"/v1/imports/{FIRST_ID}").status == 404


def test_a_call_about_an_import_starts_with_the_import_in_its_plan(
    call: Call, text_model: ScriptedTextModel
) -> None:
    _, partner = brought_with_partner(call, text_model)
    key = FIRST_ID.replace("-", "")

    started = call(
        "POST",
        "/v1/voice/calls",
        {
            "purpose": "practice",
            "sdp": "v=0 offer",
            "personaId": partner["id"],
            "practise": f"letter:{key}",
        },
    )

    assert started.status == 200
    assert started.body is not None
    plan = started.body["plan"]
    assert (plan["material"], plan["rehearse"]) == ("Brief vom Amt", True)


def test_a_call_about_an_import_the_learner_lacks_is_not_found(
    call: Call, text_model: ScriptedTextModel
) -> None:
    _, partner = onboarded(call, text_model)

    started = call(
        "POST",
        "/v1/voice/calls",
        {
            "purpose": "practice",
            "sdp": "v=0 offer",
            "personaId": partner["id"],
            "practise": "import:" + "0" * 32,
        },
    )

    assert started.status == 404
