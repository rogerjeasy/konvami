from dataclasses import replace

import pytest

from konvami_api.domain.candidate_speech import CandidateSpeech
from konvami_api.domain.costs import Feature
from konvami_api.domain.live_call import Speak
from konvami_api.domain.speech import SpeechError, SpeechTask
from konvami_api.domain.voice import CallPurpose
from tests.world import OTHER_USER, USER, World


class Speech:
    def __init__(self) -> None:
        self.tasks: list[SpeechTask] = []

    def speak_pcm(self, task: SpeechTask) -> bytes:
        self.tasks.append(task)
        return b"\x01\x00" * 24000


def test_candidate_uses_a_distinct_standard_voice_and_rechecks_consent() -> None:
    world, provider = World(), Speech()
    world.onboard()
    speech = CandidateSpeech(world.accounts, provider, "tts", world.exams.candidate_voice)
    assert len(speech.speak(USER, "Was meinst du?")) == 48000
    task = provider.tasks[0]
    assert task.voice != world.exams.briefing(USER, "goethe_b1").voice
    assert task.charge is not None
    assert task.charge.feature == Feature.VOICE_EXAM
    world.accounts.accounts[USER] = replace(world.accounts.get(USER), voice_consent=False)
    with pytest.raises(SpeechError):
        speech.speak(USER, "Never sent")
    assert len(provider.tasks) == 1


def test_candidate_rejects_unbounded_turns_and_missing_model() -> None:
    world, provider = World(), Speech()
    world.onboard()
    for model, text in (("", "Hallo"), ("tts", ""), ("tts", "a" * 1201)):
        speech = CandidateSpeech(world.accounts, provider, model, world.exams.candidate_voice)
        with pytest.raises(SpeechError):
            speech.speak(USER, text)
    assert not provider.tasks


def test_voice_service_plays_candidate_then_discards_transient_clips() -> None:
    world, provider = World(), Speech()
    world.onboard()
    world.voice._candidate_speech = CandidateSpeech(
        world.accounts, provider, "tts", world.exams.candidate_voice
    )
    started = world.voice.start(USER, CallPurpose.EXAM, "offer", scenario="goethe_b1")
    speak = world.voice.speaker(started.call_id)
    assert speak is not None
    spoken = speak(Speak("candidate_1", "Am Samstag?", role="candidate"))
    assert spoken.audio.key in world.files.files
    assert spoken.audio.milliseconds == 1000
    with pytest.raises(SpeechError):
        speak(Speak("wrong", "Examiner"))
    world.recordings.release(OTHER_USER, started.call_id)
    assert spoken.audio.key in world.files.files
    call = world.voice.live_call(started.call_id)
    assert call is not None
    call.closed()
    world.voice.finished(started.call_id, call)
    assert spoken.audio.key not in world.files.files
