from dataclasses import replace

import httpx
import pytest

from konvami_api.domain.speech import TranscriptionError
from tests.providers.test_openai_transcription import TASK, model


def test_alignment_requests_genuine_word_timestamps() -> None:
    seen: list[bytes] = []

    def reply(request: httpx.Request) -> httpx.Response:
        seen.append(request.content)
        return httpx.Response(
            200,
            json={
                "text": "Hallo Welt",
                "words": [
                    {"word": "Hallo", "start": 0.1, "end": 0.4},
                    {"word": "Welt", "start": 0.5, "end": 0.8},
                ],
            },
        )

    words = model(reply).align(replace(TASK, model="whisper-1"))
    assert [(word.word, word.start_ms, word.end_ms) for word in words] == [
        ("Hallo", 100, 400),
        ("Welt", 500, 800),
    ]
    assert b"verbose_json" in seen[0]
    assert b"timestamp_granularities[]" in seen[0]


@pytest.mark.parametrize(
    "words",
    [
        None,
        [{"word": "a", "start": -1, "end": 1}],
        [{"word": "a", "start": 2, "end": 1}],
        [{"word": "a", "start": "x", "end": 1}],
    ],
)
def test_invalid_alignment_is_never_invented(words: object) -> None:
    provider = model(lambda _: httpx.Response(200, json={"text": "a", "words": words}))
    with pytest.raises(TranscriptionError):
        provider.align(replace(TASK, model="whisper-1"))
