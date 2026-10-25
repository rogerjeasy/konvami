"""Whether a learner used a word in what they said: the same cases as the app's
`lib/word-use.test.ts`, which shows it during a call."""

import pytest

from konvami_api.domain.catalog import CATALOG
from konvami_api.domain.word_use import uses_word

GERMAN = CATALOG.available_pack("de")


@pytest.mark.parametrize(
    ("word", "said"),
    [
        ("der Termin", "Ich habe morgen einen Termin."),
        ("der Termin", "Zwei Termine, das ist viel."),
        ("die Ausstellung", "Die Ausstellungen waren toll"),
        ("pünktlich", "Der Zug war nicht pünktlich."),
        ("besuchen", "Ich besuche meine Oma."),
        ("umsteigen", "Ich steige in Köln um."),
        ("anrufen", "Ich rufe dich morgen an"),
        ("anrufen", "Ich habe sie gestern angerufen."),
        ("sich freuen auf", "Ich freue mich auf das Wochenende."),
    ],
)
def test_a_word_is_found_in_its_forms(word: str, said: str) -> None:
    assert uses_word(word, said, GERMAN.word_rules if GERMAN else None)


@pytest.mark.parametrize(
    ("word", "said"),
    [
        ("umsteigen", "Ich steige in Köln aus."),
        ("der Tisch", "Das ist typisch."),
        ("das Rad", "Ich rate mal."),
        ("der Termin", ""),
    ],
)
def test_a_word_that_was_not_said_is_not_found(word: str, said: str) -> None:
    assert not uses_word(word, said, GERMAN.word_rules if GERMAN else None)


def test_without_rules_the_words_must_be_said_as_they_are() -> None:
    assert uses_word("la gare", "Je vais à la gare.", None)
    assert not uses_word("la gare", "Je vais au marché.", None)
