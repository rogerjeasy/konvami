"""How the accuracy test judges what a transcription wrote and what the live checks found.

A transcript keeps a learner's mistake when the learner's words are in it, and tidied it away
when the right words are in it instead (spec §9.4). The live checks catch a mistake when one of
their corrections is about the learner's wrong words; any other correction is a false alarm
(spec §16.2: correction precision ≥ 98 %, recall ≥ 85 %, transcription fidelity ≥ 90 %).
"""

from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from enum import StrEnum
from typing import Any

from evals.verbatim.golden import Sample
from konvami_api.domain.live_call import LiveCorrection
from konvami_api.domain.reports import within, words_in


class Heard(StrEnum):
    # A mistake as the learner said it; a correct sentence word for word.
    KEPT = "kept"
    # The mistake written down put right: what the verbatim pass exists to prevent.
    TIDIED = "tidied"
    # Neither: the words were heard as something else.
    MISHEARD = "misheard"


def heard(sample: Sample, transcript: str) -> Heard:
    words = words_in(transcript)
    if sample.error is None:
        return Heard.KEPT if words == words_in(sample.said) else Heard.MISHEARD
    if within(words_in(sample.error), words):
        return Heard.KEPT
    if sample.fixed is not None and within(words_in(sample.fixed), words):
        return Heard.TIDIED
    return Heard.MISHEARD


def word_error_rate(reference: str, hypothesis: str) -> float:
    """Words changed, added or left out, per word of the reference (a word-level edit distance)."""
    ref, hyp = words_in(reference), words_in(hypothesis)
    previous = list(range(len(hyp) + 1))
    for i, word in enumerate(ref, start=1):
        current = [i]
        for j, other in enumerate(hyp, start=1):
            current.append(
                min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + (word != other))
            )
        previous = current
    return round(previous[-1] / len(ref), 4) if ref else 0.0


def _about(correction: LiveCorrection, sample: Sample) -> bool:
    """Whether a correction is about the sample's mistake: it names one of the wrong words."""
    if sample.error is None or sample.fixed is None:
        return False
    error = set(words_in(sample.error))
    # A word-order mistake has the right words in the wrong order: all of them are its words.
    wrong = (error - set(words_in(sample.fixed))) or error
    return bool(wrong & set(words_in(correction.said)))


def caught(sample: Sample, corrections: Sequence[LiveCorrection]) -> bool:
    return any(_about(correction, sample) for correction in corrections)


def false_alarms(sample: Sample, corrections: Sequence[LiveCorrection]) -> int:
    return sum(not _about(correction, sample) for correction in corrections)


@dataclass(frozen=True)
class SystemSummary:
    system: str
    mistakes: int
    # Shares of the mistakes, 0 to 1.
    kept: float
    tidied: float
    misheard: float
    controls: int
    controls_kept: float


def _share(count: int, total: int) -> float:
    return round(count / total, 4) if total else 0.0


def summarise(
    rows: Sequence[Mapping[str, Any]], samples: Mapping[str, Sample]
) -> list[SystemSummary]:
    """Per transcription system, how its transcripts treated the mistakes and the controls."""
    summaries: list[SystemSummary] = []
    for system in dict.fromkeys(row["system"] for row in rows):
        mine = [row for row in rows if row["system"] == system]
        errors = [row for row in mine if samples[row["sample"]].error is not None]
        controls = [row for row in mine if samples[row["sample"]].error is None]

        def count(found: Sequence[Mapping[str, Any]], verdict: Heard) -> int:
            return sum(row["heard"] == verdict for row in found)

        summaries.append(
            SystemSummary(
                system=system,
                mistakes=len(errors),
                kept=_share(count(errors, Heard.KEPT), len(errors)),
                tidied=_share(count(errors, Heard.TIDIED), len(errors)),
                misheard=_share(count(errors, Heard.MISHEARD), len(errors)),
                controls=len(controls),
                controls_kept=_share(count(controls, Heard.KEPT), len(controls)),
            )
        )
    return summaries
