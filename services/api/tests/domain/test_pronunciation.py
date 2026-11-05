"""The pronunciation lab (spec §6.14): sounds, drills heard word by word, problem words."""

import pytest

from konvami_api.domain.accounts import Account
from konvami_api.domain.catalog import GERMAN
from konvami_api.domain.costs import Feature
from konvami_api.domain.pronunciation import MAX_ATTEMPTS_PER_DAY, Attempt, PronunciationError
from konvami_api.domain.pronunciation_sounds import FALLBACK_LANGUAGE
from konvami_api.domain.speech import TranscriptionError
from konvami_api.domain.spoken import matched_words
from tests.world import USER, World

AUDIO = b"\x00\x01" * 400


def lab() -> World:
    world = World()
    world.onboard()
    return world


def say(
    world: World, heard: str, target: str, sound: str | None = "ue", drill: str = "word"
) -> Attempt:
    world.pronunciation_transcriber.answers.append(heard)
    return world.pronunciation.attempt(
        USER,
        drill,  # type: ignore[arg-type]
        sound,
        target,
        AUDIO,
        "m4a",
        seconds=2.0,
    )


def test_every_sound_has_a_text_in_the_fallback_language_and_words_to_practise() -> None:
    for sound in GERMAN.pronunciation:
        assert FALLBACK_LANGUAGE in sound.texts
        assert sound.words or sound.pairs
        assert sound.sentences
        # A pair is listened to only if its words sound different, and has two different words.
        assert all(first != second for first, second in sound.pairs)
        assert sound.listening <= bool(sound.pairs)


def test_the_catalogue_is_explained_in_the_learners_language() -> None:
    world = lab()

    sounds = world.pronunciation.sounds(USER)

    assert [sound.id for sound in sounds] == [s.id for s in GERMAN.pronunciation]
    # The learner reads French (World.onboard).
    assert sounds[0].tip == GERMAN.pronunciation[0].texts["fr"].tip
    assert all(sound.tries == 0 for sound in sounds)


def test_a_sound_lists_its_pairs_words_and_sentences() -> None:
    detail = lab().pronunciation.sound(USER, "ue")

    assert ("vier", "für") in detail.pairs
    assert "Brücke" in detail.words
    assert "Die Tür ist für dich." in detail.sentences


def test_a_sound_the_language_does_not_have_is_not_found() -> None:
    with pytest.raises(PronunciationError) as error:
        lab().pronunciation.sound(USER, "click")

    assert error.value.code == "not_found"


def test_words_found_in_order_are_matched_once_each() -> None:
    assert matched_words(["a", "b", "a"], ["a", "b"]) == (True, True, False)
    assert matched_words(["a", "b"], ["x", "a", "y", "b"]) == (True, True)
    assert matched_words(["a", "b"], ["x", "y"]) == (False, False)


def test_a_word_said_as_asked_is_right() -> None:
    world = lab()

    result = say(world, "Für.", "für")

    assert result.right
    assert [(mark.word, mark.ok) for mark in result.words] == [("für", True)]
    assert world.pronunciation.problem_words(USER) == []


def test_the_recording_is_metered_as_a_pronunciation_drill() -> None:
    world = lab()

    say(world, "für", "für")

    task = world.pronunciation_transcriber.tasks[0]
    assert task.charge is not None
    assert task.charge.feature == Feature.PRONUNCIATION
    assert task.language == "de"


def test_a_word_heard_as_another_is_marked_and_becomes_a_problem_word() -> None:
    world = lab()

    result = say(world, "vier", "vier für")

    assert not result.right
    assert [(mark.word, mark.ok) for mark in result.words] == [("vier", True), ("für", False)]
    words = world.pronunciation.problem_words(USER)
    assert [(w.word, w.sound_id, w.misses) for w in words] == [("für", "ue", 1)]


def test_a_problem_word_leaves_the_list_after_two_rights_in_a_row() -> None:
    world = lab()
    say(world, "fir", "für")

    say(world, "für", "für", sound=None)
    assert [w.word for w in world.pronunciation.problem_words(USER)] == ["für"]
    say(world, "für", "für", sound=None)

    assert world.pronunciation.problem_words(USER) == []


def test_a_miss_after_a_right_starts_the_run_again() -> None:
    world = lab()
    say(world, "fir", "für")
    say(world, "für", "für", sound=None)
    say(world, "fur", "für", sound=None)
    say(world, "für", "für", sound=None)

    assert [(w.word, w.misses) for w in world.pronunciation.problem_words(USER)] == [("für", 2)]


def test_a_word_that_was_never_missed_is_not_remembered() -> None:
    world = lab()

    say(world, "Tür", "Tür")

    assert world.pronunciation_store.words == {}


def test_a_sentence_is_shadowed_and_each_word_is_marked() -> None:
    world = lab()

    result = say(world, "Die Tür ist dich", "Die Tür ist für dich.", drill="shadow")

    assert not result.right
    assert [mark.ok for mark in result.words] == [True, True, True, False, True]


def test_a_sentence_must_be_shadowed_and_a_word_said() -> None:
    world = lab()
    for target, drill in (("Die Tür ist für dich.", "word"), ("für", "shadow")):
        with pytest.raises(PronunciationError) as error:
            say(world, "x", target, drill=drill)
        assert error.value.code == "invalid_value"


def test_a_text_that_is_not_the_sounds_own_is_refused_before_anything_is_heard() -> None:
    world = lab()

    with pytest.raises(PronunciationError) as error:
        world.pronunciation.attempt(USER, "word", "ue", "Hund", AUDIO, "m4a")

    assert error.value.code == "invalid_value"
    assert world.pronunciation_transcriber.tasks == []


def test_a_word_outside_the_problem_list_cannot_be_drilled_alone() -> None:
    world = lab()

    with pytest.raises(PronunciationError) as error:
        say(world, "für", "für", sound=None)

    assert error.value.code == "not_found"


def test_sound_progress_counts_drills_and_rights() -> None:
    world = lab()
    say(world, "für", "für")
    say(world, "fir", "für")

    ue = world.pronunciation.sounds(USER)[0]

    assert (ue.tries, ue.right) == (2, 1)


def test_which_word_was_heard_is_picked_and_remembered() -> None:
    world = lab()

    assert world.pronunciation.pick(USER, "ue", "für", "für")
    assert not world.pronunciation.pick(USER, "ue", "für", "vier")

    ue = world.pronunciation.sounds(USER)[0]
    assert (ue.tries, ue.right) == (2, 1)


def test_a_pick_of_words_that_are_not_a_pair_is_refused() -> None:
    with pytest.raises(PronunciationError) as error:
        lab().pronunciation.pick(USER, "ue", "für", "Tier")

    assert error.value.code == "invalid_value"


def test_pairs_that_sound_alike_are_not_listened_to() -> None:
    with pytest.raises(PronunciationError) as error:
        lab().pronunciation.pick(USER, "final_devoicing", "Hund", "Hunde")

    assert error.value.code == "not_found"


def test_a_word_of_a_sound_is_played_in_the_first_partners_voice() -> None:
    world = lab()

    url = world.pronunciation.audio(USER, "Tür")

    assert url
    task = world.speech.tasks[-1]
    assert task.charge is not None
    assert (task.text, task.charge.feature) == ("Tür", Feature.PRONUNCIATION_AUDIO)
    assert task.voice == world.personas.partners(USER)[0].voice


def test_the_same_word_is_spoken_once() -> None:
    world = lab()

    world.pronunciation.audio(USER, "Tür")
    world.pronunciation.audio(USER, "Tür")

    assert len(world.speech.tasks) == 1


def test_only_the_labs_own_texts_and_problem_words_can_be_played() -> None:
    world = lab()

    with pytest.raises(PronunciationError) as error:
        world.pronunciation.audio(USER, "Say anything you like")

    assert error.value.code == "not_found"
    assert world.speech.tasks == []


def test_a_problem_word_can_be_played() -> None:
    world = lab()
    say(world, "fir", "für")

    world.pronunciation.audio(USER, "für")

    assert world.speech.tasks[-1].text == "für"


def test_a_learner_who_has_not_agreed_to_share_their_voice_is_refused() -> None:
    world = lab()
    world.accounts.accounts[USER] = Account("Amara", "fr", voice_consent=False)

    with pytest.raises(PronunciationError) as error:
        say(world, "für", "für")

    assert error.value.code == "consent_required"


def test_an_unavailable_recogniser_is_reported() -> None:
    world = lab()
    world.pronunciation_transcriber.answers.append(TranscriptionError("down"))

    with pytest.raises(PronunciationError) as error:
        world.pronunciation.attempt(USER, "word", "ue", "für", AUDIO, "m4a")

    assert error.value.code == "unavailable"


def test_drills_past_the_days_limit_are_refused() -> None:
    world = lab()
    for _ in range(MAX_ATTEMPTS_PER_DAY):
        say(world, "für", "für")

    with pytest.raises(PronunciationError) as error:
        say(world, "für", "für")

    assert error.value.code == "drill_limit"
