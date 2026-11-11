"""Privacy-preserving PCM energy timing, not speech recognition or an emotion classifier."""

import struct
from dataclasses import dataclass

# Short frames smooth individual zero crossings. -40 dBFS separates quiet from audible energy;
# noisy microphones may inflate activity, so these values must never become CEFR thresholds.
FRAME_MS = 20
QUIET_RMS = 327.68
MIN_PAUSE_MS = 300
SAMPLE_BYTES = 2


@dataclass(frozen=True)
class AudioActivity:
    active_ms: int
    pause_ms: int
    pauses: int


def pcm_activity(pcm: bytes, rate: int) -> AudioActivity:
    if rate <= 0:
        raise ValueError("invalid sample rate")
    frames = max(1, rate * FRAME_MS // 1000)
    usable = len(pcm) - len(pcm) % SAMPLE_BYTES
    windows: list[tuple[bool, int]] = []
    for offset in range(0, usable, frames * SAMPLE_BYTES):
        block = pcm[offset : min(usable, offset + frames * SAMPLE_BYTES)]
        samples = [sample[0] for sample in struct.iter_unpack("<h", block)]
        active = sum(value * value for value in samples) / len(samples) >= QUIET_RMS**2
        windows.append((active, round(len(samples) * 1000 / rate)))
    active_ms = sum(length for active, length in windows if active)
    first = next((i for i, (active, _) in enumerate(windows) if active), None)
    if first is None:
        return AudioActivity(0, 0, 0)
    pause_ms = pauses = quiet = 0
    for active, length in windows[first:]:
        if active:
            if quiet >= MIN_PAUSE_MS:
                pause_ms += quiet
                pauses += 1
            quiet = 0
        else:
            quiet += length
    # A trailing quiet run has no following speech; it is not an internal pause.
    return AudioActivity(active_ms, pause_ms, pauses)
