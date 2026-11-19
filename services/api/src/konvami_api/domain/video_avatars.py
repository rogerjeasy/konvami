"""Realistic video avatars (spec §6.20 P2 "realistic", §18 Phase 3 "video avatar vendor spike").

The seam for a vendor that turns the partner's voice into a talking face streamed as video.
Nothing here calls a vendor: `VideoAvatarVendor` is the interface a vendor's provider will
implement (`providers/video_avatar.py`), and until one does, nothing is offered and every partner
keeps its drawn portrait.
Design note: `docs/superpowers/specs/2026-11-20-avatar-art-video-design.md`.

Four things must all hold before a vendor sees anything:

1. a vendor is configured and implemented (`VideoAvatars.offered`),
2. the learner may use it (`allowed`, the seam for a Pro plan),
3. the learner agreed to that vendor, in the sheet where the face is picked (its consent is kept
   per vendor: a new vendor needs a new agreement),
4. the learner picked one of the vendor's faces for this partner.

Otherwise `start` returns None and the app draws the portrait. A vendor that fails also returns
None: a video face is never the reason a call does not happen.
"""

import logging
from collections.abc import Callable, Mapping
from dataclasses import dataclass
from typing import Protocol
from uuid import UUID

_log = logging.getLogger(__name__)


@dataclass(frozen=True)
class VideoAvatarFace:
    # The vendor's own id of a stock or licensed face.
    id: str
    # The name the learner sees.
    name: str


@dataclass(frozen=True)
class VideoAvatars:
    """What is on offer: the vendor and its faces come from configuration."""

    vendor: str = ""
    faces: tuple[VideoAvatarFace, ...] = ()

    @property
    def offered(self) -> bool:
        return bool(self.vendor and self.faces)

    def find(self, face_id: str) -> VideoAvatarFace | None:
        return next((face for face in self.faces if face.id == face_id), None)


@dataclass(frozen=True)
class VideoAvatarRequest:
    """What a vendor is told when a call starts: the face and the language, never who the
    learner is."""

    face_id: str
    language: str


@dataclass(frozen=True)
class VideoAvatarSession:
    """How the app reaches the vendor's stream for one call."""

    id: str
    vendor: str
    # Where the app connects to receive the face as a WebRTC video track.
    connect_url: str
    # The short-lived credential for that connection (never the vendor's key).
    token: str
    # Seconds since the epoch after which the session is no longer valid.
    expires_at: int


class VideoAvatarVendorError(Exception):
    """The vendor could not start a session (down, refused, out of credit)."""


class VideoAvatarVendor(Protocol):
    """A vendor's provider. `start` opens a session for one call and must not keep the
    learner's data beyond it; the vendor is billed by the minute, so the implementation reports
    the minutes to cost control (spec §6.19) when it lands."""

    def start(self, request: VideoAvatarRequest) -> VideoAvatarSession:
        """Raises `VideoAvatarVendorError`."""


class ChoiceRepository(Protocol):
    def faces(self, user_id: UUID) -> Mapping[UUID, str]:
        """The face picked for each of the learner's partners that has one."""

    def set(self, user_id: UUID, persona_id: UUID, face_id: str | None) -> bool:
        """Picks a face for a partner, or None for its portrait. False when the learner has no
        such partner."""

    def consent(self, user_id: UUID) -> str | None:
        """The vendor the learner agreed to, if any."""

    def agree(self, user_id: UUID, vendor: str) -> None: ...


class VideoAvatarError(Exception):
    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


@dataclass(frozen=True)
class VideoAvatarStatus:
    offered: bool
    # The vendor's name, shown in the consent notice.
    vendor: str
    # The learner agreed to this vendor.
    consent: bool
    # The learner may use video faces (Pro, or a tester).
    allowed: bool
    faces: tuple[VideoAvatarFace, ...]
    # The face picked for each partner that has one (faces no longer offered are left out).
    chosen: Mapping[UUID, str]


_NOTHING = VideoAvatarStatus(False, "", False, False, (), {})


class VideoAvatarService:
    def __init__(
        self,
        *,
        avatars: VideoAvatars,
        vendor: VideoAvatarVendor | None,
        choices: ChoiceRepository,
        allowed: Callable[[UUID], bool],
        language: Callable[[UUID], str],
    ) -> None:
        # Configured but not implemented is not offered.
        self._avatars = avatars if vendor is not None else VideoAvatars()
        self._vendor = vendor
        self._choices = choices
        self._allowed = allowed
        self._language = language

    @property
    def offered(self) -> bool:
        return self._avatars.offered

    def status(self, user_id: UUID) -> VideoAvatarStatus:
        if not self.offered:
            return _NOTHING
        return VideoAvatarStatus(
            offered=True,
            vendor=self._avatars.vendor,
            consent=self._choices.consent(user_id) == self._avatars.vendor,
            allowed=self._allowed(user_id),
            faces=self._avatars.faces,
            chosen={
                persona: face
                for persona, face in self._choices.faces(user_id).items()
                if self._avatars.find(face)
            },
        )

    def choose(
        self, user_id: UUID, persona_id: UUID, face_id: str | None, *, agreed: bool = False
    ) -> VideoAvatarStatus:
        """Picks a vendor face for a partner, or None for its drawn portrait. `agreed` records
        the learner's agreement to the vendor, read in the same sheet. Raises
        `VideoAvatarError`."""
        if face_id is not None:
            if not self.offered:
                raise VideoAvatarError("not_offered")
            if not self._allowed(user_id):
                raise VideoAvatarError("not_allowed")
            if self._avatars.find(face_id) is None:
                raise VideoAvatarError("unknown_face")
            if self._choices.consent(user_id) != self._avatars.vendor:
                if not agreed:
                    raise VideoAvatarError("consent_needed")
                self._choices.agree(user_id, self._avatars.vendor)
        if not self._choices.set(user_id, persona_id, face_id):
            raise VideoAvatarError("unknown_persona")
        return self.status(user_id)

    def start(self, user_id: UUID, persona_id: UUID) -> VideoAvatarSession | None:
        """A session for this partner's call, or None for the drawn portrait."""
        if self._vendor is None or not self.offered or not self._allowed(user_id):
            return None
        if self._choices.consent(user_id) != self._avatars.vendor:
            return None
        face = self._choices.faces(user_id).get(persona_id)
        if face is None or self._avatars.find(face) is None:
            return None
        try:
            return self._vendor.start(VideoAvatarRequest(face, self._language(user_id)))
        except VideoAvatarVendorError:
            _log.warning("video avatar session could not start; drawing the portrait")
            return None
