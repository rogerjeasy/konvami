"""Cut PCM only at real alignment boundaries; reference words are never timed heuristically."""

import io
import wave
from dataclasses import dataclass

from konvami_api.domain.alignment import WordTiming, matches

MAX_SEGMENT_MS = 30_000
SAMPLE_RATE = 16_000
SAMPLE_BYTES = 2
# Preserve acoustic context on either side of words without crossing the provider duration cap.
PADDING_MS = 100


@dataclass(frozen=True)
class AssessmentSegment:
    audio: bytes
    reference: str
    milliseconds: int


def pcm_details(audio: bytes) -> tuple[bytes, int]:
    with wave.open(io.BytesIO(audio), "rb") as source:
        if (
            source.getnchannels() != 1
            or source.getsampwidth() != SAMPLE_BYTES
            or source.getframerate() != SAMPLE_RATE
        ):
            raise ValueError("unsupported PCM")
        return source.readframes(source.getnframes()), source.getnframes() * 1000 // SAMPLE_RATE


def aligned_segments(
    audio: bytes, reference: str, words: tuple[WordTiming, ...]
) -> tuple[AssessmentSegment, ...]:
    pcm, duration = pcm_details(audio)
    if not matches(reference, words, duration):
        return ()
    groups: list[list[WordTiming]] = []
    for word in words:
        if word.end_ms - word.start_ms + 2 * PADDING_MS > MAX_SEGMENT_MS:
            return ()
        if not groups or word.end_ms - groups[-1][0].start_ms + 2 * PADDING_MS > MAX_SEGMENT_MS:
            groups.append([])
        groups[-1].append(word)
    segments = []
    for group in groups:
        start = max(0, group[0].start_ms - PADDING_MS)
        end = min(duration, group[-1].end_ms + PADDING_MS)
        body = io.BytesIO()
        with wave.open(body, "wb") as output:
            output.setnchannels(1)
            output.setsampwidth(SAMPLE_BYTES)
            output.setframerate(SAMPLE_RATE)
            output.writeframes(
                pcm[
                    start * SAMPLE_RATE // 1000 * SAMPLE_BYTES : end
                    * SAMPLE_RATE
                    // 1000
                    * SAMPLE_BYTES
                ]
            )
        segments.append(
            AssessmentSegment(body.getvalue(), " ".join(word.word for word in group), end - start)
        )
    return tuple(segments)
