"""Opt-in acoustic observations never alter exam rubric marks or retain temporary audio."""

from dataclasses import replace

import pytest

from konvami_api.domain.exam_acoustics import ExamAcoustics
from konvami_api.domain.live_call import Turn, TurnAudio
from tests.domain.test_exam_acoustics import Assessor, Encoder
from tests.domain.test_exam_centre import scored
from tests.world import USER, World


def prepared(*, consent: bool = True, short: bool = False) -> tuple[World, str, Assessor, str]:
    world = World()
    world.onboard()
    provider = Assessor()
    world.exams._acoustics = ExamAcoustics(provider, Encoder(), world.files)
    world.exams._recordings = world.recordings
    world.exams._accounts = world.accounts
    call_id = world.simulate((Turn("learner", "Hallo"),)) if short else world.simulate()
    session = world.sessions.sessions[call_id]
    world.sessions.sessions[call_id] = replace(
        session, assessment_consent=consent, assessment_language="de" if consent else None
    )
    key = f"users/{USER}/recordings/{call_id}/0.wav"
    world.files.save(key, b"audio", "audio/wav")
    turns = world.conversations.turns(call_id)
    # The transcript repository is the same one the recording service releases.
    world.sessions.finished[call_id] = replace(
        world.sessions.finished[call_id],
        turns=tuple(
            replace(turn, audio=TurnAudio(key, 1000)) if turn.speaker == "learner" else turn
            for turn in turns
        ),
    )
    return world, call_id, provider, key


def test_opted_in_exam_reports_real_acoustics_separately_and_releases_audio() -> None:
    world, call_id, provider, key = prepared()
    world.text.answers.append(scored())
    world.exams.score(call_id)
    result = world.exams.result(USER, call_id).result
    assert result is not None
    assert result.pronunciation is not None
    assert result.total == 0.625
    assert result.pronunciation.assessed_turns == 4
    assert provider.seen
    assert world.files.stat(key) is None
    assert all(turn.audio is None for turn in world.conversations.turns(call_id))


@pytest.mark.parametrize(("short", "broken"), [(True, False), (False, True)])
def test_failed_or_too_short_exam_always_releases_audio(short: bool, broken: bool) -> None:
    world, call_id, provider, key = prepared(short=short)
    if broken:
        world.text.answers.append({})
    world.exams.score(call_id)
    assert world.files.stat(key) is None
    assert not provider.seen


def test_no_acoustic_request_without_explicit_exam_consent() -> None:
    world, call_id, provider, _ = prepared(consent=False)
    world.text.answers.append(scored())
    world.exams.score(call_id)
    assert not provider.seen
    result = world.exams.result(USER, call_id).result
    assert result is not None
    assert result.pronunciation is None


def test_revoked_account_voice_consent_prevents_acoustic_transfer() -> None:
    world, call_id, provider, key = prepared()
    world.accounts.accounts[USER] = replace(world.accounts.get(USER), voice_consent=False)
    world.text.answers.append(scored())
    world.exams.score(call_id)
    assert not provider.seen
    assert world.files.stat(key) is None


def test_ordinary_exam_and_practice_cannot_silently_enable_acoustic_capture() -> None:
    from konvami_api.domain.voice import CallPurpose, VoiceError

    world = World()
    world.onboard()
    with pytest.raises(VoiceError, match="voice_unavailable"):
        world.voice.start(
            USER, CallPurpose.EXAM, "offer", scenario="goethe_b1", assessment_consent=True
        )
    world.voice._assessment_provider = lambda _: "Azure Speech"
    with pytest.raises(VoiceError, match="voice_unavailable"):
        world.voice.start(USER, CallPurpose.PRACTICE, "offer", assessment_consent=True)


def test_opt_in_is_kept_on_the_call_and_enables_exam_audio_capture() -> None:
    from konvami_api.domain.voice import CallPurpose

    world = World()
    world.onboard()
    world.voice._assessment_provider = lambda _: "Azure Speech"
    started = world.voice.start(
        USER, CallPurpose.EXAM, "offer", scenario="goethe_b1", assessment_consent=True
    )
    session = world.sessions.get(started.call_id)
    assert session is not None
    assert session.assessment_consent
    assert session.assessment_language == "de"
    assert world.voice.audio_keeper(started.call_id) is not None


def test_exam_scorer_enqueue_failure_releases_all_temporary_audio() -> None:
    from konvami_api.domain.voice import CallPurpose

    world = World()
    world.onboard()
    world.voice._assessment_provider = lambda _: "Azure Speech"
    started = world.voice.start(
        USER, CallPurpose.EXAM, "offer", scenario="goethe_b1", assessment_consent=True
    )
    key = f"users/{USER}/recordings/{started.call_id}/turn.wav"
    world.files.save(key, b"audio", "audio/wav")
    call = world.voice.live_call(started.call_id)
    assert call is not None

    class FailingStarter:
        def start(self, call_id: str) -> None:
            raise RuntimeError("worker unavailable")

    world.exams._starter = FailingStarter()
    with pytest.raises(RuntimeError):
        world.voice.finished(started.call_id, call)
    assert world.files.stat(key) is None
