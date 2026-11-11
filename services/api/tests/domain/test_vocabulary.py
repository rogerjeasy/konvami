"""Vocabulary knowledge requires transcript evidence, not a card or an unverified guess (§6.7)."""

from konvami_api.domain.live_call import Turn
from konvami_api.domain.vocabulary import candidates, verified
from konvami_api.domain.word_use import GERMAN_WORD_RULES


def test_only_actual_partner_words_count_as_heard() -> None:
    found = candidates(
        ["der Termin", "der Zug", "die Katze"],
        [
            Turn("persona", "Der Zug kommt heute."),
            Turn("learner", "Ich habe einen Termin."),
        ],
        GERMAN_WORD_RULES,
    )
    assert [item.word for item in found] == ["der Termin", "der Zug"]
    assert found[0].heard is None
    assert found[0].spoken == ((1, "Ich habe einen Termin."),)
    assert found[1].heard == "Der Zug kommt heute."
    assert found[1].spoken == ()


def test_model_cannot_invent_a_quote_or_confirm_a_partner_turn_as_active() -> None:
    found = candidates(
        ["der Termin"], [Turn("learner", "Ich habe einen Termin.")], GERMAN_WORD_RULES
    )
    assert (
        verified(found, {"uses": [{"word": 0, "turn": 0, "quote": "invented", "correct": True}]})
        == {}
    )
    assert (
        verified(
            found,
            {"uses": [{"word": 0, "turn": 3, "quote": "Ich habe einen Termin.", "correct": True}]},
        )
        == {}
    )
    assert (
        verified(
            found,
            {"uses": [{"word": 0, "turn": 0, "quote": "Ich habe einen Termin.", "correct": False}]},
        )
        == {}
    )
    assert verified(
        found,
        {"uses": [{"word": 0, "turn": 0, "quote": "Ich habe einen Termin.", "correct": True}]},
    ) == {0: "Ich habe einen Termin."}


def test_candidate_words_are_deduplicated_and_empty_words_are_ignored() -> None:
    found = candidates(
        ["", "der Termin", "DER TERMIN"], [Turn("persona", "der Termin")], GERMAN_WORD_RULES
    )
    assert len(found) == 1
