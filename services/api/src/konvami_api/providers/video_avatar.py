"""Video avatar vendors (spec §6.20 P2). See `domain/video_avatars.py`.

No vendor is implemented yet: which one is chosen is the owner's decision, after the vendor
spike in the design note (`docs/superpowers/specs/2026-11-20-avatar-art-video-design.md`). A
vendor is added here as a class implementing `VideoAvatarVendor`, named in `VENDORS`, with its
key read from Secrets Manager like the other providers. Until then `vendor_for` finds nothing,
so a configured vendor is still not offered.
"""

from collections.abc import Callable, Mapping

from konvami_api.domain.video_avatars import VideoAvatarVendor

# The implemented vendors by their configured name, each built from a function reading its key.
VENDORS: Mapping[str, Callable[[Callable[[], str]], VideoAvatarVendor]] = {}


def vendor_for(name: str, key: Callable[[], str]) -> VideoAvatarVendor | None:
    """The provider for a configured vendor name, or None when it is not implemented."""
    build = VENDORS.get(name)
    return build(key) if build else None
