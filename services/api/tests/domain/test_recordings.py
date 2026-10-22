"""Recordings (spec §6.6) and the verbatim pass (spec §9.4): a conversation's audio, kept per
turn, transcribed a second time after the call so that the learner's mistakes survive."""

import io
import wave
from dataclasses import replace
from uuid import UUID

import pytest

from konvami_api.domain.live_call import KeepAudio, Turn, TurnAudio
from konvami_api.domain.profile import Change, Origin, Source
from konvami_api.domain.speech import TranscriptionError
from tests.world import NOON, OTHER_USER, USER, World

# Half a second of silence at the provider's rate.
PCM = b"\x00\x00" * 12_000
# The learner's, a different half second (the stand-in transcriber tells turns by their audio).
LEARNER_PCM = b"\x01\x00" * 12_000


@pytest.fixture
def world() -> World:
    world = World()
    world.onboard()
    return world


def recorded_call(
    world: World, user: UUID = USER, *, learner_says: str = "Ich habe nach Berlin gefahren."
) -> str:
    """A conversation whose turns were all recorded, as the worker leaves it."""
    call_id = world.talk(None, at=NOON, user=user, turns=())
    greeting = world.recordings.keep(user, call_id, KeepAudio("item_1", "persona", PCM))
    answer = world.recordings.keep(user, call_id, KeepAudio("item_2", "learner", LEARNER_PCM))
    finished = world.sessions.finished[call_id]
    world.sessions.finished[call_id] = replace(
        finished,
        turns=(
            Turn("persona", "Hallo! Wo warst du am Wochenende?", audio=greeting),
            Turn("learner", "Ich bin nach Berlin gefahren.", audio=answer),
        ),
    )
    world.transcriber.answers[answer.key] = learner_says
    return call_id


def turns(world: World, call_id: str, user: UUID = USER) -> tuple[Turn, ...]:
    return world.conversations.transcript(user, call_id).turns


def test_a_turns_audio_is_stored_as_a_wav_file_in_the_learners_folder(world: World) -> None:
    audio = world.recordings.keep(USER, "rtc_1", KeepAudio("item_2", "learner", PCM))

    assert audio == TurnAudio(f"users/{USER}/recordings/rtc_1/item_2.wav", 500)
    body, content_type = world.files.files[audio.key]
    assert content_type == "audio/wav"
    with wave.open(io.BytesIO(body)) as stored:
        assert (stored.getnchannels(), stored.getsampwidth(), stored.getframerate()) == (
            1,
            2,
            24_000,
        )
        assert stored.readframes(stored.getnframes()) == PCM


def test_each_learner_turn_is_transcribed_again_from_its_audio(world: World) -> None:
    call_id = recorded_call(world)

    world.recordings.transcribe(call_id)

    assert [turn.verbatim for turn in turns(world, call_id)] == [
        None,
        "Ich habe nach Berlin gefahren.",
    ]
    [task] = world.transcriber.tasks
    assert task.model == "gpt-transcribe"
    assert task.language == "de"
    assert task.audio == world.files.files[turns(world, call_id)[1].audio.key][0]  # type: ignore[union-attr]
    assert "mistake" in task.prompt
    assert "German" in task.prompt


def test_a_turn_is_transcribed_once(world: World) -> None:
    call_id = recorded_call(world)
    world.recordings.transcribe(call_id)

    world.recordings.transcribe(call_id)

    assert len(world.transcriber.tasks) == 1


def test_a_turn_that_cannot_be_transcribed_keeps_its_live_text_only(world: World) -> None:
    call_id = recorded_call(world)
    world.transcriber.fail = TranscriptionError("timeout")

    world.recordings.transcribe(call_id)

    assert turns(world, call_id)[1].verbatim is None
    assert turns(world, call_id)[1].text == "Ich bin nach Berlin gefahren."


def test_without_a_verbatim_model_nothing_is_transcribed(world: World) -> None:
    world.recordings._model = ""
    call_id = recorded_call(world)

    world.recordings.transcribe(call_id)

    assert world.transcriber.tasks == []


def test_recordings_are_kept_after_the_pass_by_default(world: World) -> None:
    call_id = recorded_call(world)

    world.recordings.transcribe(call_id)

    assert all(turn.audio for turn in turns(world, call_id))
    assert len(world.files.keys()) == 2


def keep_none(world: World, user: UUID = USER) -> None:
    world.profiles.apply(
        user, [Change("recordings_kept", False)], source=Source.ASKED, origin=Origin.FORM
    )


def test_a_learner_who_keeps_no_recordings_has_them_deleted_after_the_pass(world: World) -> None:
    keep_none(world)
    call_id = recorded_call(world)

    world.recordings.transcribe(call_id)

    assert world.files.keys() == []
    assert [turn.audio for turn in turns(world, call_id)] == [None, None]
    assert turns(world, call_id)[1].verbatim == "Ich habe nach Berlin gefahren."


def test_a_conversation_that_does_not_count_has_its_audio_deleted_when_it_ends(
    world: World,
) -> None:
    call_id = world.talk(None, at=NOON, turns=())
    audio = world.recordings.keep(USER, call_id, KeepAudio("item_1", "persona", PCM))
    finished = world.sessions.finished[call_id]
    world.sessions.finished[call_id] = replace(
        finished, turns=(Turn("persona", "Hallo?", audio=audio),)
    )

    world.recordings.after_call(USER, call_id)

    assert world.files.keys() == []
    assert world.sessions.finished[call_id].turns[0].audio is None


def test_a_conversation_that_counts_keeps_its_audio_when_it_ends(world: World) -> None:
    call_id = recorded_call(world)

    world.recordings.after_call(USER, call_id)

    assert len(world.files.keys()) == 2


def test_turning_recordings_off_deletes_every_recording_kept_so_far(world: World) -> None:
    world.onboard(OTHER_USER)
    mine = recorded_call(world)
    theirs = recorded_call(world, OTHER_USER)

    assert world.recordings.configure(USER, kept=False) is False

    assert world.recordings.kept(USER) is False
    assert [turn.audio for turn in turns(world, mine)] == [None, None]
    assert all(turn.audio for turn in turns(world, theirs, OTHER_USER))
    assert all(key.startswith(f"users/{OTHER_USER}/") for key in world.files.files)


def test_turning_recordings_on_again_deletes_nothing(world: World) -> None:
    call_id = recorded_call(world)

    assert world.recordings.configure(USER, kept=True) is True

    assert all(turn.audio for turn in turns(world, call_id))


def test_a_recording_is_read_through_a_short_lived_address(world: World) -> None:
    audio = TurnAudio(f"users/{USER}/recordings/rtc_1/item_2.wav", 500)

    assert world.recordings.address(audio) == (
        f"https://files.test/users/{USER}/recordings/rtc_1/item_2.wav?expires=900"
    )


def test_an_unknown_call_is_not_transcribed(world: World) -> None:
    world.recordings.transcribe("rtc_ghost")

    assert world.transcriber.tasks == []


def test_audio_the_learner_does_not_keep_is_deleted_even_when_the_pass_breaks_off(
    world: World,
) -> None:
    keep_none(world)
    call_id = recorded_call(world)
    world.transcriber.fail = RuntimeError("storage unreachable")

    with pytest.raises(RuntimeError):
        world.recordings.transcribe(call_id)

    assert world.files.keys() == []
    assert [turn.audio for turn in turns(world, call_id)] == [None, None]
