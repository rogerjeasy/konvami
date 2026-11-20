"""Per-sound scores from an acoustic assessment (spec §6.14 P2, §9.5)."""

import pytest

from konvami_api.domain.catalog import CATALOG
from konvami_api.domain.pronunciation_assessment import (
    AssessedWord,
    PhonemeScore,
    PronunciationAssessment,
)
from konvami_api.domain.sound_phonemes import (
    GOOD_FROM,
    MATCHERS,
    UNSCORED,
    band,
    score_sound,
)


def assessment(*words: AssessedWord) -> PronunciationAssessment:
    return PronunciationAssessment("Test", " ".join(w.word for w in words), 80, None, None, words)


def word(text: str, accuracy: float, *phones: tuple[str, float]) -> AssessedWord:
    return AssessedWord(text, accuracy, tuple(PhonemeScore(p, a) for p, a in phones))


def test_every_sound_of_every_pack_is_mapped_or_named_as_unscored() -> None:
    for pack in CATALOG.packs:
        for sound in pack.pronunciation:
            assert (sound.id in MATCHERS) != (sound.id in UNSCORED), sound.id


def test_the_sound_is_scored_from_its_own_phonemes_only() -> None:
    result = score_sound(
        "ue",
        ["für"],
        assessment(word("für", 75, ("f", 99), ("y", 52), ("ʁ", 90))),
    )
    assert result is not None
    assert result.score == 52
    assert result.basis == "phonemes"
    assert result.band == "practise"
    assert result.weakest == "für"


def test_ipa_and_sapi_spellings_both_count_and_the_mean_is_taken() -> None:
    result = score_sound(
        "ue",
        ["Tier", "Tür"],
        assessment(word("Tier", 95, ("t", 99), ("iː", 95)), word("Tür", 80, ("t", 99), ("Y", 90))),
    )
    assert result is not None
    assert result.score == 90
    assert result.weakest == "Tür"


def test_a_position_bound_sound_only_counts_its_position() -> None:
    # Final devoicing is the last consonant: the t of "Tag" at the start does not count.
    result = score_sound(
        "final_devoicing", ["Tag"], assessment(word("Tag", 80, ("t", 40), ("a", 99), ("k", 88)))
    )
    assert result is not None
    assert result.score == 88


def test_words_not_asked_for_are_left_out() -> None:
    result = score_sound(
        "ue", ["für"], assessment(word("vier", 30, ("iː", 10)), word("für", 90, ("y", 91)))
    )
    assert result is not None
    assert result.score == 91


def test_without_matching_phonemes_the_words_carrying_the_sound_are_used() -> None:
    result = score_sound("ue", ["müde"], assessment(word("müde", 78)))
    assert result is not None
    assert result.basis == "words"
    assert result.score == 78
    assert result.band == "close"


def test_stress_is_never_scored() -> None:
    assert score_sound("stress", ["Hotel"], assessment(word("Hotel", 90, ("o", 90)))) is None


def test_nothing_is_scored_when_no_word_asked_for_was_assessed() -> None:
    assert score_sound("ue", ["für"], assessment(word("vier", 70))) is None


@pytest.mark.parametrize(
    ("score", "expected"),
    [
        (100, "good"),
        (GOOD_FROM, "good"),
        (GOOD_FROM - 1, "close"),
        (70, "close"),
        (69.9, "practise"),
    ],
)
def test_bands(score: float, expected: str) -> None:
    assert band(score) == expected
