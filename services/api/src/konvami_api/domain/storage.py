"""Files the backend keeps (a learner's photo, a voice's sample). The store sits behind
`FileStore` (Amazon S3 today, spec §15), and nothing in it is ever public: a file is sent with a
short-lived upload form and read through a short-lived address.
"""

from collections.abc import Mapping
from dataclasses import dataclass
from typing import Protocol


@dataclass(frozen=True)
class UploadForm:
    """Where and how the app sends one file: a form POST to `url` with these fields, then the
    file itself as the field `file`."""

    url: str
    fields: Mapping[str, str]


@dataclass(frozen=True)
class StoredFile:
    size: int
    content_type: str


class FileStore(Protocol):
    def upload_form(
        self, key: str, *, content_type: str, max_bytes: int, expires_seconds: int
    ) -> UploadForm:
        """A form that stores one file of that type and at most that size under `key`."""

    def stat(self, key: str) -> StoredFile | None:
        """What is stored under `key`; None when nothing is."""

    def read_start(self, key: str, count: int) -> bytes:
        """The first `count` bytes of a file."""

    def read(self, key: str) -> bytes:
        """A whole file. Only for files the backend made itself (a recording): their size is
        known."""

    def save(self, key: str, body: bytes, content_type: str) -> None: ...

    def move(self, source: str, destination: str) -> None: ...

    def address(self, key: str, expires_seconds: int) -> str:
        """A web address that reads the file for that long."""

    def remove(self, key: str) -> None:
        """Deletes a file. Nothing to do when it is not there."""

    def remove_all(self, prefix: str) -> None:
        """Deletes every file whose key starts with `prefix`."""
