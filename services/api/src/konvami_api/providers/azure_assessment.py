"""Azure's short-audio pronunciation assessment REST API.

Contract: https://learn.microsoft.com/azure/ai-services/speech-service/rest-speech-to-text-short
Only validated 16 kHz mono PCM WAV is accepted; the adapter never relabels compressed audio.
"""

import base64
import io
import json
import math
import re
import wave
from collections.abc import Callable
from typing import Any

import httpx

from konvami_api.domain.costs import Charge, UsageMeter
from konvami_api.domain.pronunciation_assessment import (
    AssessedWord,
    AssessmentError,
    PhonemeScore,
    PronunciationAssessment,
)

LOCALES = {"de": "de-DE", "en": "en-US", "fr": "fr-FR", "it": "it-IT"}
# Azure's assessment REST endpoint supports at most thirty seconds, 16-bit mono at 16 kHz.
SAMPLE_RATE = 16_000
MAX_SECONDS = 30
TIMEOUT_SECONDS = 20


def _score(value: Any) -> float:
    if isinstance(value, bool) or not isinstance(value, (float, int)):
        raise AssessmentError("invalid_score")
    score = float(value)
    if not math.isfinite(score) or not 0 <= score <= 100:
        raise AssessmentError("invalid_score")
    return score


def _marks(item: dict[str, Any]) -> dict[str, Any]:
    # SDK-style and REST-style payloads place the same scores at different depths.
    nested = item.get("PronunciationAssessment")
    return nested if isinstance(nested, dict) else item


def _assessment(payload: dict[str, Any]) -> PronunciationAssessment:
    if payload.get("RecognitionStatus") != "Success":
        raise AssessmentError("no_speech")
    try:
        best = payload["NBest"][0]
        marks = _marks(best)
        words = tuple(
            AssessedWord(
                word=str(word["Word"]),
                accuracy=_score(_marks(word)["AccuracyScore"]),
                phonemes=tuple(
                    PhonemeScore(str(phone["Phoneme"]), _score(_marks(phone)["AccuracyScore"]))
                    for phone in word.get("Phonemes", [])
                ),
            )
            for word in best["Words"]
        )
        return PronunciationAssessment(
            provider="Microsoft Azure Speech",
            heard=str(best["Display"]),
            accuracy=_score(marks["AccuracyScore"]),
            fluency=_score(marks["FluencyScore"]) if "FluencyScore" in marks else None,
            prosody=_score(marks["ProsodyScore"]) if "ProsodyScore" in marks else None,
            words=words,
        )
    except (KeyError, IndexError, TypeError, AttributeError) as error:
        raise AssessmentError("invalid_response") from error


class AzurePronunciation:
    provider = "Microsoft Azure Speech"

    def __init__(
        self,
        key: Callable[[], str],
        region: str,
        http: httpx.Client | None = None,
        meter: UsageMeter | None = None,
    ) -> None:
        if not re.fullmatch(r"[a-z][a-z0-9]{1,30}", region):
            raise ValueError("invalid speech region")
        self._key = key
        self._url = (
            f"https://{region}.stt.speech.microsoft.com/"
            "speech/recognition/conversation/cognitiveservices/v1"
        )
        self._http = http or httpx.Client()
        self._meter = meter

    def supports(self, language: str, audio_format: str) -> bool:
        return language in LOCALES and audio_format == "wav"

    def assess(
        self,
        language: str,
        reference: str,
        audio: bytes,
        audio_format: str,
        *,
        charge: Charge | None = None,
    ) -> PronunciationAssessment:
        if not self.supports(language, audio_format):
            raise AssessmentError("unsupported_audio")
        try:
            with wave.open(io.BytesIO(audio), "rb") as recording:
                if (
                    recording.getnchannels() != 1
                    or recording.getsampwidth() != 2
                    or recording.getframerate() != SAMPLE_RATE
                    or not 0 < recording.getnframes() <= MAX_SECONDS * SAMPLE_RATE
                ):
                    raise AssessmentError("unsupported_audio")
                seconds = recording.getnframes() / recording.getframerate()
        except (wave.Error, EOFError) as error:
            raise AssessmentError("unsupported_audio") from error
        options = {
            "ReferenceText": reference,
            "GradingSystem": "HundredMark",
            "Granularity": "Phoneme",
            "Dimension": "Comprehensive",
            "EnableMiscue": True,
            # Prosody is supported for en-US; other languages must not receive invented marks.
            "EnableProsodyAssessment": language == "en",
        }
        try:
            response = self._http.post(
                self._url,
                params={"language": LOCALES[language], "format": "detailed"},
                headers={
                    "Ocp-Apim-Subscription-Key": self._key(),
                    "Content-Type": "audio/wav; codecs=audio/pcm; samplerate=16000",
                    "Accept": "application/json",
                    "Pronunciation-Assessment": base64.b64encode(
                        json.dumps(options).encode()
                    ).decode(),
                },
                content=audio,
                timeout=TIMEOUT_SECONDS,
            )
        except httpx.HTTPError:
            # HTTP exceptions carry credential-bearing requests; never propagate those.
            raise AssessmentError("unavailable") from None
        if not response.is_success:
            raise AssessmentError("unavailable")
        try:
            payload = response.json()
        except ValueError:
            raise AssessmentError("invalid_response") from None
        if not isinstance(payload, dict):
            raise AssessmentError("invalid_response")
        result = _assessment(payload)
        if self._meter is not None and charge is not None:
            self._meter.record(charge, "azure", "pronunciation", {"seconds": seconds})
        return result
