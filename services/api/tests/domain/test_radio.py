import datetime as dt
import random
from dataclasses import dataclass, replace
from uuid import UUID

import pytest

from konvami_api.domain.accounts import Account
from konvami_api.domain.cards import Card
from konvami_api.domain.halves import Correction
from konvami_api.domain.radio import (
    AIR_HOUR,
    CALLS_PER_DAY,
    CHECK_ATTEMPTS,
    HOST_NAME,
    KEEP_FOR,
    MIN_CALLERS,
    PICKS,
    STRIKES_TO_SUSPEND,
    Episode,
    RadioError,
    RadioService,
    Script,
    air_time,
    fallback_script,
    next_show_day,
)
from konvami_api.domain.radio_prompts import PROMPTS, prompt_for, question_in
from konvami_api.domain.spoken import Listener
from tests.fakes import ScriptedTranscriber
from tests.radio_fake import FakeBrain, InMemoryRadioRepository, RecordingRadioStarter
from tests.world import OTHER_USER, USER, World

THIRD = UUID("33333333-3333-4333-8333-333333333333")
AUDIO = b"\x00" * 4000
MINUTE = dt.timedelta(minutes=1)
# Before the show's hour on 9 October 2026 (the world's clock starts at noon).
MORNING = dt.datetime(2026, 10, 9, 9, 0, tzinfo=dt.UTC)
CARD = Card(
    UUID(int=9),
    "word",
    "ich bin gegangen",
    "",
    None,
    "fr",
    None,
    MORNING,
    MORNING,
    None,
    None,
    0,
    0,
)


@dataclass
class Show:
    world: World
    service: RadioService
    store: InMemoryRadioRepository
    starter: RecordingRadioStarter
    brain: FakeBrain
    heard: ScriptedTranscriber
    announced: list[tuple[UUID, UUID, str]]
    cards: list[tuple[UUID, str, str, str]]

    def later(self, by: dt.timedelta = MINUTE) -> None:
        self.world.clock.now += by

    def run_jobs(self) -> None:
        while self.starter.jobs:
            job, item = self.starter.jobs.pop(0)
            if job == "check":
                self.service.check(item)
            elif job == "build":
                self.service.build(item)


def show(*, allowed: bool = True, minors: tuple[UUID, ...] = ()) -> Show:
    world = World()
    world.clock.now = MORNING
    for user in (USER, OTHER_USER, THIRD):
        world.onboard(user)
        account = world.accounts.accounts.get(user, Account("Lea", "en", voice_consent=True))
        world.accounts.accounts[user] = replace(
            account, age_bracket="16-17" if user in minors else "25-34"
        )
    store, starter, brain, heard = (
        InMemoryRadioRepository(),
        RecordingRadioStarter(),
        FakeBrain(),
        ScriptedTranscriber(),
    )
    announced: list[tuple[UUID, UUID, str]] = []
    cards: list[tuple[UUID, str, str, str]] = []

    def save(user: UUID, phrase: str, meaning: str, explained_in: str) -> Card:
        cards.append((user, phrase, meaning, explained_in))
        return CARD

    service = RadioService(
        profiles=world.profiles,
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
        enabled=True,
        allowed=lambda _: allowed,
        owners=frozenset({OTHER_USER}),
        clock=world.clock,
        save_card=save,
        announce=lambda user, item, kind: announced.append((user, item, kind)),
        rng=random.Random(3),  # noqa: S311 - codenames and shuffles in a test
    )
    return Show(world, service, store, starter, brain, heard, announced, cards)


def call(s: Show, words: str, user: UUID = USER, veiled: bool = True) -> UUID:
    s.later()
    s.heard.answers.append(words)
    made = s.service.call(user, AUDIO, "m4a", 12.0, veiled)
    s.run_jobs()
    return made.id


def joined(s: Show, *users: UUID) -> None:
    for user in users or (USER,):
        s.service.join(user, veil_default=True, voice_consent=True)


def air(s: Show) -> Episode:
    """Moves to the show's hour and builds it."""
    upcoming = s.service.overview(USER).next_show
    assert upcoming is not None
    s.world.clock.now = air_time(upcoming.day)
    s.service.tick()
    s.run_jobs()
    found = s.store.episode(upcoming.episode_id)
    assert found is not None
    return found


# --- Rules ---------------------------------------------------------------------------------------


def test_the_show_takes_calls_for_today_until_its_hour_then_for_tomorrow() -> None:
    day = dt.date(2026, 10, 9)
    assert next_show_day(dt.datetime(2026, 10, 9, AIR_HOUR - 1, 59, tzinfo=dt.UTC)) == day
    assert next_show_day(air_time(day)) == day + dt.timedelta(days=1)


def test_every_prompt_is_written_in_the_four_languages_with_two_ai_calls() -> None:
    for found in PROMPTS:
        for language in ("de", "en", "fr", "it"):
            assert found.question[language].strip()
            assert all(c[language].strip() for c in found.calls)
    assert len({p.id for p in PROMPTS}) == len(PROMPTS)
    assert prompt_for(dt.date(2026, 10, 9)) != prompt_for(dt.date(2026, 10, 10))


def test_the_hosts_own_words_thank_every_caller_by_name() -> None:
    script = fallback_script("de", "Was isst du gern?", ["Nova-7", "Klara"])
    assert HOST_NAME in script.intro
    assert "Was isst du gern?" in script.intro
    assert [("Nova-7" in a, "Klara" in a) for a in script.after] == [(True, False), (False, True)]


# --- Joining (8.6) -------------------------------------------------------------------------------


def test_an_adult_must_agree_that_others_hear_their_calls() -> None:
    s = show()
    with pytest.raises(RadioError, match="consent_required"):
        s.service.join(USER, veil_default=True, voice_consent=False)
    profile = s.service.join(USER, veil_default=False, voice_consent=True)
    assert profile.agreed
    assert not profile.veil_default
    assert profile.codename


def test_a_minor_joins_without_the_consent_and_is_never_on_air() -> None:
    s = show(minors=(USER,))
    profile = s.service.join(USER, veil_default=True, voice_consent=False)
    assert profile.band == "minor"
    assert not profile.agreed


def test_the_show_is_closed_to_who_may_not_listen_yet() -> None:
    s = show(allowed=False)
    assert not s.service.overview(USER).available
    with pytest.raises(RadioError, match="unavailable"):
        s.service.join(USER, veil_default=True, voice_consent=True)


# --- The hub (8.1) -------------------------------------------------------------------------------


def test_the_first_visit_makes_a_pilot_show_with_ai_callers_only() -> None:
    s = show()
    first = s.service.overview(USER)
    assert first.warming_up
    assert first.on_air is None
    assert first.next_show is not None
    assert first.next_show.question == question_in(prompt_for(MORNING.date()), "de")
    s.run_jobs()
    second = s.service.overview(USER)
    assert not second.warming_up
    assert second.on_air is not None
    assert second.on_air.day == MORNING.date() - dt.timedelta(days=1)
    assert second.on_air.ai_callers == MIN_CALLERS
    assert second.on_air.callers == 0


def test_two_learners_share_the_next_show() -> None:
    s = show()
    one, two = s.service.overview(USER), s.service.overview(OTHER_USER)
    assert one.next_show
    assert two.next_show
    assert one.next_show.episode_id == two.next_show.episode_id


# --- Calling in (8.3) ----------------------------------------------------------------------------


def test_a_call_is_written_down_checked_and_waits_for_the_show() -> None:
    s = show()
    joined(s)
    call_id = call(s, "Einmal habe ich im Zug geschlafen und war in Basel.")
    found = s.service.my_call(USER, call_id)
    assert found.status == "ready"
    assert found.veiled
    assert s.store.calls[call_id].veil_key
    assert s.brain.checked[0][2] == question_in(prompt_for(MORNING.date()), "de")


def test_a_call_needs_joining_and_a_few_words_and_at_most_45_seconds() -> None:
    s = show()
    with pytest.raises(RadioError, match="not_joined"):
        s.service.call(USER, AUDIO, "m4a", 10.0)
    joined(s)
    with pytest.raises(RadioError, match="too_long"):
        s.service.call(USER, AUDIO, "m4a", 50.0)
    s.heard.answers.append("Hallo")
    with pytest.raises(RadioError, match="too_short"):
        s.service.call(USER, AUDIO, "m4a", 5.0)


def test_a_learner_calls_a_few_times_a_day_at_most() -> None:
    s = show()
    joined(s)
    for number in range(CALLS_PER_DAY):
        call(s, f"Das ist mein Anruf Nummer {number} heute.")
    with pytest.raises(RadioError, match="limit"):
        call(s, "Noch ein Anruf von mir heute.")


def test_a_new_call_to_the_same_show_replaces_the_earlier_one() -> None:
    s = show()
    joined(s)
    first = call(s, "Mein erster Versuch war nicht gut.")
    second = call(s, "Mein zweiter Versuch ist viel besser.")
    assert s.store.calls[first].status == "removed"
    assert s.store.calls[first].transcript == ""
    assert s.store.calls[second].status == "ready"


def test_a_held_call_is_never_aired_and_the_caller_is_told() -> None:
    s = show()
    joined(s)
    s.brain.labels = [("contact_or_meetup",)]
    held = call(s, "Schreib mir auf Instagram, ich heisse Nova.")
    assert s.store.calls[held].status == "held"
    assert (USER, held, "held") in s.announced
    episode = air(s)
    assert all(segment.call_id != held for segment in episode.segments)


def test_a_new_call_never_wipes_a_held_one_from_the_owners_queue() -> None:
    s = show()
    joined(s)
    s.brain.labels = [("harassment",)]
    held = call(s, "Etwas Böses über jemanden sagen.")
    call(s, "Mein neuer Anruf ist ganz freundlich.")
    kept = s.store.calls[held]
    assert kept.status == "held"
    assert kept.reasons == ("harassment",)
    assert kept.transcript
    assert kept.hidden
    with pytest.raises(RadioError, match="not_found"):
        s.service.my_call(USER, held)
    assert [item.id for item in s.service.queue(OTHER_USER)] == [held]
    s.service.decide(OTHER_USER, "held", held, "remove")
    assert s.store.strikes(USER) == 1


def test_withdrawing_or_leaving_keeps_a_held_call_for_the_owner_and_its_strike_counts() -> None:
    s = show()
    joined(s)
    s.brain.labels = [("romance",)]
    held = call(s, "Du hast eine schöne Stimme, Liebling.")
    s.service.withdraw_call(USER, held)
    assert s.store.calls[held].status == "held"
    s.service.leave(USER)
    assert s.store.calls[held].transcript
    s.service.decide(OTHER_USER, "held", held, "remove")
    assert s.store.strikes(USER) == 1
    joined(s)
    assert s.service.overview(USER).strikes == 1


def test_a_stored_adult_band_is_not_trusted_once_the_account_says_minor() -> None:
    s = show()
    joined(s)
    account = s.world.accounts.accounts[USER]
    s.world.accounts.accounts[USER] = replace(account, age_bracket="16-17")
    private = call(s, "Ich esse gern Brot mit Butter.")
    assert not s.store.calls[private].broadcast
    assert s.store.calls[private].status == "private"


def test_a_call_whose_caller_turns_out_a_minor_is_not_aired() -> None:
    s = show()
    joined(s)
    mine = call(s, "Ich esse gern Brot mit Butter.")
    assert s.store.calls[mine].status == "ready"
    account = s.world.accounts.accounts[USER]
    s.world.accounts.accounts[USER] = replace(account, age_bracket="")
    episode = air(s)
    assert all(segment.call_id != mine for segment in episode.segments)
    assert s.store.calls[mine].status == "not_picked"


def test_a_band_that_does_not_match_the_stored_one_is_never_on_air() -> None:
    s = show()
    joined(s)
    profile = s.store.profiles[USER]
    s.store.save_profile(replace(profile, band="minor"))
    private = call(s, "Ich esse gern Brot mit Butter.")
    assert s.store.calls[private].status == "private"


def test_a_call_that_cannot_be_checked_waits_then_fails_closed() -> None:
    s = show()
    joined(s)
    s.brain.labels = [None] * CHECK_ATTEMPTS
    waiting = call(s, "Mein Lieblingsessen ist Brot mit Käse.")
    assert s.store.calls[waiting].status == "checking"
    for _ in range(CHECK_ATTEMPTS - 1):
        s.later(dt.timedelta(minutes=6))
        s.service.tick()
        s.run_jobs()
    assert s.store.calls[waiting].status == "failed"
    assert (USER, waiting, "held") in s.announced


def test_a_veiled_call_without_its_neutral_voice_waits_rather_than_airing_the_real_one() -> None:
    s = show()
    joined(s)
    s.brain.veil_fails = True
    waiting = call(s, "Am Wochenende gehe ich wandern.")
    assert s.store.calls[waiting].status == "checking"


def test_a_minors_call_is_private_practice() -> None:
    s = show(minors=(USER,))
    s.service.join(USER, veil_default=True, voice_consent=False)
    private = call(s, "Ich spiele gern Fussball mit Freunden.")
    assert s.store.calls[private].status == "private"
    episode = air(s)
    assert all(segment.call_id != private for segment in episode.segments)


# --- The show ------------------------------------------------------------------------------------


def test_the_show_weaves_the_calls_between_the_hosts_lines_and_fills_with_ai_callers() -> None:
    s = show()
    joined(s)
    mine = call(s, "Ich habe einmal im Zug mein Ticket gegessen.")
    episode = air(s)
    kinds = [segment.kind for segment in episode.segments]
    assert kinds[0] == "host"
    assert kinds[-1] == "host"
    assert kinds.count("call") == 1
    assert kinds.count("ai_call") == MIN_CALLERS - 1
    # Opening, then each caller followed by a host line, then the goodbye.
    assert len(kinds) == 2 + 2 * MIN_CALLERS
    assert set(kinds[1:-1:2]) <= {"call", "ai_call"}
    assert all(kind == "host" for kind in kinds[2:-1:2])
    aired = next(s for s in episode.segments if s.kind == "call")
    assert aired.call_id == mine
    assert not aired.ai
    assert aired.speaker == s.store.profiles[USER].codename
    assert aired.audio_key == s.store.calls[mine].veil_key
    assert all(segment.ai for segment in episode.segments if segment.kind == "ai_call")
    assert s.store.calls[mine].status == "aired"
    assert (USER, episode.id, "aired") in s.announced
    assert s.service.overview(USER).aired is not None


def test_an_unveiled_call_airs_in_the_callers_own_voice() -> None:
    s = show()
    joined(s)
    mine = call(s, "Ich esse jeden Morgen ein Brötchen.", veiled=False)
    episode = air(s)
    aired = next(s for s in episode.segments if s.kind == "call")
    assert aired.audio_key == s.store.calls[mine].audio_key


def test_the_show_takes_the_screenings_picks_and_leaves_the_rest_unpicked() -> None:
    s = show()
    joined(s, USER, OTHER_USER, THIRD)
    first = call(s, "Erster Anruf über den Zug.", USER)
    second = call(s, "Zweiter Anruf über den Zug.", OTHER_USER)
    third = call(s, "Dritter Anruf über den Zug.", THIRD)
    s.brain.screening = [third, first]
    s.service.overview(USER)
    s.service.overview(OTHER_USER)
    episode = air(s)
    aired = {seg.call_id for seg in episode.segments if seg.kind == "call"}
    assert aired == {first, third}
    assert s.store.calls[second].status == "not_picked"
    assert s.brain.payers == [USER]


def test_without_a_screening_the_first_calls_air() -> None:
    s = show()
    users = [UUID(f"5555555{n}-5555-4555-8555-555555555555") for n in range(PICKS + 1)]
    for user in users:
        s.world.onboard(user)
        s.world.accounts.accounts[user] = Account(
            "Lea", "en", voice_consent=True, age_bracket="25-34"
        )
        joined(s, user)
        call(s, "Mein lustigster Zug war voll mit Kühen.", user)
    episode = air(s)
    assert sum(1 for seg in episode.segments if seg.kind == "call") == PICKS
    assert not any(seg.kind == "ai_call" for seg in episode.segments)


def test_a_written_script_is_used_when_it_has_a_line_for_every_caller() -> None:
    s = show()
    s.brain.written = Script("Hallo!", ("Danke!",) * MIN_CALLERS, "Tschüss!")
    episode = air(s)
    texts = [seg.text for seg in episode.segments if seg.kind == "host"]
    assert texts[0] == "Hallo!"
    assert texts[-1] == "Tschüss!"


def test_without_a_usable_script_the_host_says_her_own_words() -> None:
    s = show()
    s.brain.written = None
    episode = air(s)
    hosts = [seg.text for seg in episode.segments if seg.kind == "host"]
    assert hosts[0].startswith("Hallo und willkommen bei Radio Konvami")


def test_a_show_without_any_voice_still_airs_with_captions() -> None:
    s = show()
    s.brain.mute = True
    episode = air(s)
    assert episode.status == "ready"
    assert all(seg.audio_key is None for seg in episode.segments)


def test_calls_after_the_show_went_out_go_to_tomorrows() -> None:
    s = show()
    joined(s)
    episode = air(s)
    late = call(s, "Ich rufe nach der Sendung an.")
    assert s.store.calls[late].episode_id != episode.id
    assert s.store.calls[late].status == "ready"


# --- Listening (8.2) -----------------------------------------------------------------------------


def test_listeners_give_applause_cards_to_calls_only() -> None:
    s = show()
    episode = air(s)
    caller = next(seg for seg in episode.segments if seg.kind == "ai_call")
    view = s.service.applaud(OTHER_USER, episode.id, caller.index, "ha_ha")
    shown = next(seg for seg in view.segments if seg.index == caller.index)
    assert shown.applause["ha_ha"] == 1
    assert shown.my_applause == "ha_ha"
    view = s.service.applaud(OTHER_USER, episode.id, caller.index, None)
    assert next(seg for seg in view.segments if seg.index == caller.index).applause["ha_ha"] == 0
    with pytest.raises(RadioError, match="invalid_value"):
        s.service.applaud(OTHER_USER, episode.id, 0, "bravo")
    with pytest.raises(RadioError, match="invalid_value"):
        s.service.applaud(OTHER_USER, episode.id, caller.index, "boo")


def test_a_segment_plays_through_an_address_for_five_minutes() -> None:
    s = show()
    episode = air(s)
    assert s.service.segment_address(USER, episode.id, 0)


def test_a_reported_segment_is_hidden_from_the_reporter_and_queued_for_the_owner() -> None:
    s = show()
    joined(s)
    mine = call(s, "Ich esse gern Pizza mit Ananas.")
    episode = air(s)
    aired = next(seg for seg in episode.segments if seg.call_id == mine)
    view = s.service.report(THIRD, episode.id, aired.index, "harassment", "  rude  ")
    hidden = next(seg for seg in view.segments if seg.index == aired.index)
    assert hidden.hidden
    assert hidden.text == ""
    assert not hidden.playable
    with pytest.raises(RadioError, match="not_found"):
        s.service.segment_address(THIRD, episode.id, aired.index)
    queue = s.service.queue(OTHER_USER)
    assert [(item.kind, item.note) for item in queue] == [("report", "rude")]
    with pytest.raises(RadioError, match="not_owner"):
        s.service.queue(USER)


def test_the_owner_removing_a_reported_call_takes_it_off_air_and_strikes_the_caller() -> None:
    s = show()
    joined(s)
    mine = call(s, "Ich esse gern Pizza mit Ananas.")
    episode = air(s)
    aired = next(seg for seg in episode.segments if seg.call_id == mine)
    s.service.report(THIRD, episode.id, aired.index, "hate", None)
    report = next(iter(s.store.reports.values()))
    s.service.decide(OTHER_USER, "report", report.id, "remove")
    assert s.store.strikes(USER) == 1
    assert s.store.calls[mine].status == "removed"
    view = s.service.episode(THIRD, episode.id)
    assert all(seg.index != aired.index for seg in view.segments)


def test_three_strikes_suspend_calling_in() -> None:
    s = show()
    joined(s)
    for _ in range(STRIKES_TO_SUSPEND):
        s.brain.labels = [("harassment",)]
        held = call(s, "Etwas Böses über jemanden.")
        s.service.decide(OTHER_USER, "held", held, "remove")
    with pytest.raises(RadioError, match="suspended"):
        s.service.call(USER, AUDIO, "m4a", 5.0)


def test_the_owner_can_pull_a_whole_episode() -> None:
    s = show()
    episode = air(s)
    s.service.pull(OTHER_USER, episode.id)
    with pytest.raises(RadioError, match="not_found"):
        s.service.episode(USER, episode.id)
    assert s.service.archive(USER) == [] or all(e.id != episode.id for e in s.service.archive(USER))


# --- One's own call (8.4) ------------------------------------------------------------------------


def corrected(s: Show) -> UUID:
    s.brain.corrections = (
        Correction("ich habe gegangen", "ich bin gegangen", "Gehen takes sein.", True),
        Correction("mit der Zug", "mit dem Zug", "Zug is masculine.", False),
    )
    joined(s)
    return call(s, "Gestern ich habe gegangen mit der Zug nach Bern.")


def test_the_caller_alone_sees_their_corrections() -> None:
    s = show()
    mine = corrected(s)
    assert len(s.service.my_call(USER, mine).corrections) == 2
    with pytest.raises(RadioError, match="not_found"):
        s.service.my_call(OTHER_USER, mine)


def test_say_it_better_hears_whether_the_correction_was_said() -> None:
    s = show()
    mine = corrected(s)
    s.heard.answers.append("Gestern ich bin gegangen mit dem Zug nach Bern")
    right = s.service.say_better(USER, mine, 0, AUDIO, "m4a", 3.0)
    assert right.right
    s.heard.answers.append("Gestern ich habe gegangen")
    assert not s.service.say_better(USER, mine, 0, AUDIO, "m4a", 3.0).right
    with pytest.raises(RadioError, match="unsure"):
        s.service.say_better(USER, mine, 1, AUDIO, "m4a", 3.0)


def test_a_confirmed_correction_becomes_a_card() -> None:
    s = show()
    mine = corrected(s)
    s.service.save_card(USER, mine, 0)
    assert s.cards == [(USER, "ich bin gegangen", "Gehen takes sein.", "fr")]
    with pytest.raises(RadioError, match="unsure"):
        s.service.save_card(USER, mine, 1)


def test_withdrawing_an_aired_call_takes_it_out_of_the_show() -> None:
    s = show()
    joined(s)
    mine = call(s, "Ich trinke nur Kaffee am Morgen.")
    episode = air(s)
    s.service.withdraw_call(USER, mine)
    after = s.store.episode(episode.id)
    assert after is not None
    assert all(seg.removed for seg in after.segments if seg.call_id == mine)
    assert not any(seg.mine for seg in s.service.episode(USER, episode.id).segments)
    assert not s.world.files.files.get(f"radio/{USER}/{episode.id}/{mine}.m4a")


def test_leaving_deletes_the_calls_applause_and_profile() -> None:
    s = show()
    joined(s)
    mine = call(s, "Ich trinke nur Kaffee am Morgen.")
    episode = air(s)
    caller = next(seg for seg in episode.segments if seg.kind == "ai_call")
    s.service.applaud(USER, episode.id, caller.index, "wow")
    s.service.leave(USER)
    assert USER not in s.store.profiles
    assert s.store.calls[mine].transcript == ""
    assert s.store.calls[mine].status == "removed"
    assert s.store.applause_of(USER, episode.id) == {}


# --- The hourly tick -----------------------------------------------------------------------------


def test_words_and_sounds_go_30_days_after_the_show() -> None:
    s = show()
    joined(s)
    mine = call(s, "Ich trinke nur Kaffee am Morgen.")
    episode = air(s)
    s.world.clock.now = episode.airs_at + KEEP_FOR + MINUTE
    s.service.tick()
    assert s.store.calls[mine].transcript == ""
    assert s.store.calls[mine].audio_key is None
    expired = s.store.episode(episode.id)
    assert expired is not None
    assert expired.status == "expired"
    assert expired.segments == ()


def test_a_show_that_failed_is_built_again_by_the_tick() -> None:
    s = show()
    upcoming = s.service.overview(USER).next_show
    assert upcoming is not None
    s.starter.jobs.clear()
    found = s.store.episode(upcoming.episode_id)
    assert found is not None
    s.store.save_episode(replace(found, status="failed", attempts=1, built_at=MORNING))
    s.later(dt.timedelta(hours=1))
    s.service.tick()
    assert ("build", upcoming.episode_id) in s.starter.jobs
