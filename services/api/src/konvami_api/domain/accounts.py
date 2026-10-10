"""What the backend needs to know about an account: who to greet, in which language, and whether
they agreed to send their voice to the voice provider. And what it keeps for an account itself:
the learner's photo, and the way to delete everything.

The account itself lives with the identity provider (Amazon Cognito). The consent record stays
there too for now (onboarding design O7); the backend reads it before every voice call, because
a check made only in the app could be skipped (Apple guideline 5.1.2(i)).
"""

import datetime as dt
from collections.abc import Callable, Mapping
from dataclasses import dataclass
from typing import Literal, Protocol, get_args
from uuid import UUID, uuid4

from konvami_api.domain.storage import FileStore, UploadForm

# The languages of the app's interface (spec D15); the setup guide speaks these.
InterfaceLanguage = Literal["en", "de", "fr", "it"]
INTERFACE_LANGUAGES: tuple[InterfaceLanguage, ...] = get_args(InterfaceLanguage)
DEFAULT_LANGUAGE: InterfaceLanguage = "en"

# The provider that receives live voice: without consent to it there is no voice call.
VOICE_PROVIDER = "openai"


@dataclass(frozen=True)
class Account:
    # Empty when the account has none; never a made-up name.
    first_name: str
    language: InterfaceLanguage
    voice_consent: bool


class AccountNotFound(Exception):  # noqa: N818 - reads as a fact, like KeyError
    """No such account (it was deleted while its last token was still valid)."""


class AccountDirectory(Protocol):
    def get(self, user_id: UUID) -> Account:
        """The account, or `AccountNotFound`."""

    def delete(self, user_id: UUID) -> None:
        """Removes the account, so nobody can sign in to it. Nothing to do when it is gone."""


def _voice_consent(stored: str | None) -> bool:
    """Reads the app's consent record: `v1|<ISO time>|openai=1,elevenlabs=1,bedrock=0`.

    The format is written by apps/mobile/src/auth/consent.ts. Anything that cannot be read in
    full counts as no consent.
    """
    parts = (stored or "").split("|")
    if len(parts) != 3 or not all(parts):
        return False
    try:
        dt.datetime.fromisoformat(parts[1])
    except ValueError:
        return False
    flags = dict(pair.split("=", 1) for pair in parts[2].split(",") if "=" in pair)
    return flags.get(VOICE_PROVIDER) == "1"


def account_from_attributes(attributes: Mapping[str, str]) -> Account:
    """An account from the identity provider's attributes (names as in infra/modules/auth)."""
    locale = attributes.get("locale")
    language = next((code for code in INTERFACE_LANGUAGES if code == locale), DEFAULT_LANGUAGE)
    return Account(
        first_name=attributes.get("given_name", "").strip(),
        language=language,
        voice_consent=_voice_consent(attributes.get("custom:ai_consent")),
    )


# --- The photo and account deletion (profile design P2-P5) ---------------------------------------

PICTURE_TYPE = "image/jpeg"
# The app sends a 512 px JPEG, which is well under 200 kB; this is the most the store accepts.
PICTURE_MAX_BYTES = 1024 * 1024
# How long the app has to send the file after asking for the form.
UPLOAD_SECONDS = 300
# How long a photo's address works. The app asks for a new one whenever it opens.
PICTURE_ADDRESS_SECONDS = 3600
# How long a deleted account's id is remembered. Its last access token works for up to an hour
# (infra/modules/auth); a day covers that with room, and then the id, which identified a person,
# is deleted as well.
DELETION_MEMORY = dt.timedelta(days=1)
# How every JPEG file starts, whatever wrote it.
_JPEG_START = b"\xff\xd8\xff"


class AccountError(Exception):
    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


class AccountRepository(Protocol):
    def picture_key(self, user_id: UUID) -> str | None:
        """Where the learner's photo is stored; None without one."""

    def set_picture_key(self, user_id: UUID, key: str | None) -> None: ...

    def delete(self, user_id: UUID, at: dt.datetime) -> None:
        """Deletes the learner and everything stored for them, and remembers the deletion
        for `DELETION_MEMORY`, so that nothing is stored for them again."""

    def is_deleted(self, user_id: UUID) -> bool: ...


@dataclass(frozen=True)
class AccountView:
    # A short-lived address of the learner's photo; None without one.
    picture_url: str | None


@dataclass(frozen=True)
class PictureUpload:
    upload_id: UUID
    form: UploadForm


def _upload_folder(user_id: UUID) -> str:
    return f"uploads/{user_id}/"


def _user_folder(user_id: UUID) -> str:
    return f"users/{user_id}/"


class AccountService:
    def __init__(
        self,
        *,
        records: AccountRepository,
        files: FileStore,
        directory: AccountDirectory,
        clock: Callable[[], dt.datetime],
        new_id: Callable[[], UUID] = uuid4,
    ) -> None:
        self._records = records
        self._files = files
        self._directory = directory
        self._clock = clock
        self._new_id = new_id

    def view(self, user_id: UUID) -> AccountView:
        key = self._records.picture_key(user_id)
        return AccountView(
            picture_url=self._files.address(key, PICTURE_ADDRESS_SECONDS) if key else None
        )

    def start_picture_upload(self, user_id: UUID) -> PictureUpload:
        """A form for one photo. It becomes the learner's photo only with `confirm_picture`."""
        upload_id = self._new_id()
        form = self._files.upload_form(
            f"{_upload_folder(user_id)}{upload_id}.jpg",
            content_type=PICTURE_TYPE,
            max_bytes=PICTURE_MAX_BYTES,
            expires_seconds=UPLOAD_SECONDS,
        )
        return PictureUpload(upload_id, form)

    def confirm_picture(self, user_id: UUID, upload_id: UUID) -> AccountView:
        """Makes an uploaded file the learner's photo, after checking that it is one."""
        # The folder is the caller's own, so an id from someone else's upload finds nothing.
        uploaded = f"{_upload_folder(user_id)}{upload_id}.jpg"
        stored = self._files.stat(uploaded)
        if stored is None:
            raise AccountError("upload_not_found")
        is_jpeg = (
            stored.content_type == PICTURE_TYPE
            and 0 < stored.size <= PICTURE_MAX_BYTES
            and self._files.read_start(uploaded, len(_JPEG_START)) == _JPEG_START
        )
        if not is_jpeg:
            self._files.remove(uploaded)
            raise AccountError("invalid_picture")

        previous = self._records.picture_key(user_id)
        # A new name for every photo, so no cache shows the old one under the new address.
        key = f"{_user_folder(user_id)}picture/{upload_id}.jpg"
        self._files.move(uploaded, key)
        self._records.set_picture_key(user_id, key)
        if previous and previous != key:
            self._files.remove(previous)
        return self.view(user_id)

    def remove_picture(self, user_id: UUID) -> AccountView:
        key = self._records.picture_key(user_id)
        if key:
            self._records.set_picture_key(user_id, None)
            self._files.remove(key)
        return AccountView(picture_url=None)

    def delete(self, user_id: UUID) -> None:
        """Deletes the account and everything kept for it (spec §6.19, Apple guideline 5.1.1(v)).

        Files first, then the database, the sign-in last: if a step fails the learner can still
        sign in and ask again, and every step can be repeated.
        """
        self._files.remove_all(_user_folder(user_id))
        self._files.remove_all(_upload_folder(user_id))
        self._records.delete(user_id, self._clock())
        self._directory.delete(user_id)

    def is_deleted(self, user_id: UUID) -> bool:
        """Whether this account was deleted. Its last access token outlives it by up to an
        hour; a request made with it must not store anything."""
        return self._records.is_deleted(user_id)
