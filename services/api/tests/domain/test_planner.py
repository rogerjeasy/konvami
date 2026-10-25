from datetime import timedelta
from uuid import uuid4

from konvami_api.domain.cards import Card
from konvami_api.domain.plan import FocusPoint, PlanWord
from konvami_api.domain.planner import MAX_FOCUS, MAX_PLAN_WORDS
from konvami_api.domain.reports import Mistake, Severity, Word
from tests.world import NOON, OTHER_USER, USER, World


def mistake(
    category: str,
    original: str = "mit der Bus",
    corrected: str = "mit dem Bus",
    *,
    certain: bool = True,
    severity: Severity = "noticeable",
) -> Mistake:
    return Mistake(
        turn=1,
        original=original,
        corrected=corrected,
        explanation="« mit » est suivi du datif.",
        category=category,
        severity=severity,
        certain=certain,
    )


def report(world: World, *mistakes: Mistake, days_ago: int = 1, target: str = "de") -> str:
    lena = world.personas.partners(USER)[0]
    call_id = world.talk(lena, at=NOON - timedelta(days=days_ago))
    world.reported(call_id, target=target, mistakes=mistakes)
    return call_id


def topics(world: World) -> list[str]:
    return [point.topic for point in world.planner.plan(USER).focus]


def test_a_learner_without_reports_has_no_focus_yet() -> None:
    world = World()
    world.onboard()

    assert world.planner.plan(USER).focus == ()


def test_a_plan_says_which_language_it_practises() -> None:
    world = World()
    world.onboard()

    assert world.planner.plan(USER).language == "de"


def test_the_kind_of_mistake_made_most_is_practised_first() -> None:
    world = World()
    world.onboard()
    report(world, mistake("case_dative"), mistake("case_dative", "mit meine Mutter"))
    report(world, mistake("perfekt_auxiliary", "ich habe gefahren", "ich bin gefahren"))

    assert topics(world) == ["case_dative", "perfekt_auxiliary"]


def test_a_mistake_the_second_check_could_not_confirm_does_not_count() -> None:
    world = World()
    world.onboard()
    report(world, mistake("case_dative", certain=False), mistake("plural_form", certain=False))

    assert topics(world) == []


def test_a_recent_mistake_counts_more_than_an_old_one() -> None:
    world = World()
    world.onboard()
    report(world, mistake("plural_form"), mistake("plural_form", "zwei Kind"), days_ago=9)
    for days_ago in (8, 7, 6):
        report(world, days_ago=days_ago)
    report(world, mistake("case_dative"), days_ago=1)

    assert topics(world)[0] == "case_dative"


def test_a_mistake_that_hid_the_meaning_counts_more() -> None:
    world = World()
    world.onboard()
    report(
        world,
        mistake("plural_form", "zwei Kind"),
        mistake("negation", "ich habe nicht Zeit", severity="blocks_meaning"),
    )

    assert topics(world)[0] == "negation"


def test_only_reports_of_the_last_few_conversations_count() -> None:
    world = World()
    world.onboard()
    report(world, mistake("plural_form"), days_ago=20)
    for days_ago in range(10, 5, -1):
        report(world, days_ago=days_ago)

    assert topics(world) == []


def test_at_most_two_kinds_are_practised_at_once() -> None:
    world = World()
    world.onboard()
    report(
        world,
        mistake("case_dative"),
        mistake("plural_form", "zwei Kind"),
        mistake("negation", "ich habe nicht Zeit"),
    )

    assert len(topics(world)) == MAX_FOCUS == 2


def test_word_choice_is_not_a_structure_to_steer_towards() -> None:
    world = World()
    world.onboard()
    report(world, mistake("lexical_choice", "ich mache ein Foto", "ich nehme ein Foto"))
    report(world, mistake("vocabulary_false_friend", "ich bekomme ein Kaffee", "ich kriege"))
    report(world, mistake("other", "ja ja", "ja"))

    assert topics(world) == []


def test_a_focus_names_its_rule_how_to_bring_it_up_and_the_learners_own_sentences() -> None:
    world = World()
    world.onboard()
    report(
        world,
        mistake("case_dative", "mit der Bus", "mit dem Bus"),
        mistake("case_dative", "mit meine Mutter", "mit meiner Mutter"),
        mistake("case_dative", "bei die Arbeit", "bei der Arbeit"),
    )

    (point,) = world.planner.plan(USER).focus

    assert point == FocusPoint(
        topic="case_dative",
        title="Dative",
        elicit=point.elicit,
        examples=(("mit der Bus", "mit dem Bus"), ("mit meine Mutter", "mit meiner Mutter")),
    )
    assert "Mit wem" in point.elicit


def test_reports_of_another_language_do_not_count() -> None:
    world = World()
    world.onboard()
    report(world, mistake("case_dative"), target="it")

    assert topics(world) == []


def card(world: World, front: str, back: str, *, due_in: timedelta, kind: str = "word") -> None:
    created = NOON - timedelta(days=3)
    world.card_store.add(
        USER,
        "de",
        front.casefold(),
        Card(
            id=uuid4(),
            kind=kind,  # type: ignore[arg-type]
            front=front,
            back=back,
            note=None,
            explained_in="fr",
            source_call_id=None,
            created_at=created,
            due_at=NOON + due_in,
            reviewed_at=None,
            memory=None,
            reviews=0,
            lapses=0,
        ),
        limit=1000,
    )


def test_the_partner_works_in_the_words_that_are_due_first() -> None:
    world = World()
    world.onboard()
    card(world, "pünktlich", "à l'heure", due_in=timedelta(days=5))
    card(world, "der Termin", "le rendez-vous", due_in=-timedelta(days=2))
    card(world, "umsteigen", "changer de train", due_in=-timedelta(days=1))

    words = world.planner.plan(USER).words

    assert words == (
        PlanWord("der Termin", "le rendez-vous"),
        PlanWord("umsteigen", "changer de train"),
        PlanWord("pünktlich", "à l'heure"),
    )


def test_at_most_a_few_words_and_never_a_correction_card() -> None:
    world = World()
    world.onboard()
    card(world, "mit der Bus", "mit dem Bus", due_in=-timedelta(days=3), kind="correction")
    for number in range(6):
        card(world, f"das Wort{number}", "un mot", due_in=-timedelta(hours=number))

    words = world.planner.plan(USER).words

    assert len(words) == MAX_PLAN_WORDS == 4
    assert all(word.text.startswith("das Wort") for word in words)


def test_recent_conversations_are_named_so_the_partner_does_not_repeat_them() -> None:
    world = World()
    world.onboard()
    report(world)

    assert world.planner.plan(USER).recent_topics == ("Vous avez parlé de votre week-end.",)


def test_a_plan_is_the_learners_own() -> None:
    world = World()
    world.onboard()
    world.onboard(OTHER_USER)
    report(world, mistake("case_dative"))

    assert world.planner.plan(OTHER_USER).focus == ()


def test_words_from_a_report_are_not_plan_words_until_saved() -> None:
    world = World()
    world.onboard()
    call_id = report(world)
    world.reported(call_id, words=(Word("der Termin", "le rendez-vous", None),))

    assert world.planner.plan(USER).words == ()
