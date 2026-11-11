import struct

from konvami_api.domain.audio_activity import pcm_activity

RATE = 24000


def tone(milliseconds: int) -> bytes:
    return struct.pack("<h", 8000) * (RATE * milliseconds // 1000)


def quiet(milliseconds: int) -> bytes:
    return b"\0\0" * (RATE * milliseconds // 1000)


def test_measures_internal_pauses_but_excludes_leading_and_trailing_silence() -> None:
    found = pcm_activity(quiet(400) + tone(200) + quiet(400) + tone(300) + quiet(500), RATE)
    assert found.active_ms == 500
    assert found.pause_ms == 400
    assert found.pauses == 1


def test_short_gaps_and_all_silence_are_not_hesitation_claims() -> None:
    found = pcm_activity(tone(200) + quiet(100) + tone(200), RATE)
    assert found.pause_ms == 0
    assert found.pauses == 0
    assert pcm_activity(quiet(500), RATE).active_ms == 0


def test_an_incomplete_sample_is_ignored_without_crashing() -> None:
    assert pcm_activity(b"\0", RATE).active_ms == 0
