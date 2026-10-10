"""Persona Studio (spec §6.2): partners a learner makes, changes and copies themselves."""

import json
from datetime import timedelta
from typing import Any

import pytest

from konvami_api.domain.personas import PersonaError, personality_of, teaching_of
from konvami_api.domain.text import TextModelError
from tests.world import OTHER_USER, USER, World

LOOK = {
    "skin": "honey",
    "hair": "bob",
    "hair_color": "auburn",
    "top": "amber",
    "backdrop": "sand",
    "glasses": True,
    "beard": False,
}
PERSONALITY = {
    "warmth": 5,
    "playfulness": 2,
    "talkativeness": 4,
    "curiosity": 3,
    "humour": 1,
    "form_of_address": "formal",
    "style": "stories",
}
TEACHING = {
    "correction_timing": "immediate",
    "strictness": "everything",
    "explanation_usage": "never",
    "level": "B1",
    "focus": "Dativ und Perfekt",
    "speed": 0.9,
}
GRETA: dict[str, Any] = {
    "role": "teacher",
    "name": "Greta",
    "gender": "female",
    "age": 30,
    "origin": "Hamburg",
    "occupation": "Marketing-Managerin",
    "tagline": "Friendly and precise, loves sailing",
    "backstory": "Greta arbeitet im Marketing in Hamburg und segelt jedes Wochenende.",
    "look": LOOK,
    "voice": "coral",
    "personality": PERSONALITY,
    "teaching": TEACHING,
}
DESCRIPTION = (
    "A 30-year-old woman from Hamburg, friendly, works in marketing, loves sailing, "
    "helps me prepare for job interviews"
)


def in_the_app() -> World:
    world = World()
    world.onboard()
    return world


# --- Creating ------------------------------------------------------------------------------------


def test_a_learner_adds_a_partner_they_designed_themselves() -> None:
    world = in_the_app()

    greta = world.personas.create(USER, GRETA)

    assert [p.name for p in world.personas.partners(USER)] == ["Lena", "Jonas", "Greta"]
    assert world.personas.partners(USER)[2] == greta
    assert (greta.role, greta.gender, greta.age, greta.origin) == (
        "teacher",
        "female",
        30,
        "Hamburg",
    )
    assert (greta.occupation, greta.voice, greta.look) == ("Marketing-Managerin", "coral", LOOK)
    assert greta.personality == PERSONALITY
    assert greta.teaching == TEACHING


def test_a_partner_without_settings_of_their_own_behaves_as_their_role_does() -> None:
    world = in_the_app()
    plain = {k: v for k, v in GRETA.items() if k not in ("personality", "teaching", "occupation")}

    buddy = world.personas.create(USER, {**plain, "role": "buddy"})
    teacher = world.personas.create(USER, {**plain, "role": "teacher", "name": "Gesa"})
    coach = world.personas.create(USER, {**plain, "role": "exam_coach", "name": "Gitta"})

    assert buddy.occupation == ""
    assert (teaching_of(buddy).correction_timing, teaching_of(buddy).strictness) == (
        "recast",
        "meaning",
    )
    assert (teaching_of(teacher).correction_timing, teaching_of(teacher).strictness) == (
        "immediate",
        "important",
    )
    assert (teaching_of(coach).correction_timing, teaching_of(coach).strictness) == (
        "end",
        "important",
    )
    # In the middle on every scale, and the form of address that fits the situation.
    assert personality_of(buddy).model_dump() == {
        "warmth": 3,
        "playfulness": 3,
        "talkativeness": 3,
        "curiosity": 3,
        "humour": 3,
        "form_of_address": "auto",
        "style": "questions",
    }


def test_the_starter_partners_keep_behaving_as_their_role_does() -> None:
    world = World()
    lena, jonas = world.onboard()

    assert teaching_of(lena).correction_timing == "recast"
    assert teaching_of(jonas).correction_timing == "immediate"


@pytest.mark.parametrize(
    "change",
    [
        {"name": "  "},
        {"name": "x" * 41},
        {"age": 17},
        {"age": 81},
        {"role": "villain"},
        {"gender": "robot"},
        {"voice": "darth"},
        {"origin": ""},
        {"occupation": "x" * 81},
        {"backstory": ""},
        {"backstory": "x" * 601},
        {"tagline": "x" * 121},
        {"look": {**LOOK, "hair": "mohawk"}},
        {"personality": {**PERSONALITY, "warmth": 6}},
        {"personality": {**PERSONALITY, "humour": 0}},
        {"personality": {**PERSONALITY, "form_of_address": "rude"}},
        {"teaching": {**TEACHING, "correction_timing": "always"}},
        {"teaching": {**TEACHING, "level": "Z9"}},
        {"teaching": {**TEACHING, "focus": "x" * 121}},
        {"teaching": {**TEACHING, "speed": 2.0}},
        {"teaching": {**TEACHING, "speed": 0.5}},
        {"secret": "field"},
    ],
)
def test_a_partner_that_breaks_a_rule_is_not_added(change: dict[str, Any]) -> None:
    world = in_the_app()

    with pytest.raises(PersonaError) as error:
        world.personas.create(USER, {**GRETA, **change})

    assert error.value.code == "invalid_value"
    assert len(world.personas.partners(USER)) == 2


def test_blank_optional_lines_are_stored_as_none() -> None:
    world = in_the_app()

    greta = world.personas.create(
        USER, {**GRETA, "tagline": "  ", "teaching": {**TEACHING, "focus": " "}}
    )

    assert greta.tagline is None
    assert greta.teaching["focus"] is None


def test_a_learner_has_at_most_twelve_partners() -> None:
    world = in_the_app()
    for number in range(10):
        world.personas.create(USER, {**GRETA, "name": f"Greta {number}"})

    with pytest.raises(PersonaError) as error:
        world.personas.create(USER, GRETA)

    assert error.value.code == "too_many"
    assert len(world.personas.partners(USER)) == 12


def test_a_partner_needs_a_language_to_be_learned() -> None:
    world = World()

    with pytest.raises(PersonaError) as error:
        world.personas.create(USER, GRETA)

    assert error.value.code == "no_language"


# --- Changing ------------------------------------------------------------------------------------


def test_every_part_of_a_partner_can_be_changed() -> None:
    world = World()
    lena, _ = world.onboard()

    changed = world.personas.change(
        USER,
        lena.id,
        role="teacher",
        age=31,
        gender="female",
        origin="Wien",
        occupation="Lehrerin",
        tagline="Geduldig",
        backstory="Lena unterrichtet jetzt in Wien.",
        voice="coral",
        personality=PERSONALITY,
        teaching=TEACHING,
    )

    assert world.personas.partners(USER)[0] == changed
    assert (changed.id, changed.name, changed.look) == (lena.id, "Lena", lena.look)
    assert (changed.role, changed.age, changed.origin, changed.voice) == (
        "teacher",
        31,
        "Wien",
        "coral",
    )
    assert (changed.occupation, changed.tagline) == ("Lehrerin", "Geduldig")
    assert changed.backstory == "Lena unterrichtet jetzt in Wien."
    assert (changed.personality, changed.teaching) == (PERSONALITY, TEACHING)


def test_a_partner_whose_role_changes_takes_on_the_teaching_of_the_new_role() -> None:
    world = World()
    lena, _ = world.onboard()

    changed = world.personas.change(USER, lena.id, role="teacher")

    assert teaching_of(changed).correction_timing == "immediate"


def test_settings_can_be_handed_back_to_the_role() -> None:
    world = in_the_app()
    greta = world.personas.create(USER, GRETA)

    changed = world.personas.change(USER, greta.id, teaching=None, personality=None)

    assert (changed.teaching, changed.personality) == ({}, {})
    assert teaching_of(changed).strictness == "important"


@pytest.mark.parametrize(
    "changes",
    [
        {"age": 12},
        {"voice": "darth"},
        {"teaching": {"correction_timing": "recast"}},
        {"personality": {**PERSONALITY, "style": "monologue"}},
        {"id": "aaaaaaaa-aaaa-4aaa-8aaa-000000000009"},
    ],
)
def test_a_change_that_breaks_a_rule_leaves_the_partner_as_they_were(
    changes: dict[str, Any],
) -> None:
    world = World()
    lena, _ = world.onboard()

    with pytest.raises(PersonaError) as error:
        world.personas.change(USER, lena.id, **changes)

    assert error.value.code == "invalid_value"
    assert world.personas.partners(USER)[0] == lena


# --- Copying -------------------------------------------------------------------------------------


def test_a_copy_is_a_new_partner_with_a_numbered_name() -> None:
    world = in_the_app()
    greta = world.personas.create(USER, GRETA)

    copy = world.personas.duplicate(USER, greta.id)
    another = world.personas.duplicate(USER, greta.id)

    assert (copy.name, another.name) == ("Greta 2", "Greta 3")
    assert len({greta.id, copy.id, another.id}) == 3
    assert (copy.role, copy.look, copy.voice, copy.backstory) == (
        greta.role,
        greta.look,
        greta.voice,
        greta.backstory,
    )
    assert (copy.personality, copy.teaching) == (PERSONALITY, TEACHING)
    assert [p.name for p in world.personas.partners(USER)][-3:] == ["Greta", "Greta 2", "Greta 3"]


def test_a_copy_of_a_long_name_still_fits() -> None:
    world = in_the_app()
    long = world.personas.create(USER, {**GRETA, "name": "G" * 40})

    copy = world.personas.duplicate(USER, long.id)

    assert copy.name == "G" * 38 + " 2"


def test_copying_counts_towards_the_limit_and_needs_an_own_partner() -> None:
    world = World()
    lena, _ = world.onboard()

    with pytest.raises(PersonaError) as stranger:
        world.personas.duplicate(OTHER_USER, lena.id)
    for _ in range(10):
        world.personas.duplicate(USER, lena.id)
    with pytest.raises(PersonaError) as full:
        world.personas.duplicate(USER, lena.id)

    assert (stranger.value.code, full.value.code) == ("not_found", "too_many")


# --- Templates -----------------------------------------------------------------------------------


def test_the_language_pack_offers_ready_made_partners_to_start_from() -> None:
    world = in_the_app()

    templates = world.personas.templates(USER)

    assert [(t.role, t.name) for t in templates[:3]] == [
        ("buddy", "Lena"),
        ("teacher", "Jonas"),
        ("exam_coach", "Frau Weber"),
    ]
    assert len(templates) >= 5
    assert len({t.name for t in templates}) == len(templates)
    # A template is complete: it can be added as it is.
    for template in templates:
        world.personas.create(USER, template.model_dump())
    assert len(world.personas.partners(USER)) == 2 + len(templates)


def test_some_templates_show_what_the_settings_can_do() -> None:
    templates = in_the_app().personas.templates(USER)

    assert any(t.personality and t.personality.style == "debate" for t in templates)
    assert any(t.personality and t.personality.form_of_address == "formal" for t in templates)


def test_without_a_language_there_are_no_templates() -> None:
    assert World().personas.templates(USER) == []


# --- From a description --------------------------------------------------------------------------


def test_a_partner_is_drafted_from_a_description_and_not_saved() -> None:
    world = in_the_app()
    world.text.answers.append(GRETA)

    draft = world.personas.draft(USER, DESCRIPTION)

    assert (draft.name, draft.role, draft.age, draft.origin) == ("Greta", "teacher", 30, "Hamburg")
    assert (draft.voice, draft.occupation) == ("coral", "Marketing-Managerin")
    assert draft.look.model_dump() == LOOK
    assert draft.personality is not None
    assert draft.personality.model_dump() == PERSONALITY
    assert draft.teaching is not None
    assert draft.teaching.model_dump() == TEACHING
    assert [p.name for p in world.personas.partners(USER)] == ["Lena", "Jonas"]


def test_the_writer_gets_the_description_as_material_not_as_instructions() -> None:
    world = in_the_app()
    world.text.answers.append(GRETA)

    world.personas.draft(USER, f"  {DESCRIPTION}  ")

    task = world.text.tasks[-1]
    assert task.model == "gpt-6-luna"
    assert json.loads(task.content)["description"] == DESCRIPTION
    assert DESCRIPTION not in task.instructions
    # The partner speaks the language being learned; what the learner reads is in their own.
    assert "German" in task.instructions
    assert "French" in task.instructions
    assert "real person" in task.instructions
    properties = task.answer_schema["properties"]
    assert "debate" in properties["personality"]["properties"]["style"]["enum"]
    assert "end" in properties["teaching"]["properties"]["correction_timing"]["enum"]
    assert set(task.answer_schema["required"]) == set(GRETA)


def test_the_writer_knows_the_learners_level_and_goals() -> None:
    world = in_the_app()
    world.text.answers.append(GRETA)

    world.personas.draft(USER, DESCRIPTION)

    learner = json.loads(world.text.tasks[-1].content)["learner"]
    assert learner["level"] == "A2"
    assert learner["goals"] == {"reasons": ["work"], "note": "job in Zurich"}


def test_the_writer_must_answer_while_the_learner_is_waiting() -> None:
    world = in_the_app()
    world.text.answers.append(GRETA)

    world.personas.draft(USER, DESCRIPTION)

    limit = world.text.tasks[-1].max_seconds
    assert limit is not None
    assert limit <= 20


@pytest.mark.parametrize(
    "answer",
    [
        TextModelError("timeout"),
        {**GRETA, "voice": "darth"},
        {**GRETA, "age": 12},
        {k: v for k, v in GRETA.items() if k != "teaching"},
    ],
    ids=["failure", "unknown voice", "a child", "incomplete"],
)
def test_a_draft_the_writer_could_not_deliver_is_reported(answer: Any) -> None:
    world = in_the_app()
    world.text.answers.append(answer)

    with pytest.raises(PersonaError) as error:
        world.personas.draft(USER, DESCRIPTION)

    assert error.value.code == "writer_unavailable"


@pytest.mark.parametrize("description", ["", "  hi ", "x" * 501])
def test_a_description_must_say_something_and_stay_short(description: str) -> None:
    world = in_the_app()

    with pytest.raises(PersonaError) as error:
        world.personas.draft(USER, description)

    assert error.value.code == "invalid_value"
    assert len(world.text.tasks) == 1  # Only the starter partners' writer was ever asked.


def test_a_learner_gets_twenty_drafts_a_day() -> None:
    world = in_the_app()
    world.onboard(OTHER_USER)
    world.text.answers.extend([GRETA] * 19 + [TextModelError("timeout")])
    for _ in range(19):
        world.personas.draft(USER, DESCRIPTION)
    # A draft that failed was asked for all the same.
    with pytest.raises(PersonaError):
        world.personas.draft(USER, DESCRIPTION)

    with pytest.raises(PersonaError) as error:
        world.personas.draft(USER, DESCRIPTION)

    assert error.value.code == "draft_limit"
    # The limit is each learner's own, and a day later it is used up no more.
    world.text.answers.extend([GRETA, GRETA])
    assert world.personas.draft(OTHER_USER, DESCRIPTION).name == "Greta"
    world.clock.now += timedelta(hours=24, seconds=1)
    assert world.personas.draft(USER, DESCRIPTION).name == "Greta"
