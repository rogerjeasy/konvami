"""A practice call the learner accepted from a partner's ring (5.28, design note 2026-11-20)."""

import pytest

from konvami_api.domain.voice import RANG_CALL_SECONDS, CallPurpose, VoiceError
from tests.world import USER, World


def test_a_rang_call_is_short_and_the_partner_opens_as_the_one_who_called() -> None:
    world = World()
    lena, _ = world.onboard()

    started = world.voice.start(USER, CallPurpose.PRACTICE, "offer", lena.id, rang=True)

    assert started.max_seconds == RANG_CALL_SECONDS
    assert "You called the learner" in world.provider.created[0][1]["instructions"]
    session = world.sessions.get(started.call_id)
    assert session is not None
    assert session.rang


def test_an_ordinary_practice_call_is_not_a_rang_one() -> None:
    world = World()
    lena, _ = world.onboard()

    started = world.voice.start(USER, CallPurpose.PRACTICE, "offer", lena.id)

    assert started.max_seconds > RANG_CALL_SECONDS
    assert "You called the learner" not in world.provider.created[0][1]["instructions"]
    session = world.sessions.get(started.call_id)
    assert session is not None
    assert not session.rang


@pytest.mark.parametrize(("scenario", "practise"), [("bakery", None), (None, "words")])
def test_a_ring_opens_only_free_conversation(scenario: str | None, practise: str | None) -> None:
    world = World()
    lena, _ = world.onboard()

    with pytest.raises(VoiceError) as refused:
        world.voice.start(
            USER,
            CallPurpose.PRACTICE,
            "offer",
            lena.id,
            scenario=scenario,
            practise=practise,
            rang=True,
        )

    assert refused.value.code == "voice_unavailable"
    assert world.provider.created == []


def test_only_a_practice_call_can_be_rang() -> None:
    world = World()
    world.onboard()

    with pytest.raises(VoiceError):
        world.voice.start(USER, CallPurpose.EXAM, "offer", rang=True)
    assert world.provider.created == []
