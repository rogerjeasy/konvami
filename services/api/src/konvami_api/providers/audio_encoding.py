"""Optional ffmpeg installation supplied by a deployment layer, behind AudioEncoder."""

import subprocess

from konvami_api.domain.recording_export import AudioEncodingError

# Leave time for the API to store and return the export within its request deadline.
ENCODING_SECONDS = 20
_CODECS = {
    "mp3": ["-c:a", "libmp3lame", "-f", "mp3"],
    "m4a": ["-c:a", "aac", "-movflags", "frag_keyframe+empty_moov", "-f", "mp4"],
}


class FfmpegEncoder:
    def __init__(self, binary: str) -> None:
        self._binary = binary

    def encode(self, audio: bytes, format: str) -> bytes:
        if format not in _CODECS:
            raise ValueError("unsupported recording format")
        # The executable comes only from deployment config; no learner text enters argv.
        command = [
            self._binary,
            "-nostdin",
            "-hide_banner",
            "-loglevel",
            "error",
            "-i",
            "pipe:0",
            *_CODECS[format],
            "pipe:1",
        ]
        try:
            result = subprocess.run(  # noqa: S603 - controlled executable and fixed arguments
                command,
                input=audio,
                stdout=subprocess.PIPE,
                stderr=subprocess.DEVNULL,
                check=True,
                timeout=ENCODING_SECONDS,
            )
        except (OSError, subprocess.SubprocessError):
            raise AudioEncodingError("encoding unavailable") from None
        if not result.stdout:
            raise AudioEncodingError("empty encoding")
        return result.stdout
