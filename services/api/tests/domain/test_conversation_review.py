"""Review inside conversation (spec §6.7, §7): a due word the learner used in a conversation
planned around it counts as reviewed."""

from datetime import timedelta
from typing import Any

from konvami_api.domain.live_call import Turn
from konvami_api.domain.plan import PlanWord, SessionPlan
from konvami_api.domain.reports import Word
from tests.world import NOON, USER, World

TERMIN = Word("der Termin", "le rendez-vous", "Ich habe morgen einen Termin.")
UMSTEIGEN = Word("umsteigen", "changer de train", None)


def saved(world: World) -> tuple[Any, dict[str, Any]]:
    """A learner whose two word cards, "der Termin" and "umsteigen", are due."""
    lena, _ = world.onboard()
    call_id = world.talk(lena, at=NOON - timedelta(days=2))
    world.reported(call_id, words=(TERMIN, UMSTEIGEN))
    cards = {
        "termin": world.cards.save(USER, call_id, "word", 0),
        "umsteigen": world.cards.save(USER, call_id, "word", 1),
    }
    return lena, cards


def planned(cards: dict[str, Any], *, review: bool = True) -> SessionPlan:
    return SessionPlan(
        language="de",
        words=(
            PlanWord("der Termin", "le rendez-vous", str(cards["termin"].id)),
            PlanWord("umsteigen", "changer de train", str(cards["umsteigen"].id)),
        ),
        review=review,
    )


def talked(world: World, lena: Any, plan: SessionPlan | None, *learner: Turn) -> str:
    world.clock.now = NOON + timedelta(minutes=30)
    return world.talk(
        lena,
        at=NOON + timedelta(minutes=20),
        turns=(Turn("persona", "Wann hast du Zeit?"), *learner),
        plan=plan,
    )


def stored(world: World, card: Any) -> Any:
    return world.card_store.get(USER, card.id)


def test_a_due_word_the_learner_used_counts_as_reviewed() -> None:
    world = World()
    lena, cards = saved(world)
    call_id = talked(world, lena, planned(cards), Turn("learner", "Ich habe morgen einen Termin."))

    world.conversation_review.after_conversation(call_id)

    termin = stored(world, cards["termin"])
    assert termin.reviews == 1
    assert termin.due_at > world.clock.now
    # Not used: still due, and not counted as forgotten either.
    assert stored(world, cards["umsteigen"]).reviews == 0


def test_a_word_in_its_forms_counts_too() -> None:
    world = World()
    lena, cards = saved(world)
    call_id = talked(world, lena, planned(cards), Turn("learner", "Ich steige in Köln um."))

    world.conversation_review.after_conversation(call_id)

    assert stored(world, cards["umsteigen"]).reviews == 1


def test_what_the_learner_really_said_counts() -> None:
    world = World()
    lena, cards = saved(world)
    # The live transcription tidied the sentence; the verbatim pass kept what was said.
    turn = Turn("learner", "Ich habe morgen einen Termin.", verbatim="Ich habe morgen Zeit.")
    call_id = talked(world, lena, planned(cards), turn)

    world.conversation_review.after_conversation(call_id)

    assert stored(world, cards["termin"]).reviews == 0


def test_the_partner_saying_a_word_does_not_count() -> None:
    world = World()
    lena, cards = saved(world)
    call_id = world.talk(
        lena,
        at=NOON + timedelta(minutes=20),
        turns=(Turn("persona", "Hast du einen Termin?"), Turn("learner", "Ja.")),
        plan=planned(cards),
    )

    world.conversation_review.after_conversation(call_id)

    assert stored(world, cards["termin"]).reviews == 0


def test_an_ordinary_conversation_reviews_the_due_words_used_as_well() -> None:
    world = World()
    lena, cards = saved(world)
    call_id = talked(
        world, lena, planned(cards, review=False), Turn("learner", "Ich habe einen Termin.")
    )

    world.conversation_review.after_conversation(call_id)

    assert stored(world, cards["termin"]).reviews == 1


def test_a_word_that_is_not_due_yet_is_not_reviewed_early() -> None:
    world = World()
    lena, cards = saved(world)
    world.cards.review(USER, cards["termin"].id, "good")
    call_id = talked(world, lena, planned(cards), Turn("learner", "Ich habe einen Termin."))

    world.conversation_review.after_conversation(call_id)

    assert stored(world, cards["termin"]).reviews == 1


def test_a_conversation_counts_once() -> None:
    world = World()
    lena, cards = saved(world)
    call_id = talked(world, lena, planned(cards), Turn("learner", "Ich habe einen Termin."))
    world.conversation_review.after_conversation(call_id)
    world.clock.now += timedelta(days=30)

    world.conversation_review.after_conversation(call_id)

    assert stored(world, cards["termin"]).reviews == 1


def test_a_conversation_without_a_plan_reviews_nothing() -> None:
    world = World()
    lena, cards = saved(world)
    call_id = talked(world, lena, None, Turn("learner", "Ich habe einen Termin."))

    world.conversation_review.after_conversation(call_id)

    assert stored(world, cards["termin"]).reviews == 0


def test_a_removed_card_is_skipped() -> None:
    world = World()
    lena, cards = saved(world)
    world.cards.remove(USER, cards["termin"].id)
    call_id = talked(world, lena, planned(cards), Turn("learner", "Ich habe einen Termin."))

    world.conversation_review.after_conversation(call_id)

    assert stored(world, cards["umsteigen"]).reviews == 0


def test_an_unknown_conversation_is_ignored() -> None:
    World().conversation_review.after_conversation("rtc_nope")


def test_the_plan_words_the_learner_said_are_named_whether_or_not_they_were_due() -> None:
    world = World()
    lena, cards = saved(world)
    call_id = talked(
        world,
        lena,
        planned(cards),
        Turn("learner", "Ich muss in Bern umsteigen."),
        Turn("persona", "Hast du einen Termin?"),
    )

    used = world.conversation_review.words_used(call_id)

    # Only the learner's own words count: the partner said "Termin".
    assert [word.text for word in used] == ["umsteigen"]
    assert world.conversation_review.words_used("rtc_unknown") == ()
