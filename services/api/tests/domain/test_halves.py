import datetime as dt
import random
from dataclasses import dataclass, replace
from uuid import UUID

import pytest

from konvami_api.domain.halves import (
    CHECK_ATTEMPTS,
    CODE_ALPHABET,
    CODE_LENGTH,
    MOVES_PER_DAY,
    SEAT_TIMEOUT,
    STRIKES_TO_SUSPEND,
    WRONG_CODES_PER_DAY,
    HalvesError,
    HalvesService,
    Move,
    band_of,
    valid_place,
)
from konvami_api.domain.halves_cases import CASES, LANGUAGES, ROUNDS, season_case, template
from konvami_api.domain.profile import Change, Origin, Source
from konvami_api.domain.spoken import Listener
from tests.fakes import ScriptedTranscriber
from tests.halves_fake import FakeBrain, InMemoryHalvesRepository, RecordingHalvesStarter
from tests.world import OTHER_USER, USER, World

MINUTE = dt.timedelta(minutes=1)
AUDIO = b"\x00" * 4000


@dataclass
class Game:
    world: World
    service: HalvesService
    store: InMemoryHalvesRepository
    starter: RecordingHalvesStarter
    brain: FakeBrain
    heard: ScriptedTranscriber
    announced: list[tuple[UUID, UUID, str]]

    def tick(self) -> None:
        self.world.clock.now += MINUTE

    def run_jobs(self) -> None:
        """Does what the worker would, until no job is left."""
        while self.starter.jobs:
            job, item = self.starter.jobs.pop(0)
            if job == "check":
                self.service.check(item)
            elif job == "ai":
                self.service.play(item)
            elif job == "recap":
                self.service.write_recap(item)


def game(*, enabled: bool = True, allowed: bool = True, adult: bool = True) -> Game:
    world = World()
    world.onboard()
    world.onboard(OTHER_USER)
    for user in (USER, OTHER_USER):
        account = world.accounts.accounts[user]
        world.accounts.accounts[user] = replace(account, age_bracket="25-34" if adult else "16-17")
    store = InMemoryHalvesRepository()
    starter = RecordingHalvesStarter()
    brain = FakeBrain(world.clock)
    heard = ScriptedTranscriber()
    announced: list[tuple[UUID, UUID, str]] = []
    service = HalvesService(
        profiles=world.profiles,
        personas=world.personas,
        accounts=world.accounts,
        repository=store,
        listener=Listener(
            profiles=world.profiles,
            accounts=world.accounts,
            transcriber=heard,
            model="gpt-4o-transcribe",
        ),
        brain=brain,
        files=world.files,
        starter=starter,
        enabled=enabled,
        allowed=lambda _: allowed,
        owners=frozenset({OTHER_USER}),
        clock=world.clock,
        announce=lambda user, case, kind: announced.append((user, case, kind)),
        rng=random.Random(7),  # noqa: S311 - codenames in a test
    )
    return Game(world, service, store, starter, brain, heard, announced)


def join(g: Game, user: UUID = USER, native: str = "fr", veil: bool = False) -> None:
    g.service.join(
        user, native_language=native, place="city:Lyon", veil_default=veil, voice_consent=True
    )


def say(g: Game, case_id: UUID, words: str, user: UUID = USER) -> UUID:
    """Records a move that is heard as `words`, and has the worker check it."""
    g.tick()
    g.heard.answers.append(words)
    move = g.service.record(user, case_id, AUDIO, "m4a", 6.0)
    g.run_jobs()
    return move.id


# --- Rules ---------------------------------------------------------------------------------------


def test_the_age_band_is_strict_when_unsure() -> None:
    assert band_of("25-34") == "adult"
    assert band_of("16-17") == "minor"
    assert band_of("") == "minor"


def test_a_place_is_a_listed_city_a_country_or_nothing() -> None:
    assert valid_place("city:Zürich")
    assert valid_place("country:CH")
    assert valid_place(None)
    assert not valid_place("city:Atlantis")
    assert not valid_place("street:Bahnhofstrasse 1")


def test_every_case_is_written_in_the_four_languages_with_three_rounds_a_seat() -> None:
    for case in CASES:
        assert set(case.title) == set(LANGUAGES)
        for seat in ("A", "B"):
            rounds = sorted(c.round for c in case.clues if c.seat == seat)
            assert rounds == list(range(1, ROUNDS + 1))
        for clue in case.clues:
            assert set(clue.says) == set(LANGUAGES)
            assert set(clue.asks) == set(LANGUAGES)
            assert 0 <= clue.answer < len(clue.options)
        assert 0 <= case.answer < len(case.options)


def test_the_weeks_case_turns_through_the_library() -> None:
    seen = {season_case(2026, week).id for week in range(1, 7)}
    assert seen == {case.id for case in CASES}


# --- Joining -------------------------------------------------------------------------------------


def test_joining_needs_the_voice_sharing_consent_and_listed_answers() -> None:
    g = game()
    with pytest.raises(HalvesError, match="consent_required"):
        g.service.join(
            USER, native_language="fr", place=None, veil_default=True, voice_consent=False
        )
    with pytest.raises(HalvesError, match="invalid_value"):
        g.service.join(
            USER, native_language="xx", place=None, veil_default=True, voice_consent=True
        )
    with pytest.raises(HalvesError, match="invalid_value"):
        g.service.join(
            USER, native_language="fr", place="city:Nowhere", veil_default=True, voice_consent=True
        )
    profile = g.service.join(
        USER, native_language="fr", place="country:FR", veil_default=True, voice_consent=True
    )
    assert profile.band == "adult"
    assert "-" in profile.codename
    assert g.service.reroll(USER).codename != ""


def test_it_is_closed_until_turned_on_and_allowed() -> None:
    for g in (game(enabled=False), game(allowed=False)):
        assert not g.service.overview(USER).available
        with pytest.raises(HalvesError, match="unavailable"):
            join(g)


# --- A case against the AI -----------------------------------------------------------------------


def test_a_whole_case_against_the_ai_from_first_clue_to_recap() -> None:
    g = game()
    join(g)
    case = g.service.play_ai(USER, "lost_cello")
    g.run_jobs()
    view = g.service.view(USER, case.id)
    # Mirror mode: the learner speaks German, the stand-in their native French, labelled AI.
    assert (view.speaks, view.hears) == ("de", "fr")
    assert view.partner.ai
    assert view.partner.name == "Julien"
    assert view.record_round == 1
    assert view.rounds[0].clue.startswith("Ein Schaffner")
    # The stand-in told its first clue; the learner's question is in their interface language.
    theirs = view.rounds[0].theirs
    assert theirs is not None
    assert theirs.question == "Où Inès a-t-elle changé de train ?"

    sentences = (
        "Ein Schaffner hat um 14 Uhr 20 einen Kasten gesehen",
        "Im Fundbüro gibt es einen Kasten mit einem roten Band",
        "Das Fundbüro schließt am Freitag um 18:00 Uhr",
    )
    for number, sentence in enumerate(sentences, start=1):
        mine = say(g, case.id, sentence)
        assert g.store.moves[mine].status == "delivered"
        view = g.service.view(USER, case.id)
        mine_view = view.rounds[number - 1].mine
        assert mine_view is not None
        assert mine_view.understood is True
        theirs = view.rounds[number - 1].theirs
        assert theirs is not None
        clue = template("lost_cello").clue("B", number)  # type: ignore[union-attr]
        g.tick()
        g.service.answer(USER, theirs.id, clue.answer)
        g.run_jobs()

    view = g.service.view(USER, case.id)
    assert view.final.open
    g.service.solve(USER, case.id, 0)
    g.run_jobs()
    view = g.service.view(USER, case.id)
    assert view.status == "solved"
    assert view.final.solution == 0
    assert view.ending is not None
    assert "Inès" in view.ending
    assert view.recap_status == "ready"
    assert view.recap[0].text.endswith("fertig!")
    # Nothing to ask again against an AI.
    assert not view.ask_again
    assert all(m.delete_after is not None for m in g.store.moves_of(case.id))


def test_a_learner_records_a_round_only_after_finishing_the_others_clue() -> None:
    g = game()
    join(g)
    case = g.service.play_ai(USER, "grandma_recipe")
    g.run_jobs()
    say(g, case.id, "Oma Rosa nimmt 250 Gramm Mehl")
    view = g.service.view(USER, case.id)
    assert view.record_round is None
    with pytest.raises(HalvesError, match="not_your_turn"):
        g.service.record(USER, case.id, AUDIO, "m4a", 5.0)
    theirs = view.rounds[0].theirs
    assert theirs is not None
    # Two wrong answers, then the right one is shown and the round moves on.
    g.service.answer(USER, theirs.id, 0)
    view = g.service.answer(USER, theirs.id, 2)
    assert view.rounds[0].theirs is not None
    assert view.rounds[0].theirs.solution == 1
    assert view.record_round == 2
    with pytest.raises(HalvesError, match="answered"):
        g.service.answer(USER, theirs.id, 1)


def test_the_stand_in_may_not_understand_and_the_learner_sees_it() -> None:
    g = game()
    join(g)
    case = g.service.play_ai(USER, "lost_cello")
    g.run_jobs()
    g.brain.picks.append(2)
    say(g, case.id, "Der Kasten war um drei Uhr auf dem Gleis")
    mine = g.service.view(USER, case.id).rounds[0].mine
    assert mine is not None
    assert mine.understood is False
    assert mine.reaction == "again_slower"


def test_a_short_or_unheard_move_is_refused_and_moves_are_limited() -> None:
    g = game()
    join(g)
    case = g.service.play_ai(USER)
    g.heard.answers.append("ja")
    with pytest.raises(HalvesError, match="too_short"):
        g.service.record(USER, case.id, AUDIO, "m4a", 2.0)
    with pytest.raises(HalvesError, match="too_long"):
        g.service.record(USER, case.id, AUDIO, "m4a", 200.0)
    for number in range(MOVES_PER_DAY):
        g.store.save_move(
            Move(UUID(int=number + 1), case.id, "A", 1, USER, "removed", "", g.world.clock.now)
        )
    with pytest.raises(HalvesError, match="limit"):
        g.service.record(USER, case.id, AUDIO, "m4a", 5.0)


def test_at_most_three_cases_are_open_at_once() -> None:
    g = game()
    join(g)
    for _ in range(3):
        g.service.play_ai(USER)
    with pytest.raises(HalvesError, match="too_many_cases"):
        g.service.play_ai(USER)


# --- The check -----------------------------------------------------------------------------------


def test_a_held_move_never_reaches_the_other_and_goes_to_the_owners_queue() -> None:
    g = game()
    join(g)
    join(g, OTHER_USER, native="de")
    case = g.service.play_ai(USER, "lost_cello")
    g.run_jobs()
    g.brain.labels.append(("contact_or_meetup",))
    held = say(g, case.id, "Gib mir deine Nummer, wir treffen uns")
    assert g.store.moves[held].status == "held"
    assert (USER, case.id, "held") in g.announced
    view = g.service.view(USER, case.id)
    assert view.rounds[0].mine is not None
    assert view.rounds[0].mine.reasons == ("contact_or_meetup",)
    # The learner records the round again.
    assert view.record_round == 1
    queue = g.service.queue(OTHER_USER)
    assert [(item.kind, item.move_id) for item in queue] == [("held", held)]
    with pytest.raises(HalvesError, match="not_owner"):
        g.service.queue(USER)


def test_three_moves_the_owner_removes_suspend_the_sender() -> None:
    g = game()
    join(g)
    case = g.service.play_ai(USER, "lost_cello")
    g.run_jobs()
    for _ in range(STRIKES_TO_SUSPEND):
        g.brain.labels.append(("romance",))
        held = say(g, case.id, "Du hast eine schöne Stimme, Liebling")
        g.service.decide(OTHER_USER, "held", held, "remove")
        assert g.store.moves[held].transcript == ""
    profile = g.store.profiles[USER]
    assert profile.strikes == STRIKES_TO_SUSPEND
    assert profile.suspended
    with pytest.raises(HalvesError, match="suspended"):
        g.service.view(USER, case.id)


def test_a_move_that_cannot_be_checked_waits_and_then_fails_closed() -> None:
    g = game()
    join(g)
    case = g.service.play_ai(USER, "lost_cello")
    g.run_jobs()
    g.brain.labels.extend([None] * CHECK_ATTEMPTS)
    move = say(g, case.id, "Ein Schaffner hat um 14 Uhr 20 etwas gesehen")
    assert g.store.moves[move].status == "checking"
    for _ in range(CHECK_ATTEMPTS - 1):
        g.world.clock.now += dt.timedelta(minutes=10)
        g.service.tick()
        g.run_jobs()
    assert g.store.moves[move].status == "failed"
    assert g.store.moves[move].reasons == ("unavailable",)


def test_a_veiled_move_is_heard_in_the_neutral_voice_and_waits_if_it_cannot_be_made() -> None:
    g = game()
    join(g, veil=True)
    join(g, OTHER_USER, native="de")
    g.world.profiles.apply(
        OTHER_USER, [Change("target_language", "fr")], source=Source.ASKED, origin=Origin.FORM
    )
    invite = g.service.invite(USER)
    case = g.service.redeem(OTHER_USER, invite.code)
    g.brain.veil_fails = True
    move = say(g, case.id, "Ein Schaffner hat um 14 Uhr 20 etwas gesehen")
    assert g.store.moves[move].status == "checking"
    g.brain.veil_fails = False
    g.service.check(move)
    stored = g.store.moves[move]
    assert stored.status == "delivered"
    assert g.service.address(OTHER_USER, move).startswith(f"https://files.test/{stored.veil_key}")
    # The speaker hears their own voice.
    assert stored.audio_key is not None
    assert g.service.address(USER, move).startswith(f"https://files.test/{stored.audio_key}")


def test_a_minors_check_is_told_their_band() -> None:
    g = game(adult=False)
    join(g)
    case = g.service.play_ai(USER, "lost_cello")
    g.run_jobs()
    say(g, case.id, "Ein Schaffner hat um 14 Uhr 20 etwas gesehen")
    assert g.brain.checked[-1][1] == "minor"


# --- Two learners --------------------------------------------------------------------------------


def friends(native_other: str = "de", target_other: str = "fr") -> tuple[Game, UUID]:
    g = game()
    join(g)
    join(g, OTHER_USER, native=native_other)
    if target_other != "de":
        g.world.profiles.apply(
            OTHER_USER,
            [Change("target_language", target_other)],
            source=Source.ASKED,
            origin=Origin.FORM,
        )
    invite = g.service.invite(USER, "museum_postcard")
    case = g.service.redeem(OTHER_USER, invite.code.lower())
    return g, case.id


def test_a_friend_redeems_a_code_and_both_hear_the_others_learned_language() -> None:
    g, case_id = friends()
    mine = g.service.view(USER, case_id)
    theirs = g.service.view(OTHER_USER, case_id)
    assert (mine.speaks, mine.hears) == ("de", "fr")
    assert (theirs.speaks, theirs.hears) == ("fr", "de")
    assert not mine.partner.ai
    assert mine.partner.place == "city:Lyon"
    assert g.store.invite_of(USER) is None
    assert (USER, case_id, "move") in g.announced


def test_a_code_is_long_and_comes_from_a_cryptographic_source() -> None:
    g = game()
    join(g)

    codes = {g.service.invite(USER).code for _ in range(20)}

    assert all(len(code) == CODE_LENGTH >= 10 for code in codes)
    assert all(set(code) <= set(CODE_ALPHABET) for code in codes)
    # Seeding the game's own random source (codenames, cases) does not make codes repeat.
    assert len(codes) == 20


def test_wrong_codes_are_capped_for_the_day() -> None:
    g = game()
    join(g)
    join(g, OTHER_USER, native="it")
    invite = g.service.invite(USER)
    for _ in range(WRONG_CODES_PER_DAY):
        with pytest.raises(HalvesError, match="not_found"):
            g.service.redeem(OTHER_USER, "ZZZZZZZZZZ")

    # Even the right code is refused now, so guessing gains nothing.
    with pytest.raises(HalvesError, match="limit"):
        g.service.redeem(OTHER_USER, invite.code)
    # The next day the learner may try again.
    g.world.clock.now += dt.timedelta(days=1)
    assert g.service.redeem(OTHER_USER, invite.code).mode == "friend"


def test_codes_are_refused_calmly() -> None:
    g = game()
    join(g)
    join(g, OTHER_USER, native="it")
    invite = g.service.invite(USER)
    with pytest.raises(HalvesError, match="own_code"):
        g.service.redeem(USER, invite.code)
    with pytest.raises(HalvesError, match="not_found"):
        g.service.redeem(OTHER_USER, "ZZZZZZ")
    # Both learn German: same-language mode works.
    case = g.service.redeem(OTHER_USER, invite.code)
    assert case.mode == "friend"
    # A code is for seven days.
    invite = g.service.invite(USER)
    g.world.clock.now += dt.timedelta(days=8)
    with pytest.raises(HalvesError, match="not_found"):
        g.service.redeem(OTHER_USER, invite.code)


def test_two_learners_who_could_not_follow_each_other_are_not_paired() -> None:
    g = game()
    join(g, native="fr")
    join(g, OTHER_USER, native="en")
    g.world.profiles.apply(
        OTHER_USER, [Change("target_language", "it")], source=Source.ASKED, origin=Origin.FORM
    )
    invite = g.service.invite(USER)
    with pytest.raises(HalvesError, match="no_shared_language"):
        g.service.redeem(OTHER_USER, invite.code)


def test_minors_play_against_the_ai_only() -> None:
    g = game(adult=False)
    join(g)
    with pytest.raises(HalvesError, match="adults_only"):
        g.service.invite(USER)
    assert g.service.play_ai(USER).mode == "ai"


def test_two_yes_make_a_duo_who_can_start_again_at_once() -> None:
    g, case_id = friends()
    case = g.store.cases[case_id]
    g.store.save_case(replace(case, status="solved"))
    g.service.again(USER, case_id, True)
    assert g.store.duos_of(USER) == []
    g.service.again(OTHER_USER, case_id, True)
    duo = g.store.duos_of(USER)[0]
    assert g.service.overview(USER).duos[0].codename == g.store.profiles[OTHER_USER].codename
    again = g.service.play_duo(USER, duo.id)
    assert again.mode == "duo"
    g.service.remove_duo(OTHER_USER, duo.id)
    assert g.store.duos_of(USER) == []


def test_a_report_hides_the_move_and_a_block_hands_the_seat_to_an_ai() -> None:
    g, case_id = friends()
    move = say(g, case_id, "Die Karte wurde 1952 in Basel abgeschickt")
    view = g.service.report(OTHER_USER, move, "harassment", "  rude  ")
    assert view.rounds[0].theirs is not None
    assert view.rounds[0].theirs.hidden
    report = next(iter(g.store.reports.values()))
    assert report.note == "rude"
    assert [item.kind for item in g.service.queue(OTHER_USER)] == ["report"]
    with pytest.raises(HalvesError, match="not_found"):
        g.service.address(OTHER_USER, move)

    view = g.service.block(OTHER_USER, case_id)
    assert view.partner.ai
    assert g.store.blocked(USER, OTHER_USER)
    assert ("ai", case_id) in g.starter.jobs
    invite = g.service.invite(USER)
    with pytest.raises(HalvesError, match="not_found"):
        g.service.redeem(OTHER_USER, invite.code)
    # The owner confirms the report: a strike.
    g.service.decide(OTHER_USER, "report", report.id, "remove")
    assert g.store.profiles[USER].strikes == 1


def test_a_quiet_seat_can_be_handed_to_an_ai_after_three_days() -> None:
    g, case_id = friends()
    assert not g.service.view(USER, case_id).can_hand_over
    g.world.clock.now += SEAT_TIMEOUT
    assert g.service.view(USER, case_id).can_hand_over
    view = g.service.hand_over(USER, case_id)
    assert view.partner.ai
    with pytest.raises(HalvesError, match="not_your_turn"):
        g.service.hand_over(USER, case_id)


# --- Leaving and the hourly tick -----------------------------------------------------------------


def test_leaving_deletes_the_learners_moves_and_an_ai_finishes_their_seats() -> None:
    g, case_id = friends()
    move = say(g, case_id, "Die Karte wurde 1952 in Basel abgeschickt")
    key = g.store.moves[move].audio_key
    assert key is not None
    assert key in g.world.files.files
    g.service.leave(USER)
    assert g.store.profile(USER) is None
    assert g.store.moves[move].transcript == ""
    assert g.store.moves[move].status == "removed"
    assert key not in g.world.files.files
    assert g.service.view(OTHER_USER, case_id).partner.ai


def test_sounds_and_words_go_thirty_days_after_the_case_ends() -> None:
    g, case_id = friends()
    move = say(g, case_id, "Die Karte wurde 1952 in Basel abgeschickt")
    key = g.store.moves[move].audio_key
    g.store.save_move(replace(g.store.moves[move], delete_after=g.world.clock.now + MINUTE))
    g.world.clock.now += dt.timedelta(minutes=2)
    g.service.tick()
    assert g.store.moves[move].transcript == ""
    assert key not in g.world.files.files


def test_the_overview_lists_cases_with_what_each_waits_for() -> None:
    g = game()
    join(g)
    case = g.service.play_ai(USER, "flatshare_key")
    g.run_jobs()
    overview = g.service.overview(USER)
    assert overview.available
    assert [(c.id, c.next) for c in overview.cases] == [(case.id, "record")]
    assert overview.cases[0].title == "La clé de la colocation"
    assert overview.season_week == "2026-W41"


def test_the_briefing_tells_the_partner_the_clue_to_rehearse() -> None:
    g = game()
    join(g)
    case = g.service.play_ai(USER, "wrong_parcel")
    briefing = g.service.briefing(USER, case.id)
    assert briefing is not None
    assert briefing[2] == "Euer Paket ist eine blaue Kiste, zwei Kilo schwer."
    assert g.service.briefing(OTHER_USER, case.id) is None


def test_a_briefing_call_rehearses_the_clue_the_learner_tells_next() -> None:
    g = game()
    join(g)
    case = g.service.play_ai(USER, "wrong_parcel")
    scenario = g.service.briefing_scenario(USER, f"halves:{case.id}")
    assert scenario is not None
    assert "Euer Paket ist eine blaue Kiste" in scenario.situation
    assert [goal.id for goal in scenario.goals] == ["said_clue", "tried_again"]
    assert g.service.briefing_scenario(USER, "doctor") is None
    assert g.service.briefing_scenario(USER, "halves:not-a-case") is None
    assert g.service.briefing_scenario(OTHER_USER, f"halves:{case.id}") is None

    # The practice call finds it as a role-play the language pack does not have.
    g.world.practice._extra_scenarios = g.service.briefing_scenario
    partner = g.world.personas.partners(USER)[0]
    account = g.world.accounts.accounts[USER]
    briefing = g.world.practice.prepare(
        USER, account, g.world.clock.now.date(), partner.id, scenario=f"halves:{case.id}"
    )
    assert "Euer Paket ist eine blaue Kiste" in briefing.instructions
