from datetime import UTC, datetime
from uuid import UUID

import pytest
from starlette.requests import Request

from konvami_api.api.auth import recently_signed_in
from konvami_api.api.errors import ApiError
from tests.api.conftest import OTHER_USER, USER, Call, http_api_event
from tests.fakes import FakeAccountDirectory, InMemoryAccountRepository, InMemoryFileStore

JPEG = b"\xff\xd8\xff\xe0" + b"\x00" * 64
FIRST_UPLOAD = "aaaaaaaa-aaaa-4aaa-8aaa-000000000001"


def test_a_new_account_has_no_picture(call: Call) -> None:
    response = call("GET", "/v1/account")

    assert response.status == 200
    assert response.body == {"picture": None}


def test_the_app_is_given_a_form_to_send_a_picture_with(call: Call) -> None:
    response = call("POST", "/v1/account/picture/upload")

    assert response.status == 200
    assert response.body == {
        "uploadId": FIRST_UPLOAD,
        "url": "https://files.test/",
        "fields": {"key": f"uploads/{USER}/{FIRST_UPLOAD}.jpg", "Content-Type": "image/jpeg"},
    }


def test_a_sent_picture_is_confirmed_and_then_shown(call: Call, files: InMemoryFileStore) -> None:
    upload = call("POST", "/v1/account/picture/upload").body
    files.save(upload["fields"]["key"], JPEG, "image/jpeg")

    response = call("POST", "/v1/account/picture", {"uploadId": upload["uploadId"]})

    address = f"https://files.test/users/{USER}/picture/{FIRST_UPLOAD}.jpg?expires=3600"
    assert response.status == 200
    assert response.body == {"picture": {"url": address}}
    assert call("GET", "/v1/account").body == response.body
    assert call("GET", "/v1/account", subject=OTHER_USER).body == {"picture": None}


def test_a_picture_that_was_never_sent_is_not_found(call: Call) -> None:
    upload = call("POST", "/v1/account/picture/upload").body

    response = call("POST", "/v1/account/picture", {"uploadId": upload["uploadId"]})

    assert response.status == 404
    assert response.body == {"error": {"code": "upload_not_found", "field": None}}


def test_a_file_that_is_not_a_picture_is_refused(call: Call, files: InMemoryFileStore) -> None:
    upload = call("POST", "/v1/account/picture/upload").body
    files.save(upload["fields"]["key"], b"#!/bin/sh\nrm -rf /", "image/jpeg")

    response = call("POST", "/v1/account/picture", {"uploadId": upload["uploadId"]})

    assert response.status == 422
    assert response.body == {"error": {"code": "invalid_picture", "field": None}}


def test_an_upload_id_that_is_not_an_id_is_refused(call: Call, files: InMemoryFileStore) -> None:
    files.save(f"users/{OTHER_USER}/picture/x.jpg", JPEG, "image/jpeg")

    response = call("POST", "/v1/account/picture", {"uploadId": f"../../users/{OTHER_USER}/x"})

    assert response.status == 422
    assert response.body == {"error": {"code": "invalid_request", "field": None}}


def test_a_picture_can_be_removed(call: Call, files: InMemoryFileStore) -> None:
    upload = call("POST", "/v1/account/picture/upload").body
    files.save(upload["fields"]["key"], JPEG, "image/jpeg")
    call("POST", "/v1/account/picture", {"uploadId": upload["uploadId"]})

    response = call("DELETE", "/v1/account/picture")

    assert response.status == 200
    assert response.body == {"picture": None}
    assert files.keys() == []


def test_deleting_the_account_removes_everything(
    call: Call,
    files: InMemoryFileStore,
    directory: FakeAccountDirectory,
    account_records: InMemoryAccountRepository,
) -> None:
    upload = call("POST", "/v1/account/picture/upload").body
    files.save(upload["fields"]["key"], JPEG, "image/jpeg")
    call("POST", "/v1/account/picture", {"uploadId": upload["uploadId"]})

    response = call("DELETE", "/v1/account")

    assert response.status == 200
    assert response.body == {"deleted": True}
    assert files.keys() == []
    assert account_records.deleted == [UUID(USER)]
    assert UUID(USER) not in directory.accounts
    assert UUID(OTHER_USER) in directory.accounts


def test_the_account_routes_need_a_signed_in_user(call: Call) -> None:
    for method, path in [
        ("GET", "/v1/account"),
        ("POST", "/v1/account/picture/upload"),
        ("DELETE", "/v1/account/picture"),
        ("DELETE", "/v1/account"),
    ]:
        assert call(method, path, subject=None).status == 401, (method, path)


def test_deleting_the_account_needs_a_password_typed_moments_ago(
    call: Call, directory: FakeAccountDirectory, account_records: InMemoryAccountRepository
) -> None:
    """A token alone is not enough: one that was stolen, or kept alive by refreshing for weeks,
    must not be able to delete everything."""
    response = call("DELETE", "/v1/account", signed_in_seconds_ago=301)

    assert response.status == 403
    assert response.body == {"error": {"code": "recent_sign_in_required", "field": None}}
    assert account_records.deleted == []
    assert UUID(USER) in directory.accounts

    assert call("DELETE", "/v1/account", signed_in_seconds_ago=300).status == 200


def test_the_last_token_of_a_deleted_account_can_store_nothing(
    call: Call, files: InMemoryFileStore
) -> None:
    call("DELETE", "/v1/account")

    changes = {"changes": [{"field": "target_language", "value": "de"}]}
    for method, path, body in [
        ("PATCH", "/v1/profile", changes),
        ("POST", "/v1/account/picture/upload", None),
        ("POST", "/v1/personas/draft", {"description": "A friendly woman from Hamburg"}),
        ("DELETE", "/v1/account/picture", None),
    ]:
        response = call(method, path, body)
        assert response.status == 401, (method, path)
        assert response.body == {"error": {"code": "not_authenticated", "field": None}}
    assert files.forms == []
    # Reading shows what is left, which is nothing.
    assert call("GET", "/v1/profile").body == {
        "targetLanguage": None,
        "global": {},
        "languages": {},
    }
    # Other accounts are not affected.
    assert call("PATCH", "/v1/profile", changes, subject=OTHER_USER).status == 200


def test_a_deletion_left_half_done_can_be_finished(
    call: Call, directory: FakeAccountDirectory, account_records: InMemoryAccountRepository
) -> None:
    """The data is gone and remembered as deleted, but the sign-in is still there (the request
    was cut off between the two). Asking again must finish the job, not be refused."""
    account_records.delete(UUID(USER), datetime(2026, 10, 9, 11, 59, tzinfo=UTC))
    assert UUID(USER) in directory.accounts

    response = call("DELETE", "/v1/account")

    assert response.status == 200
    assert UUID(USER) not in directory.accounts


@pytest.mark.parametrize("auth_time", ["1e999", "nan", "", "yesterday", None, [], "-1"])
def test_a_sign_in_time_that_cannot_be_read_is_a_refusal(auth_time: object) -> None:
    event = http_api_event("DELETE", "/v1/account", None, USER)
    event["requestContext"]["authorizer"]["jwt"]["claims"]["auth_time"] = auth_time
    request = Request({"type": "http", "aws.event": event})

    with pytest.raises(ApiError) as error:
        recently_signed_in(request, UUID(USER))

    assert (error.value.status, error.value.code) == (403, "recent_sign_in_required")
