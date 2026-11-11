from konvami_api.domain.fluency import recording_fluency
from konvami_api.domain.live_call import Turn, TurnAudio


def test_pace_counts_only_words_with_their_own_real_recording_duration() -> None:
    found = recording_fluency(
        (
            Turn("persona", "A long answer from the partner", TurnAudio("p", 90000)),
            Turn("learner", "Ich fahre mit dem Bus", TurnAudio("a", 5000)),
            Turn("learner", "No audio for this turn"),
        )
    )
    assert found is not None
    assert found.words == 5
    assert found.recorded_seconds == 5
    assert found.words_per_minute == 60
    assert found.recorded_turns == 1


def test_missing_or_invalid_recordings_never_fabricate_pace() -> None:
    assert recording_fluency((Turn("learner", "Hello"),)) is None
    assert recording_fluency((Turn("learner", "Hello", TurnAudio("a", 0)),)) is None
    assert recording_fluency((Turn("learner", "", TurnAudio("a", 1000)),)) is None


def test_verbatim_words_are_used_and_pace_is_weighted_by_recording_duration() -> None:
    found = recording_fluency(
        (
            Turn("learner", "changed text", TurnAudio("a", 1000), "I am here"),
            Turn("learner", "I go", TurnAudio("b", 9000)),
        )
    )
    assert found is not None
    assert found.words_per_minute == 30
    assert found.unique_words == 4


def test_pause_statistics_require_measured_pcm_for_every_included_turn() -> None:
    measured = Turn("learner", "I am here", TurnAudio("a", 3000, 2000, 400, 1))
    found = recording_fluency((measured,))
    assert found is not None
    assert (found.active_seconds, found.pause_seconds, found.pauses) == (2, 0.4, 1)
    mixed = recording_fluency((measured, Turn("learner", "Hello", TurnAudio("b", 1000))))
    assert mixed is not None
    assert mixed.pause_seconds is None
