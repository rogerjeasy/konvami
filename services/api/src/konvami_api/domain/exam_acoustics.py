"""Bounded, actual acoustic observations for consented exams, separate from rubric grades."""

import logging
from collections.abc import Sequence
from dataclasses import dataclass
from uuid import UUID

from konvami_api.domain.alignment import WordAligner
from konvami_api.domain.assessment_segments import (
    MAX_SEGMENT_MS,
    AssessmentSegment,
    aligned_segments,
    pcm_details,
)
from konvami_api.domain.costs import Charge, Feature
from konvami_api.domain.live_call import Turn
from konvami_api.domain.pronunciation_assessment import (
    PronunciationAssessment,
    PronunciationAssessor,
)
from konvami_api.domain.recording_export import AudioEncoder
from konvami_api.domain.speech import TranscriptionTask
from konvami_api.domain.storage import FileStore

# Six short requests bound added assessment cost and worker time (at most three minutes audio).
MAX_SEGMENTS = 6
_log = logging.getLogger(__name__)


@dataclass(frozen=True)
class ExamPronunciation:
    provider: str
    accuracy: float | None
    fluency: float | None
    prosody: float | None
    assessed_turns: int
    skipped_turns: int
    assessed_seconds: float


class ExamAcoustics:
    def __init__(
        self,
        assessor: PronunciationAssessor,
        encoder: AudioEncoder,
        files: FileStore,
        *,
        aligner: WordAligner | None = None,
        alignment_model: str = "",
    ) -> None:
        self._assessor = assessor
        self._encoder = encoder
        self._files = files
        self._aligner = aligner
        self._alignment_model = alignment_model

    def provider(self, language: str) -> str | None:
        return self._assessor.provider if self._assessor.supports(language, "wav") else None

    def assess(
        self, user_id: UUID, call_id: str, language: str, turns: Sequence[Turn]
    ) -> ExamPronunciation:
        scores: list[PronunciationAssessment] = []
        assessed_turns = skipped = requests = milliseconds = 0
        prefix = f"users/{user_id}/recordings/{call_id}/"
        for turn in turns:
            if turn.speaker != "learner" or not turn.said.strip():
                continue
            completed = 0
            segments: tuple[AssessmentSegment, ...] = ()
            try:
                if (
                    requests >= MAX_SEGMENTS
                    or turn.audio is None
                    or not turn.audio.key.startswith(prefix)
                    or self.provider(language) is None
                ):
                    skipped += 1
                    continue
                converted = self._encoder.encode(self._files.read(turn.audio.key), "wav")
                _, duration = pcm_details(converted)
                if 0 < duration <= MAX_SEGMENT_MS:
                    segments = (AssessmentSegment(converted, turn.said, duration),)
                elif duration > MAX_SEGMENT_MS and self._aligner and self._alignment_model:
                    words = self._aligner.align(
                        TranscriptionTask(
                            self._alignment_model,
                            converted,
                            language,
                            turn.said,
                            charge=Charge(user_id, Feature.EXAM_SCORE),
                            seconds=duration / 1000,
                        )
                    )
                    segments = aligned_segments(converted, turn.said, words)
                for segment in segments:
                    if requests >= MAX_SEGMENTS:
                        break
                    requests += 1
                    score = self._assessor.assess(
                        language,
                        segment.reference,
                        segment.audio,
                        "wav",
                        charge=Charge(user_id, Feature.EXAM_SCORE),
                    )
                    scores.append(score)
                    milliseconds += segment.milliseconds
                    completed += 1
            except Exception:
                # A partial acoustic outage must not destroy a valid transcript-based result.
                # Provider requests may contain credentials, so keep exceptions out of user data.
                _log.warning("Exam acoustic segment unavailable")
            if completed:
                assessed_turns += 1
            if not segments or completed < len(segments):
                skipped += 1

        def average(field: str) -> float | None:
            measured = [
                (getattr(score, field), max(1, len(score.words)))
                for score in scores
                if getattr(score, field) is not None
            ]
            return (
                round(
                    sum(value * weight for value, weight in measured)
                    / sum(weight for _, weight in measured),
                    1,
                )
                if measured
                else None
            )

        return ExamPronunciation(
            self._assessor.provider,
            average("accuracy"),
            average("fluency"),
            average("prosody"),
            assessed_turns,
            skipped,
            round(milliseconds / 1000, 1),
        )
