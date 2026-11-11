"""The english lab offers distinct listening choices and localized guidance (§13)."""

from konvami_api.domain.language_packs.english_sounds import SOUNDS


def test_every_drill_has_distinct_choices_and_accessible_guidance() -> None:
    assert len(SOUNDS) >= 3
    assert len({sound.id for sound in SOUNDS}) == len(SOUNDS)
    for sound in SOUNDS:
        assert set(sound.texts) == {"en", "de", "fr", "it"}
        assert sound.sentences
        assert sound.words
        assert sound.pairs
        assert all(first != second for first, second in sound.pairs)
        for language in ("en", "de", "fr", "it"):
            assert sound.text(language).tip
        assert sound.text("unknown") == sound.text("en")
