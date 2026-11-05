from dataclasses import replace
from uuid import UUID

import pytest

from konvami_api.domain.costs import Charge, Feature
from konvami_api.domain.premium_voices import (
    PilotAccess,
    PremiumError,
    PremiumVoice,
    PremiumVoices,
    PremiumVoiceService,
)
from konvami_api.domain.sounds import Sounds
from konvami_api.domain.speech import SpeechError
from tests.world import OTHER_USER, USER, World

MAYA = "Maya123"
OWNER = UUID("33333333-3333-4333-8333-333333333333")


def agree(world: World, user: UUID = USER) -> None:
    """The learner agreed to ElevenLabs (consent record v3)."""
    world.accounts.accounts[user] = replace(
        world.accounts.accounts[user], premium_voice_consent=True
    )


def sounds(world: World) -> Sounds:
    return Sounds(
        speech=world.speech, model="gpt-4o-mini-tts", files=world.files, premium=world.premium
    )


def listen(world: World, user: UUID = USER) -> str:
    charge = Charge(user, Feature.CARD_AUDIO)
    return sounds(world).address("cards/", "marin", "der Tisch", charge)


def test_nothing_is_offered_without_a_model_and_voices() -> None:
    world = World()
    bare = PremiumVoiceService(
        premium=PremiumVoices(model=""),
        access=PilotAccess(owners=[], open_to_testers=True),
        accounts=world.accounts,
        choices=world.premium_choices,
        speech=world.premium_speech,
        profiles=world.profiles,
        files=world.files,
    )

    status = bare.status(USER)

    assert (status.offered, status.consent, status.allowed, status.voices) == (
        False,
        False,
        False,
        (),
    )
    with pytest.raises(PremiumError) as error:
        bare.choose(USER, MAYA)
    assert error.value.code == "not_offered"


def test_a_learner_who_has_not_agreed_cannot_pick_a_voice() -> None:
    world = World()

    with pytest.raises(PremiumError) as error:
        world.premium.choose(USER, MAYA)

    assert error.value.code == "consent_needed"
    assert world.premium.status(USER).consent is False


def test_a_chosen_voice_reads_aloud_instead_of_the_standard_voice() -> None:
    world = World()
    agree(world)
    world.premium.choose(USER, MAYA)

    address = listen(world)

    [key] = world.files.keys()
    assert address.startswith(f"https://files.test/{key}")
    assert world.files.files[key] == (b"mp3:Maya123", "audio/mpeg")
    [task] = world.premium_speech.tasks
    assert (task.model, task.voice, task.text) == (
        "eleven_multilingual_v2",
        MAYA,
        "der Tisch",
    )
    # The learner pays for it, like any speech.
    assert task.charge == Charge(USER, Feature.CARD_AUDIO)
    assert world.speech.tasks == []


def test_a_voice_that_is_not_chosen_leaves_the_standard_voice() -> None:
    world = World()
    agree(world)

    listen(world)

    assert world.premium_speech.tasks == []
    assert [task.voice for task in world.speech.tasks] == ["marin"]


def test_a_learner_who_withdrew_consent_is_not_sent_to_elevenlabs() -> None:
    world = World()
    agree(world)
    world.premium.choose(USER, MAYA)
    world.accounts.accounts[USER] = replace(
        world.accounts.accounts[USER], premium_voice_consent=False
    )

    listen(world)

    assert world.premium_speech.tasks == []
    assert [task.voice for task in world.speech.tasks] == ["marin"]


def test_each_learner_hears_their_own_choice() -> None:
    world = World()
    agree(world)
    agree(world, OTHER_USER)
    world.premium.choose(USER, MAYA)
    world.premium.choose(OTHER_USER, "Otto456")

    first, second = listen(world), listen(world, OTHER_USER)

    assert first != second
    assert [task.voice for task in world.premium_speech.tasks] == [MAYA, "Otto456"]


def test_going_back_to_the_standard_voice_is_a_choice_too() -> None:
    world = World()
    agree(world)
    world.premium.choose(USER, MAYA)

    status = world.premium.choose(USER, None)

    assert status.chosen is None
    listen(world)
    assert world.premium_speech.tasks == []


def test_a_spoken_text_is_kept_per_voice() -> None:
    world = World()
    agree(world)
    world.premium.choose(USER, MAYA)
    listen(world)
    listen(world)
    world.premium.choose(USER, "Otto456")
    listen(world)

    assert [task.voice for task in world.premium_speech.tasks] == [MAYA, "Otto456"]


def test_a_failing_premium_voice_falls_back_to_the_standard_voice() -> None:
    world = World()
    agree(world)
    world.premium.choose(USER, MAYA)
    world.premium_speech.fail = SpeechError("timeout")

    listen(world)

    assert [task.voice for task in world.speech.tasks] == ["marin"]


def test_a_voice_that_is_not_on_offer_cannot_be_chosen() -> None:
    world = World()
    agree(world)

    with pytest.raises(PremiumError) as error:
        world.premium.choose(USER, "Nobody999")

    assert error.value.code == "unknown_voice"


def test_a_voice_dropped_from_the_configuration_is_no_longer_chosen() -> None:
    world = World()
    agree(world)
    world.premium_choices.set(USER, "Gone000")

    assert world.premium.status(USER).chosen is None
    assert world.premium.choice_for(USER) is None


def test_premium_voices_can_be_restricted_to_the_owners() -> None:
    world = World()
    agree(world)
    agree_owner = replace(world.accounts.accounts[USER])
    world.accounts.accounts[OWNER] = agree_owner
    closed = PremiumVoiceService(
        premium=PremiumVoices("eleven_multilingual_v2", (PremiumVoice(MAYA, "Maya"),)),
        access=PilotAccess(owners=[OWNER], open_to_testers=False),
        accounts=world.accounts,
        choices=world.premium_choices,
        speech=world.premium_speech,
        profiles=world.profiles,
        files=world.files,
    )

    with pytest.raises(PremiumError) as error:
        closed.choose(USER, MAYA)
    assert error.value.code == "not_allowed"
    assert closed.status(USER).allowed is False
    assert closed.choose(OWNER, MAYA).chosen == MAYA


def test_a_sample_is_spoken_once_in_the_learners_language_and_kept() -> None:
    world = World()
    world.onboard()
    agree(world)

    first = world.premium.sample(USER, MAYA)
    again = world.premium.sample(USER, MAYA)

    assert first == again
    [key] = world.files.keys()
    assert key.startswith("voices/premium/de/Maya123-")
    [task] = world.premium_speech.tasks
    assert task.text.startswith("Hallo!")
    assert task.charge == Charge(USER, Feature.VOICE_SAMPLE)


def test_a_sample_needs_consent() -> None:
    world = World()
    world.onboard()

    with pytest.raises(PremiumError) as error:
        world.premium.sample(USER, MAYA)

    assert error.value.code == "consent_needed"
    assert world.premium_speech.tasks == []


def test_a_sample_that_cannot_be_spoken_asks_to_try_again() -> None:
    world = World()
    world.onboard()
    agree(world)
    world.premium_speech.fail = SpeechError("timeout")

    with pytest.raises(PremiumError) as error:
        world.premium.sample(USER, MAYA)

    assert error.value.code == "voice_unavailable"
