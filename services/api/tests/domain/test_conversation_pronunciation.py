from typing import Any

import pytest

from konvami_api.domain.live_call import Turn, TurnAudio
from konvami_api.domain.plan import SessionPlan
from konvami_api.domain.pronunciation import PronunciationError
from konvami_api.domain.pronunciation_assessment import (
    AssessedWord,
    PhonemeScore,
    PronunciationAssessment,
)
from tests.world import NOON, OTHER_USER, USER, World


class Assessor:
    provider = "Acoustic test"

    def __init__(self) -> None:
        self.references: list[str] = []

    def supports(self, language: str, audio_format: str) -> bool:
        return language == "de" and audio_format == "wav"

    def assess(
        self, language: str, reference: str, audio: bytes, audio_format: str, **kwargs: Any
    ) -> PronunciationAssessment:
        self.references.append(reference)
        return PronunciationAssessment(
            self.provider,
            reference,
            80,
            80,
            None,
            (
                AssessedWord("Brücke", 55, (PhonemeScore("y", 50),)),
                AssessedWord("Die", 95, ()),
                AssessedWord("hallucination", 20, ()),
            ),
        )


def setup(monkeypatch: pytest.MonkeyPatch) -> tuple[World, Assessor, str]:
    world = World()
    world.onboard()
    assessor = Assessor()
    monkeypatch.setattr(world.pronunciation, "_assessor", assessor)
    call = world.talk(
        None,
        at=NOON,
        plan=SessionPlan(language="de"),
        turns=(
            Turn("persona", "Hallo", TurnAudio("a", 2000)),
            Turn("learner", "Die Brücke", TurnAudio("b", 2000)),
        ),
    )
    return world, assessor, call


def test_owned_recording_collects_only_scored_words_actually_in_the_learner_turn(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    world, assessor, call = setup(monkeypatch)
    result = world.pronunciation.conversation_attempt(
        USER, call, 1, b"pcm", "wav", assessment_consent=True
    )
    assert result.assessment is not None
    assert assessor.references == ["Die Brücke"]
    assert [word.word for word in world.pronunciation.problem_words(USER)] == ["Brücke"]


def test_explicit_consent_is_required_before_audio_leaves_the_service(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    world, assessor, call = setup(monkeypatch)
    with pytest.raises(PronunciationError, match="consent_required"):
        world.pronunciation.conversation_attempt(
            USER, call, 1, b"pcm", "wav", assessment_consent=False
        )
    assert assessor.references == []


def test_other_accounts_partner_turns_and_missing_recordings_are_not_assessed(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    world, assessor, call = setup(monkeypatch)
    for user, index in ((OTHER_USER, 1), (USER, 0), (USER, 99), (USER, -1)):
        with pytest.raises(PronunciationError, match="not_found"):
            world.pronunciation.conversation_attempt(
                user, call, index, b"pcm", "wav", assessment_consent=True
            )
    assert assessor.references == []


def test_unknown_historic_language_is_not_replaced_by_current_language(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from dataclasses import replace

    world, assessor, call = setup(monkeypatch)
    world.sessions.sessions[call] = replace(world.sessions.sessions[call], plan=None)
    with pytest.raises(PronunciationError, match="unavailable"):
        world.pronunciation.conversation_attempt(
            USER, call, 1, b"pcm", "wav", assessment_consent=True
        )
    assert assessor.references == []


def test_repeated_case_variants_count_once_for_database_word_tallies() -> None:
    from konvami_api.domain.pronunciation import WordMark, _per_word

    assert _per_word((WordMark("Die", True), WordMark("die", False))) == [("Die", False)]
