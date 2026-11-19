"""Realistic video avatars (spec §6.20 P2): the seam is off unless a vendor is configured and
implemented, and a face is shown only with the learner's agreement and choice."""

from uuid import UUID

import pytest

from konvami_api.domain.video_avatars import (
    VideoAvatarError,
    VideoAvatarFace,
    VideoAvatars,
    VideoAvatarService,
    VideoAvatarVendor,
)
from konvami_api.providers.video_avatar import vendor_for
from tests.video_avatars_fake import FakeVideoAvatarVendor, InMemoryVideoAvatarChoices

USER = UUID("11111111-1111-4111-8111-111111111111")
LENA = UUID("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")
STRANGER = UUID("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb")
FACES = (VideoAvatarFace("anna-01", "Anna"), VideoAvatarFace("ben-02", "Ben"))
OFFER = VideoAvatars(vendor="facely", faces=FACES)


def service(
    *,
    avatars: VideoAvatars = OFFER,
    vendor: VideoAvatarVendor | None = None,
    allowed: bool = True,
    choices: InMemoryVideoAvatarChoices | None = None,
) -> tuple[VideoAvatarService, InMemoryVideoAvatarChoices]:
    store = choices or InMemoryVideoAvatarChoices({USER: {LENA}})
    return (
        VideoAvatarService(
            avatars=avatars,
            vendor=vendor if vendor is not None else FakeVideoAvatarVendor(),
            choices=store,
            allowed=lambda _: allowed,
            language=lambda _: "de",
        ),
        store,
    )


def test_no_vendor_is_implemented_yet_so_a_configured_one_is_not_offered() -> None:
    vendor = vendor_for("facely", lambda: "key")
    videos = VideoAvatarService(
        avatars=OFFER,
        vendor=vendor,
        choices=InMemoryVideoAvatarChoices({USER: {LENA}}),
        allowed=lambda _: True,
        language=lambda _: "de",
    )

    assert vendor is None
    assert videos.offered is False
    assert videos.status(USER).offered is False
    assert videos.start(USER, LENA) is None


def test_nothing_is_offered_without_faces() -> None:
    videos, _ = service(avatars=VideoAvatars(vendor="facely"))

    assert videos.status(USER).faces == ()
    with pytest.raises(VideoAvatarError) as error:
        videos.choose(USER, LENA, "anna-01", agreed=True)
    assert error.value.code == "not_offered"


def test_the_offer_lists_the_faces_and_what_the_learner_may_do() -> None:
    videos, _ = service()

    status = videos.status(USER)

    assert (status.offered, status.vendor, status.consent, status.allowed) == (
        True,
        "facely",
        False,
        True,
    )
    assert status.faces == FACES
    assert status.chosen == {}


def test_a_face_needs_the_agreement_to_the_vendor() -> None:
    videos, store = service()

    with pytest.raises(VideoAvatarError) as error:
        videos.choose(USER, LENA, "anna-01")

    assert error.value.code == "consent_needed"
    assert store.faces(USER) == {}


def test_agreeing_in_the_sheet_keeps_the_agreement_and_the_face() -> None:
    videos, store = service()

    status = videos.choose(USER, LENA, "anna-01", agreed=True)

    assert status.consent is True
    assert status.chosen == {LENA: "anna-01"}
    assert store.consent(USER) == "facely"


def test_an_agreement_to_another_vendor_does_not_count() -> None:
    choices = InMemoryVideoAvatarChoices({USER: {LENA}})
    choices.agree(USER, "older-vendor")
    videos, _ = service(choices=choices)

    assert videos.status(USER).consent is False
    with pytest.raises(VideoAvatarError):
        videos.choose(USER, LENA, "anna-01")


def test_only_offered_faces_and_own_partners_can_be_picked() -> None:
    videos, _ = service()

    with pytest.raises(VideoAvatarError) as unknown:
        videos.choose(USER, LENA, "nobody", agreed=True)
    with pytest.raises(VideoAvatarError) as stranger:
        videos.choose(USER, STRANGER, "anna-01", agreed=True)

    assert unknown.value.code == "unknown_face"
    assert stranger.value.code == "unknown_persona"


def test_a_learner_without_access_cannot_pick_a_face() -> None:
    videos, _ = service(allowed=False)

    with pytest.raises(VideoAvatarError) as error:
        videos.choose(USER, LENA, "anna-01", agreed=True)

    assert error.value.code == "not_allowed"


def test_going_back_to_the_portrait_is_always_possible() -> None:
    videos, _ = service()
    videos.choose(USER, LENA, "anna-01", agreed=True)

    status = videos.choose(USER, LENA, None)

    assert status.chosen == {}


def test_a_call_with_a_picked_face_gets_a_session_with_only_the_face_and_language() -> None:
    vendor = FakeVideoAvatarVendor()
    videos, _ = service(vendor=vendor)
    videos.choose(USER, LENA, "ben-02", agreed=True)

    session = videos.start(USER, LENA)

    assert session is not None
    assert session.connect_url == "https://stream.example/session"
    assert [(r.face_id, r.language) for r in vendor.requests] == [("ben-02", "de")]


def test_without_a_face_the_call_draws_the_portrait() -> None:
    vendor = FakeVideoAvatarVendor()
    videos, _ = service(vendor=vendor)

    assert videos.start(USER, LENA) is None
    assert vendor.requests == []


def test_a_vendor_that_fails_leaves_the_portrait() -> None:
    videos, _ = service(vendor=FakeVideoAvatarVendor(fail=True))
    videos.choose(USER, LENA, "anna-01", agreed=True)

    assert videos.start(USER, LENA) is None


def test_a_face_dropped_from_the_offer_is_no_longer_used() -> None:
    choices = InMemoryVideoAvatarChoices({USER: {LENA}})
    first, _ = service(choices=choices)
    first.choose(USER, LENA, "anna-01", agreed=True)
    later, _ = service(choices=choices, avatars=VideoAvatars("facely", FACES[1:]))

    assert later.status(USER).chosen == {}
    assert later.start(USER, LENA) is None


def test_losing_access_stops_the_sessions() -> None:
    choices = InMemoryVideoAvatarChoices({USER: {LENA}})
    first, _ = service(choices=choices)
    first.choose(USER, LENA, "anna-01", agreed=True)
    later, _ = service(choices=choices, allowed=False)

    assert later.start(USER, LENA) is None
