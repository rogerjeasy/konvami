"""The vendor faces picked for partners and the agreement to the vendor (spec §6.20 P2),
against a real PostgreSQL, and the same behaviour from the in-memory stand-in."""

import datetime as dt
from uuid import UUID

import pytest

from konvami_api.domain.video_avatars import ChoiceRepository
from konvami_api.persistence.repositories import SqlPersonaRepository
from konvami_api.persistence.sql import SqlClient
from konvami_api.persistence.video_avatar_repository import SqlVideoAvatarRepository
from tests.persistence.test_repositories import OTHER_USER, USER, persona
from tests.video_avatars_fake import InMemoryVideoAvatarChoices

NOON = dt.datetime(2026, 11, 20, 12, 0, tzinfo=dt.UTC)
LENA = persona(1, "Lena")
TOM = persona(2, "Tom")


@pytest.fixture(params=["memory", "postgres"])
def choices(request: pytest.FixtureRequest) -> ChoiceRepository:
    if request.param == "memory":
        return InMemoryVideoAvatarChoices({USER: {LENA.id, TOM.id}})
    db: SqlClient = request.getfixturevalue("db")
    for user in (USER, OTHER_USER):
        db.execute(
            "INSERT INTO app_user (id) VALUES (CAST(:id AS uuid)) ON CONFLICT (id) DO NOTHING",
            {"id": str(user)},
        )
    SqlPersonaRepository(db).add(USER, "de", [LENA, TOM])
    return SqlVideoAvatarRepository(db, lambda: NOON)


def test_a_face_is_kept_per_partner_and_can_be_given_up(choices: ChoiceRepository) -> None:
    assert choices.faces(USER) == {}

    assert choices.set(USER, LENA.id, "anna-01")
    assert choices.set(USER, TOM.id, "ben-02")
    assert choices.set(USER, LENA.id, "clara-03")
    assert choices.faces(USER) == {LENA.id: "clara-03", TOM.id: "ben-02"}

    assert choices.set(USER, LENA.id, None)
    assert choices.faces(USER) == {TOM.id: "ben-02"}


def test_a_face_cannot_be_picked_for_someone_elses_partner(choices: ChoiceRepository) -> None:
    assert not choices.set(OTHER_USER, LENA.id, "anna-01")
    assert not choices.set(USER, UUID(int=7), "anna-01")
    assert choices.faces(OTHER_USER) == {}


def test_the_agreement_names_the_vendor_and_a_new_one_replaces_it(
    choices: ChoiceRepository,
) -> None:
    assert choices.consent(USER) is None

    choices.agree(USER, "facely")
    choices.agree(USER, "other")

    assert choices.consent(USER) == "other"
    assert choices.consent(OTHER_USER) is None
