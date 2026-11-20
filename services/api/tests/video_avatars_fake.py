"""In-memory stand-ins for the video avatar seam (spec §6.20 P2)."""

from collections.abc import Callable, Mapping
from uuid import UUID

from konvami_api.domain.video_avatars import (
    VideoAvatarRequest,
    VideoAvatarSession,
    VideoAvatarVendorError,
)


class InMemoryVideoAvatarChoices:
    def __init__(
        self,
        personas: Mapping[UUID, set[UUID]] | None = None,
        *,
        owns: Callable[[UUID, UUID], bool] | None = None,
    ) -> None:
        # The partners each learner has; a face can only be picked for one of them.
        self.personas = {user: set(ids) for user, ids in (personas or {}).items()}
        self._owns = owns or (lambda user, persona: persona in self.personas.get(user, set()))
        self.picked: dict[UUID, dict[UUID, str]] = {}
        self.agreed: dict[UUID, str] = {}

    def faces(self, user_id: UUID) -> Mapping[UUID, str]:
        return dict(self.picked.get(user_id, {}))

    def set(self, user_id: UUID, persona_id: UUID, face_id: str | None) -> bool:
        if not self._owns(user_id, persona_id):
            return False
        faces = self.picked.setdefault(user_id, {})
        if face_id is None:
            faces.pop(persona_id, None)
        else:
            faces[persona_id] = face_id
        return True

    def consent(self, user_id: UUID) -> str | None:
        return self.agreed.get(user_id)

    def agree(self, user_id: UUID, vendor: str) -> None:
        self.agreed[user_id] = vendor


class FakeVideoAvatarVendor:
    """Opens a pretend session; `fail` makes it refuse."""

    def __init__(self, *, fail: bool = False) -> None:
        self.fail = fail
        self.requests: list[VideoAvatarRequest] = []

    def start(self, request: VideoAvatarRequest) -> VideoAvatarSession:
        self.requests.append(request)
        if self.fail:
            raise VideoAvatarVendorError("down")
        return VideoAvatarSession(
            id=f"session-{len(self.requests)}",
            vendor="facely",
            connect_url="https://stream.example/session",
            token="short-lived",  # noqa: S106 - a pretend session credential
            expires_at=1_900_000_000,
        )
