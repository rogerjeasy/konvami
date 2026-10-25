"""Voice review (spec §6.7): the learner answers a card out loud, and hears whether the German
was right."""

from datetime import timedelta
from typing import Any
from uuid import uuid4

import pytest

from konvami_api.domain.accounts import Account
from konvami_api.domain.cards import CardError, WordDetails
from konvami_api.domain.costs import Feature
from konvami_api.domain.reports import Mistake, Word
from konvami_api.domain.speech import TranscriptionError
from konvami_api.domain.spoken import Listener
from konvami_api.domain.voice_review import MAX_ANSWERS_PER_DAY, Answered, VoiceReviewService
from tests.fakes import InMemoryDailyAllowance
from tests.world import NOON, OTHER_USER, USER, World

AUDIO = b"\x00\x01" * 400
TERMIN = Word("der Termin", "le rendez-vous", "Ich habe morgen einen Termin.")
FAHREN = Word("fahren", "aller (en véhicule)", None)
PERFEKT = Mistake(
    1,
    "Ich habe nach Berlin gefahren",
    "Ich bin nach Berlin gefahren",
    "« fahren » forme le Perfekt avec « sein ».",
    "perfekt_auxiliary",
    "noticeable",
    True,
)


def cards(world: World) -> dict[str, Any]:
    """A learner with a noun, a verb and a correction as cards."""
    lena, _ = world.onboard()
    call_id = world.talk(lena, at=NOON - timedelta(hours=1))
    world.reported(call_id, words=(TERMIN, FAHREN), mistakes=(PERFEKT,))
    return {
        "termin": world.cards.save(USER, call_id, "word", 0),
        "fahren": world.cards.save(USER, call_id, "word", 1),
        "perfekt": world.cards.save(USER, call_id, "correction", 0),
    }


def answer(world: World, card: Any, heard: str | Exception, fmt: str = "m4a") -> Answered:
    world.answer_transcriber.answers.append(heard)
    return world.voice_review.answer(USER, card.id, AUDIO, fmt, seconds=1.5)


def test_a_word_said_with_its_article_is_right() -> None:
    world = World()
    deck = cards(world)

    result = answer(world, deck["termin"], "Der Termin.")

    assert result == Answered(
        heard="Der Termin.", outcome="right", expected="der Termin", suggested="good"
    )


def test_a_word_in_a_sentence_is_right_too() -> None:
    world = World()
    deck = cards(world)

    assert answer(world, deck["fahren"], "Ich möchte fahren.").outcome == "right"


def test_a_noun_without_its_article_is_almost_right() -> None:
    world = World()
    deck = cards(world)

    result = answer(world, deck["termin"], "Termin")

    assert (result.outcome, result.suggested) == ("article", "hard")


def test_a_noun_with_another_article_is_almost_right() -> None:
    world = World()
    deck = cards(world)

    assert answer(world, deck["termin"], "die Termin").outcome == "article"


def test_another_word_is_not_right() -> None:
    world = World()
    deck = cards(world)

    result = answer(world, deck["termin"], "die Verabredung")

    assert (result.outcome, result.suggested) == ("wrong", "again")


def test_silence_is_not_right() -> None:
    world = World()
    deck = cards(world)

    assert answer(world, deck["fahren"], "").outcome == "wrong"


def test_a_correction_is_right_when_said_as_it_is_right() -> None:
    world = World()
    deck = cards(world)

    result = answer(world, deck["perfekt"], "Ich bin nach Berlin gefahren.")

    assert result == Answered(
        heard="Ich bin nach Berlin gefahren.",
        outcome="right",
        expected="Ich bin nach Berlin gefahren",
        suggested="good",
    )


def test_a_correction_said_with_the_mistake_again_is_not_right() -> None:
    world = World()
    deck = cards(world)

    assert answer(world, deck["perfekt"], "Ich habe nach Berlin gefahren.").outcome == "wrong"


def test_the_answer_is_written_down_as_said_keeping_mistakes() -> None:
    world = World()
    deck = cards(world)

    answer(world, deck["termin"], "der Termin", fmt="webm")

    (task,) = world.answer_transcriber.tasks
    assert task.model == "gpt-4o-transcribe"
    assert task.language == "de"
    assert "German" in task.prompt
    assert "Keep every mist" in task.prompt
    assert task.format == "webm"
    assert task.audio == AUDIO
    assert task.charge is not None
    assert task.charge.feature is Feature.VOICE_REVIEW


def test_an_answer_is_metered_at_least_as_long_as_its_size_makes_it() -> None:
    world = World()
    deck = cards(world)
    world.answer_transcriber.answers.append("der Termin")

    # The app says the recording lasts no time at all; its size says otherwise.
    world.voice_review.answer(USER, deck["termin"].id, b"\x00" * 40_000, "m4a", seconds=0)

    (task,) = world.answer_transcriber.tasks
    assert task.seconds == pytest.approx(10.0)


def test_answering_leaves_the_rating_to_the_learner() -> None:
    world = World()
    deck = cards(world)

    answer(world, deck["termin"], "der Termin")

    stored = world.card_store.get(USER, deck["termin"].id)
    assert stored is not None
    assert stored.reviews == 0


def test_the_expected_words_of_a_noun_follow_its_card() -> None:
    world = World()
    deck = cards(world)
    world.card_store.set_details(USER, deck["termin"].id, WordDetails("noun", article="der"))

    assert answer(world, deck["termin"], "der Termin").expected == "der Termin"


def test_a_card_that_is_not_the_learners_cannot_be_answered() -> None:
    world = World()
    cards(world)

    with pytest.raises(CardError) as raised:
        world.voice_review.answer(USER, uuid4(), AUDIO, "m4a")

    assert raised.value.code == "not_found"


def test_another_learners_card_cannot_be_answered() -> None:
    world = World()
    deck = cards(world)

    with pytest.raises(CardError) as raised:
        world.voice_review.answer(OTHER_USER, deck["termin"].id, AUDIO, "m4a")

    assert raised.value.code == "not_found"


@pytest.mark.parametrize(("audio", "fmt"), [(AUDIO, "ogg"), (b"", "m4a")])
def test_a_recording_that_is_not_one_is_refused(audio: bytes, fmt: str) -> None:
    world = World()
    deck = cards(world)

    with pytest.raises(CardError) as raised:
        world.voice_review.answer(USER, deck["termin"].id, audio, fmt)

    assert raised.value.code == "invalid_value"
    assert world.answer_transcriber.tasks == []


def test_a_learner_who_withdrew_their_consent_cannot_answer_out_loud() -> None:
    world = World()
    deck = cards(world)
    world.accounts.accounts[USER] = Account("Amara", "fr", voice_consent=False)

    with pytest.raises(CardError) as raised:
        world.voice_review.answer(USER, deck["termin"].id, AUDIO, "m4a")

    assert raised.value.code == "consent_required"
    assert world.answer_transcriber.tasks == []


def test_answers_are_limited_per_day() -> None:
    world = World()
    deck = cards(world)
    for _ in range(MAX_ANSWERS_PER_DAY):
        answer(world, deck["fahren"], "fahren")

    with pytest.raises(CardError) as raised:
        world.voice_review.answer(USER, deck["fahren"].id, AUDIO, "m4a")
    assert raised.value.code == "answer_limit"

    world.clock.now += timedelta(days=1)
    assert answer(world, deck["fahren"], "fahren").outcome == "right"


def test_an_answer_that_cannot_be_written_down_is_unavailable() -> None:
    world = World()
    deck = cards(world)

    with pytest.raises(CardError) as raised:
        answer(world, deck["termin"], TranscriptionError("down"))

    assert raised.value.code == "unavailable"


def test_without_a_transcription_model_answers_are_unavailable() -> None:
    world = World()
    deck = cards(world)
    listener = Listener(
        profiles=world.profiles,
        accounts=world.accounts,
        transcriber=world.answer_transcriber,
        model="",
    )
    service = VoiceReviewService(
        profiles=world.profiles,
        cards=world.card_store,
        listener=listener,
        allowance=InMemoryDailyAllowance(),
        clock=world.clock,
    )

    with pytest.raises(CardError) as raised:
        service.answer(USER, deck["termin"].id, AUDIO, "m4a")

    assert raised.value.code == "unavailable"
