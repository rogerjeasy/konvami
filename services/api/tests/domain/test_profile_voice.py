"""Changing the profile by voice (spec §6.1.3, §12.7): the partner's `update_profile` tool, the
log of what it changed, undoing a change, and the "Ask me again" check-in."""

from typing import Any

import pytest

from konvami_api.domain.profile import Change, Origin, ProfileError, Source
from konvami_api.domain.profile_voice import CHECK_GROUPS, UPDATE_PROFILE, VOICE_FIELDS
from konvami_api.domain.scenarios import ScenarioError
from tests.world import NOON, OTHER_USER, USER, World

TODAY = NOON.date()


def call(world: World, **arguments: Any) -> dict[str, Any]:
    """What the partner is told back when it calls the tool."""
    arguments.setdefault("confirmed", True)
    return world.practice.tools(USER).run(UPDATE_PROFILE, arguments).output


def learning(world: World, field: str) -> Any:
    return world.profiles.get(USER).value("de", field)


def brief(world: World, practise: str | None = None) -> Any:
    lena = world.personas.partners(USER)[0]
    return world.practice.prepare(USER, world.accounts.get(USER), TODAY, lena.id, practise=practise)


@pytest.fixture
def world() -> World:
    world = World()
    world.onboard()
    return world


def test_a_partner_can_change_settings_by_voice(world: World) -> None:
    definitions = world.practice.tools(USER).definitions()

    update = next(d for d in definitions if d["name"] == UPDATE_PROFILE)

    assert update["parameters"]["properties"]["field"]["enum"] == list(VOICE_FIELDS)


def test_the_privacy_switches_and_the_level_are_not_open_to_the_voice() -> None:
    assert {"memory_enabled", "recordings_kept", "target_language", "starting_level"}.isdisjoint(
        VOICE_FIELDS
    )


def test_a_confirmed_change_is_written_and_logged_as_made_by_voice(world: World) -> None:
    result = call(world, field="explanation_language", value="en")

    assert result["changed"] is True
    assert result["field"] == "explanation_language"
    assert learning(world, "explanation_language") == "en"
    logged = world.profiles.recent(USER, Origin.VOICE, 10)
    assert [(c.change.field, c.change.old_value, c.change.new_value) for c in logged] == [
        ("explanation_language", "fr", "en")
    ]
    assert logged[0].change.id == result["change"]
    assert world.profiles.get(USER).fields[("de", "explanation_language")].source is Source.ASKED


def test_the_partner_is_told_what_a_change_means_for_the_rest_of_the_call(world: World) -> None:
    language = call(world, field="explanation_language", value="en")
    usage = call(world, field="explanation_usage", value="freely")

    assert "English" in language["from_now_on"]
    assert "whenever it helps" in usage["from_now_on"]


def test_a_change_that_matters_later_has_no_instruction_for_now(world: World) -> None:
    result = call(world, field="course", value='{"name": "Menschen A2", "chapter": "7"}')

    assert result["changed"] is True
    assert "from_now_on" not in result


def test_a_call_that_was_not_confirmed_changes_nothing(world: World) -> None:
    result = call(world, field="explanation_language", value="en", confirmed=False)

    assert result == {"changed": False, "reason": "not_confirmed"}
    assert learning(world, "explanation_language") == "fr"


def test_a_setting_outside_the_list_is_refused(world: World) -> None:
    result = call(world, field="memory_enabled", value="false")

    assert result == {"changed": False, "reason": "not_changeable_by_voice"}
    assert world.profiles.get(USER).memory_enabled


def test_a_value_the_profile_refuses_is_reported_and_not_written(world: World) -> None:
    result = call(world, field="explanation_language", value="xx1")

    assert result == {"changed": False, "reason": "invalid_value"}
    assert learning(world, "explanation_language") == "fr"


def test_arguments_of_the_wrong_kind_are_refused(world: World) -> None:
    tools = world.practice.tools(USER)

    result = tools.run(UPDATE_PROFILE, {"field": 3, "value": None, "confirmed": True})

    assert result.output == {"changed": False, "reason": "invalid_arguments"}


def test_saying_what_is_already_so_changes_nothing(world: World) -> None:
    result = call(world, field="explanation_language", value="fr")

    assert result == {"changed": False, "reason": "unchanged"}
    assert world.profiles.recent(USER, Origin.VOICE, 10) == []


def test_a_date_said_alone_keeps_the_rest_of_the_exam(world: World) -> None:
    world.profiles.apply(
        USER,
        [Change("exam", {"type": "goethe", "target_level": "B1", "date": None})],
        source=Source.ASKED,
        origin=Origin.FORM,
    )

    result = call(world, field="exam", value='{"date": "2026-12-01"}')

    assert result["changed"] is True
    assert learning(world, "exam") == {"type": "goethe", "target_level": "B1", "date": "2026-12-01"}


def test_no_exam_is_said_with_null(world: World) -> None:
    world.profiles.apply(
        USER,
        [Change("exam", {"type": "goethe", "target_level": "B1", "date": None})],
        source=Source.ASKED,
        origin=Origin.FORM,
    )

    call(world, field="exam", value="null")

    assert learning(world, "exam") is None


# --- Undo --------------------------------------------------------------------------------------


def test_a_change_made_by_voice_can_be_undone(world: World) -> None:
    change = call(world, field="explanation_language", value="en")["change"]

    world.profiles.undo(USER, change)

    assert learning(world, "explanation_language") == "fr"
    # The undoing is a change of its own, made from the app: it is not listed as one by voice.
    assert world.profiles.history(USER, "de", "explanation_language")[-1].origin is Origin.FORM


def test_only_the_latest_change_of_a_field_can_be_undone(world: World) -> None:
    first = call(world, field="explanation_language", value="en")["change"]
    second = call(world, field="explanation_language", value="it")["change"]

    with pytest.raises(ProfileError) as refused:
        world.profiles.undo(USER, first)

    assert refused.value.code == "superseded"
    assert learning(world, "explanation_language") == "it"
    listed = world.profiles.recent(USER, Origin.VOICE, 10)
    assert [(c.change.id, c.undoable) for c in listed] == [(second, True), (first, False)]


def test_a_change_made_in_the_app_cannot_be_undone_this_way(world: World) -> None:
    world.profiles.apply(
        USER, [Change("explanation_language", "it")], source=Source.ASKED, origin=Origin.FORM
    )
    form_change = world.profiles.history(USER, "de", "explanation_language")[-1].id

    with pytest.raises(ProfileError) as refused:
        world.profiles.undo(USER, form_change or 0)

    assert refused.value.code == "not_found"


def test_one_learner_cannot_undo_anothers_change(world: World) -> None:
    change = call(world, field="explanation_language", value="en")["change"]

    with pytest.raises(ProfileError) as refused:
        world.profiles.undo(OTHER_USER, change)

    assert refused.value.code == "not_found"
    assert learning(world, "explanation_language") == "en"


def test_an_exam_set_by_voice_can_be_taken_back(world: World) -> None:
    change = call(world, field="exam", value='{"type": "goethe", "target_level": "B1"}')["change"]

    world.profiles.undo(USER, change)

    # The learner had no exam before: undoing puts that back.
    assert learning(world, "exam") is None


# --- Ask me again ------------------------------------------------------------------------------


def test_a_recheck_goes_through_the_settings_of_its_group(world: World) -> None:
    briefing = brief(world, "check:learning")

    assert "short check-in" in briefing.instructions
    assert "- explanation language: French" in briefing.instructions
    assert "- explanation usage: when stuck" in briefing.instructions
    assert briefing.plan.focus == ()
    assert briefing.plan.words == ()


def test_an_ordinary_conversation_is_not_a_checkin_but_can_change_settings(world: World) -> None:
    briefing = brief(world)

    assert "short check-in" not in briefing.instructions
    assert UPDATE_PROFILE in briefing.instructions


def test_a_group_the_app_does_not_have_cannot_be_rechecked(world: World) -> None:
    with pytest.raises(ScenarioError):
        brief(world, "check:privacy")


def test_every_setting_of_a_check_group_can_be_changed_by_voice() -> None:
    for fields in CHECK_GROUPS.values():
        assert set(fields) <= set(VOICE_FIELDS)
