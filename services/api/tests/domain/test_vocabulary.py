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


def test_conversation_evidence_promotes_words_without_counting_saved_cards() -> None:
    from konvami_api.domain.reports import Word
    from tests.world import NOON, USER, World

    world = World()
    world.onboard()
    call_id = world.talk(
        None,
        at=NOON,
        turns=(
            Turn("persona", "Der Zug kommt heute. Hast du einen Termin?"),
            Turn("learner", "Ich habe einen Termin."),
        ),
    )
    world.reported(
        call_id, words=(Word("der Zug", "train", None), Word("der Termin", "appointment", None))
    )
    world.text.answers.append(
        {"uses": [{"word": 1, "turn": 1, "quote": "Ich habe einen Termin.", "correct": True}]}
    )
    world.vocabulary.after_report(call_id)
    counts = world.cards.progress(USER, NOON)
    assert counts.active_words == 1
    assert counts.passive_words == 1
    assert counts.total == 0
    requests = len(world.text.tasks)
    world.vocabulary.after_report(call_id)
    assert len(world.text.tasks) == requests


def test_consent_withdrawal_prevents_a_vocabulary_provider_request() -> None:
    from konvami_api.domain.accounts import Account
    from konvami_api.domain.reports import Word
    from tests.world import NOON, USER, World

    world = World()
    world.onboard()
    call_id = world.talk(None, at=NOON, learner_says=("Ich habe einen Termin.",))
    world.reported(call_id, words=(Word("der Termin", "appointment", None),))
    world.accounts.accounts[USER] = Account("Amara", "fr", voice_consent=False)
    requests = len(world.text.tasks)
    world.vocabulary.after_report(call_id)
    assert len(world.text.tasks) == requests
    assert world.vocabulary_store.scans == {}
    assert world.cards.progress(USER, NOON).active_words == 0


def test_provider_failure_preserves_exposure_without_inventing_active_knowledge() -> None:
    from konvami_api.domain.reports import Word
    from konvami_api.domain.text import TextModelError
    from tests.world import NOON, USER, World

    world = World()
    world.onboard()
    call_id = world.talk(
        None,
        at=NOON,
        turns=(
            Turn("persona", "Hast du einen Termin?"),
            Turn("learner", "Ich habe einen Termin."),
        ),
    )
    world.reported(call_id, words=(Word("der Termin", "appointment", None),))
    world.text.answers.append(TextModelError("unavailable"))
    world.vocabulary.after_report(call_id)
    counts = world.cards.progress(USER, NOON)
    assert (counts.active_words, counts.passive_words) == (0, 1)
