import pytest

from konvami_api.domain.speech import SpeechError
from konvami_api.domain.voices import SampleError, VoiceSampleService
from tests.world import OTHER_USER, USER, World


def test_a_voice_is_spoken_once_and_then_kept() -> None:
    world = World()
    world.onboard()
    world.onboard(OTHER_USER)

    first = world.voices.sample(USER, "coral")
    again = world.voices.sample(USER, "coral")
    for_another_learner = world.voices.sample(OTHER_USER, "coral")

    assert first == again == for_another_learner
    assert len(world.speech.tasks) == 1
    task = world.speech.tasks[0]
    assert (task.model, task.voice) == ("gpt-4o-mini-tts", "coral")
    # The sample is in the language being learned: it is how the partner will sound.
    assert task.text.startswith("Hallo!")


def test_the_sample_is_stored_as_audio_and_read_through_a_short_lived_address() -> None:
    world = World()
    world.onboard()

    address = world.voices.sample(USER, "cedar")

    [key] = world.files.keys()
    assert key.startswith("voices/de/cedar-")
    assert key.endswith(".mp3")
    assert world.files.files[key] == (b"mp3:cedar", "audio/mpeg")
    assert address == f"https://files.test/{key}?expires=3600"


def test_each_voice_has_its_own_sample() -> None:
    world = World()
    world.onboard()

    assert world.voices.sample(USER, "coral") != world.voices.sample(USER, "cedar")
    assert [task.voice for task in world.speech.tasks] == ["coral", "cedar"]


def test_another_speech_model_speaks_the_samples_anew() -> None:
    world = World()
    world.onboard()
    world.voices.sample(USER, "coral")
    newer = VoiceSampleService(
        profiles=world.profiles, files=world.files, speech=world.speech, model="gpt-5-tts"
    )

    newer.sample(USER, "coral")

    assert [task.model for task in world.speech.tasks] == ["gpt-4o-mini-tts", "gpt-5-tts"]


def test_a_voice_that_cannot_be_spoken_is_reported_and_nothing_is_stored() -> None:
    world = World()
    world.onboard()
    world.speech.fail = SpeechError("timeout")

    with pytest.raises(SampleError) as error:
        world.voices.sample(USER, "coral")

    assert error.value.code == "voice_unavailable"
    assert world.files.keys() == []


def test_without_a_speech_model_there_are_no_samples() -> None:
    world = World()
    world.onboard()
    silent = VoiceSampleService(
        profiles=world.profiles, files=world.files, speech=world.speech, model=""
    )

    with pytest.raises(SampleError) as error:
        silent.sample(USER, "coral")

    assert error.value.code == "voice_unavailable"
    assert world.speech.tasks == []


def test_a_sample_needs_a_language_to_be_spoken_in() -> None:
    with pytest.raises(SampleError) as error:
        World().voices.sample(USER, "coral")

    assert error.value.code == "no_language"
