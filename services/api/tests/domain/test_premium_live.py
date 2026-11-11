import json

from konvami_api.domain.live_call import LiveCall, Send, Speak, Spoken, TurnAudio
from tests.domain.test_live_call import ScriptedTools


def live() -> LiveCall:
    return LiveCall(
        ScriptedTools(),
        max_seconds=480,
        wrap_up_seconds=45,
        goodbye_grace_seconds=8,
        record=True,
        premium=True,
    )


def test_text_reply_is_synthesized_once_and_recorded_with_real_audio() -> None:
    call = live()
    event = {"type": "response.output_text.done", "item_id": "hello", "text": "Hallo!"}
    assert call.handle(event, 1) == [Speak("hello", "Hallo!")]
    assert call.handle(event, 2) == []
    audio = TurnAudio("users/user/recordings/call/hello.wav", 1200)
    actions = call.spoken(Spoken("hello", "Hallo!", audio, "https://recording"), 3)
    assert call.turns[0].audio == audio
    assert isinstance(actions[0], Send)
    note = actions[0].event["item"]["content"][0]["text"]
    assert json.loads(note.removeprefix("premium_audio: "))["url"] == "https://recording"


def test_interruption_discards_late_audio_and_ended_calls_never_play() -> None:
    call = live()
    call.handle({"type": "response.output_text.done", "item_id": "old", "text": "Hallo"}, 1)
    call.handle({"type": "input_audio_buffer.speech_started"}, 2)
    spoken = Spoken("old", "Hallo", TurnAudio("old.wav", 2000), "https://old")
    assert call.spoken(spoken, 3) == []
    call.closed()
    assert call.spoken(spoken, 4) == []


def test_premium_speech_rechecks_choice_and_consent_for_every_turn() -> None:
    from dataclasses import replace

    import pytest

    from konvami_api.domain.live_speech import LiveSpeech
    from konvami_api.domain.speech import SpeechError, SpeechTask
    from tests.domain.test_premium_voices import MAYA, agree
    from tests.world import USER, World

    class Pcm:
        def __init__(self) -> None:
            self.tasks: list[SpeechTask] = []

        def speak_pcm(self, task: SpeechTask) -> bytes:
            self.tasks.append(task)
            return b"\x01\x00" * 24000

    world, pcm = World(), Pcm()
    speech = LiveSpeech(world.premium, pcm)
    assert not speech.available(USER)
    agree(world)
    world.premium.choose(USER, MAYA)
    assert speech.available(USER)
    assert len(speech.speak(USER, "Hallo")) == 48000
    world.accounts.accounts[USER] = replace(world.accounts.get(USER), premium_voice_consent=False)
    with pytest.raises(SpeechError):
        speech.speak(USER, "Never sent")
    assert len(pcm.tasks) == 1
