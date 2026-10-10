from uuid import UUID

from tests.api.conftest import OTHER_USER, USER, Call
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
