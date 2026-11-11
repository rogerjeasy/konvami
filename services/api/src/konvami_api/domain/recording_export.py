"""A session export joins the recorded turns in their original order (spec §6.6)."""

import io
import wave
from typing import Protocol

# Sessions are ten minutes today; bound malformed imports and future longer sessions too.
MAX_RECORDING_SECONDS = 30 * 60
CONTENT_TYPES = {"mp3": "audio/mpeg", "m4a": "audio/mp4"}


class AudioEncodingError(Exception):
    pass


class AudioEncoder(Protocol):
    def encode(self, audio: bytes, format: str) -> bytes: ...


def join_recordings(clips: list[bytes]) -> bytes:
    output = io.BytesIO()
    settings: tuple[int, int, int] | None = None
    frames = 0
    with wave.open(output, "wb") as target:
        for clip in clips:
            with wave.open(io.BytesIO(clip), "rb") as source:
                current = source.getnchannels(), source.getsampwidth(), source.getframerate()
                if settings is None:
                    settings = current
                    target.setnchannels(current[0])
                    target.setsampwidth(current[1])
                    target.setframerate(current[2])
                if current != settings:
                    raise AudioEncodingError("incompatible recordings")
                frames += source.getnframes()
                if frames > MAX_RECORDING_SECONDS * current[2]:
                    raise AudioEncodingError("recording too long")
                target.writeframes(source.readframes(source.getnframes()))
    return output.getvalue()
