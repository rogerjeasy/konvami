import io
import wave

from konvami_api.domain.alignment import WordTiming
from konvami_api.domain.assessment_segments import aligned_segments, pcm_details


def recording(seconds: int) -> bytes:
    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as output:
        output.setnchannels(1)
        output.setsampwidth(2)
        output.setframerate(16000)
        output.writeframes(b"\0\0" * 16000 * seconds)
    return buffer.getvalue()


def test_long_monologue_is_cut_only_at_verified_word_boundaries() -> None:
    words = (
        WordTiming("eins", 100, 8000),
        WordTiming("zwei", 9000, 18000),
        WordTiming("drei", 31000, 40000),
    )
    chunks = aligned_segments(recording(45), "eins zwei drei", words)
    assert [chunk.reference for chunk in chunks] == ["eins zwei", "drei"]
    assert all(0 < pcm_details(chunk.audio)[1] <= 30000 for chunk in chunks)
    assert [chunk.milliseconds for chunk in chunks] == [18100, 9200]


def test_mismatched_or_unbounded_timing_does_not_invent_alignment() -> None:
    assert aligned_segments(recording(45), "different words", (WordTiming("eins", 0, 1000),)) == ()
    assert aligned_segments(recording(45), "eins", (WordTiming("eins", 0, 31000),)) == ()
