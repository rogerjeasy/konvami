import base64
import io
import json
from collections.abc import Iterator
from urllib.parse import parse_qs, urlparse

import pytest
from botocore.response import StreamingBody
from botocore.stub import Stubber

from konvami_api.domain.storage import StoredFile
from konvami_api.providers.s3_store import S3FileStore, s3_client

BUCKET = "kv-dev-media-503002144480"
KEY = "uploads/11111111-1111-4111-8111-111111111111/aaaa.jpg"


@pytest.fixture
def stub() -> Iterator[Stubber]:
    s3 = s3_client(
        region_name="eu-central-1",
        aws_access_key_id="test",
        aws_secret_access_key="test",  # noqa: S106
    )
    with Stubber(s3) as stubber:
        yield stubber
        stubber.assert_no_pending_responses()


def store(stub: Stubber) -> S3FileStore:
    return S3FileStore(stub.client, BUCKET)


def test_an_upload_form_takes_one_file_of_the_given_type_and_size(stub: Stubber) -> None:
    form = store(stub).upload_form(
        KEY, content_type="image/jpeg", max_bytes=1_048_576, expires_seconds=300
    )

    assert form.url == f"https://{BUCKET}.s3.eu-central-1.amazonaws.com/"
    assert form.fields["key"] == KEY
    assert form.fields["Content-Type"] == "image/jpeg"
    # The signed policy is what makes the store refuse another key, type or size.
    assert {"policy", "x-amz-signature", "x-amz-credential"} <= set(form.fields)


def test_the_policy_of_an_upload_form_limits_key_type_and_size(stub: Stubber) -> None:
    form = store(stub).upload_form(
        KEY, content_type="image/jpeg", max_bytes=1_048_576, expires_seconds=300
    )

    policy = json.loads(base64.b64decode(form.fields["policy"]))
    assert ["content-length-range", 1, 1_048_576] in policy["conditions"]
    assert {"Content-Type": "image/jpeg"} in policy["conditions"]
    assert {"key": KEY} in policy["conditions"]
    assert {"bucket": BUCKET} in policy["conditions"]


def test_a_stored_file_is_described_by_its_size_and_type(stub: Stubber) -> None:
    stub.add_response(
        "head_object",
        {"ContentLength": 48_211, "ContentType": "image/jpeg"},
        {"Bucket": BUCKET, "Key": KEY},
    )

    assert store(stub).stat(KEY) == StoredFile(size=48_211, content_type="image/jpeg")


def test_a_file_that_is_not_there_has_no_description(stub: Stubber) -> None:
    stub.add_client_error("head_object", service_error_code="404", http_status_code=404)

    assert store(stub).stat(KEY) is None


def test_only_the_start_of_a_file_is_fetched_to_look_at_it(stub: Stubber) -> None:
    body = b"\xff\xd8\xff"
    stub.add_response(
        "get_object",
        {"Body": StreamingBody(io.BytesIO(body), len(body))},
        {"Bucket": BUCKET, "Key": KEY, "Range": "bytes=0-2"},
    )

    assert store(stub).read_start(KEY, 3) == body


def test_a_whole_file_is_read(stub: Stubber) -> None:
    body = b"RIFF....WAVE"
    stub.add_response(
        "get_object",
        {"Body": StreamingBody(io.BytesIO(body), len(body))},
        {"Bucket": BUCKET, "Key": KEY},
    )

    assert store(stub).read(KEY) == body


def test_a_file_is_saved_with_its_type(stub: Stubber) -> None:
    stub.add_response(
        "put_object",
        {},
        {
            "Bucket": BUCKET,
            "Key": "voices/de/marin.mp3",
            "Body": b"ID3",
            "ContentType": "audio/mpeg",
        },
    )

    store(stub).save("voices/de/marin.mp3", b"ID3", "audio/mpeg")


def test_moving_a_file_copies_it_and_deletes_the_original(stub: Stubber) -> None:
    destination = "users/11111111-1111-4111-8111-111111111111/picture/aaaa.jpg"
    stub.add_response(
        "copy_object",
        {},
        {"Bucket": BUCKET, "Key": destination, "CopySource": {"Bucket": BUCKET, "Key": KEY}},
    )
    stub.add_response("delete_object", {}, {"Bucket": BUCKET, "Key": KEY})

    store(stub).move(KEY, destination)


def test_an_address_reads_one_file_for_a_limited_time(stub: Stubber) -> None:
    address = urlparse(store(stub).address(KEY, 3600))

    assert address.netloc == f"{BUCKET}.s3.eu-central-1.amazonaws.com"
    assert address.path == f"/{KEY}"
    query = parse_qs(address.query)
    assert query["X-Amz-Expires"] == ["3600"]
    assert "X-Amz-Signature" in query


def test_a_file_is_removed(stub: Stubber) -> None:
    stub.add_response("delete_object", {}, {"Bucket": BUCKET, "Key": KEY})

    store(stub).remove(KEY)


def test_everything_under_a_prefix_is_removed_page_by_page(stub: Stubber) -> None:
    prefix = "users/11111111-1111-4111-8111-111111111111/"
    stub.add_response(
        "list_objects_v2",
        {
            "Contents": [{"Key": f"{prefix}picture/a.jpg"}, {"Key": f"{prefix}picture/b.jpg"}],
            "IsTruncated": True,
            "NextContinuationToken": "page-2",
        },
        {"Bucket": BUCKET, "Prefix": prefix},
    )
    stub.add_response(
        "delete_objects",
        {},
        {
            "Bucket": BUCKET,
            "Delete": {
                "Objects": [{"Key": f"{prefix}picture/a.jpg"}, {"Key": f"{prefix}picture/b.jpg"}],
                "Quiet": True,
            },
        },
    )
    stub.add_response(
        "list_objects_v2",
        {"Contents": [{"Key": f"{prefix}c.jpg"}], "IsTruncated": False},
        {"Bucket": BUCKET, "Prefix": prefix, "ContinuationToken": "page-2"},
    )
    stub.add_response(
        "delete_objects",
        {},
        {"Bucket": BUCKET, "Delete": {"Objects": [{"Key": f"{prefix}c.jpg"}], "Quiet": True}},
    )

    store(stub).remove_all(prefix)


def test_removing_everything_under_an_empty_prefix_deletes_nothing(stub: Stubber) -> None:
    stub.add_response(
        "list_objects_v2", {"IsTruncated": False}, {"Bucket": BUCKET, "Prefix": "users/none/"}
    )

    store(stub).remove_all("users/none/")


def test_a_failed_deletion_under_a_prefix_is_reported(stub: Stubber) -> None:
    prefix = "users/11111111-1111-4111-8111-111111111111/"
    stub.add_response(
        "list_objects_v2",
        {"Contents": [{"Key": f"{prefix}a.jpg"}], "IsTruncated": False},
        {"Bucket": BUCKET, "Prefix": prefix},
    )
    stub.add_response(
        "delete_objects",
        {"Errors": [{"Key": f"{prefix}a.jpg", "Code": "AccessDenied", "Message": "no"}]},
        {"Bucket": BUCKET, "Delete": {"Objects": [{"Key": f"{prefix}a.jpg"}], "Quiet": True}},
    )

    with pytest.raises(RuntimeError):
        store(stub).remove_all(prefix)
