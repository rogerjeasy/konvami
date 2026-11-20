import datetime as dt
import random
from dataclasses import dataclass, replace
from uuid import UUID

import pytest

from konvami_api.domain.chain import (
    LINES,
    LINES_PER_DAY,
    TURN_TIMEOUT,
    ChainError,
    ChainService,
    Line,
    SeatKind,
    seat_for,
)
from konvami_api.domain.chain_openings import AI_NAMES, FALLBACK_LINES, LANGUAGES, OPENINGS
from konvami_api.domain.halves import CHECK_ATTEMPTS, WRONG_CODES_PER_DAY, Correction, Duo
from konvami_api.domain.profile import Change, Origin, Source
from konvami_api.domain.spoken import Listener
from tests.chain_fake import FakeNarrator, InMemoryChainRepository, RecordingChainStarter
from tests.fakes import ScriptedTranscriber
from tests.halves_fake import InMemoryHalvesRepository
from tests.world import OTHER_USER, USER, World

THIRD = UUID("33333333-3333-4333-8333-333333333333")
MINUTE = dt.timedelta(minutes=1)
AUDIO = b"\x00" * 4000
AI_SEATS: list[tuple[SeatKind, UUID | None]] = [("ai", None)] * 3


@dataclass
class Table:
    world: World
    service: ChainService
    store: InMemoryChainRepository
    social: InMemoryHalvesRepository
    starter: RecordingChainStarter
    narrator: FakeNarrator
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
                self.service.play_ai(item)
            elif job == "play":
                self.service.make_play(item)
            elif job == "opening":
                self.service.speak_opening(item)


def table(*, enabled: bool = True, adult: bool = True) -> Table:
    world = World()
    world.accounts.accounts[THIRD] = replace(world.accounts.accounts[USER], first_name="Noa")
    for user in (USER, OTHER_USER, THIRD):
        world.onboard(user)
        account = world.accounts.accounts[user]
        world.accounts.accounts[user] = replace(account, age_bracket="25-34" if adult else "16-17")
    store = InMemoryChainRepository()
    social = InMemoryHalvesRepository()
    starter = RecordingChainStarter()
    narrator = FakeNarrator(world.clock)
    heard = ScriptedTranscriber()
    announced: list[tuple[UUID, UUID, str]] = []
    service = ChainService(
        profiles=world.profiles,
        accounts=world.accounts,
        repository=store,
        social=social,
        listener=Listener(
            profiles=world.profiles,
            accounts=world.accounts,
            transcriber=heard,
            model="gpt-4o-transcribe",
        ),
        narrator=narrator,
        files=world.files,
        cards=world.cards,
        starter=starter,
        enabled=enabled,
        allowed=lambda _: True,
        owners=frozenset({OTHER_USER}),
        clock=world.clock,
        announce=lambda user, story, kind: announced.append((user, story, kind)),
        rng=random.Random(3),  # noqa: S311 - codenames in a test
    )
    return Table(world, service, store, social, starter, narrator, heard, announced)


def join(t: Table, *users: UUID, veil: bool = False) -> None:
    for user in users or (USER,):
        t.service.join(user, veil_default=veil, voice_consent=True)


def say(t: Table, story_id: UUID, words: str, user: UUID = USER) -> UUID:
    """Records a line heard as `words`, and has the worker check it."""
    t.tick()
    t.heard.answers.append(words)
    line = t.service.record(user, story_id, AUDIO, "m4a", 6.0)
    t.run_jobs()
    return line.id


# --- Rules ---------------------------------------------------------------------------------------


def test_every_opening_and_fallback_is_written_in_the_four_languages() -> None:
    for one in OPENINGS:
        for text in (one.title, one.opening, one.ending):
            assert set(text) == set(LANGUAGES)
    assert {o.genre for o in OPENINGS} == {
        "mystery",
        "comedy",
        "adventure",
        "fairytale",
        "future",
        "everyday",
    }
    for language in LANGUAGES:
        assert len(FALLBACK_LINES[language]) == LINES
        assert len(AI_NAMES[language]) == 3


def test_lines_go_round_the_table() -> None:
    assert [seat_for(p) for p in range(1, LINES + 1)] == [1, 2, 3, 4, 1, 2, 3, 4]


# --- Joining -------------------------------------------------------------------------------------


def test_joining_needs_its_own_voice_sharing_consent() -> None:
    t = table()
    with pytest.raises(ChainError, match="consent_required"):
        t.service.join(USER, veil_default=True, voice_consent=False)
    profile = t.service.join(USER, veil_default=True, voice_consent=True)
    assert profile.band == "adult"
    assert profile.consent_version == 1
    assert "-" in profile.codename
    assert t.service.change(USER, paused=True).paused


def test_it_is_closed_until_turned_on() -> None:
    t = table(enabled=False)
    assert not t.service.overview(USER).available
    with pytest.raises(ChainError, match="unavailable"):
        join(t)


# --- A story with three AI characters ------------------------------------------------------------


def test_a_whole_story_with_ai_characters_from_the_opening_to_the_radio_play() -> None:
    t = table()
    join(t)
    story = t.service.start(USER, "night-train", AI_SEATS)
    t.run_jobs()
    view = t.service.view(USER, story.id)
    assert view.mode == "solo"
    assert [s.ai for s in view.seats] == [False, True, True, True]
    assert {s.name for s in view.seats[1:]} == set(AI_NAMES["de"])
    # The first seat hears the narrator's opening, in the language learned, spoken.
    assert view.my_turn
    assert view.position == 1
    assert view.before is not None
    assert view.before.kind == "narrator"
    assert view.before.text.startswith("Es ist Mitternacht")
    assert view.before.has_audio

    say(t, story.id, "Ich sehe einen Mann mit einem Hut")
    view = t.service.view(USER, story.id)
    # The three AI characters said lines 2 to 4; the learner hears only line 4 and the recap.
    assert view.my_turn
    assert view.position == 5
    assert view.before is not None
    assert view.before.text == "AI line number 4 goes on"
    assert view.before.recap == "So far 4 lines."
    assert view.before.ai

    say(t, story.id, "Der Mann hat den Koffer gestohlen")
    view = t.service.view(USER, story.id)
    assert view.status == "done"
    assert [x.kind for x in view.play][:3] == ["narrator", "line", "narrator"]
    lines = [x for x in view.play if x.kind == "line"]
    assert [x.position for x in lines] == list(range(1, LINES + 1))
    assert [x.mine for x in lines] == [True, False, False, False, True, False, False, False]
    assert view.play[-1].text == "The end."
    assert (USER, story.id, "ready") in t.announced
    assert t.service.overview(USER).stories[0].next == "listen"

    view = t.service.react(USER, story.id, "laughed")
    assert view.my_reaction == "laughed"
    assert view.reactions["laughed"] == 1
    assert t.service.overview(USER).stories[0].next == "done"


def test_a_line_is_only_recorded_on_ones_turn_and_within_its_length() -> None:
    t = table()
    join(t)
    story = t.service.start(USER, None, AI_SEATS)
    with pytest.raises(ChainError, match="too_long"):
        t.service.record(USER, story.id, AUDIO, "m4a", 60.0)
    t.heard.answers.append("Hm")
    with pytest.raises(ChainError, match="too_short"):
        t.service.record(USER, story.id, AUDIO, "m4a", 2.0)
    t.heard.answers.append("Ich sehe einen Mann")
    t.service.record(USER, story.id, AUDIO, "m4a", 4.0)
    # Being checked: nobody may record until it is in.
    with pytest.raises(ChainError, match="not_your_turn"):
        t.service.record(USER, story.id, AUDIO, "m4a", 4.0)


def test_a_learner_may_say_twenty_lines_a_day() -> None:
    t = table()
    join(t)
    story = t.service.start(USER, None, AI_SEATS)
    for n in range(LINES_PER_DAY):
        t.store.save_line(
            Line(UUID(int=n + 1), UUID(int=0), 1, 1, USER, "held", "x", t.world.clock())
        )
    t.heard.answers.append("Ich sehe einen Mann")
    with pytest.raises(ChainError, match="limit"):
        t.service.record(USER, story.id, AUDIO, "m4a", 4.0)


# --- The check -----------------------------------------------------------------------------------


def test_a_held_line_is_never_delivered_and_the_learner_says_it_again() -> None:
    t = table()
    join(t)
    story = t.service.start(USER, None, AI_SEATS)
    t.run_jobs()
    t.narrator.labels.append(("contact_or_meetup",))
    held = say(t, story.id, "Schreib mir auf Insta")
    assert t.store.lines[held].status == "held"
    assert (USER, story.id, "held") in t.announced
    view = t.service.view(USER, story.id)
    assert view.my_turn
    assert view.position == 1
    assert view.mine[0].reasons == ("contact_or_meetup",)
    say(t, story.id, "Ich sehe einen Mann mit einem Hut")
    assert t.service.view(USER, story.id).position == 5


def test_a_line_that_cannot_be_checked_fails_closed() -> None:
    t = table()
    join(t)
    story = t.service.start(USER, None, AI_SEATS)
    t.narrator.labels.extend([None] * CHECK_ATTEMPTS)
    line = say(t, story.id, "Ich sehe einen Mann")
    assert t.store.lines[line].status == "checking"
    for _ in range(CHECK_ATTEMPTS - 1):
        t.service.check(line)
    assert t.store.lines[line].status == "failed"


def test_a_veiled_line_reaches_the_others_in_the_neutral_voice() -> None:
    t = table()
    join(t, USER, OTHER_USER, veil=True)
    story = t.service.start(USER, None, [("friend", None), ("ai", None), ("ai", None)])
    invite = t.service.invite(USER, story.id)
    t.service.redeem(OTHER_USER, invite.code)
    line = say(t, story.id, "Ich sehe einen Mann mit einem Hut")
    heard = t.service.address(OTHER_USER, line)
    assert "-veil.mp3" in heard
    assert "-veil" not in t.service.address(USER, line)


def test_a_veil_that_cannot_be_made_keeps_the_line_waiting() -> None:
    t = table()
    join(t, veil=True)
    story = t.service.start(USER, None, AI_SEATS)
    t.narrator.veil_fails = True
    line = say(t, story.id, "Ich sehe einen Mann")
    assert t.store.lines[line].status == "checking"


# --- Friends and duos ----------------------------------------------------------------------------


def test_friends_take_the_empty_seats_by_code_and_each_hears_only_the_line_before() -> None:
    t = table()
    join(t, USER, OTHER_USER, THIRD)
    story = t.service.start(USER, "wrong-cake", [("friend", None), ("friend", None), ("ai", None)])
    assert story.mode == "friends"
    invite = t.service.invite(USER, story.id)
    assert t.service.invite(USER, story.id).code == invite.code
    t.service.redeem(OTHER_USER, invite.code.lower())
    t.service.redeem(THIRD, invite.code)
    assert t.store.invite_for(story.id) is None
    first = say(t, story.id, "Oma lacht und sagt hallo")
    assert (OTHER_USER, story.id, "turn") in t.announced
    view = t.service.view(OTHER_USER, story.id)
    assert view.my_turn
    assert view.before is not None
    assert view.before.id == first
    second = say(t, story.id, "Bruno kommt mit einem Hund", OTHER_USER)
    # The third seat hears line 2 only: line 1 is not theirs to hear before the end.
    view = t.service.view(THIRD, story.id)
    assert view.before is not None
    assert view.before.id == second
    t.service.address(THIRD, second)
    with pytest.raises(ChainError, match="not_found"):
        t.service.address(THIRD, first)


def test_a_code_is_refused_across_bands_languages_blocks_and_after_the_days_wrong_tries() -> None:
    t = table()
    join(t, USER, OTHER_USER)
    story = t.service.start(USER, None, [("friend", None), ("ai", None), ("ai", None)])
    code = t.service.invite(USER, story.id).code
    t.world.profiles.apply(
        OTHER_USER, [Change("target_language", "fr")], source=Source.ASKED, origin=Origin.FORM
    )
    with pytest.raises(ChainError, match="no_shared_language"):
        t.service.redeem(OTHER_USER, code)
    t.world.profiles.apply(
        OTHER_USER, [Change("target_language", "de")], source=Source.ASKED, origin=Origin.FORM
    )
    from konvami_api.domain.halves import Block

    t.social.add_block(Block(UUID(int=9), USER, OTHER_USER, "", t.world.clock()))
    with pytest.raises(ChainError, match="not_found"):
        t.service.redeem(OTHER_USER, code)
    t.social.blocks.clear()
    for _ in range(WRONG_CODES_PER_DAY):
        with pytest.raises(ChainError, match="not_found"):
            t.service.redeem(OTHER_USER, "ZZZZZZZZZZ")
    with pytest.raises(ChainError, match="limit"):
        t.service.redeem(OTHER_USER, code)


def test_minors_play_with_ai_characters_only() -> None:
    t = table(adult=False)
    join(t)
    with pytest.raises(ChainError, match="adults_only"):
        t.service.start(USER, None, [("friend", None), ("ai", None), ("ai", None)])
    assert t.service.start(USER, None, AI_SEATS).mode == "solo"


def test_a_duo_is_seated_directly_and_told() -> None:
    t = table()
    join(t, USER, OTHER_USER)
    duo = Duo(UUID(int=5), USER, OTHER_USER, t.world.clock())
    t.social.add_duo(duo)
    story = t.service.start(USER, None, [("duo", duo.id), ("ai", None), ("ai", None)])
    assert story.seat(2).user_id == OTHER_USER
    assert (OTHER_USER, story.id, "invited") in t.announced
    with pytest.raises(ChainError, match="not_found"):
        t.service.start(USER, None, [("duo", UUID(int=99)), ("ai", None), ("ai", None)])


def test_the_host_can_fill_the_empty_seats_with_ai_characters() -> None:
    t = table()
    join(t)
    story = t.service.start(USER, None, [("friend", None), ("friend", None), ("friend", None)])
    view = t.service.view(USER, story.id)
    assert view.can_fill
    assert view.invite is not None
    view = t.service.fill(USER, story.id)
    assert all(s.ai for s in view.seats[1:])
    assert not view.can_fill


def test_a_seat_quiet_on_its_turn_for_two_days_is_taken_over_by_an_ai() -> None:
    t = table()
    join(t, USER, OTHER_USER)
    story = t.service.start(USER, None, [("friend", None), ("ai", None), ("ai", None)])
    t.service.redeem(OTHER_USER, t.service.invite(USER, story.id).code)
    say(t, story.id, "Ich sehe einen Mann mit einem Hut")
    t.world.clock.now += TURN_TIMEOUT
    t.service.tick()
    t.run_jobs()
    view = t.service.view(OTHER_USER, story.id)
    assert view.seats[1].state == "taken_over"
    assert view.position == 5
    assert t.service.view(USER, story.id).my_turn


# --- Safety --------------------------------------------------------------------------------------


def test_a_reported_line_is_hidden_and_the_owner_removes_it_with_a_strike() -> None:
    t = table()
    join(t, USER, OTHER_USER)
    story = t.service.start(USER, None, [("friend", None), ("ai", None), ("ai", None)])
    t.service.redeem(OTHER_USER, t.service.invite(USER, story.id).code)
    line = say(t, story.id, "Ich sehe einen Mann mit einem Hut")
    view = t.service.report(OTHER_USER, line, "harassment", "rude")
    assert view.before is not None
    assert view.before.hidden
    queue = t.service.queue(OTHER_USER)
    assert [(i.kind, i.transcript) for i in queue] == [
        ("report", "Ich sehe einen Mann mit einem Hut")
    ]
    with pytest.raises(ChainError, match="not_owner"):
        t.service.queue(USER)
    t.service.decide(OTHER_USER, "report", queue[0].id, "remove")
    assert t.store.lines[line].transcript == ""
    profile = t.store.profiles[USER]
    assert profile.strikes == 1


def test_blocking_a_player_hands_their_seat_to_an_ai() -> None:
    t = table()
    join(t, USER, OTHER_USER)
    story = t.service.start(USER, None, [("friend", None), ("ai", None), ("ai", None)])
    t.service.redeem(OTHER_USER, t.service.invite(USER, story.id).code)
    view = t.service.block(USER, story.id, 2)
    assert view.seats[1].ai
    assert t.social.blocked(USER, OTHER_USER)


def test_leaving_deletes_ones_lines_and_an_ai_takes_the_seat() -> None:
    t = table()
    join(t)
    story = t.service.start(USER, None, AI_SEATS)
    line = say(t, story.id, "Ich sehe einen Mann mit einem Hut")
    t.service.leave(USER)
    assert t.store.lines[line].transcript == ""
    assert t.store.profile(USER) is None
    assert t.store.stories[story.id].seat(1).ai


# --- The private report --------------------------------------------------------------------------


def test_only_a_confirmed_correction_is_said_again_and_kept_as_a_card() -> None:
    t = table()
    join(t, USER, OTHER_USER)
    story = t.service.start(USER, None, AI_SEATS)
    t.narrator.corrections = (
        Correction("einen Mann mit ein Hut", "einen Mann mit einem Hut", "Dativ", True),
        Correction("Ich sehe", "Ich sah", "Zeit", False),
    )
    line = say(t, story.id, "Ich sehe einen Mann mit ein Hut")
    with pytest.raises(ChainError, match="unsure"):
        t.service.save_card(USER, line, 1)
    card = t.service.save_card(USER, line, 0)
    assert (card.kind, card.back) == ("correction", "einen Mann mit einem Hut")
    t.heard.answers.append("einen Mann mit einem Hut")
    tried = t.service.retry(USER, line, 0, AUDIO, "m4a", 3.0)
    assert tried.right
    with pytest.raises(ChainError, match="not_found"):
        t.service.save_card(OTHER_USER, line, 0)
