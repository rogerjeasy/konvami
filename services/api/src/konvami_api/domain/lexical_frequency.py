"""Corpus frequency observations, not CEFR levels or a test of word knowledge (§6.9)."""

import math
from collections.abc import Sequence
from dataclasses import dataclass
from typing import Protocol

from konvami_api.domain.live_call import Turn

# Zipf = log10 occurrences per billion words. These are frequency bands, never level cutoffs.
COMMON_ZIPF = 5
FREQUENT_ZIPF = 4
UNCOMMON_ZIPF = 3


class FrequencyLexicon(Protocol):
    def tokens(self, text: str, language: str) -> Sequence[str]: ...
    def zipf(self, word: str, language: str) -> float: ...


@dataclass(frozen=True)
class FrequencyProfile:
    tokens: int
    unique_words: int
    common: int
    frequent: int
    uncommon: int
    rare: int
    unknown: int


def frequency_profile(
    turns: Sequence[Turn], language: str, lexicon: FrequencyLexicon
) -> FrequencyProfile:
    words = [
        word.casefold()
        for turn in turns
        if turn.speaker == "learner"
        for word in lexicon.tokens(turn.said, language)
        if any(letter.isalpha() for letter in word)
    ]
    # Look up each distinct form once. Repetitions still contribute to the token distribution.
    frequencies = {word: lexicon.zipf(word, language) for word in set(words)}
    counts = dict.fromkeys(("common", "frequent", "uncommon", "rare", "unknown"), 0)
    for word in words:
        value = frequencies[word]
        if not math.isfinite(value) or value <= 0:
            band = "unknown"
        elif value >= COMMON_ZIPF:
            band = "common"
        elif value >= FREQUENT_ZIPF:
            band = "frequent"
        elif value >= UNCOMMON_ZIPF:
            band = "uncommon"
        else:
            band = "rare"
        counts[band] += 1
    return FrequencyProfile(tokens=len(words), unique_words=len(frequencies), **counts)
