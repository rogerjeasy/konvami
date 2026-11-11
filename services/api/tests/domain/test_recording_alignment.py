from dataclasses import replace

import pytest

from konvami_api.domain.alignment import WordTiming
from konvami_api.domain.conversations import ConversationError
from konvami_api.domain.recordings import RecordingService
from konvami_api.domain.speech import TranscriptionTask
from tests.domain.test_recordings import recorded_call
from tests.world import OTHER_USER, USER, World


class Alignment:
    def __init__(self) -> None:
        self.tasks: list[TranscriptionTask] = []
        self.words: tuple[WordTiming, ...] = (
            WordTiming("Hallo", 0, 200),
            WordTiming("Welt", 200, 500),
        )

    def align(self, task: TranscriptionTask) -> tuple[WordTiming, ...]:
        self.tasks.append(task)
        return self.words


def setup() -> tuple[World, str, RecordingService, Alignment]:
    world = World()
    world.onboard()
    call = recorded_call(world)
    finished = world.sessions.finished[call]
    world.sessions.finished[call] = replace(
        finished, turns=(replace(finished.turns[0], text="Hallo Welt"),)
    )
    aligner = Alignment()
    service = RecordingService(
        profiles=world.profiles,
        conversations=world.conversations,
        sessions=world.sessions,
        repository=world.recording_store,
        files=world.files,
        transcriber=world.transcriber,
        model="",
        aligner=aligner,
        alignment_model="whisper-1",
        accounts=world.accounts,
    )
    return world, call, service, aligner


def test_alignment_is_opt_in_and_cached_with_the_private_recording() -> None:
    world, call, service, aligner = setup()
    assert world.recordings.word_timings(USER, call, 0) is None
    assert service.word_timings(USER, call, 0) == aligner.words
    assert service.word_timings(USER, call, 0) == aligner.words
    assert len(aligner.tasks) == 1
    service.configure(USER, kept=False)
    assert not world.files.files


def test_mismatched_recognition_does_not_highlight_the_wrong_words() -> None:
    _, call, service, aligner = setup()
    aligner.words = (WordTiming("different", 0, 500),)
    assert service.word_timings(USER, call, 0) == ()


def test_another_account_cannot_request_alignment() -> None:
    _, call, service, aligner = setup()
    with pytest.raises(ConversationError):
        service.word_timings(OTHER_USER, call, 0)
    assert not aligner.tasks
