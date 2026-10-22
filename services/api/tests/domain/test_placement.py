import json
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

import pytest

from konvami_api.domain.catalog import CATALOG
from konvami_api.domain.costs import Charge, Feature
from konvami_api.domain.live_call import Turn
from konvami_api.domain.onboarding import (
    OnboardingError,
    OnboardingService,
    PlacementStatus,
    Stage,
)
from konvami_api.domain.placement import (
    MIN_TASKS,
    USUAL_TASKS,
    PlacementResult,
    PlacementService,
    PlacementTools,
)
from konvami_api.domain.profile import Change, Origin, ProfileService, Source
from konvami_api.domain.text import TextModelError
from tests.fakes import (
    FixedClock,
    InMemoryOnboardingRepository,
    InMemoryPlacementRepository,
    InMemoryProfileRepository,
    ScriptedTextModel,
)

USER = UUID("11111111-1111-4111-8111-111111111111")
NOON = datetime(2026, 10, 9, 12, 0, tzinfo=UTC)
ESSENTIALS = [
    Change("target_language", "de"),
    Change("explanation_language", "fr"),
    Change("explanation_usage", "when_stuck"),
    Change("goals", {"reasons": ["work"], "note": None}),
    Change("exam", None),
    Change("self_assessed_level", "A2"),
    Change("course", None),
]
IMPRESSION = {
    "speaking": "B1",
    "listening": "B1",
    "grammar": "A2",
    "vocabulary": "B1",
    "pronunciation": "B2",
}
ASSESSED = {
    "levels": {
        "speaking": "B1",
        "listening": "C1",
        "grammar": "A2",
        "vocabulary": "A2",
        "pronunciation": "A1",
    },
    "overall": "B1",
    "weak_areas": ["Perfekt avec « sein » : ich bin gegangen", "L’ordre des mots après « weil »"],
}
TURNS = (
    Turn("persona", "Hallo! Erzähl mir von deinem Wochenende."),
    Turn("learner", "Ich habe nach Berlin gefahren und habe viel gesehen."),
    Turn("persona", "Schön! Was hat dir am besten gefallen?"),
    Turn("learner", "Das Museum, weil es war sehr interessant."),
    Turn("persona", "Und was machst du beruflich?"),
    Turn("learner", "Ich arbeite als Ingenieur in einer kleinen Firma."),
)


class Setup:
    def __init__(self, *answers: dict[str, Any] | Exception) -> None:
        clock = FixedClock(NOON)
        self.profiles = ProfileService(InMemoryProfileRepository(), CATALOG, clock)
        self.states = InMemoryOnboardingRepository()
        self.onboarding = OnboardingService(self.profiles, self.states, clock)
        self.results = InMemoryPlacementRepository()
        self.text = ScriptedTextModel(*answers)
        self.placement = PlacementService(
            profiles=self.profiles,
            onboarding=self.onboarding,
            results=self.results,
            text_model=self.text,
            model="gpt-6.1-sol",
            clock=clock,
        )
        self.profiles.apply(USER, ESSENTIALS, source=Source.ASKED, origin=Origin.FORM)
        self.onboarding.confirm_essentials(USER)

    def status(self) -> PlacementStatus:
        return self.states.load(USER).placement

    def tested(self, tasks: int = MIN_TASKS) -> PlacementTools:
        """The examiner's tools after a test with `tasks` noted tasks and a final impression."""
        self.placement.begin(USER)
        tools = PlacementTools()
        for _ in range(tasks):
            tools.run("note_task", {"task": "opinion", "level": "A2", "outcome": "handled"})
        tools.run("finish_test", IMPRESSION)
        return tools


# --- The examiner's tools ----------------------------------------------------------------------


def test_the_examiner_notes_each_task_and_is_told_when_there_are_enough() -> None:
    tools = PlacementTools()

    note = {"task": "listening", "level": "B1", "outcome": "struggled"}
    outputs = [tools.run("note_task", note).output for _ in range(USUAL_TASKS)]

    # The task's name goes back too: the app ticks off the parts of the test by name.
    assert outputs[0] == {"noted": 1, "enough": False, "task": "listening"}
    # A level can be estimated from four tasks, but the examiner is only told she has enough
    # after the usual five: told earlier, she ends the test before the opinion task.
    assert outputs[MIN_TASKS - 1] == {"noted": MIN_TASKS, "enough": False, "task": "listening"}
    assert outputs[-1] == {"noted": USUAL_TASKS, "enough": True, "task": "listening"}


def test_the_test_cannot_finish_before_enough_tasks() -> None:
    tools = PlacementTools()
    tools.run("note_task", {"task": "warm_up", "level": "A2", "outcome": "handled"})

    result = tools.run("finish_test", IMPRESSION)

    assert result.output == {"done": False, "reason": "too_few_tasks", "noted": 1}
    assert result.finished is False
    assert tools.impression is None


def test_finishing_keeps_the_examiners_impression_per_skill() -> None:
    tools = PlacementTools()
    for _ in range(MIN_TASKS):
        tools.run("note_task", {"task": "description", "level": "B1", "outcome": "handled"})

    result = tools.run("finish_test", IMPRESSION)

    assert result.output == {"done": True}
    assert result.finished is True
    assert tools.impression == IMPRESSION


@pytest.mark.parametrize(
    ("name", "arguments", "reason"),
    [
        ("note_task", {"task": "karaoke", "level": "A2", "outcome": "handled"}, "invalid_value"),
        ("note_task", {"task": "opinion", "level": "A0", "outcome": "handled"}, "invalid_value"),
        ("note_task", {"task": "opinion", "level": "A2"}, "invalid_value"),
        ("finish_test", {**IMPRESSION, "speaking": "Z9"}, "invalid_value"),
        ("finish_test", {"speaking": "B1"}, "invalid_value"),
        ("save_level", {"level": "B1"}, "unknown_tool"),
    ],
)
def test_a_bad_tool_call_is_reported_and_changes_nothing(
    name: str, arguments: dict[str, Any], reason: str
) -> None:
    tools = PlacementTools()

    result = tools.run(name, arguments)

    assert result.output["reason"] == reason
    assert (tools.notes, tools.impression) == ([], None)


def test_the_examiner_has_exactly_two_tools() -> None:
    assert [tool["name"] for tool in PlacementTools().definitions()] == ["note_task", "finish_test"]


# --- Before and after the test -----------------------------------------------------------------


def test_starting_the_test_marks_it_as_in_progress() -> None:
    setup = Setup()

    setup.placement.begin(USER)

    assert setup.status() is PlacementStatus.IN_PROGRESS
    assert setup.onboarding.status(USER).stage is Stage.PLACEMENT


def test_the_test_cannot_start_before_the_essentials_are_confirmed() -> None:
    clock = FixedClock(NOON)
    profiles = ProfileService(InMemoryProfileRepository(), CATALOG, clock)
    onboarding = OnboardingService(profiles, InMemoryOnboardingRepository(), clock)
    placement = PlacementService(
        profiles=profiles,
        onboarding=onboarding,
        results=InMemoryPlacementRepository(),
        text_model=ScriptedTextModel(),
        model="gpt-6.1-sol",
        clock=clock,
    )

    with pytest.raises(OnboardingError) as error:
        placement.begin(USER)

    assert error.value.code == "wrong_stage"


def test_the_examiner_is_told_the_languages_and_the_level_to_start_at() -> None:
    setup = Setup()

    text = setup.placement.instructions(USER, first_name="Amara")

    assert "Amara" in text
    assert "Conduct the test in German" in text
    assert "explain in French" in text
    assert "Start at level A2" in text


def test_the_examiner_knows_what_a_typed_message_means() -> None:
    # The app's "I don't know" button sends a typed line instead of the learner's voice.
    text = Setup().placement.instructions(USER, first_name="Amara")

    assert "typed message" in text
    assert "no_answer" in text


def test_a_finished_test_is_assessed_and_its_levels_are_stored_as_measured() -> None:
    setup = Setup(ASSESSED)
    tools = setup.tested()

    setup.placement.conclude(USER, tools, TURNS)

    result = setup.results.load(USER, "de")
    assert result == PlacementResult(
        levels={
            "speaking": "B1",
            # What only a listener can judge comes from the examiner, not from the transcript.
            "listening": "B1",
            "grammar": "A2",
            "vocabulary": "A2",
            "pronunciation": "B2",
        },
        overall="B1",
        weak_areas=("Perfekt avec « sein » : ich bin gegangen", "L’ordre des mots après « weil »"),
        measured_at=NOON,
    )
    stored = setup.profiles.get(USER).fields[("de", "measured_levels")]
    assert stored.value == result.levels
    assert stored.source is Source.MEASURED
    assert setup.status() is PlacementStatus.MEASURED


def test_the_assessor_does_not_count_a_tapped_i_dont_know_as_a_mistake() -> None:
    setup = Setup(ASSESSED)

    setup.placement.conclude(USER, setup.tested(), TURNS)

    instructions = setup.text.tasks[0].instructions
    assert "tapped" in instructions
    assert "never as a weak area" in instructions


def test_the_assessor_gets_the_transcript_the_notes_and_the_explanation_language() -> None:
    setup = Setup(ASSESSED)
    tools = setup.tested()

    setup.placement.conclude(USER, tools, TURNS)

    task = setup.text.tasks[0]
    assert task.model == "gpt-6.1-sol"
    assert task.charge == Charge(USER, Feature.PLACEMENT_ASSESSMENT)
    assert "French" in task.instructions
    content = json.loads(task.content)
    assert content["self_assessed_level"] == "A2"
    assert content["examiner_impression"] == IMPRESSION
    assert len(content["examiner_notes"]) == MIN_TASKS
    assert content["transcript"][1] == {
        "speaker": "learner",
        "text": "Ich habe nach Berlin gefahren und habe viel gesehen.",
    }
    assert task.answer_schema["properties"]["weak_areas"]["maxItems"] == 5


def test_a_measured_level_equal_to_the_learners_own_needs_no_decision() -> None:
    setup = Setup({**ASSESSED, "overall": "A2"})

    setup.placement.conclude(USER, setup.tested(), TURNS)

    assert setup.status() is PlacementStatus.DECIDED
    starting = setup.profiles.get(USER).fields[("de", "starting_level")]
    assert (starting.value, starting.source) == ("A2", Source.MEASURED)
    assert setup.onboarding.status(USER).stage is Stage.PARTNERS


def test_a_different_measured_level_waits_for_the_learners_choice() -> None:
    setup = Setup(ASSESSED)

    setup.placement.conclude(USER, setup.tested(), TURNS)

    view = setup.placement.view(USER)
    assert (view.status, view.self_assessed, view.differs) == (PlacementStatus.MEASURED, "A2", True)
    assert ("de", "starting_level") not in setup.profiles.get(USER).fields
    assert setup.onboarding.status(USER).stage is Stage.PLACEMENT


@pytest.mark.parametrize(
    ("use", "level", "source"),
    [("measured", "B1", Source.MEASURED), ("self", "A2", Source.ASKED)],
)
def test_the_learner_chooses_which_level_to_start_at(use: str, level: str, source: Source) -> None:
    setup = Setup(ASSESSED)
    setup.placement.conclude(USER, setup.tested(), TURNS)

    setup.placement.decide(USER, use)

    starting = setup.profiles.get(USER).fields[("de", "starting_level")]
    assert (starting.value, starting.source) == (level, source)
    assert setup.status() is PlacementStatus.DECIDED
    assert setup.onboarding.status(USER).stage is Stage.PARTNERS


def test_there_is_nothing_to_decide_before_a_result() -> None:
    setup = Setup()

    with pytest.raises(OnboardingError) as error:
        setup.placement.decide(USER, "measured")

    assert error.value.code == "wrong_stage"


def test_an_unknown_choice_is_refused() -> None:
    setup = Setup(ASSESSED)
    setup.placement.conclude(USER, setup.tested(), TURNS)

    with pytest.raises(OnboardingError) as error:
        setup.placement.decide(USER, "average")

    assert error.value.code == "invalid_choice"


def test_a_test_the_learner_left_early_is_inconclusive_and_can_be_retaken() -> None:
    setup = Setup()
    setup.placement.begin(USER)
    tools = PlacementTools()
    tools.run("note_task", {"task": "warm_up", "level": "A2", "outcome": "handled"})

    setup.placement.conclude(USER, tools, TURNS[:2])

    assert setup.status() is PlacementStatus.INCONCLUSIVE
    assert setup.text.tasks == []
    assert setup.results.load(USER, "de") is None
    setup.placement.begin(USER)
    assert setup.status() is PlacementStatus.IN_PROGRESS


def test_when_the_assessor_fails_the_examiners_impression_is_the_result() -> None:
    setup = Setup(TextModelError("timeout"))

    setup.placement.conclude(USER, setup.tested(), TURNS)

    result = setup.results.load(USER, "de")
    assert result is not None
    assert result.levels == IMPRESSION
    assert result.overall == "B1"
    assert result.weak_areas == ()
    assert setup.status() is PlacementStatus.MEASURED


def test_an_assessment_in_a_wrong_shape_is_treated_like_a_failed_one() -> None:
    setup = Setup({"levels": {"speaking": "Z9"}, "overall": "B1", "weak_areas": []})

    setup.placement.conclude(USER, setup.tested(), TURNS)

    result = setup.results.load(USER, "de")
    assert result is not None
    assert result.levels == IMPRESSION


def test_the_view_of_a_test_not_taken_has_no_result() -> None:
    setup = Setup()

    view = setup.placement.view(USER)

    assert (view.status, view.result, view.self_assessed, view.differs) == (
        PlacementStatus.NOT_STARTED,
        None,
        "A2",
        False,
    )


def test_postponing_is_still_possible_after_an_inconclusive_test() -> None:
    setup = Setup()
    setup.placement.begin(USER)
    setup.placement.conclude(USER, PlacementTools(), ())

    setup.onboarding.skip_placement(USER)

    assert setup.onboarding.status(USER).stage is Stage.PARTNERS
