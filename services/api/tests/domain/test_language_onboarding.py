"""New packs work through the existing onboarding and practice services (§13)."""

import pytest

from konvami_api.domain.profile import Change, Origin, ProfileError, Source
from konvami_api.domain.text import TextModelError
from tests.world import NOON, USER, World


@pytest.mark.parametrize(
    ("code", "name", "buddy"),
    [("en", "English", "Maya"), ("fr", "French", "Camille"), ("it", "Italian", "Giulia")],
)
def test_onboarding_fallback_starts_a_call_in_the_chosen_language(
    code: str, name: str, buddy: str
) -> None:
    world = World()
    world.profiles.apply(
        USER,
        [
            Change("target_language", code),
            Change("explanation_language", "en"),
            Change("explanation_usage", "when_stuck"),
            Change("goals", {"reasons": ["travel"], "note": None}),
            Change("exam", None),
            Change("self_assessed_level", "A2"),
            Change("course", None),
        ],
        source=Source.ASKED,
        origin=Origin.FORM,
    )
    world.onboarding.confirm_essentials(USER)
    world.onboarding.skip_placement(USER)
    world.text.answers.append(TextModelError())
    partners = world.personas.propose(USER)
    world.personas.confirm(USER)
    world.onboarding.complete(USER)
    assert partners[0].name == buddy
    prepared = world.practice.prepare(USER, world.accounts.get(USER), NOON.date(), partners[0].id)
    assert f"Speak {name}" in prepared.instructions
    assert "Speak German" not in prepared.instructions
    assert prepared.voice == "marin"
    with pytest.raises(ProfileError, match="invalid_value"):
        world.profiles.apply(
            USER,
            [
                Change(
                    "exam",
                    {
                        "type": "goethe",
                        "target_level": "B1",
                        "date": None,
                    },
                )
            ],
            source=Source.ASKED,
            origin=Origin.FORM,
        )
