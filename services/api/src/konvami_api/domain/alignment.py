"""Real word timestamps for recorded speech (spec §6.6), never estimated from text."""

import re
from dataclasses import dataclass
from itertools import pairwise
from typing import Protocol

from konvami_api.domain.speech import TranscriptionTask


@dataclass(frozen=True)
class WordTiming:
    word: str
    start_ms: int
    end_ms: int


class WordAligner(Protocol):
    def align(self, task: TranscriptionTask) -> tuple[WordTiming, ...]: ...


def matches(text: str, words: tuple[WordTiming, ...], duration_ms: int) -> bool:
    """A second recognition pass may hear different words. Those times cannot label this text."""

    def normalize(value: str) -> str:
        return re.sub(r"[^\w]", "", value.casefold())

    return bool(words) and (
        normalize(text) == normalize("".join(item.word for item in words))
        and all(0 <= item.start_ms <= item.end_ms <= duration_ms for item in words)
        and all(left.end_ms <= right.start_ms for left, right in pairwise(words))
    )
