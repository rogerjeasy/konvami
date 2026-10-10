import json
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

import pytest

from konvami_api.domain.catalog import CATALOG
from konvami_api.domain.onboarding import OnboardingError, OnboardingService, Stage
from konvami_api.domain.personas import PersonaError, PersonaService
from konvami_api.domain.profile import Change, Origin, ProfileService, Source
from konvami_api.domain.text import TextModelError
from tests.fakes import (
    FixedClock,
    InMemoryDraftLog,
    InMemoryOnboardingRepository,
    InMemoryPersonaRepository,
    InMemoryProfileRepository,
    ScriptedTextModel,
)

USER = UUID("11111111-1111-4111-8111-111111111111")
OTHER_USER = UUID("22222222-2222-4222-8222-222222222222")
NOON = datetime(2026, 10, 9, 12, 0, tzinfo=UTC)
LOOK = {
    "skin": "sand",
    "hair": "long",
    "hair_color": "chestnut",
    "top": "teal",
    "backdrop": "mist",
    "glasses": False,
    "beard": False,
}


def written(role: str, name: str, **changes: Any) -> dict[str, Any]:
    """One persona as the text model writes it."""
    return {
        "role": role,
        "name": name,
        "gender": "female",
        "age": 29,
        "origin": "Leipzig",
        "tagline": "Bavarde et curieuse, pour parler de tout et de rien",
        "backstory": "Lena arbeitet in einem Café in Leipzig und spielt Volleyball.",
        "look": LOOK,
        "voice": "marin",
        **changes,
    }


class Setup:
    def __init__(self, *answers: dict[str, Any] | Exception, exam: Any = None) -> None:
        clock = FixedClock(NOON)
        self.profiles = ProfileService(InMemoryProfileRepository(), CATALOG, clock)
        self.onboarding = OnboardingService(self.profiles, InMemoryOnboardingRepository(), clock)
        self.repository = InMemoryPersonaRepository()
        self.text = ScriptedTextModel(*answers)
        self.personas = PersonaService(
            profiles=self.profiles,
            onboarding=self.onboarding,
            repository=self.repository,
            text_model=self.text,
            model="gpt-6-luna",
            drafts=InMemoryDraftLog(),
            clock=clock,
        )
        self.profiles.apply(
            USER,
            [
                Change("target_language", "de"),
                Change("explanation_language", "fr"),
                Change("explanation_usage", "when_stuck"),
                Change("goals", {"reasons": ["work"], "note": "job in Zurich"}),
                Change("exam", exam),
                Change("self_assessed_level", "A2"),
                Change("course", None),
            ],
            source=Source.ASKED,
            origin=Origin.FORM,
        )
        self.onboarding.confirm_essentials(USER)
        self.onboarding.skip_placement(USER)


TWO = {
    "personas": [
        written("buddy", "Lena"),
        written("teacher", "Jonas", gender="male", voice="cedar"),
    ]
}


def test_a_learner_gets_a_buddy_and_a_teacher_written_for_them() -> None:
    setup = Setup(TWO)

    personas = setup.personas.propose(USER)

    assert [(p.role, p.name) for p in personas] == [("buddy", "Lena"), ("teacher", "Jonas")]
    lena = personas[0]
    assert (lena.age, lena.origin, lena.voice) == (29, "Leipzig", "marin")
    assert lena.tagline == "Bavarde et curieuse, pour parler de tout et de rien"
    assert lena.look == LOOK
    assert len({p.id for p in personas}) == 2


def test_a_learner_preparing_an_exam_also_gets_an_exam_coach() -> None:
    three = {"personas": [*TWO["personas"], written("exam_coach", "Frau Weber", age=47)]}
    setup = Setup(three, exam={"type": "goethe", "target_level": "B1", "date": None})

    personas = setup.personas.propose(USER)

    assert [p.role for p in personas] == ["buddy", "teacher", "exam_coach"]


def test_the_writer_is_told_about_the_learner_and_what_it_may_choose_from() -> None:
    setup = Setup(TWO)

    setup.personas.propose(USER)

    task = setup.text.tasks[0]
    assert task.model == "gpt-6-luna"
    assert "French" in task.instructions
    # Where a partner is from is shown to the learner, so it is written in their language too.
    assert "`origin`: the city and country, written in French" in task.instructions
    content = json.loads(task.content)
    assert content["roles"] == ["buddy", "teacher"]
    assert content["learner"]["goals"] == {"reasons": ["work"], "note": "job in Zurich"}
    assert content["learner"]["level"] == "A2"
    look = task.answer_schema["properties"]["personas"]["items"]["properties"]["look"]
    assert "umber" in look["properties"]["skin"]["enum"]
    assert "curls" in look["properties"]["hair"]["enum"]


def test_the_writer_must_answer_while_the_learner_is_waiting() -> None:
    # Proposing runs inside an API request (29 seconds at most): a slow writer must give up
    # early enough for the built-in partners to be offered in the same request.
    setup = Setup(TWO)

    setup.personas.propose(USER)

    limit = setup.text.tasks[0].max_seconds
    assert limit is not None
    assert limit <= 20


def test_proposing_again_returns_the_same_partners_without_asking_the_writer() -> None:
    setup = Setup(TWO)
    first = setup.personas.propose(USER)

    again = setup.personas.propose(USER)

    assert again == first
    assert len(setup.text.tasks) == 1


@pytest.mark.parametrize(
    "answer",
    [
        TextModelError("timeout"),
        {"personas": [written("buddy", "Lena")]},
        {"personas": [written("buddy", "Lena"), written("buddy", "Mara")]},
        {"personas": [written("buddy", "Lena"), written("teacher", "Jonas", voice="darth")]},
        {"personas": [written("buddy", ""), written("teacher", "Jonas")]},
        {"personas": [written("buddy", "Lena", age=12), written("teacher", "Jonas")]},
        {
            "personas": [
                written("buddy", "Lena", look={**LOOK, "skin": "green"}),
                written("teacher", "J"),
            ]
        },
    ],
    ids=["failure", "one missing", "role twice", "unknown voice", "no name", "a child", "bad look"],
)
def test_when_the_writer_fails_the_built_in_partners_are_proposed(answer: Any) -> None:
    setup = Setup(answer)

    personas = setup.personas.propose(USER)

    assert [(p.role, p.name) for p in personas] == [("buddy", "Lena"), ("teacher", "Jonas")]
    # A built-in partner has no line written for this learner; the app shows the role's own.
    assert personas[0].tagline is None
    assert all(18 <= p.age <= 80 for p in personas)


def test_partners_are_proposed_only_at_that_stage_of_onboarding() -> None:
    clock = FixedClock(NOON)
    profiles = ProfileService(InMemoryProfileRepository(), CATALOG, clock)
    service = PersonaService(
        profiles=profiles,
        onboarding=OnboardingService(profiles, InMemoryOnboardingRepository(), clock),
        repository=InMemoryPersonaRepository(),
        text_model=ScriptedTextModel(),
        model="gpt-6-luna",
        drafts=InMemoryDraftLog(),
        clock=clock,
    )

    with pytest.raises(OnboardingError) as error:
        service.propose(USER)

    assert error.value.code == "wrong_stage"


def test_a_partner_can_be_renamed_and_given_another_look() -> None:
    setup = Setup(TWO)
    lena = setup.personas.propose(USER)[0]
    new_look = {**LOOK, "hair": "curls", "glasses": True}

    changed = setup.personas.change(USER, lena.id, name="  Lena Marie ", look=new_look)

    assert (changed.name, changed.look) == ("Lena Marie", new_look)
    assert setup.personas.partners(USER)[0] == changed
    assert setup.personas.partners(USER)[1].name == "Jonas"


@pytest.mark.parametrize(
    "changes",
    [
        {"name": ""},
        {"name": "x" * 41},
        {"look": {**LOOK, "hair": "mohawk"}},
        {"look": {"skin": "sand"}},
    ],
)
def test_an_invalid_change_to_a_partner_is_refused(changes: dict[str, Any]) -> None:
    setup = Setup(TWO)
    lena = setup.personas.propose(USER)[0]

    with pytest.raises(PersonaError) as error:
        setup.personas.change(USER, lena.id, **changes)

    assert error.value.code == "invalid_value"
    assert setup.personas.partners(USER)[0] == lena


def test_a_partner_can_be_removed() -> None:
    setup = Setup(TWO)
    lena, jonas = setup.personas.propose(USER)

    setup.personas.remove(USER, lena.id)

    assert setup.personas.partners(USER) == [jonas]


def test_someone_elses_partner_cannot_be_changed_or_removed() -> None:
    setup = Setup(TWO)
    lena = setup.personas.propose(USER)[0]

    with pytest.raises(PersonaError) as changed:
        setup.personas.change(OTHER_USER, lena.id, name="Mine now")
    with pytest.raises(PersonaError) as removed:
        setup.personas.remove(OTHER_USER, lena.id)

    assert (changed.value.code, removed.value.code) == ("not_found", "not_found")
    assert setup.personas.partners(USER)[0] == lena


def test_confirming_the_partners_moves_on_to_the_last_step() -> None:
    setup = Setup(TWO)
    setup.personas.propose(USER)

    setup.personas.confirm(USER)

    assert setup.onboarding.status(USER).stage is Stage.READY


def test_at_least_one_partner_must_be_kept() -> None:
    setup = Setup(TWO)
    for persona in setup.personas.propose(USER):
        setup.personas.remove(USER, persona.id)

    with pytest.raises(PersonaError) as error:
        setup.personas.confirm(USER)

    assert error.value.code == "no_partners"
    assert setup.onboarding.status(USER).stage is Stage.PARTNERS


def test_onboarding_is_complete_after_the_last_step() -> None:
    setup = Setup(TWO)
    setup.personas.propose(USER)
    setup.personas.confirm(USER)

    setup.onboarding.complete(USER)

    assert setup.onboarding.status(USER).stage is Stage.DONE


def test_onboarding_cannot_be_completed_before_the_partners_are_confirmed() -> None:
    setup = Setup(TWO)

    with pytest.raises(OnboardingError) as error:
        setup.onboarding.complete(USER)

    assert error.value.code == "wrong_stage"
