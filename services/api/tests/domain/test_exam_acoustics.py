import io
import wave
from typing import Any

from konvami_api.domain.exam_acoustics import ExamAcoustics
from konvami_api.domain.live_call import Turn, TurnAudio
from konvami_api.domain.pronunciation_assessment import (
    AssessedWord,
    AssessmentError,
    PronunciationAssessment,
)
from tests.fakes import InMemoryFileStore
from tests.world import USER


class Encoder:
    def encode(self, audio: bytes, format: str) -> bytes:
        assert format == "wav"
        buffer = io.BytesIO()
        with wave.open(buffer, "wb") as output:
            output.setnchannels(1)
            output.setsampwidth(2)
            output.setframerate(16000)
            output.writeframes(b"\0\0" * (16000 * (31 if audio == b"long" else 1)))
        return buffer.getvalue()


class Assessor:
    provider = "Acoustic provider"

    def __init__(self) -> None:
        self.seen: list[str] = []

    def supports(self, language: str, audio_format: str) -> bool:
        return language == "de" and audio_format == "wav"

    def assess(
        self, language: str, reference: str, audio: bytes, audio_format: str, **kwargs: Any
    ) -> PronunciationAssessment:
        self.seen.append(reference)
        assert audio.startswith(b"RIFF")
        if reference == "failure":
            raise AssessmentError("unavailable")
        words = tuple(AssessedWord(word, 80, ()) for word in reference.split())
        return PronunciationAssessment(
            self.provider, reference, 80 if len(words) == 1 else 60, 70, None, words
        )


def test_only_owned_short_learner_turns_are_assessed_and_weighted_by_word_count() -> None:
    files = InMemoryFileStore()
    key = f"users/{USER}/recordings/call/turn.wav"
    files.save(key, b"audio", "audio/wav")
    files.save(key + "long", b"long", "audio/wav")
    provider = Assessor()
    service = ExamAcoustics(provider, Encoder(), files)
    result = service.assess(
        USER,
        "call",
        "de",
        (
            Turn("persona", "Hello", TurnAudio(key, 1000)),
            Turn("learner", "Hallo", TurnAudio(key, 1000)),
            Turn("learner", "guten Tag", TurnAudio(key, 2000)),
            Turn("learner", "too long", TurnAudio(key + "long", 31000)),
            Turn("learner", "missing"),
            Turn("learner", "foreign", TurnAudio("users/another/recording.wav", 1000)),
        ),
    )
    assert result.assessed_turns == 2
    assert result.skipped_turns == 3
    assert result.accuracy == 66.7
    assert result.prosody is None
    assert provider.seen == ["Hallo", "guten Tag"]


def test_unavailable_assessment_never_fabricates_zero_scores() -> None:
    files = InMemoryFileStore()
    key = f"users/{USER}/recordings/call/turn.wav"
    files.save(key, b"audio", "audio/wav")
    service = ExamAcoustics(Assessor(), Encoder(), files)
    result = service.assess(USER, "call", "de", (Turn("learner", "failure", TurnAudio(key, 1000)),))
    assert result.accuracy is None
    assert result.assessed_turns == 0
    assert result.skipped_turns == 1


def test_alignment_can_cover_long_monologues_without_guessing_word_timings() -> None:
    from konvami_api.domain.alignment import WordTiming
    from konvami_api.domain.speech import TranscriptionTask

    class Aligner:
        def align(self, task: TranscriptionTask) -> tuple[WordTiming, ...]:
            return (WordTiming("Hallo", 0, 10000), WordTiming("Welt", 20000, 31000))

    files = InMemoryFileStore()
    key = f"users/{USER}/recordings/call/turn.wav"
    files.save(key, b"long", "audio/wav")
    provider = Assessor()
    service = ExamAcoustics(
        provider, Encoder(), files, aligner=Aligner(), alignment_model="whisper-1"
    )
    result = service.assess(
        USER, "call", "de", (Turn("learner", "Hallo Welt", TurnAudio(key, 31000)),)
    )
    assert result.assessed_turns == 1
    assert result.skipped_turns == 0
    assert provider.seen == ["Hallo", "Welt"]


def test_provider_calls_are_bounded_even_when_an_exam_has_many_turns() -> None:
    from konvami_api.domain.exam_acoustics import MAX_SEGMENTS

    files = InMemoryFileStore()
    key = f"users/{USER}/recordings/call/turn.wav"
    files.save(key, b"audio", "audio/wav")
    provider = Assessor()
    result = ExamAcoustics(provider, Encoder(), files).assess(
        USER, "call", "de", (Turn("learner", "Hallo", TurnAudio(key, 1000)),) * (MAX_SEGMENTS + 2)
    )
    assert len(provider.seen) == MAX_SEGMENTS
    assert result.skipped_turns == 2
