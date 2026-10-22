"""Role-play scenarios (spec §6.3): real-life situations with goals, from the language pack."""

from konvami_api.domain.catalog import CATALOG


def test_the_german_pack_has_role_plays_with_goals() -> None:
    pack = CATALOG.available_pack("de")
    assert pack is not None

    ids = [scenario.id for scenario in pack.scenarios]
    assert {"bakery", "doctor", "flat_viewing", "job_interview"} <= set(ids)
    assert len(ids) == len(set(ids))
    for scenario in pack.scenarios:
        assert scenario.level in ("A1", "A2", "B1", "B2"), scenario.id
        assert len(scenario.character) >= 20, scenario.id
        assert len(scenario.situation) >= 20, scenario.id
        goal_ids = [goal.id for goal in scenario.goals]
        assert 2 <= len(goal_ids) <= 4, scenario.id
        assert len(goal_ids) == len(set(goal_ids)), scenario.id
        assert all(goal.description for goal in scenario.goals), scenario.id


def test_a_scenario_is_found_by_its_id() -> None:
    pack = CATALOG.available_pack("de")
    assert pack is not None

    bakery = pack.scenario("bakery")
    assert bakery is not None
    assert bakery.id == "bakery"
    assert pack.scenario("moon_landing") is None
