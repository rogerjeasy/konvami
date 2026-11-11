import io
import wave

import pytest

from konvami_api.domain.conversations import ConversationError
from konvami_api.domain.recording_export import join_recordings
from tests.domain.test_recording_alignment import setup
from tests.world import OTHER_USER, USER


class Encoder:
    def __init__(self) -> None:
        self.calls = 0
        self.audio = b""

    def encode(self, audio: bytes, format: str) -> bytes:
        self.calls += 1
        self.audio = audio
        return b"encoded audio"


def test_session_export_preserves_recorded_turn_order_and_is_cached() -> None:
    world, call, service, _ = setup()
    encoder = Encoder()
    service._encoder = encoder
    assert service.export_formats() == ("mp3", "m4a")
    first = service.export_audio(USER, call, "mp3")
    assert service.export_audio(USER, call, "mp3") == first
    assert encoder.calls == 1
    assert world.files.files[f"users/{USER}/recordings/{call}/export.mp3"] == (
        b"encoded audio",
        "audio/mpeg",
    )
    with wave.open(io.BytesIO(encoder.audio)) as audio:
        assert audio.getnframes() == 12000
    with pytest.raises(ConversationError):
        service.export_audio(OTHER_USER, call, "mp3")
    assert encoder.calls == 1


def test_join_preserves_audio_order() -> None:
    from konvami_api.domain.recordings import wav

    first, second = b"\x01\x00" * 10, b"\x02\x00" * 20
    with wave.open(io.BytesIO(join_recordings([wav(first), wav(second)]))) as result:
        assert result.readframes(30) == first + second
