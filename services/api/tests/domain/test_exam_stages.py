"""Full-length task allowances and persistent staged progress (spec §6.13)."""

from konvami_api.domain.exams import GERMAN_EXAMS, next_stage


def test_testdaf_stages_cover_all_seven_tasks_at_their_own_timing() -> None:
    stages = [exam for exam in GERMAN_EXAMS if exam.exam == "testdaf"]
    assert len(stages) == 7
    assert [exam.stage for exam in stages] == list(range(1, 8))
    assert all(exam.series == "testdaf_paper" and exam.stages == 7 for exam in stages)
    assert [(exam.prep_seconds, exam.parts[0].seconds) for exam in stages] == [
        (30, 30),
        (60, 60),
        (60, 90),
        (180, 120),
        (120, 90),
        (180, 120),
        (90, 90),
    ]
    assert all(exam.min_learner_turns == 1 for exam in stages)
    assert stages[2].parts[0].cards[0].figure is not None
    assert stages[5].parts[0].cards[0].figure is not None


def test_staged_suggestion_resumes_the_least_completed_task() -> None:
    stages = [exam for exam in GERMAN_EXAMS if exam.exam == "testdaf"]
    assert next_stage(stages[0], stages, {}).id == stages[0].id
    assert next_stage(stages[0], stages, {stages[0].id: 1}).id == stages[1].id
    assert next_stage(stages[0], stages, {exam.id: 1 for exam in stages}).id == stages[0].id


def test_dtz_picture_tasks_have_renderable_scene_identifiers() -> None:
    dtz = next(exam for exam in GERMAN_EXAMS if exam.id == "dtz")
    cards = next(part.cards for part in dtz.parts if part.kind == "picture_experience")
    assert {card.picture for card in cards} == {"waiting_room", "bus_stop"}


def test_one_testdaf_answer_is_scored_and_advances_the_suggested_stage() -> None:
    from konvami_api.domain.live_call import Turn
    from tests.world import USER, World

    world = World()
    world.onboard(exam={"type": "testdaf", "target_level": "B2"})
    assert world.exams.centre(USER).suggested == "testdaf_paper_1"
    call_id = world.simulate(
        (
            Turn("persona", "Sportbüro, guten Tag."),
            Turn(
                "learner",
                "Guten Tag, ich heiße Amara. Ich möchte einen Schwimmkurs besuchen. "
                "Wann beginnt der Kurs und wie kann ich mich anmelden?",
            ),
        ),
        exam="testdaf_paper_1",
    )
    world.text.answers.append(
        {
            "parts": [
                {
                    "part": "aufgabe_1",
                    "marks": {"task": 3, "coherence": 3, "vocabulary": 3, "grammar": 3},
                    "feedback": "Tu as posé des questions précises.",
                    "model_answer": "Wann beginnt der Kurs?",
                }
            ],
            "summary": "Des questions claires.",
        }
    )
    world.exams.score(call_id)
    assert world.exams.result(USER, call_id).status == "ready"
    assert world.exams.centre(USER).suggested == "testdaf_paper_2"
