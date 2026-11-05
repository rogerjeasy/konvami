"""The learner's copy of their data (6.19, spec §6.21.3; GDPR art. 15 and 20, revFADP art. 25 and
28): one JSON file with everything Konvami keeps about them, in a common machine-readable format.

The file is written to the media bucket under `exports/<user>/` and read through a short-lived
address, like every private file. It is deleted by the bucket after a day, and with the account.
Making one is limited to a few a day, so the endpoint cannot be used to load the database.
"""

import datetime as dt
import json
from collections.abc import Callable, Mapping
from dataclasses import dataclass
from typing import Any, Protocol
from uuid import UUID, uuid4

from konvami_api.domain.accounts import AccountDirectory, AccountNotFound, export_folder
from konvami_api.domain.storage import FileStore

# What the file says about itself, so a later change of its shape can be told from this one.
EXPORT_FORMAT = "konvami-export/1"
# Archives a learner can make in a day. They are for a person, not for a script.
MAX_EXPORTS_PER_DAY = 3
# How long the archive's address works, and the addresses of the recordings inside it.
ADDRESS_SECONDS = 3600
# The table whose rows say where a turn's audio is kept, and the column that says it.
TURN_TABLE = "voice_turn"
AUDIO_KEY = "audio_key"
AUDIO_URL = "audio_url"


class ExportError(Exception):
    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


class ExportRepository(Protocol):
    def rows(self, user_id: UUID) -> Mapping[str, list[dict[str, Any]]]:
        """Every row stored for the learner, by table name, as JSON-ready values."""

    def made_since(self, user_id: UUID, since: dt.datetime) -> int:
        """How many archives the learner made since then."""

    def record(self, export_id: UUID, user_id: UUID, at: dt.datetime) -> None: ...


@dataclass(frozen=True)
class DataExport:
    # A short-lived address of the archive.
    url: str
    expires_in_seconds: int
    created_at: dt.datetime
    size_bytes: int


class DataExportService:
    def __init__(
        self,
        *,
        records: ExportRepository,
        accounts: AccountDirectory,
        files: FileStore,
        clock: Callable[[], dt.datetime],
        new_id: Callable[[], UUID] = uuid4,
    ) -> None:
        self._records = records
        self._accounts = accounts
        self._files = files
        self._clock = clock
        self._new_id = new_id

    def export(self, user_id: UUID) -> DataExport:
        """Writes the learner's archive and returns where to read it. Raises `ExportError`:
        `export_limit` after `MAX_EXPORTS_PER_DAY` archives in a day."""
        now = self._clock()
        if self._records.made_since(user_id, now - dt.timedelta(days=1)) >= MAX_EXPORTS_PER_DAY:
            raise ExportError("export_limit")
        export_id = self._new_id()
        # Counted before the work, so a burst of requests cannot all pass the check.
        self._records.record(export_id, user_id, now)

        archive = {
            "format": EXPORT_FORMAT,
            "exported_at": now.isoformat(),
            "account": self._account(user_id),
            "data": self._data(user_id),
        }
        body = json.dumps(archive, ensure_ascii=False, indent=2).encode()
        key = f"{export_folder(user_id)}{export_id}.json"
        self._files.save(key, body, "application/json")
        return DataExport(
            url=self._files.address(key, ADDRESS_SECONDS),
            expires_in_seconds=ADDRESS_SECONDS,
            created_at=now,
            size_bytes=len(body),
        )

    def _account(self, user_id: UUID) -> dict[str, Any]:
        """What the sign-in service keeps. The password is not part of it: the provider stores
        only a hash that nobody at Konvami can read."""
        try:
            account = self._accounts.get(user_id)
        except AccountNotFound:
            return {}
        details: dict[str, Any] = {
            "first_name": account.first_name,
            "language": account.language,
            "ai_consent_for_voice": account.voice_consent,
        }
        if account.email:
            details["email"] = account.email
        return details

    def _data(self, user_id: UUID) -> dict[str, list[dict[str, Any]]]:
        data = {table: list(rows) for table, rows in self._records.rows(user_id).items()}
        # A recording is a file in the bucket: the archive carries a link to it instead of the
        # bucket's key, which means nothing outside Konvami.
        for turn in data.get(TURN_TABLE, []):
            key = turn.pop(AUDIO_KEY, None)
            turn[AUDIO_URL] = self._files.address(key, ADDRESS_SECONDS) if key else None
        return data
