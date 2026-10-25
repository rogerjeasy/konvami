from dataclasses import replace
from datetime import timedelta
from uuid import UUID

import pytest

from konvami_api.domain import fsrs
from konvami_api.domain.cards import AGAIN_DELAY, MAX_CARDS, Card, CardError
from konvami_api.domain.conversations import ConversationError
from konvami_api.domain.reports import Mistake, Word
from tests.world import NOON, OTHER_USER, USER, World

HOUR = timedelta(hours=1)
DAY = timedelta(days=1)
MINUTE = timedelta(minutes=1)

WORDS = (
    Word("das Wochenende", "le week-end", "Wie war dein Wochenende?"),
    Word("umsteigen", "changer (de train)", None),
)
MISTAKES = (
    Mistake(
        turn=1,
        original="Ich habe nach Berlin gefahren",
        corrected="Ich bin nach Berlin gefahren",
        explanation="« fahren » forme le Perfekt avec « sein ».",
        category="perfekt_auxiliary",
        severity="noticeable",
        certain=True,
    ),
    Mistake(
        1, "mit der Bus", "mit dem Bus", "« mit » demande le datif.", "case_dative", "minor", False
    ),
)


def reported(world: World, user: UUID = USER, **report: object) -> str:
    """A learner of German with a conversation whose report has two words and two mistakes
    (the second one unconfirmed)."""
    lena, _ = world.onboard(user)
    call_id = world.talk(lena, at=world.clock() - HOUR, user=user)
    world.reported(call_id, **{"words": WORDS, "mistakes": MISTAKES, **report})  # type: ignore[arg-type]
    return call_id


def test_a_word_of_a_report_becomes_a_card_that_is_due_at_once() -> None:
    world = World()
    call_id = reported(world)

    card = world.cards.save(USER, call_id, "word", 0)

    assert card == Card(
        id=UUID("cccccccc-cccc-4ccc-8ccc-000000000001"),
        kind="word",
        front="das Wochenende",
        back="le week-end",
        note="Wie war dein Wochenende?",
        explained_in="fr",
        source_call_id=call_id,
        created_at=NOON,
        due_at=NOON,
        reviewed_at=None,
        memory=None,
        reviews=0,
        lapses=0,
    )


def test_a_correction_becomes_a_card_that_asks_for_the_right_sentence() -> None:
    world = World()
    call_id = reported(world)

    card = world.cards.save(USER, call_id, "correction", 0)

    assert (card.kind, card.front, card.back, card.note) == (
        "correction",
        "Ich habe nach Berlin gefahren",
        "Ich bin nach Berlin gefahren",
        "« fahren » forme le Perfekt avec « sein ».",
    )


def test_a_card_is_made_only_once_however_the_word_is_written() -> None:
    world = World()
    lena, _ = world.onboard()
    first = world.talk(lena, at=NOON - 2 * HOUR)
    second = world.talk(lena, at=NOON - HOUR)
    world.reported(first, words=WORDS)
    world.reported(second, words=(Word("Das  wochenende!", "le weekend", None),))

    one = world.cards.save(USER, first, "word", 0)
    again = world.cards.save(USER, first, "word", 0)
    other = world.cards.save(USER, second, "word", 0)

    assert one == again == other
    assert world.cards.deck(USER).total == 1


def test_a_word_and_a_correction_with_the_same_words_are_two_cards() -> None:
    world = World()
    same = Mistake(1, "das Wochenende", "am Wochenende", "…", "other", "minor", True)
    call_id = reported(world, mistakes=(same,))

    word = world.cards.save(USER, call_id, "word", 0)
    correction = world.cards.save(USER, call_id, "correction", 0)

    assert word.id != correction.id


def test_a_correction_the_second_check_could_not_confirm_cannot_be_learned() -> None:
    world = World()
    call_id = reported(world)

    with pytest.raises(CardError) as refused:
        world.cards.save(USER, call_id, "correction", 1)

    assert refused.value.code == "not_certain"


@pytest.mark.parametrize("index", [-1, 2, 40])
def test_a_card_needs_something_the_report_has(index: int) -> None:
    world = World()
    call_id = reported(world)

    with pytest.raises(CardError) as refused:
        world.cards.save(USER, call_id, "word", index)

    assert refused.value.code == "no_such_item"


def test_a_card_needs_a_report_that_is_ready() -> None:
    world = World()
    lena, _ = world.onboard()
    without = world.talk(lena, at=NOON - HOUR)
    pending = world.talk(lena, at=NOON - HOUR)
    world.reports.after_call(USER, pending)

    for call_id in (without, pending):
        with pytest.raises(CardError) as refused:
            world.cards.save(USER, call_id, "word", 0)
        assert refused.value.code == "no_report"


def test_cards_are_only_made_from_the_learners_own_conversations() -> None:
    world = World()
    call_id = reported(world)

    with pytest.raises(ConversationError):
        world.cards.save(OTHER_USER, call_id, "word", 0)
    with pytest.raises(ConversationError):
        world.cards.save(USER, "rtc_unknown", "word", 0)


def test_a_learner_keeps_a_bounded_number_of_cards() -> None:
    world = World()
    many = tuple(Word(f"das Wort{number}", "un mot", None) for number in range(MAX_CARDS + 1))
    call_id = reported(world, words=many)
    for index in range(MAX_CARDS):
        world.cards.save(USER, call_id, "word", index)

    with pytest.raises(CardError) as refused:
        world.cards.save(USER, call_id, "word", MAX_CARDS)

    assert refused.value.code == "too_many"
    # One that is already there is still found.
    assert world.cards.save(USER, call_id, "word", 0).front == "das Wort0"


# --- The deck ------------------------------------------------------------------------------------


def test_the_deck_lists_cards_newest_first_and_counts_what_is_due() -> None:
    world = World()
    call_id = reported(world)
    world.cards.save(USER, call_id, "word", 0)
    world.clock.now += MINUTE
    learned = world.cards.save(USER, call_id, "word", 1)
    world.clock.now += MINUTE
    world.cards.save(USER, call_id, "correction", 0)
    world.cards.review(USER, learned.id, "good")

    deck = world.cards.deck(USER)

    assert [card.front for card in deck.cards] == [
        "Ich habe nach Berlin gefahren",
        "umsteigen",
        "das Wochenende",
    ]
    assert (deck.total, deck.due, deck.next) == (3, 2, None)
    assert world.cards.due_count(USER) == 2


def test_a_long_deck_is_read_page_by_page() -> None:
    world = World()
    words = tuple(Word(f"das Wort{number}", "un mot", None) for number in range(5))
    call_id = reported(world, words=words)
    for index in range(5):
        world.cards.save(USER, call_id, "word", index)
        world.clock.now += MINUTE

    first = world.cards.deck(USER, limit=2)
    second = world.cards.deck(USER, limit=2, before=first.next)
    third = world.cards.deck(USER, limit=2, before=second.next)

    assert [card.front for card in first.cards] == ["das Wort4", "das Wort3"]
    assert [card.front for card in second.cards] == ["das Wort2", "das Wort1"]
    assert [card.front for card in third.cards] == ["das Wort0"]
    assert (first.total, third.next) == (5, None)


def test_a_deck_belongs_to_one_learner_and_the_language_they_are_learning() -> None:
    world = World()
    call_id = reported(world)
    theirs = reported(world, OTHER_USER)
    world.cards.save(USER, call_id, "word", 0)
    world.cards.save(OTHER_USER, theirs, "word", 1)

    # A card from another language they once learned (only German can be learned for now).
    mine = world.cards.deck(USER).cards[0]
    french = replace(mine, id=UUID("cccccccc-cccc-4ccc-8ccc-000000000099"), front="le mot")
    world.card_store.add(USER, "fr", "le mot", french, MAX_CARDS)

    assert [card.front for card in world.cards.deck(OTHER_USER).cards] == ["umsteigen"]
    assert [card.front for card in world.cards.deck(USER).cards] == ["das Wochenende"]
    assert (world.cards.deck(USER).total, world.cards.due_count(USER)) == (1, 1)
    assert [item.card.front for item in world.cards.queue(USER).cards] == ["das Wochenende"]


def test_a_learner_without_cards_has_an_empty_deck() -> None:
    world = World()
    world.onboard()

    deck = world.cards.deck(USER)

    assert (deck.cards, deck.total, deck.due, deck.next) == ((), 0, 0, None)
    assert world.cards.queue(USER).cards == ()


# --- Reviewing -----------------------------------------------------------------------------------


def test_the_queue_holds_the_cards_that_are_due_the_longest_waiting_first() -> None:
    world = World()
    call_id = reported(world)
    first = world.cards.save(USER, call_id, "word", 0)
    world.clock.now += MINUTE
    second = world.cards.save(USER, call_id, "word", 1)
    world.clock.now += MINUTE
    third = world.cards.save(USER, call_id, "correction", 0)
    world.cards.review(USER, second.id, "good")

    queue = world.cards.queue(USER)
    short = world.cards.queue(USER, limit=1)

    assert [item.card.id for item in queue.cards] == [first.id, third.id]
    assert queue.due == 2
    assert ([item.card.id for item in short.cards], short.due) == ([first.id], 2)


def test_each_card_in_the_queue_says_when_it_would_come_back() -> None:
    world = World()
    call_id = reported(world)
    world.cards.save(USER, call_id, "word", 0)

    (item,) = world.cards.queue(USER).cards

    assert item.due_in == {"again": AGAIN_DELAY, "hard": DAY, "good": 2 * DAY, "easy": 8 * DAY}


def test_a_card_that_was_known_comes_back_later_each_time() -> None:
    world = World()
    call_id = reported(world)
    card = world.cards.save(USER, call_id, "word", 0)

    first = world.cards.review(USER, card.id, "good")
    world.clock.now += 2 * DAY
    due_again = world.cards.queue(USER).due
    second = world.cards.review(USER, card.id, "good")

    assert (first.due_at, first.reviewed_at, first.reviews, first.lapses) == (
        NOON + 2 * DAY,
        NOON,
        1,
        0,
    )
    assert first.memory == fsrs.review(None, 0, "good")
    assert due_again == 1
    # As the reference scheduler has it: two days, then eleven.
    assert second.due_at == NOON + 2 * DAY + 11 * DAY
    assert second.memory == fsrs.review(first.memory, 2, "good")
    assert second.reviews == 2
    assert world.cards.queue(USER).due == 0


def test_a_card_that_was_forgotten_comes_back_in_a_few_minutes() -> None:
    world = World()
    call_id = reported(world)
    card = world.cards.save(USER, call_id, "word", 0)
    world.cards.review(USER, card.id, "good")
    world.clock.now += 2 * DAY

    forgotten = world.cards.review(USER, card.id, "again")

    assert forgotten.due_at == world.clock.now + AGAIN_DELAY
    assert (forgotten.reviews, forgotten.lapses) == (2, 1)
    world.clock.now += AGAIN_DELAY
    assert world.cards.queue(USER).due == 1


def test_not_knowing_a_new_card_is_not_forgetting_it() -> None:
    world = World()
    call_id = reported(world)
    card = world.cards.save(USER, call_id, "word", 0)

    new = world.cards.review(USER, card.id, "again")

    assert (new.due_at, new.reviews, new.lapses) == (NOON + AGAIN_DELAY, 1, 0)


@pytest.mark.parametrize(("later", "days"), [(23 * HOUR, 0), (25 * HOUR, 1), (71 * HOUR, 2)])
def test_the_time_between_two_reviews_is_counted_in_whole_days(later: timedelta, days: int) -> None:
    world = World()
    call_id = reported(world)
    card = world.cards.save(USER, call_id, "word", 0)
    first = world.cards.review(USER, card.id, "hard")
    world.clock.now += later

    second = world.cards.review(USER, card.id, "good")

    assert second.memory == fsrs.review(first.memory, days, "good")


def test_only_the_learners_own_cards_can_be_reviewed_or_removed() -> None:
    world = World()
    call_id = reported(world)
    card = world.cards.save(USER, call_id, "word", 0)
    world.onboard(OTHER_USER)
    unknown = UUID("cccccccc-cccc-4ccc-8ccc-999999999999")

    for user, card_id in ((OTHER_USER, card.id), (USER, unknown)):
        with pytest.raises(CardError) as refused:
            world.cards.review(user, card_id, "good")
        assert refused.value.code == "not_found"
        with pytest.raises(CardError) as refused:
            world.cards.remove(user, card_id)
        assert refused.value.code == "not_found"
    assert world.cards.deck(USER).total == 1


def test_a_review_that_arrives_twice_counts_once() -> None:
    """Two taps on a rating can both read the card before either is stored. Storage accepts
    the first (the contract tests show that with real connections); the second is refused."""
    world = World()
    call_id = reported(world)
    card = world.cards.save(USER, call_id, "word", 0)
    stale = world.card_store.get

    def before_the_other_review(user_id: UUID, card_id: UUID) -> Card | None:
        seen = stale(user_id, card_id)
        world.card_store.get = stale  # type: ignore[method-assign]
        world.cards.review(USER, card.id, "good")
        return seen

    world.card_store.get = before_the_other_review  # type: ignore[method-assign]

    with pytest.raises(CardError) as refused:
        world.cards.review(USER, card.id, "good")

    assert refused.value.code == "conflict"
    assert world.cards.deck(USER).cards[0].reviews == 1


def test_a_removed_card_is_gone_and_can_be_made_again() -> None:
    world = World()
    call_id = reported(world)
    card = world.cards.save(USER, call_id, "word", 0)
    world.cards.review(USER, card.id, "good")

    world.cards.remove(USER, card.id)
    again = world.cards.save(USER, call_id, "word", 0)

    assert world.cards.deck(USER).total == 1
    assert (again.id != card.id, again.reviews, again.memory) == (True, 0, None)


# --- What a report shows as saved ----------------------------------------------------------------


def test_a_report_knows_which_of_its_words_and_corrections_are_cards() -> None:
    world = World()
    call_id = reported(world)
    world.cards.save(USER, call_id, "word", 1)
    world.cards.save(USER, call_id, "correction", 0)
    report = world.reports.view(USER, call_id).report
    assert report is not None

    saved = world.cards.saved(USER, report)

    assert (saved.words, saved.mistakes) == ((False, True), (True, False))


def test_nothing_of_a_report_is_saved_before_the_learner_saves_it() -> None:
    world = World()
    call_id = reported(world)
    report = world.reports.view(USER, call_id).report
    assert report is not None

    saved = world.cards.saved(USER, report)

    assert (saved.words, saved.mistakes) == ((False, False), (False, False))


def test_what_comes_due_by_a_moment_is_counted_with_the_words_apart() -> None:
    world = World()
    call_id = reported(world)
    word = world.cards.save(USER, call_id, "word", 0)
    world.cards.save(USER, call_id, "word", 1)
    world.cards.save(USER, call_id, "correction", 0)
    world.cards.review(USER, word.id, "good")

    now = world.cards.due_ahead(USER, world.clock())
    later = world.cards.due_ahead(USER, world.clock() + 30 * DAY)

    assert (now.now, now.by_then, now.words_by_then) == (2, 2, 1)
    assert (later.now, later.by_then, later.words_by_then) == (2, 3, 2)


def test_reviews_are_counted_from_a_moment_on() -> None:
    world = World()
    call_id = reported(world)
    card = world.cards.save(USER, call_id, "word", 0)
    world.cards.review(USER, card.id, "good")
    world.clock.now += DAY

    assert world.cards.reviews_since(USER, NOON - HOUR) == 1
    assert world.cards.reviews_since(USER, NOON + HOUR) == 0
