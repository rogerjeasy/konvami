import shutil

import pytest

from konvami_api.domain.recordings import wav
from konvami_api.providers.audio_encoding import FfmpegEncoder
from tests.domain.test_recordings import PCM


@pytest.mark.parametrize(("format", "signature"), [("mp3", b"ID3"), ("m4a", b"ftyp")])
def test_encoder_produces_real_compressed_audio(format: str, signature: bytes) -> None:
    binary = shutil.which("ffmpeg")
    if binary is None:
        pytest.skip("ffmpeg integration binary is not installed")
    encoded = FfmpegEncoder(binary).encode(wav(PCM), format)
    assert signature in encoded[:20]
    assert not encoded.startswith(b"RIFF")


def test_unknown_format_never_reaches_the_process() -> None:
    with pytest.raises(ValueError, match="unsupported recording format"):
        FfmpegEncoder("/missing/ffmpeg").encode(b"audio", "shell")
