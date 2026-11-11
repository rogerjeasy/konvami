"""Measured recording pace (§6.15), never an inferred pronunciation or CEFR score.

Turn recordings include pauses inside the turn. The metric is therefore recording pace, not
articulation rate; missing audio contributes neither words nor duration.
"""

import re
from collections.abc import Sequence
from dataclasses import dataclass

from konvami_api.domain.live_call import Turn

# Recordings store milliseconds; pace is presented per minute.
MILLISECONDS_PER_SECOND = 1000
SECONDS_PER_MINUTE = 60


@dataclass(frozen=True)
class RecordingFluency:
    words: int
    unique_words: int
    recorded_seconds: float
    recorded_turns: int
    words_per_minute: float
    active_seconds: float | None = None
    pause_seconds: float | None = None
    pauses: int | None = None


def recording_fluency(turns: Sequence[Turn]) -> RecordingFluency | None:
    milliseconds = recorded = 0
    words: list[str] = []
    active_ms = pause_ms = pauses = 0
    activity_complete = True
    for turn in turns:
        if turn.speaker != "learner" or turn.audio is None or turn.audio.milliseconds <= 0:
            continue
        tokens = re.findall(r"\w+(?:['\u2019]\w+)*", turn.said.casefold())
        if not tokens:
            continue
        words.extend(tokens)
        milliseconds += turn.audio.milliseconds
        recorded += 1
        if turn.audio.active_ms is None or turn.audio.pause_ms is None or turn.audio.pauses is None:
            activity_complete = False
        else:
            active_ms += turn.audio.active_ms
            pause_ms += turn.audio.pause_ms
            pauses += turn.audio.pauses
    if not milliseconds:
        return None
    seconds = milliseconds / MILLISECONDS_PER_SECOND
    return RecordingFluency(
        words=len(words),
        unique_words=len(set(words)),
        recorded_seconds=seconds,
        recorded_turns=recorded,
        words_per_minute=round(len(words) * SECONDS_PER_MINUTE / seconds, 1),
        active_seconds=active_ms / MILLISECONDS_PER_SECOND if activity_complete else None,
        pause_seconds=pause_ms / MILLISECONDS_PER_SECOND if activity_complete else None,
        pauses=pauses if activity_complete else None,
    )
