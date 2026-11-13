import re

from konvami_api.domain.lexical_frequency import frequency_profile
from konvami_api.domain.live_call import Turn


class Lexicon:
    def tokens(self, text: str, language: str) -> list[str]:
        return re.findall(r"\w+", text)

    def zipf(self, word: str, language: str) -> float:
        assert language == "en"
        return {"hello": 5.2, "green": 4.4, "meadow": 3.2, "silviculture": 2.1}.get(word, 0)


def test_profiles_only_learner_words_using_corpus_bands_without_calling_them_levels() -> None:
    profile = frequency_profile(
        (
            Turn("persona", "hello hello hello"),
            Turn("learner", "Hello green meadow silviculture Xyzzy hello 2026."),
        ),
        "en",
        Lexicon(),
    )
    assert profile.tokens == 6
    assert profile.unique_words == 5
    assert profile.common == 2
    assert profile.frequent == profile.uncommon == profile.rare == profile.unknown == 1


def test_uses_verbatim_and_keeps_unknown_words_separate_from_rare_words() -> None:
    profile = frequency_profile((Turn("learner", "hello", verbatim="Xyzzy"),), "en", Lexicon())
    assert profile.unknown == 1
    assert profile.rare == 0


def test_empty_and_partner_only_transcripts_have_no_measured_tokens() -> None:
    assert frequency_profile((Turn("persona", "hello"),), "en", Lexicon()).tokens == 0
