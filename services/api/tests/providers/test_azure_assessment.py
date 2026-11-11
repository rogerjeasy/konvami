import base64
import io
import json
import wave

import httpx
import pytest

from konvami_api.domain.pronunciation_assessment import AssessmentError
from konvami_api.providers.azure_assessment import AzurePronunciation


def wav() -> bytes:
    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as output:
        output.setnchannels(1)
        output.setsampwidth(2)
        output.setframerate(16000)
        output.writeframes(b"\0\0" * 1600)
    return buffer.getvalue()


def test_azure_receives_reference_and_returns_real_phoneme_scores() -> None:
    def respond(request: httpx.Request) -> httpx.Response:
        config = json.loads(base64.b64decode(request.headers["Pronunciation-Assessment"]))
        assert config["Granularity"] == "Phoneme"
        assert config["ReferenceText"] == "Hallo"
        assert request.url.params["language"] == "de-DE"
        assert request.content == wav()
        return httpx.Response(
            200,
            json={
                "RecognitionStatus": "Success",
                "NBest": [
                    {
                        "Display": "Hallo",
                        "AccuracyScore": 86,
                        "FluencyScore": 90,
                        "Words": [
                            {
                                "Word": "Hallo",
                                "AccuracyScore": 86,
                                "Phonemes": [{"Phoneme": "h", "AccuracyScore": 80}],
                            }
                        ],
                    }
                ],
            },
        )

    provider = AzurePronunciation(
        lambda: "test-key", "westeurope", httpx.Client(transport=httpx.MockTransport(respond))
    )
    result = provider.assess("de", "Hallo", wav(), "wav")
    assert result.words[0].phonemes[0].accuracy == 80
    assert result.prosody is None


@pytest.mark.parametrize("value", [-1, 101, float("nan")])
def test_invalid_scores_are_rejected(value: float) -> None:
    response = {
        "RecognitionStatus": "Success",
        "NBest": [{"Display": "Hello", "AccuracyScore": value, "Words": []}],
    }
    provider = AzurePronunciation(
        lambda: "test-key",
        "westeurope",
        httpx.Client(
            transport=httpx.MockTransport(
                lambda request: httpx.Response(200, content=json.dumps(response))
            )
        ),
    )
    with pytest.raises(AssessmentError):
        provider.assess("en", "Hello", wav(), "wav")


def test_unsupported_recordings_are_not_sent() -> None:
    provider = AzurePronunciation(lambda: "test-key", "westeurope")
    assert not provider.supports("de", "m4a")
    with pytest.raises(AssessmentError):
        provider.assess("de", "Hallo", b"not wav", "wav")
