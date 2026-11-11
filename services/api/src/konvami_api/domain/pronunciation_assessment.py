"""Dedicated acoustic assessment contract (§6.14); text recognition is never a phoneme score."""

from dataclasses import dataclass
from typing import Protocol

from konvami_api.domain.costs import Charge


class AssessmentError(Exception):
    """Unavailable or unsupported acoustic assessment, without provider request details."""


@dataclass(frozen=True)
class PhonemeScore:
    phoneme: str
    accuracy: float


@dataclass(frozen=True)
class AssessedWord:
    word: str
    accuracy: float
    phonemes: tuple[PhonemeScore, ...]


@dataclass(frozen=True)
class PronunciationAssessment:
    provider: str
    heard: str
    accuracy: float
    fluency: float | None
    prosody: float | None
    words: tuple[AssessedWord, ...]


class PronunciationAssessor(Protocol):
    provider: str

    def supports(self, language: str, audio_format: str) -> bool: ...

    def assess(
        self,
        language: str,
        reference: str,
        audio: bytes,
        audio_format: str,
        *,
        charge: Charge | None = None,
    ) -> PronunciationAssessment: ...
