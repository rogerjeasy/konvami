"""Deleting an account from the web, without the app (spec §6.21.3), and its page."""

import re
from typing import Any
from uuid import UUID

from mangum import Mangum

from konvami_api.api.app import Services, create_app
from konvami_api.api.deletion_page import LANGUAGES, MESSAGE_KEYS, TEXT
from tests.api.conftest import OTHER_USER, USER, Call, http_api_event
from tests.fakes import FakeAccountDirectory, FakeEmailProof, InMemoryFileStore

ASK = "/public/delete-account/request"
CONFIRM = "/public/delete-account/confirm"
EMAIL = "amara.diallo@mail.com"
CODE = FakeEmailProof.CODE


def page(
    services: Services, target: str = "/public/delete-account", accept_language: str | None = None
) -> tuple[int, dict[str, str], str]:
    handler = Mangum(create_app(services), lifespan="off")
    event = http_api_event("GET", target, None, None)
    if accept_language:
        event["headers"]["accept-language"] = accept_language
    result = handler(event, None)  # type: ignore[arg-type]
    return result["statusCode"], result["headers"], result.get("body") or ""


def test_the_page_is_in_the_visitors_language_and_needs_no_account(services: Services) -> None:
    status, _, english = page(services)
    _, _, german = page(services, "/public/delete-account?lang=de")
    _, _, french = page(services, accept_language="fr-CH,fr;q=0.9,en;q=0.8")
    _, _, other = page(services, accept_language="pt-BR", target="/public/delete-account?lang=xx")

    assert status == 200
    assert '<html lang="en">' in english
    assert '<html lang="de">' in german
    assert '<html lang="fr">' in french
    assert '<html lang="en">' in other
    assert TEXT["en"]["title"] in english
    assert TEXT["de"]["confirm"] in german


def test_the_page_allows_only_its_own_script_and_style_and_loads_nothing(
    services: Services,
) -> None:
    _, headers, body = page(services)

    policy = headers["content-security-policy"]
    nonce = re.search(r"script-src 'nonce-([^']+)'", policy)
    assert nonce is not None
    assert f"style-src 'nonce-{nonce.group(1)}'" in policy
    assert "default-src 'none'" in policy
    assert "frame-ancestors 'none'" in policy
    assert body.count(f'nonce="{nonce.group(1)}"') == 2
    assert headers["cache-control"] == "no-store"
    assert headers["x-content-type-options"] == "nosniff"
    assert "http://" not in body
    assert "https://" not in body


def test_every_visit_gets_its_own_nonce(services: Services) -> None:
    first = page(services)[1]["content-security-policy"]
    second = page(services)[1]["content-security-policy"]

    assert first != second


def test_the_text_is_complete_in_every_language_and_cannot_close_the_script() -> None:
    assert set(LANGUAGES) == set(TEXT)
    keys = set(TEXT["en"])
    assert set(MESSAGE_KEYS) <= keys
    for language, text in TEXT.items():
        assert set(text) == keys, language
        assert all(text[key].strip() for key in keys), language


def test_the_page_is_not_part_of_the_schema_the_app_is_built_from(services: Services) -> None:
    paths = create_app(services).openapi()["paths"]

    assert not [path for path in paths if path.startswith("/public")]


def test_a_code_is_sent_to_an_address_with_an_account(
    call: Call, email_proof: FakeEmailProof
) -> None:
    response = call("POST", ASK, {"email": f"  {EMAIL.upper()} "}, subject=None)

    assert (response.status, response.body) == (202, {"sent": True})
    assert email_proof.emailed == [EMAIL]


def test_asking_for_a_code_looks_the_same_for_an_address_without_an_account(
    call: Call, email_proof: FakeEmailProof
) -> None:
    known = call("POST", ASK, {"email": EMAIL}, subject=None)
    unknown = call("POST", ASK, {"email": "nobody@mail.com"}, subject=None)

    assert (unknown.status, unknown.body) == (known.status, known.body)
    assert email_proof.emailed == [EMAIL]


def test_something_that_is_not_an_address_is_refused(call: Call) -> None:
    for email in ["", "amara", "a@b", "two words@mail.com", "x" * 250 + "@mail.com"]:
        response = call("POST", ASK, {"email": email}, subject=None)

        assert response.status == 422, email
        assert response.body["error"]["code"] in {"invalid_email", "invalid_value"}


def test_asking_too_often_is_refused_for_a_while(call: Call, email_proof: FakeEmailProof) -> None:
    email_proof.limited = True

    response = call("POST", ASK, {"email": EMAIL}, subject=None)

    assert response.status == 429
    assert response.body == {"error": {"code": "too_many_attempts", "field": None}}


def test_the_right_code_deletes_the_account_and_everything_stored_for_it(
    call: Call,
    email_proof: FakeEmailProof,
    directory: FakeAccountDirectory,
    files: InMemoryFileStore,
) -> None:
    files.save(f"users/{USER}/picture/a.jpg", b"jpeg", "image/jpeg")
    files.save(f"exports/{USER}/a.json", b"{}", "application/json")
    files.save(f"users/{OTHER_USER}/picture/b.jpg", b"jpeg", "image/jpeg")
    call("POST", ASK, {"email": EMAIL}, subject=None)

    response = call("POST", CONFIRM, {"email": EMAIL, "code": f" {CODE} "}, subject=None)

    assert (response.status, response.body) == (200, {"deleted": True})
    assert UUID(USER) not in directory.accounts
    assert UUID(OTHER_USER) in directory.accounts
    assert sorted(files.files) == [f"users/{OTHER_USER}/picture/b.jpg"]


def test_a_wrong_code_deletes_nothing(
    call: Call, email_proof: FakeEmailProof, directory: FakeAccountDirectory
) -> None:
    call("POST", ASK, {"email": EMAIL}, subject=None)

    response = call("POST", CONFIRM, {"email": EMAIL, "code": "000000"}, subject=None)

    assert response.status == 422
    assert response.body == {"error": {"code": "invalid_code", "field": None}}
    assert UUID(USER) in directory.accounts


def test_a_code_never_asked_for_deletes_nothing(
    call: Call, directory: FakeAccountDirectory
) -> None:
    response = call("POST", CONFIRM, {"email": EMAIL, "code": CODE}, subject=None)

    assert response.status == 422
    assert UUID(USER) in directory.accounts


def test_a_wrong_code_looks_the_same_for_an_address_without_an_account(
    call: Call, email_proof: FakeEmailProof
) -> None:
    call("POST", ASK, {"email": EMAIL}, subject=None)

    known = call("POST", CONFIRM, {"email": EMAIL, "code": "000000"}, subject=None)
    unknown = call("POST", CONFIRM, {"email": "nobody@mail.com", "code": CODE}, subject=None)

    assert (unknown.status, unknown.body) == (known.status, known.body)


def test_a_code_that_cannot_be_one_is_refused_before_the_provider_is_asked(
    call: Call, email_proof: FakeEmailProof
) -> None:
    for code in ["", "12345", "1234567", "abcdef", "12 456"]:
        response = call("POST", CONFIRM, {"email": EMAIL, "code": code}, subject=None)

        assert response.status == 422, code
        assert response.body["error"]["code"] == "invalid_code"
    assert email_proof.tries == []


def test_too_many_wrong_codes_are_refused_for_a_while(
    call: Call, email_proof: FakeEmailProof, directory: FakeAccountDirectory
) -> None:
    call("POST", ASK, {"email": EMAIL}, subject=None)
    email_proof.limited = True

    response = call("POST", CONFIRM, {"email": EMAIL, "code": CODE}, subject=None)

    assert response.status == 429
    assert UUID(USER) in directory.accounts


def test_the_requests_take_nothing_but_what_they_ask_for(call: Call) -> None:
    extra: dict[str, Any] = {"email": EMAIL, "code": CODE, "admin": True}

    assert call("POST", CONFIRM, extra, subject=None).status == 422
