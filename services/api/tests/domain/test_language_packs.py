"""Every enabled target language supplies material to the existing learning services (§13)."""

import pytest

from konvami_api.domain.catalog import CATALOG
from konvami_api.domain.word_use import uses_word


@pytest.mark.parametrize("code", ["en", "fr", "it"])
def test_target_pack_has_grammar_practice_and_native_partners(code: str) -> None:
    pack = CATALOG.available_pack(code)
    assert pack is not None
    assert tuple(note.topic for note in pack.grammar) == pack.error_categories
    assert len(pack.grammar) >= 8
    assert {topic.level for topic in pack.grammar_map} == {"A1", "A2", "B1", "B2", "C1", "C2"}
    for topic in pack.grammar_map:
        assert set(topic.categories) <= set(pack.error_categories)
        assert topic.examples
        assert topic.elicit
    for note in pack.grammar:
        assert len(note.rule) >= 60
        assert note.right
        assert note.wrong
        assert not set(note.right) & set(note.wrong)
    assert len(pack.scenarios) >= 7
    assert len(pack.starter_personas) == 3
    assert len({person.name for person in pack.starter_personas}) == 3
    assert pack.voice_sample
    assert pack.speaking_exams == ()


@pytest.mark.parametrize("code", ["en", "fr", "it"])
def test_target_sounds_have_four_translations_and_real_drills(code: str) -> None:
    pack = CATALOG.available_pack(code)
    assert pack is not None
    assert len(pack.pronunciation) >= 3
    for sound in pack.pronunciation:
        assert set(sound.texts) == {"en", "de", "fr", "it"}
        assert sound.pairs
        assert sound.words
        assert sound.sentences
        assert sound.targets() >= sound.spoken()
        assert all(first != second for first, second in sound.pairs)


@pytest.mark.parametrize(
    ("code", "entry", "said"),
    [
        ("en", "to work", "She works every morning."),
        ("en", "the ticket", "I bought two tickets."),
        ("fr", "la maison", "Nous regardons les maisons."),
        ("fr", "parler", "Nous parlons français."),
        ("it", "il biglietto", "Vorrei due biglietti."),
        ("it", "parlare", "Parliamo italiano."),
    ],
)
def test_target_word_rules_recognise_common_inflections(code: str, entry: str, said: str) -> None:
    pack = CATALOG.available_pack(code)
    assert pack is not None
    assert uses_word(entry, said, pack.word_rules)
    assert not uses_word(entry, "xyz", pack.word_rules)


def test_unsupported_language_is_still_rejected() -> None:
    assert CATALOG.available_pack("xx") is None
