from collections.abc import Iterator
from datetime import UTC, datetime
from uuid import UUID

import pytest

from konvami_api.domain.accounts import Account, AccountError, AccountService
from tests.fakes import (
    FakeAccountDirectory,
    FixedClock,
    InMemoryAccountRepository,
    InMemoryFileStore,
)

USER = UUID("11111111-1111-4111-8111-111111111111")
OTHER_USER = UUID("22222222-2222-4222-8222-222222222222")
FIRST = UUID("aaaaaaaa-aaaa-4aaa-8aaa-000000000001")
SECOND = UUID("aaaaaaaa-aaaa-4aaa-8aaa-000000000002")
# The first bytes of every JPEG file, and some image data after them.
JPEG = b"\xff\xd8\xff\xe0" + b"\x00" * 64
NOON = datetime(2026, 10, 9, 12, 0, tzinfo=UTC)
PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64


class Setup:
    def __init__(self) -> None:
        self.files = InMemoryFileStore()
        self.records = InMemoryAccountRepository()
        self.directory = FakeAccountDirectory(
            {
                USER: Account("Amara", "fr", voice_consent=True),
                OTHER_USER: Account("Jonas", "de", voice_consent=True),
            }
        )
        ids: Iterator[UUID] = iter([FIRST, SECOND])
        self.accounts = AccountService(
            records=self.records,
            files=self.files,
            directory=self.directory,
            clock=FixedClock(NOON),
            new_id=lambda: next(ids),
        )

    def uploaded(self, user: UUID = USER, body: bytes = JPEG) -> UUID:
        """Starts an upload and sends the file, as the app does with the form it was given."""
        upload = self.accounts.start_picture_upload(user)
        self.files.save(upload.form.fields["key"], body, "image/jpeg")
        return upload.upload_id


def test_a_new_account_has_no_picture() -> None:
    assert Setup().accounts.view(USER).picture_url is None


def test_an_upload_is_offered_for_one_small_jpeg_in_the_learners_own_folder() -> None:
    setup = Setup()

    upload = setup.accounts.start_picture_upload(USER)

    assert upload.upload_id == FIRST
    assert upload.form.url == "https://files.test/"
    assert setup.files.forms == [
        {
            "key": f"uploads/{USER}/{FIRST}.jpg",
            "content_type": "image/jpeg",
            "max_bytes": 1_048_576,
            "expires_seconds": 300,
        }
    ]


def test_a_confirmed_upload_becomes_the_picture() -> None:
    setup = Setup()
    upload_id = setup.uploaded()

    view = setup.accounts.confirm_picture(USER, upload_id)

    stored = f"users/{USER}/picture/{FIRST}.jpg"
    assert view.picture_url == f"https://files.test/{stored}?expires=3600"
    assert setup.accounts.view(USER) == view
    assert setup.files.keys() == [stored]


def test_an_upload_that_never_arrived_cannot_be_confirmed() -> None:
    setup = Setup()
    upload = setup.accounts.start_picture_upload(USER)

    with pytest.raises(AccountError) as error:
        setup.accounts.confirm_picture(USER, upload.upload_id)

    assert error.value.code == "upload_not_found"
    assert setup.accounts.view(USER).picture_url is None


def test_a_file_that_is_not_a_jpeg_is_refused_and_thrown_away() -> None:
    setup = Setup()
    upload_id = setup.uploaded(body=PNG)

    with pytest.raises(AccountError) as error:
        setup.accounts.confirm_picture(USER, upload_id)

    assert error.value.code == "invalid_picture"
    assert setup.files.keys() == []
    assert setup.accounts.view(USER).picture_url is None


def test_a_file_larger_than_the_limit_is_refused() -> None:
    setup = Setup()
    upload_id = setup.uploaded(body=JPEG + b"\x00" * 1_048_576)

    with pytest.raises(AccountError) as error:
        setup.accounts.confirm_picture(USER, upload_id)

    assert error.value.code == "invalid_picture"
    assert setup.files.keys() == []


def test_a_new_picture_replaces_the_old_file() -> None:
    setup = Setup()
    setup.accounts.confirm_picture(USER, setup.uploaded())

    view = setup.accounts.confirm_picture(USER, setup.uploaded())

    stored = f"users/{USER}/picture/{SECOND}.jpg"
    assert view.picture_url == f"https://files.test/{stored}?expires=3600"
    assert setup.files.keys() == [stored]


def test_nobody_can_take_someone_elses_upload_as_their_picture() -> None:
    setup = Setup()
    upload_id = setup.uploaded(USER)

    with pytest.raises(AccountError) as error:
        setup.accounts.confirm_picture(OTHER_USER, upload_id)

    assert error.value.code == "upload_not_found"
    assert setup.accounts.view(OTHER_USER).picture_url is None


def test_removing_the_picture_deletes_the_file() -> None:
    setup = Setup()
    setup.accounts.confirm_picture(USER, setup.uploaded())

    view = setup.accounts.remove_picture(USER)

    assert view.picture_url is None
    assert setup.accounts.view(USER).picture_url is None
    assert setup.files.keys() == []


def test_removing_a_picture_that_is_not_there_changes_nothing() -> None:
    setup = Setup()

    assert setup.accounts.remove_picture(USER).picture_url is None


def test_deleting_the_account_removes_its_files_its_data_and_its_sign_in() -> None:
    setup = Setup()
    setup.accounts.confirm_picture(USER, setup.uploaded())
    abandoned = setup.accounts.start_picture_upload(USER)
    setup.files.save(abandoned.form.fields["key"], JPEG, "image/jpeg")
    setup.files.save(f"users/{OTHER_USER}/picture/x.jpg", JPEG, "image/jpeg")

    setup.accounts.delete(USER)

    assert setup.files.keys() == [f"users/{OTHER_USER}/picture/x.jpg"]
    assert setup.records.deleted == [USER]
    assert USER not in setup.directory.accounts
    assert OTHER_USER in setup.directory.accounts


def test_an_account_whose_sign_in_is_already_gone_can_still_be_deleted() -> None:
    setup = Setup()
    del setup.directory.accounts[USER]

    setup.accounts.delete(USER)

    assert setup.records.deleted == [USER]


def test_the_sign_in_is_removed_last_so_a_failed_deletion_can_be_repeated() -> None:
    setup = Setup()
    setup.accounts.confirm_picture(USER, setup.uploaded())
    setup.records.fail_delete = True

    with pytest.raises(RuntimeError):
        setup.accounts.delete(USER)

    # The learner can still sign in and ask again.
    assert USER in setup.directory.accounts
    setup.records.fail_delete = False
    setup.accounts.delete(USER)
    assert USER not in setup.directory.accounts


def test_a_deleted_account_is_remembered_as_deleted() -> None:
    """Its last access token works for up to an hour: nothing may be stored with it again."""
    setup = Setup()
    assert setup.accounts.is_deleted(USER) is False

    setup.accounts.delete(USER)

    assert setup.accounts.is_deleted(USER) is True
    assert setup.accounts.is_deleted(OTHER_USER) is False
    assert setup.records.deleted_at[USER] == NOON
