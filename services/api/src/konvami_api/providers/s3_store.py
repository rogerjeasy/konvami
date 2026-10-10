"""Files in one private Amazon S3 bucket (infra/modules/media)."""

from typing import Any, Protocol

from botocore.exceptions import ClientError

from konvami_api.domain.storage import StoredFile, UploadForm

# How S3 says that a key does not exist, depending on the operation.
_NOT_FOUND = ("404", "NoSuchKey", "NotFound")


class S3(Protocol):
    """The part of boto3's `s3` client that is used here."""

    def generate_presigned_post(self, **kwargs: Any) -> dict[str, Any]: ...

    def generate_presigned_url(self, ClientMethod: str, **kwargs: Any) -> str: ...  # noqa: N803

    def head_object(self, **kwargs: Any) -> dict[str, Any]: ...

    def get_object(self, **kwargs: Any) -> dict[str, Any]: ...

    def put_object(self, **kwargs: Any) -> dict[str, Any]: ...

    def copy_object(self, **kwargs: Any) -> dict[str, Any]: ...

    def delete_object(self, **kwargs: Any) -> dict[str, Any]: ...

    def delete_objects(self, **kwargs: Any) -> dict[str, Any]: ...

    def list_objects_v2(self, **kwargs: Any) -> dict[str, Any]: ...


def s3_client(**options: Any) -> Any:
    """The S3 client the store needs: addresses signed with Signature Version 4 on the bucket's
    own regional host name, which is what a bucket in Frankfurt accepts."""
    import boto3  # Provided by the Lambda runtime; imported late so tests need no AWS setup.
    from botocore.config import Config

    config = Config(signature_version="s3v4", s3={"addressing_style": "virtual"})
    return boto3.client("s3", config=config, **options)


class S3FileStore:
    def __init__(self, s3: S3, bucket: str) -> None:
        self._s3 = s3
        self._bucket = bucket

    def upload_form(
        self, key: str, *, content_type: str, max_bytes: int, expires_seconds: int
    ) -> UploadForm:
        # The conditions are signed into the form's policy: S3 itself refuses another type, an
        # empty file or a larger one. (The key and the bucket are added by the SDK.)
        form = self._s3.generate_presigned_post(
            Bucket=self._bucket,
            Key=key,
            Fields={"Content-Type": content_type},
            Conditions=[{"Content-Type": content_type}, ["content-length-range", 1, max_bytes]],
            ExpiresIn=expires_seconds,
        )
        return UploadForm(url=form["url"], fields=form["fields"])

    def stat(self, key: str) -> StoredFile | None:
        try:
            head = self._s3.head_object(Bucket=self._bucket, Key=key)
        except ClientError as error:
            if error.response.get("Error", {}).get("Code") in _NOT_FOUND:
                return None
            raise
        return StoredFile(size=head["ContentLength"], content_type=head.get("ContentType", ""))

    def read_start(self, key: str, count: int) -> bytes:
        answer = self._s3.get_object(Bucket=self._bucket, Key=key, Range=f"bytes=0-{count - 1}")
        start: bytes = answer["Body"].read()
        return start

    def save(self, key: str, body: bytes, content_type: str) -> None:
        self._s3.put_object(Bucket=self._bucket, Key=key, Body=body, ContentType=content_type)

    def move(self, source: str, destination: str) -> None:
        self._s3.copy_object(
            Bucket=self._bucket,
            Key=destination,
            CopySource={"Bucket": self._bucket, "Key": source},
        )
        self.remove(source)

    def address(self, key: str, expires_seconds: int) -> str:
        return self._s3.generate_presigned_url(
            "get_object", Params={"Bucket": self._bucket, "Key": key}, ExpiresIn=expires_seconds
        )

    def remove(self, key: str) -> None:
        # S3 answers the same whether or not the key existed.
        self._s3.delete_object(Bucket=self._bucket, Key=key)

    def remove_all(self, prefix: str) -> None:
        page: dict[str, Any] = {}
        while True:
            listed = self._s3.list_objects_v2(Bucket=self._bucket, Prefix=prefix, **page)
            keys = [{"Key": item["Key"]} for item in listed.get("Contents", [])]
            if keys:
                answer = self._s3.delete_objects(
                    Bucket=self._bucket, Delete={"Objects": keys, "Quiet": True}
                )
                if answer.get("Errors"):
                    # Deleting an account must not report success while files remain.
                    raise RuntimeError(f"{len(answer['Errors'])} files could not be deleted")
            if not listed.get("IsTruncated"):
                return
            page = {"ContinuationToken": listed["NextContinuationToken"]}
