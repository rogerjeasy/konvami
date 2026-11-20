# The IPA symbols below are the data, not look-alikes of ASCII letters.
# ruff: noqa: RUF001
"""How a drill went for the sound it practises, from an acoustic assessment (spec §6.14 P2, §9.5).

The assessment provider scores every phoneme of the words said (0-100). A lab drill is about one
problem sound, so the learner is told how *that* sound went: the mean accuracy of the phonemes
that are the sound, in the words they were asked to say. Phoneme names depend on the provider's
alphabet (IPA, or Microsoft's SAPI set for some locales), so each sound lists both spellings.
When no phoneme of the sound is found in the result (another alphabet, or phoneme names not given
for the locale), the words that carry the sound are used instead and the result says so.

Stress is not a phoneme and accuracy does not measure it, so stress drills get no score: a
number there would be invented.
"""

import unicodedata
from collections.abc import Sequence
from dataclasses import dataclass
from typing import Literal

from konvami_api.domain.pronunciation_assessment import AssessedWord, PronunciationAssessment

# Bands on the provider's 0-100 scale. A pedagogical nudge, never an exam or CEFR cutoff. The
# lower bound of "close" is the lab's existing review threshold, so the two always agree.
GOOD_FROM = 85
CLOSE_FROM = 70

Band = Literal["good", "close", "practise"]
Basis = Literal["phonemes", "words"]
# Where in a word the sound is: anywhere, its first phoneme, or its last.
Position = Literal["any", "first", "last"]


@dataclass(frozen=True)
class Matcher:
    phonemes: frozenset[str]
    position: Position = "any"


@dataclass(frozen=True)
class SoundScore:
    sound_id: str
    score: float
    band: Band
    basis: Basis
    # The word asked for whose sound scored lowest, to say again first.
    weakest: str


def _set(*symbols: str) -> frozenset[str]:
    return frozenset(unicodedata.normalize("NFC", s) for s in symbols)


_GERMAN_VOWELS = _set(
    "a", "aː", "a:", "ɐ", "e", "eː", "e:", "ɛ", "ɛː", "ə", "i", "iː", "i:", "ɪ", "o", "oː", "o:",
    "ɔ", "u", "uː", "u:", "ʊ", "y", "yː", "y:", "ʏ", "ø", "øː", "œ",
)  # fmt: skip

MATCHERS: dict[str, Matcher] = {
    # German (domain/pronunciation_sounds.py).
    "ue": Matcher(_set("y", "yː", "y:", "ʏ", "Y")),
    "oe": Matcher(_set("ø", "øː", "ø:", "œ", "2:", "9")),
    "ich_ach": Matcher(_set("ç", "x", "C")),
    "r": Matcher(_set("ʁ", "ʀ", "r", "ɐ", "R", "6")),
    "final_devoicing": Matcher(_set("p", "t", "k", "f", "s", "ʃ", "ç", "x"), "last"),
    # Vowel length is how every vowel of the word is held, short or long.
    "vowel_length": Matcher(_GERMAN_VOWELS),
    "ig": Matcher(_set("ç", "C", "k"), "last"),
    "sp_st": Matcher(_set("ʃ", "S"), "first"),
    # English (language_packs/english_sounds.py), IPA and SAPI.
    "en_short_long_i": Matcher(_set("ɪ", "i", "iː", "i:", "ih", "iy")),
    "en_th": Matcher(_set("θ", "ð", "th", "dh")),
    "en_v_w": Matcher(_set("v", "w")),
    # French.
    "fr_u_ou": Matcher(_set("y", "u")),
    "fr_nasal": Matcher(_set("ɑ̃", "ɔ̃", "ɛ̃", "œ̃", "ã", "õ")),
    "fr_e_open": Matcher(_set("e", "ɛ")),
    # Italian. A geminate is a long consonant; the provider marks it with a length mark.
    "it_geminates": Matcher(
        _set("pː", "tː", "kː", "bː", "dː", "gː", "fː", "sː", "lː", "mː", "nː", "rː", "tʃː", "ddʒː")
    ),
    "it_r_l": Matcher(_set("r", "ɾ", "l")),
    "it_gn": Matcher(_set("ɲ", "ɲː")),
}

# Sounds that accuracy cannot measure. They keep the word comparison only.
UNSCORED = frozenset({"stress"})


def band(score: float) -> Band:
    if score >= GOOD_FROM:
        return "good"
    if score >= CLOSE_FROM:
        return "close"
    return "practise"


def _sound_phonemes(word: AssessedWord, matcher: Matcher) -> list[float]:
    phones = list(word.phonemes)
    if matcher.position == "first":
        phones = phones[:1]
    elif matcher.position == "last":
        phones = phones[-1:]
    return [
        phone.accuracy
        for phone in phones
        if unicodedata.normalize("NFC", phone.phoneme.strip()) in matcher.phonemes
    ]


def score_sound(
    sound_id: str, asked: Sequence[str], assessment: PronunciationAssessment
) -> SoundScore | None:
    """The score of the sound `sound_id` in the words `asked` for; None when the sound is not
    scored or none of those words was assessed."""
    matcher = MATCHERS.get(sound_id)
    if matcher is None:
        return None
    wanted = {text.casefold() for text in asked}
    words = [w for w in assessment.words if w.word.casefold() in wanted]
    if not words:
        return None
    per_word = [(w, _sound_phonemes(w, matcher)) for w in words]
    found = [(w, scores) for w, scores in per_word if scores]
    if found:
        scores = [score for _, scores in found for score in scores]
        weakest = min(found, key=lambda item: min(item[1]))[0].word
        basis: Basis = "phonemes"
    else:
        scores = [w.accuracy for w in words]
        weakest = min(words, key=lambda w: w.accuracy).word
        basis = "words"
    score = round(sum(scores) / len(scores), 1)
    return SoundScore(sound_id, score, band(score), basis, weakest)
