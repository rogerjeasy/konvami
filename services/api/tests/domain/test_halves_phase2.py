"""Two Halves phase 2 (design note 2026-11-20-two-halves-phase2-design.md): strangers matched
behind their switch, the Bridge, native nudges, the strand map, the share card, the owner's
decisions and numbers, native intelligibility, the week's suggestion and a case from an import."""

import datetime as dt
from dataclasses import replace
from typing import Any
from uuid import UUID

import pytest

from konvami_api.domain.halves import (
    AI_OFFER_AFTER,
    IMPORT_CASES_PER_DAY,
    HalvesError,
    Move,
)
from konvami_api.domain.halves_cases import template
from konvami_api.domain.halves_writer import CaseMaterial
from konvami_api.domain.profile import Change, Origin, Source
from tests.domain.test_halves import Game, game, join, say
from tests.world import OTHER_USER, USER

HOUR = dt.timedelta(hours=1)
CELLO = "Ein Schaffner hat um 14 Uhr 20 einen Kasten gesehen"


def learns(g: Game, user: UUID, language: str) -> None:
    g.world.profiles.apply(
        user, [Change("target_language", language)], source=Source.ASKED, origin=Origin.FORM
    )


def strangers(**phase2: Any) -> Game:
    """USER (French, learns German) and OTHER_USER (German, learns French), both looking."""
    g = game(strangers=True, **phase2)
    join(g)
    join(g, OTHER_USER, native="de")
    learns(g, OTHER_USER, "fr")
    return g


def age(g: Game, user: UUID, bracket: str) -> None:
    accounts = g.world.accounts.accounts
    accounts[user] = replace(accounts[user], age_bracket=bracket)


# --- Finding a partner (7.3) ---------------------------------------------------------------------


def test_looking_for_a_stranger_is_closed_without_the_switch() -> None:
    g = game()
    join(g)
    with pytest.raises(HalvesError, match="unavailable"):
        g.service.look(USER, 12)
    assert not g.service.overview(USER).strangers


def test_two_mirrors_who_look_are_paired_at_once() -> None:
    g = strangers()
    first = g.service.look(USER, 12)
    assert not isinstance(first, Move)
    assert g.service.overview(USER).search is not None
    g.tick()
    case = g.service.look(OTHER_USER, 12)
    found = g.store.case(case.id)  # type: ignore[union-attr]
    assert found is not None
    assert found.mode == "match"
    view = g.service.view(USER, found.id)
    assert (view.speaks, view.hears) == ("de", "fr")
    assert not view.partner.ai
    assert not view.same_language
    # The one who waited is told by push; the searches are over.
    assert (USER, found.id, "match") in g.announced
    assert g.store.ticket(USER) is None
    assert g.store.ticket(OTHER_USER) is None


def test_minors_are_never_matched_and_the_band_is_read_each_time() -> None:
    g = strangers()
    g.service.look(USER, 12)
    # Their age group was corrected after they joined: the stored band does not count.
    age(g, OTHER_USER, "16-17")
    with pytest.raises(HalvesError, match="adults_only"):
        g.service.look(OTHER_USER, 12)
    assert g.store.ticket(USER) is not None


def test_a_move_between_two_learners_is_held_once_one_is_not_an_adult() -> None:
    g = strangers()
    g.service.look(USER, 12)
    case = g.service.look(OTHER_USER, 12)
    age(g, OTHER_USER, "16-17")
    mine = say(g, case.id, CELLO)  # type: ignore[union-attr]
    assert g.store.moves[mine].status == "held"
    assert g.store.moves[mine].reasons == ("age_band",)


def test_a_block_keeps_two_strangers_apart() -> None:
    g = strangers()
    g.service.look(USER, 12)
    case = g.service.look(OTHER_USER, 12)
    g.service.block(USER, case.id)  # type: ignore[union-attr]
    g.service.look(USER, 12)
    assert isinstance(g.service.look(OTHER_USER, 12), object)
    assert g.store.ticket(OTHER_USER) is not None


def test_two_learners_of_one_language_play_in_same_language_mode() -> None:
    g = game(strangers=True)
    join(g)
    join(g, OTHER_USER, native="en")
    g.service.look(USER, 12)
    case = g.service.look(OTHER_USER, 12)
    view = g.service.view(USER, case.id)  # type: ignore[union-attr]
    assert (view.speaks, view.hears) == ("de", "de")
    assert view.same_language


def test_a_long_search_offers_an_ai_then_ends() -> None:
    g = strangers()
    g.service.look(USER, 24)
    g.world.clock.now += AI_OFFER_AFTER
    g.service.tick()
    assert (USER, UUID(int=0), "ai_offer") in g.announced
    search = g.service.overview(USER).search
    assert search is not None
    assert search.offer_ai
    g.world.clock.now += 13 * HOUR
    g.service.tick()
    assert (USER, UUID(int=0), "search_over") in g.announced
    assert g.store.ticket(USER) is None


def test_playing_the_ai_ends_the_search() -> None:
    g = strangers()
    g.service.look(USER, 12)
    g.service.play_ai(USER)
    assert g.store.ticket(USER) is None


def test_the_search_length_is_bounded() -> None:
    g = strangers()
    for hours in (1, 49):
        with pytest.raises(HalvesError, match="invalid_value"):
            g.service.look(USER, hours)


# --- The Bridge (same-language mode) -------------------------------------------------------------


def same_language_ai() -> tuple[Game, UUID, UUID]:
    """USER plays the AI in German both ways (their first language is not one of the four)."""
    g = game()
    join(g, native="other")
    case = g.service.play_ai(USER, "lost_cello")
    g.run_jobs()
    theirs = g.service.view(USER, case.id).rounds[0].theirs
    assert theirs is not None
    return g, case.id, theirs.id


def test_the_bridge_helps_step_by_step_in_same_language_mode() -> None:
    g, case_id, move_id = same_language_ai()
    view = g.service.view(USER, case_id)
    theirs = view.rounds[0].theirs
    assert theirs is not None
    assert theirs.bridge
    with pytest.raises(HalvesError, match="not_your_turn"):
        g.service.bridge(USER, move_id, "gist")
    g.service.bridge(USER, move_id, "slower")
    theirs = g.service.bridge(USER, move_id, "simpler").rounds[0].theirs
    assert theirs is not None
    assert theirs.simpler == "Es ist um 14 Uhr 20."
    theirs = g.service.bridge(USER, move_id, "gist").rounds[0].theirs
    assert theirs is not None
    assert theirs.gist == "It is at 14:20."


def test_the_bridge_says_so_calmly_when_nothing_could_be_written() -> None:
    g, _, move_id = same_language_ai()
    g.brain.simpler = None
    with pytest.raises(HalvesError, match="not_written"):
        g.service.bridge(USER, move_id, "simpler")


def test_mirror_mode_needs_no_bridge() -> None:
    g = game()
    join(g)
    case = g.service.play_ai(USER, "lost_cello")
    g.run_jobs()
    theirs = g.service.view(USER, case.id).rounds[0].theirs
    assert theirs is not None
    assert not theirs.bridge
    with pytest.raises(HalvesError, match="not_your_turn"):
        g.service.bridge(USER, theirs.id, "simpler")


# --- Native nudges -------------------------------------------------------------------------------


def friends_with_a_move() -> tuple[Game, UUID, UUID]:
    """USER told OTHER_USER (who grew up with German) a clue in German."""
    g = strangers()
    g.service.look(USER, 12)
    case = g.service.look(OTHER_USER, 12)
    case_id = case.id  # type: ignore[union-attr]
    mine = say(g, case_id, CELLO)
    return g, case_id, mine


def test_a_native_nudge_reaches_the_speaker_only_after_the_verifier() -> None:
    g, case_id, mine = friends_with_a_move()
    theirs = g.service.view(OTHER_USER, case_id).rounds[0].theirs
    assert theirs is not None
    assert theirs.can_nudge
    assert theirs.caption == CELLO
    g.service.nudge(OTHER_USER, mine, "  um 14:20 Uhr  ")
    assert g.service.view(USER, case_id).rounds[0].mine.nudges == ()  # type: ignore[union-attr]
    g.run_jobs()
    nudges = g.service.view(USER, case_id).rounds[0].mine.nudges  # type: ignore[union-attr]
    assert [n.text for n in nudges] == ["um 14:20 Uhr"]
    assert nudges[0].by == g.store.profiles[OTHER_USER].codename
    with pytest.raises(HalvesError, match="answered"):
        g.service.nudge(OTHER_USER, mine, "noch einmal")


def test_a_wrong_nudge_is_dropped_quietly_and_an_unsafe_one_is_held_for_the_owner() -> None:
    g, case_id, mine = friends_with_a_move()
    g.brain.verdicts = ["wrong"]
    g.service.nudge(OTHER_USER, mine, "um 14 Uhr")
    g.run_jobs()
    assert g.service.view(USER, case_id).rounds[0].mine.nudges == ()  # type: ignore[union-attr]
    assert not g.service.queue(OTHER_USER)

    g2, case2, mine2 = friends_with_a_move()
    g2.service.nudge(OTHER_USER, mine2, "schreib mir: lena@example.com")
    g2.run_jobs()
    queue = g2.service.queue(OTHER_USER)
    assert [item.kind for item in queue] == ["nudge"]
    assert g2.service.view(USER, case2).rounds[0].mine.nudges == ()  # type: ignore[union-attr]
    g2.service.decide(OTHER_USER, "nudge", queue[0].id, "remove")
    assert g2.store.profiles[OTHER_USER].strikes == 1
    assert not g2.service.queue(OTHER_USER)


def test_a_nudge_that_cannot_be_judged_is_never_shown() -> None:
    g, case_id, mine = friends_with_a_move()
    g.brain.verdicts = [None, None, None]
    g.service.nudge(OTHER_USER, mine, "um 14:20 Uhr")
    for _ in range(3):
        g.run_jobs()
        nudge = next(iter(g.store.nudges.values()))
        if nudge.status == "checking":
            g.service.check_nudge(nudge.id)
    nudge = next(iter(g.store.nudges.values()))
    assert nudge.status == "dropped"
    assert g.service.view(USER, case_id).rounds[0].mine.nudges == ()  # type: ignore[union-attr]


def test_only_a_native_of_the_moves_language_may_nudge() -> None:
    g, case_id, _ = friends_with_a_move()
    # USER grew up with French: OTHER_USER's French moves, not German ones, are theirs to nudge.
    theirs = say(g, case_id, "Inès a changé de train à Genève, sans violoncelle", OTHER_USER)
    view = g.service.view(USER, case_id).rounds[0].theirs
    assert view is not None
    assert view.can_nudge
    learns(g, USER, "it")
    g.store.profiles[USER] = replace(g.store.profiles[USER], native_language="en")
    with pytest.raises(HalvesError, match="not_your_turn"):
        g.service.nudge(USER, theirs, "à Genève")


# --- The owner (6.15) ----------------------------------------------------------------------------


def held_move() -> tuple[Game, UUID]:
    g = game()
    join(g)
    case = g.service.play_ai(USER, "lost_cello")
    g.run_jobs()
    g.brain.labels = [("contact_or_meetup",)]
    return g, say(g, case.id, "Ruf mich an, wir treffen uns morgen")


def test_a_warning_takes_the_move_and_tells_the_sender_without_a_strike() -> None:
    g, move = held_move()
    g.service.decide(OTHER_USER, "held", move, "warn")
    assert g.store.profiles[USER].strikes == 0
    assert any(kind == "warning" for _, _, kind in g.announced)
    assert [s.kind for s in g.store.strikes_of(USER)] == ["warning"]
    assert g.store.moves[move].status == "removed"


def test_a_suspension_is_at_once() -> None:
    g, move = held_move()
    g.service.decide(OTHER_USER, "held", move, "suspend")
    assert g.store.profiles[USER].suspended
    with pytest.raises(HalvesError, match="suspended"):
        g.service.play_ai(USER)


def test_leaving_never_takes_a_held_move_out_of_the_owners_queue() -> None:
    g, move = held_move()
    g.service.leave(USER)
    assert [item.move_id for item in g.service.queue(OTHER_USER)] == [move]


def test_the_owner_sees_rates_per_thousand_and_the_time_to_decide() -> None:
    g, move = held_move()
    g.world.clock.now += 6 * HOUR
    g.service.decide(OTHER_USER, "held", move, "remove")
    stats = g.service.stats(OTHER_USER)
    assert stats.moves == 1
    assert stats.held_per_1000 == 1000.0
    assert stats.median_decision_hours == pytest.approx(6.0, abs=0.1)
    assert stats.open_items == 0
    with pytest.raises(HalvesError, match="not_owner"):
        g.service.stats(USER)


# --- What the learner sees about how they did ----------------------------------------------------


def test_native_intelligibility_counts_the_clues_understood_at_the_first_try() -> None:
    g = game()
    join(g)
    case = g.service.play_ai(USER, "lost_cello")
    g.run_jobs()
    say(g, case.id, CELLO)
    view = g.service.view(USER, case.id)
    assert (view.understood_first, view.told) == (1, 1)
    overview = g.service.overview(USER)
    assert (overview.understood_first, overview.told) == (1, 1)


def test_the_strand_map_draws_only_places_people_shared() -> None:
    g = strangers()
    g.service.look(USER, 12)
    g.service.look(OTHER_USER, 12)
    g.service.change(OTHER_USER, place="city:Zürich")
    strands = g.service.strands(USER)
    assert strands.me is not None
    assert strands.me.label == "Lyon"
    assert [(s.codename, s.point.label) for s in strands.strands] == [
        (g.store.profiles[OTHER_USER].codename, "Zürich")
    ]
    g.service.change(OTHER_USER, clear_place=True)
    strands = g.service.strands(USER)
    assert strands.strands == ()
    assert strands.unplaced == 1


def test_the_share_card_has_no_words_and_carries_an_invite_code() -> None:
    g = game()
    join(g)
    case = g.service.play_ai(USER, "lost_cello", season=False)
    with pytest.raises(HalvesError, match="not_your_turn"):
        g.service.share(USER, case.id)
    found = g.store.case(case.id)
    assert found is not None
    g.store.save_case(replace(found, status="solved"))
    card = g.service.share(USER, case.id)
    assert card.title == "Le violoncelle perdu"
    assert card.code is not None
    assert card.code == g.store.invite_of(USER).code  # type: ignore[union-attr]


def test_the_director_suggests_one_case_a_week() -> None:
    g = game()
    join(g)
    monday = g.world.clock.now.date() - dt.timedelta(days=g.world.clock.now.weekday())
    suggested = g.service.suggestion(USER, monday)
    assert suggested is not None
    g.service.play_ai(USER, suggested.template_id)
    assert g.service.suggestion(USER, monday) is None


# --- A case from a course import (7.17) ----------------------------------------------------------

IMPORT = UUID(int=77)
MATERIAL = CaseMaterial(
    IMPORT,
    "Brief vom Vermieter",
    "de",
    "B1",
    "…",
    tuple(
        (word, word)
        for word in ("Frist", "Kaution", "Vermieter", "Wohnung", "Schlüssel", "Kündigung")
    ),
)


def test_a_case_from_an_import_falls_back_to_its_words() -> None:
    g = game(material=lambda user, item: MATERIAL if item == IMPORT and user == USER else None)
    join(g)
    case = g.service.play_import(USER, IMPORT)
    assert case.custom is not None
    assert template(case.template_id) is None
    g.run_jobs()
    view = g.service.view(USER, case.id)
    assert view.from_import
    # The word case is in the language learned, so the AI speaks it too.
    assert (view.speaks, view.hears) == ("de", "de")
    stored = g.store.case(case.id)
    assert stored is not None
    assert stored.custom == case.custom
    join(g, OTHER_USER, native="de")
    with pytest.raises(HalvesError, match="not_found"):
        g.service.play_import(OTHER_USER, IMPORT)


def test_cases_from_imports_are_limited_a_day() -> None:
    g = game(material=lambda *_: MATERIAL)
    join(g)
    for _ in range(IMPORT_CASES_PER_DAY):
        made = g.service.play_import(USER, IMPORT)
        found = g.store.case(made.id)
        assert found is not None
        g.store.save_case(replace(found, status="solved"))
    with pytest.raises(HalvesError, match="limit"):
        g.service.play_import(USER, IMPORT)
