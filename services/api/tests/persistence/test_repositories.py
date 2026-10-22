"""The contract every repository keeps. It runs against PostgreSQL and against the in-memory
fakes, so tests that use the fakes are testing something the real database also does.
"""

import json
import threading
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, replace
from datetime import UTC, date, datetime, timedelta, timezone
from typing import Any
from uuid import UUID

import psycopg
import pytest

from konvami_api.domain.accounts import AccountRepository
from konvami_api.domain.cards import Card, CardRepository, CardTotals, card_key
from konvami_api.domain.conversations import ConversationRepository
from konvami_api.domain.fsrs import Memory, Rating
from konvami_api.domain.live_call import Turn, TurnAudio
from konvami_api.domain.memories import Memory as Remembered
from konvami_api.domain.memories import MemoryRepository, memory_key
from konvami_api.domain.onboarding import OnboardingRepository, OnboardingState, PlacementStatus
from konvami_api.domain.personas import DraftLog, Persona, PersonaRepository
from konvami_api.domain.placement import PlacementRepository, PlacementResult
from konvami_api.domain.profile import ChangeRecord, Origin, ProfileRepository, Source
from konvami_api.domain.recordings import RecordingRepository
from konvami_api.domain.reports import (
    Mistake,
    Report,
    ReportRepository,
    ReportTotals,
    Rewrite,
    Stats,
    Status,
    StoredReport,
    WeekMistakes,
    Word,
)
from konvami_api.domain.tutor import Example, TutorAnswer, TutorQuestion, TutorRepository
from konvami_api.domain.voice import (
    CallPurpose,
    FinishedCall,
    VoiceSession,
    VoiceSessionRepository,
)
from konvami_api.persistence.repositories import (
    SqlAccountRepository,
    SqlCardRepository,
    SqlConversationRepository,
    SqlDraftLog,
    SqlMemoryRepository,
    SqlOnboardingRepository,
    SqlPersonaRepository,
    SqlPlacementRepository,
    SqlProfileRepository,
    SqlRecordingRepository,
    SqlReportRepository,
    SqlTutorRepository,
    SqlVoiceSessionRepository,
)
from konvami_api.persistence.sql import SqlClient
from tests.fakes import (
    InMemoryAccountRepository,
    InMemoryCardRepository,
    InMemoryConversationRepository,
    InMemoryDraftLog,
    InMemoryMemoryRepository,
    InMemoryOnboardingRepository,
    InMemoryPersonaRepository,
    InMemoryPlacementRepository,
    InMemoryProfileRepository,
    InMemoryRecordingRepository,
    InMemoryReportRepository,
    InMemoryTutorRepository,
    InMemoryVoiceSessionRepository,
)
from tests.persistence.pg import LocalSqlClient

USER = UUID("11111111-1111-4111-8111-111111111111")
OTHER_USER = UUID("22222222-2222-4222-8222-222222222222")
NOON = datetime(2026, 10, 9, 12, 0, 0, 123456, tzinfo=UTC)

# (scope, field, old value, new value) of each logged change, oldest first.
History = Callable[[UUID], list[tuple[str, str, Any, Any]]]


@dataclass
class Profiles:
    repository: ProfileRepository
    history: History


@pytest.fixture(params=["memory", "postgres"])
def profiles(request: pytest.FixtureRequest) -> Profiles:
    if request.param == "memory":
        fake = InMemoryProfileRepository()
        return Profiles(
            fake,
            lambda user: [(c.scope, c.field, c.old_value, c.new_value) for c in fake.history(user)],
        )
    db: SqlClient = request.getfixturevalue("db")

    def history(user: UUID) -> list[tuple[str, str, Any, Any]]:
        rows = db.execute(
            "SELECT scope, field, old_value::text AS old, new_value::text AS new"
            " FROM profile_change WHERE user_id = CAST(:user AS uuid) ORDER BY id",
            {"user": str(user)},
        )
        return [
            (row["scope"], row["field"], json.loads(row["old"]), json.loads(row["new"]))
            for row in rows
        ]

    return Profiles(SqlProfileRepository(db), history)


@pytest.fixture(params=["memory", "postgres"])
def onboarding(request: pytest.FixtureRequest) -> OnboardingRepository:
    if request.param == "memory":
        return InMemoryOnboardingRepository()
    return SqlOnboardingRepository(request.getfixturevalue("db"))


def change(
    field: str,
    new: Any,
    *,
    old: Any = None,
    scope: str = "de",
    source: Source = Source.ASKED,
    origin: Origin = Origin.FORM,
    at: datetime = NOON,
) -> ChangeRecord:
    return ChangeRecord(scope, field, old, new, source, origin, at)


def test_an_unknown_user_has_an_empty_profile(profiles: Profiles) -> None:
    assert profiles.repository.load(USER).fields == {}


def test_saved_values_are_read_back_with_source_and_time(profiles: Profiles) -> None:
    profiles.repository.save(
        USER,
        [
            change("target_language", "de", scope="global"),
            change("goals", {"reasons": ["work", "exam"], "note": "Zürich: «Grüezi»"}),
            change("self_assessed_level", "A2", source=Source.MEASURED, origin=Origin.SYSTEM),
        ],
    )

    fields = profiles.repository.load(USER).fields
    assert set(fields) == {
        ("global", "target_language"),
        ("de", "goals"),
        ("de", "self_assessed_level"),
    }
    assert fields[("de", "goals")].value == {
        "reasons": ["work", "exam"],
        "note": "Zürich: «Grüezi»",
    }
    assert fields[("de", "goals")].source is Source.ASKED
    assert fields[("de", "goals")].updated_at == NOON
    assert fields[("de", "self_assessed_level")].source is Source.MEASURED


def test_the_answer_none_is_stored_as_an_answer(profiles: Profiles) -> None:
    profiles.repository.save(USER, [change("exam", None)])

    fields = profiles.repository.load(USER).fields
    assert ("de", "exam") in fields
    assert fields[("de", "exam")].value is None


def test_a_later_save_replaces_the_value(profiles: Profiles) -> None:
    later = NOON + timedelta(days=1)
    profiles.repository.save(USER, [change("self_assessed_level", "A2")])
    profiles.repository.save(USER, [change("self_assessed_level", "B1", old="A2", at=later)])

    stored = profiles.repository.load(USER).fields[("de", "self_assessed_level")]
    assert (stored.value, stored.updated_at) == ("B1", later)


def test_two_changes_to_one_field_in_one_save_keep_the_last(profiles: Profiles) -> None:
    profiles.repository.save(
        USER,
        [
            change("self_assessed_level", "A2"),
            change("course", None),
            change("self_assessed_level", "B1", old="A2"),
        ],
    )

    assert profiles.repository.load(USER).fields[("de", "self_assessed_level")].value == "B1"
    assert profiles.history(USER) == [
        ("de", "self_assessed_level", None, "A2"),
        ("de", "course", None, None),
        ("de", "self_assessed_level", "A2", "B1"),
    ]


def test_times_are_read_back_in_utc_whatever_zone_they_were_saved_in(profiles: Profiles) -> None:
    zurich = timezone(timedelta(hours=2))
    profiles.repository.save(
        USER, [change("course", None, at=datetime(2026, 10, 9, 14, 0, tzinfo=zurich))]
    )

    stored = profiles.repository.load(USER).fields[("de", "course")].updated_at
    assert stored == datetime(2026, 10, 9, 12, 0, tzinfo=UTC)
    assert stored.utcoffset() == timedelta(0)


def test_profiles_do_not_leak_between_users(profiles: Profiles) -> None:
    profiles.repository.save(USER, [change("self_assessed_level", "A2")])

    assert profiles.repository.load(OTHER_USER).fields == {}
    assert profiles.history(OTHER_USER) == []


def test_saving_nothing_is_allowed(profiles: Profiles) -> None:
    profiles.repository.save(USER, [])

    assert profiles.repository.load(USER).fields == {}


def test_a_user_who_has_not_started_has_the_default_onboarding_state(
    onboarding: OnboardingRepository,
) -> None:
    assert onboarding.load(USER) == OnboardingState()


def test_onboarding_progress_is_read_back(onboarding: OnboardingRepository) -> None:
    state = OnboardingState(essentials_confirmed_at=NOON, placement=PlacementStatus.SKIPPED)

    onboarding.save(USER, state)

    assert onboarding.load(USER) == state
    assert onboarding.load(OTHER_USER) == OnboardingState()


def test_onboarding_progress_can_be_updated(onboarding: OnboardingRepository) -> None:
    onboarding.save(USER, OnboardingState(essentials_confirmed_at=NOON))
    onboarding.save(
        USER, OnboardingState(essentials_confirmed_at=NOON, placement=PlacementStatus.SKIPPED)
    )

    assert onboarding.load(USER).placement is PlacementStatus.SKIPPED


# --- Voice sessions --------------------------------------------------------------------------


@dataclass
class Sessions:
    repository: VoiceSessionRepository
    # (outcome, usage, [(speaker, text)]) of a finished call, or None while it runs.
    result: Callable[[str], tuple[str, dict[str, int], list[tuple[str, str]]] | None]


@pytest.fixture(params=["memory", "postgres"])
def sessions(request: pytest.FixtureRequest) -> Sessions:
    if request.param == "memory":
        fake = InMemoryVoiceSessionRepository()

        def from_memory(call_id: str) -> tuple[str, dict[str, int], list[tuple[str, str]]] | None:
            done = fake.finished.get(call_id)
            if done is None:
                return None
            return done.outcome, dict(done.usage), [(t.speaker, t.text) for t in done.turns]

        return Sessions(fake, from_memory)
    db: SqlClient = request.getfixturevalue("db")

    def from_database(call_id: str) -> tuple[str, dict[str, int], list[tuple[str, str]]] | None:
        rows = db.execute(
            "SELECT outcome, CAST(usage AS text) AS usage FROM voice_session"
            " WHERE call_id = :call_id AND ended_at IS NOT NULL",
            {"call_id": call_id},
        )
        if not rows:
            return None
        turns = db.execute(
            "SELECT speaker, text FROM voice_turn WHERE call_id = :call_id ORDER BY position",
            {"call_id": call_id},
        )
        return (
            rows[0]["outcome"],
            json.loads(rows[0]["usage"]),
            [(turn["speaker"], turn["text"]) for turn in turns],
        )

    return Sessions(SqlVoiceSessionRepository(db), from_database)


def session(call_id: str, user: UUID = USER, at: datetime = NOON) -> VoiceSession:
    return VoiceSession(call_id, user, CallPurpose.ONBOARDING, "gpt-realtime-2.1-mini", at)


USAGE = {
    "input_text_tokens": 238,
    "input_audio_tokens": 26,
    "cached_input_tokens": 128,
    "output_text_tokens": 60,
    "output_audio_tokens": 182,
}


def test_a_started_call_can_be_found_by_its_id(sessions: Sessions) -> None:
    sessions.repository.started(session("rtc_1"))

    assert sessions.repository.get("rtc_1") == session("rtc_1")
    assert sessions.repository.get("rtc_other") is None


def test_a_session_keeps_the_time_it_was_granted(sessions: Sessions) -> None:
    granted = replace(session("rtc_1"), max_seconds=600)
    sessions.repository.started(granted)

    assert sessions.repository.get("rtc_1") == granted


WEEK = date(2026, 10, 5)


def test_voice_seconds_are_granted_from_what_is_left_of_the_week(sessions: Sessions) -> None:
    calls = sessions.repository

    assert calls.reserve_seconds(USER, WEEK, weekly=1000, least=60, most=600) == 600
    assert calls.reserve_seconds(USER, WEEK, weekly=1000, least=60, most=600) == 400
    # Less than `least` left: nothing is granted, and nothing changes.
    assert calls.reserve_seconds(USER, WEEK, weekly=1000, least=60, most=600) == 0
    assert calls.seconds_used(USER, WEEK) == 1000
    # Each learner and each week on its own.
    assert calls.seconds_used(OTHER_USER, WEEK) == 0
    assert calls.reserve_seconds(USER, WEEK + timedelta(days=7), 1000, 60, 600) == 600


def test_a_week_with_too_little_time_grants_nothing(sessions: Sessions) -> None:
    assert sessions.repository.reserve_seconds(USER, WEEK, weekly=30, least=60, most=600) == 0
    assert sessions.repository.seconds_used(USER, WEEK) == 0


def test_seconds_a_call_did_not_use_are_given_back(sessions: Sessions) -> None:
    calls = sessions.repository
    calls.reserve_seconds(USER, WEEK, weekly=1000, least=60, most=600)

    calls.release_seconds(USER, WEEK, 350)
    assert calls.seconds_used(USER, WEEK) == 250
    calls.release_seconds(USER, WEEK, 900)
    assert calls.seconds_used(USER, WEEK) == 0
    # A week never granted stays empty.
    calls.release_seconds(OTHER_USER, WEEK, 100)
    assert calls.seconds_used(OTHER_USER, WEEK) == 0


def test_calls_started_together_are_never_granted_the_same_seconds(
    db: SqlClient, postgres_uri: str
) -> None:
    """Granting and counting are one statement: eight calls of up to 600 seconds started at the
    same moment share out the 3000 seconds left, never more."""
    schema = db.execute("SELECT current_schema() AS name")[0]["name"]
    barrier = threading.Barrier(8)

    def start() -> int:
        with psycopg.connect(postgres_uri, autocommit=True) as connection:
            connection.execute(f'SET search_path TO "{schema}"')
            barrier.wait()
            calls = SqlVoiceSessionRepository(LocalSqlClient(connection))
            return calls.reserve_seconds(USER, WEEK, weekly=3000, least=60, most=600)

    with ThreadPoolExecutor(max_workers=8) as pool:
        granted = [future.result() for future in [pool.submit(start) for _ in range(8)]]

    assert sorted(granted) == [0, 0, 0, 600, 600, 600, 600, 600]


def test_a_finished_call_keeps_its_outcome_usage_and_what_was_said(sessions: Sessions) -> None:
    sessions.repository.started(session("rtc_1"))
    assert sessions.result("rtc_1") is None

    sessions.repository.finish(
        "rtc_1",
        FinishedCall(
            ended_at=NOON + timedelta(minutes=4),
            outcome="finished",
            usage=USAGE,
            turns=(
                Turn("persona", "Bonjour Amara ! On continue en français ?"),
                Turn("learner", "Oui, « très bien »."),
                Turn("persona", "Parfait."),
            ),
        ),
    )

    assert sessions.result("rtc_1") == (
        "finished",
        USAGE,
        [
            ("persona", "Bonjour Amara ! On continue en français ?"),
            ("learner", "Oui, « très bien »."),
            ("persona", "Parfait."),
        ],
    )


def test_a_call_without_a_word_can_be_finished(sessions: Sessions) -> None:
    sessions.repository.started(session("rtc_1"))

    sessions.repository.finish(
        "rtc_1", FinishedCall(ended_at=NOON, outcome="closed", usage=USAGE, turns=())
    )

    assert sessions.result("rtc_1") == ("closed", USAGE, [])


def test_finishing_an_unknown_call_stores_nothing(sessions: Sessions) -> None:
    sessions.repository.finish(
        "rtc_ghost",
        FinishedCall(ended_at=NOON, outcome="closed", usage=USAGE, turns=(Turn("learner", "Hi"),)),
    )

    assert sessions.result("rtc_ghost") is None
    assert sessions.repository.get("rtc_ghost") is None


# --- Placement results -----------------------------------------------------------------------


@pytest.fixture(params=["memory", "postgres"])
def placements(request: pytest.FixtureRequest) -> PlacementRepository:
    if request.param == "memory":
        return InMemoryPlacementRepository()
    return SqlPlacementRepository(request.getfixturevalue("db"))


RESULT = PlacementResult(
    levels={
        "speaking": "B1",
        "listening": "B1",
        "grammar": "A2",
        "vocabulary": "A2",
        "pronunciation": "B2",
    },
    overall="B1",
    weak_areas=("Perfekt avec « sein » : ich bin gegangen", "L’ordre des mots après « weil »"),
    measured_at=NOON,
)


def test_a_learner_without_a_test_has_no_result(placements: PlacementRepository) -> None:
    assert placements.load(USER, "de") is None


def test_a_result_is_read_back_as_it_was_stored(placements: PlacementRepository) -> None:
    placements.save(USER, "de", RESULT)

    assert placements.load(USER, "de") == RESULT
    assert placements.load(USER, "fr") is None
    assert placements.load(OTHER_USER, "de") is None


def test_a_later_test_replaces_the_earlier_result(placements: PlacementRepository) -> None:
    placements.save(USER, "de", RESULT)
    later = PlacementResult(
        levels=dict.fromkeys(RESULT.levels, "B2"),
        overall="B2",
        weak_areas=(),
        measured_at=NOON + timedelta(days=30),
    )

    placements.save(USER, "de", later)

    assert placements.load(USER, "de") == later


# --- Personas and the last onboarding steps --------------------------------------------------


@pytest.fixture(params=["memory", "postgres"])
def personas(request: pytest.FixtureRequest) -> PersonaRepository:
    if request.param == "memory":
        return InMemoryPersonaRepository()
    return SqlPersonaRepository(request.getfixturevalue("db"))


def persona(number: int, name: str, tagline: str | None = "Bavarde et curieuse") -> Persona:
    return Persona(
        id=UUID(f"aaaaaaaa-aaaa-4aaa-8aaa-{number:012d}"),
        role="buddy",
        name=name,
        gender="female",
        age=27,
        origin="Leipzig",
        tagline=tagline,
        backstory="Lena arbeitet als Grafikerin in Leipzig und hat eine Katze namens Krümel.",
        look={
            "skin": "sand",
            "hair": "long",
            "hair_color": "chestnut",
            "top": "teal",
            "backdrop": "mist",
            "glasses": False,
            "beard": False,
        },
        voice="marin",
    )


def test_personas_are_read_back_in_the_order_they_were_added(personas: PersonaRepository) -> None:
    personas.add(USER, "de", [persona(2, "Lena"), persona(1, "Jonas", tagline=None)])
    personas.add(USER, "de", [persona(3, "Frau Weber")])

    stored = personas.for_learner(USER, "de")

    assert stored == [
        persona(2, "Lena"),
        persona(1, "Jonas", tagline=None),
        persona(3, "Frau Weber"),
    ]
    assert personas.for_learner(USER, "fr") == []
    assert personas.for_learner(OTHER_USER, "de") == []


def test_a_persona_can_be_changed_by_its_owner_only(personas: PersonaRepository) -> None:
    personas.add(USER, "de", [persona(1, "Lena"), persona(2, "Jonas")])
    renamed = persona(1, "Lena Marie")

    assert personas.update(OTHER_USER, renamed) is False
    assert personas.for_learner(USER, "de")[0].name == "Lena"

    assert personas.update(USER, renamed) is True
    assert [p.name for p in personas.for_learner(USER, "de")] == ["Lena Marie", "Jonas"]


def test_changing_a_persona_that_does_not_exist_reports_it(personas: PersonaRepository) -> None:
    assert personas.update(USER, persona(9, "Nobody")) is False
    assert personas.for_learner(USER, "de") == []


def test_a_persona_can_be_removed_by_its_owner_only(personas: PersonaRepository) -> None:
    personas.add(USER, "de", [persona(1, "Lena"), persona(2, "Jonas")])

    assert personas.remove(OTHER_USER, persona(1, "Lena").id) is False
    assert personas.remove(USER, persona(1, "Lena").id) is True
    assert personas.remove(USER, persona(1, "Lena").id) is False

    assert [p.name for p in personas.for_learner(USER, "de")] == ["Jonas"]


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
    "explanation_usage": None,
    "level": "B1",
    "focus": "Dativ und Perfekt",
    "speed": 0.9,
}


def test_a_persona_keeps_its_occupation_personality_and_teaching(
    personas: PersonaRepository,
) -> None:
    greta = replace(
        persona(1, "Greta"),
        occupation="Marketing-Managerin",
        personality=PERSONALITY,
        teaching=TEACHING,
    )
    personas.add(USER, "de", [greta, persona(2, "Lena")])

    stored = personas.for_learner(USER, "de")

    assert stored == [greta, persona(2, "Lena")]
    assert (stored[1].occupation, stored[1].personality, stored[1].teaching) == ("", {}, {})


def test_every_part_of_a_persona_can_be_replaced(personas: PersonaRepository) -> None:
    personas.add(USER, "de", [persona(1, "Lena"), persona(2, "Jonas")])
    changed = Persona(
        id=persona(1, "Lena").id,
        role="teacher",
        name="Greta",
        gender="male",
        age=44,
        origin="Wien",
        tagline=None,
        backstory="Greta unterrichtet in Wien.",
        look={**persona(1, "Lena").look, "hair": "bun", "glasses": True},
        voice="coral",
        occupation="Lehrerin",
        personality=PERSONALITY,
        teaching=TEACHING,
    )

    assert personas.update(USER, changed) is True

    assert personas.for_learner(USER, "de") == [changed, persona(2, "Jonas")]


def test_settings_of_their_own_can_be_taken_from_a_persona_again(
    personas: PersonaRepository,
) -> None:
    greta = replace(persona(1, "Greta"), personality=PERSONALITY, teaching=TEACHING)
    personas.add(USER, "de", [greta])

    personas.update(USER, persona(1, "Greta"))

    assert personas.for_learner(USER, "de") == [persona(1, "Greta")]


@pytest.fixture(params=["memory", "postgres"])
def drafts(request: pytest.FixtureRequest) -> DraftLog:
    if request.param == "memory":
        return InMemoryDraftLog()
    return SqlDraftLog(request.getfixturevalue("db"))


TODAY = NOON.date()
TOMORROW = TODAY + timedelta(days=1)


def test_a_draft_is_counted_until_the_days_limit_is_reached(drafts: DraftLog) -> None:
    assert [drafts.reserve(USER, TODAY, 3) for _ in range(5)] == [True, True, True, False, False]


def test_the_limit_is_each_learners_own_and_starts_again_the_next_day(drafts: DraftLog) -> None:
    assert drafts.reserve(USER, TODAY, 1) is True
    assert drafts.reserve(USER, TODAY, 1) is False

    assert drafts.reserve(OTHER_USER, TODAY, 1) is True
    assert drafts.reserve(USER, TOMORROW, 1) is True


def test_requests_arriving_together_cannot_get_past_the_limit(
    db: SqlClient, postgres_uri: str
) -> None:
    """Counting and checking are one statement: twelve requests at the same moment get five
    drafts, never more."""
    schema = db.execute("SELECT current_schema() AS name")[0]["name"]
    barrier = threading.Barrier(12)

    def ask() -> bool:
        with psycopg.connect(postgres_uri, autocommit=True) as connection:
            connection.execute(f'SET search_path TO "{schema}"')
            barrier.wait()
            return SqlDraftLog(LocalSqlClient(connection)).reserve(USER, TODAY, 5)

    with ThreadPoolExecutor(max_workers=12) as pool:
        answers = [future.result() for future in [pool.submit(ask) for _ in range(12)]]

    assert sorted(answers) == [False] * 7 + [True] * 5


def test_the_last_onboarding_steps_are_read_back(onboarding: OnboardingRepository) -> None:
    state = OnboardingState(
        essentials_confirmed_at=NOON,
        placement=PlacementStatus.DECIDED,
        partners_confirmed_at=NOON + timedelta(minutes=5),
        completed_at=NOON + timedelta(minutes=6),
    )

    onboarding.save(USER, state)

    assert onboarding.load(USER) == state


# --- Practice conversations ------------------------------------------------------------------


@dataclass
class Practice:
    calls: VoiceSessionRepository
    personas: PersonaRepository
    conversations: ConversationRepository
    recordings: RecordingRepository


@pytest.fixture(params=["memory", "postgres"])
def practice(request: pytest.FixtureRequest) -> Practice:
    if request.param == "memory":
        calls = InMemoryVoiceSessionRepository()
        return Practice(
            calls,
            InMemoryPersonaRepository(),
            InMemoryConversationRepository(calls),
            InMemoryRecordingRepository(calls),
        )
    db: SqlClient = request.getfixturevalue("db")
    return Practice(
        SqlVoiceSessionRepository(db),
        SqlPersonaRepository(db),
        SqlConversationRepository(db),
        SqlRecordingRepository(db),
    )


LENA = persona(1, "Lena")
JONAS = persona(2, "Jonas")
HOUR = timedelta(hours=1)


def talked(
    practice: Practice,
    call_id: str,
    *,
    at: datetime,
    partner: Persona | None = LENA,
    user: UUID = USER,
    minutes: float = 5,
    learner_says: tuple[str, ...] = ("Hallo!",),
    purpose: CallPurpose = CallPurpose.PRACTICE,
    ended: bool = True,
) -> None:
    """A call as the broker and the worker record it."""
    practice.calls.started(
        VoiceSession(
            call_id,
            user,
            purpose,
            "gpt-realtime-2.1-mini",
            at,
            persona_id=partner.id if partner else None,
        )
    )
    if ended:
        turns = [Turn("persona", "Hallo! Wie geht's?"), *(Turn("learner", t) for t in learner_says)]
        practice.calls.finish(
            call_id, FinishedCall(at + timedelta(minutes=minutes), "closed", USAGE, tuple(turns))
        )


@pytest.fixture
def partners(practice: Practice) -> Practice:
    """The learner has two partners (a call's partner must exist)."""
    practice.personas.add(USER, "de", [LENA, JONAS])
    return practice


def test_a_practice_call_keeps_its_partner(partners: Practice) -> None:
    talked(partners, "rtc_1", at=NOON, ended=False)

    stored = partners.calls.get("rtc_1")

    assert stored is not None
    assert (stored.purpose, stored.persona_id) == (CallPurpose.PRACTICE, LENA.id)


def test_conversations_that_count_are_listed_newest_first(partners: Practice) -> None:
    talked(partners, "rtc_old", at=NOON - 3 * HOUR, minutes=5)
    talked(partners, "rtc_new", at=NOON - HOUR, partner=JONAS, minutes=8.5)
    talked(partners, "rtc_silent", at=NOON - 2 * HOUR, learner_says=())
    talked(partners, "rtc_running", at=NOON, ended=False)
    talked(partners, "rtc_setup", at=NOON, partner=None, purpose=CallPurpose.ONBOARDING)
    talked(partners, "rtc_theirs", at=NOON, partner=None, user=OTHER_USER)

    listed = partners.conversations.listed(USER, 10, None)

    assert [(c.id, c.persona_id, c.seconds, c.learner_turns) for c in listed] == [
        ("rtc_new", JONAS.id, 510, 1),
        ("rtc_old", LENA.id, 300, 1),
    ]
    assert listed[0].started_at == NOON - HOUR
    assert listed[0].ended_at == NOON - HOUR + timedelta(minutes=8.5)
    assert listed[0].partner is None


def test_the_list_can_be_cut_by_size_and_continued_before_a_time(partners: Practice) -> None:
    for hours in (1, 2, 3):
        talked(partners, f"rtc_{hours}", at=NOON - hours * HOUR)

    assert [c.id for c in partners.conversations.listed(USER, 2, None)] == ["rtc_1", "rtc_2"]
    assert [c.id for c in partners.conversations.listed(USER, 2, NOON - 2 * HOUR)] == ["rtc_3"]


def test_one_practice_call_is_read_whether_or_not_it_counts_yet(partners: Practice) -> None:
    talked(partners, "rtc_running", at=NOON, ended=False)
    talked(partners, "rtc_done", at=NOON - HOUR, learner_says=("Hallo!", "Gut, danke."))
    talked(partners, "rtc_setup", at=NOON, partner=None, purpose=CallPurpose.ONBOARDING)

    running = partners.conversations.get(USER, "rtc_running")
    done = partners.conversations.get(USER, "rtc_done")

    assert running is not None
    assert (running.ended_at, running.seconds, running.learner_turns) == (None, 0, 0)
    assert done is not None
    assert (done.seconds, done.learner_turns, done.persona_id) == (300, 2, LENA.id)
    assert partners.conversations.get(OTHER_USER, "rtc_done") is None
    assert partners.conversations.get(USER, "rtc_setup") is None
    assert partners.conversations.get(USER, "rtc_unknown") is None


def test_the_turns_of_a_conversation_are_read_in_order(partners: Practice) -> None:
    talked(partners, "rtc_1", at=NOON, learner_says=("Hallo!", "Gut, « danke »."))

    turns = partners.conversations.turns("rtc_1")

    assert [(turn.speaker, turn.text) for turn in turns] == [
        ("persona", "Hallo! Wie geht's?"),
        ("learner", "Hallo!"),
        ("learner", "Gut, « danke »."),
    ]
    assert partners.conversations.turns("rtc_unknown") == []


def audio(call_id: str, item: str, user: UUID = USER) -> TurnAudio:
    return TurnAudio(f"users/{user}/recordings/{call_id}/{item}.wav", 1250)


def recorded(practice: Practice, call_id: str, user: UUID = USER) -> None:
    """A conversation whose two turns were recorded."""
    practice.calls.started(
        VoiceSession(call_id, user, CallPurpose.PRACTICE, "m", NOON, persona_id=LENA.id)
    )
    turns = (
        Turn("persona", "Wo warst du?", audio=audio(call_id, "item_1", user)),
        Turn("learner", "Ich bin in Berlin.", audio=audio(call_id, "item_2", user)),
    )
    practice.calls.finish(call_id, FinishedCall(NOON + HOUR, "closed", USAGE, turns))


def test_a_turn_keeps_its_recording(partners: Practice) -> None:
    recorded(partners, "rtc_1")

    turns = partners.conversations.turns("rtc_1")

    assert [turn.audio for turn in turns] == [audio("rtc_1", "item_1"), audio("rtc_1", "item_2")]
    assert [turn.verbatim for turn in turns] == [None, None]


def test_a_turn_keeps_what_the_verbatim_pass_wrote(partners: Practice) -> None:
    recorded(partners, "rtc_1")

    partners.recordings.set_verbatim("rtc_1", audio("rtc_1", "item_2").key, "Ich habe Berlin.")

    assert [turn.verbatim for turn in partners.conversations.turns("rtc_1")] == [
        None,
        "Ich habe Berlin.",
    ]


def test_a_calls_recordings_can_be_forgotten_and_its_text_stays(partners: Practice) -> None:
    recorded(partners, "rtc_1")
    recorded(partners, "rtc_2")
    partners.recordings.set_verbatim("rtc_1", audio("rtc_1", "item_2").key, "Ich habe Berlin.")

    partners.recordings.forget("rtc_1")

    first = partners.conversations.turns("rtc_1")
    assert [turn.audio for turn in first] == [None, None]
    assert first[1].verbatim == "Ich habe Berlin."
    assert all(turn.audio for turn in partners.conversations.turns("rtc_2"))


def test_all_of_a_learners_recordings_can_be_forgotten(partners: Practice) -> None:
    partners.personas.add(OTHER_USER, "de", [persona(3, "Lena")])
    recorded(partners, "rtc_1")
    recorded(partners, "rtc_2")
    recorded(partners, "rtc_theirs", OTHER_USER)

    partners.recordings.forget_all(USER)

    assert not [t for c in ("rtc_1", "rtc_2") for t in partners.conversations.turns(c) if t.audio]
    assert all(turn.audio for turn in partners.conversations.turns("rtc_theirs"))


def test_each_partners_history_counts_only_conversations_that_count(partners: Practice) -> None:
    talked(partners, "rtc_1", at=NOON - 30 * HOUR)
    talked(partners, "rtc_2", at=NOON - 3 * HOUR)
    talked(partners, "rtc_silent", at=NOON - HOUR, learner_says=())
    talked(partners, "rtc_running", at=NOON, partner=JONAS, ended=False)

    history = partners.conversations.partner_history(USER)

    assert set(history) == {LENA.id}
    assert (history[LENA.id].conversations, history[LENA.id].last_at) == (2, NOON - 3 * HOUR)
    assert partners.conversations.partner_history(OTHER_USER) == {}


def test_practice_is_added_up_per_day_of_the_learners_calendar(partners: Practice) -> None:
    late = datetime(2026, 10, 8, 23, 30, tzinfo=UTC)
    talked(partners, "rtc_late", at=late, minutes=10)
    talked(partners, "rtc_noon", at=NOON, minutes=5)
    talked(partners, "rtc_before", at=NOON - 30 * HOUR, minutes=4)
    talked(partners, "rtc_silent", at=NOON, learner_says=())

    zurich = partners.conversations.days(USER, "Europe/Zurich", NOON)
    utc = partners.conversations.days(USER, None, NOON)

    # 23:30 in UTC is already the next day in Zurich (UTC+2 in October).
    assert zurich.today == date(2026, 10, 9)
    assert [(d.day, d.seconds, d.conversations) for d in zurich.days] == [
        (date(2026, 10, 9), 900, 2),
        (date(2026, 10, 8), 240, 1),
    ]
    assert [(d.day, d.seconds, d.conversations) for d in utc.days] == [
        (date(2026, 10, 9), 300, 1),
        (date(2026, 10, 8), 840, 2),
    ]


def test_today_is_the_learners_date_not_the_servers(practice: Practice) -> None:
    late = datetime(2026, 10, 9, 23, 30, tzinfo=UTC)

    assert practice.conversations.days(USER, "Europe/Zurich", late).today == date(2026, 10, 10)
    assert practice.conversations.days(USER, "America/Los_Angeles", NOON).today == date(2026, 10, 9)
    assert practice.conversations.days(USER, None, late).days == ()


@pytest.mark.parametrize("unknown", ["Mars/Olympus", "", "'; DROP TABLE voice_session; --"])
def test_an_unknown_time_zone_means_utc(practice: Practice, unknown: str) -> None:
    late = datetime(2026, 10, 9, 23, 30, tzinfo=UTC)

    assert practice.conversations.days(USER, unknown, late).today == date(2026, 10, 9)


def test_removing_a_partner_keeps_their_conversations(db: SqlClient) -> None:
    practice = Practice(
        SqlVoiceSessionRepository(db),
        SqlPersonaRepository(db),
        SqlConversationRepository(db),
        SqlRecordingRepository(db),
    )
    practice.personas.add(USER, "de", [LENA])
    talked(practice, "rtc_1", at=NOON)

    practice.personas.remove(USER, LENA.id)

    kept = practice.conversations.listed(USER, 10, None)
    assert [(c.id, c.persona_id, c.seconds) for c in kept] == [("rtc_1", None, 300)]
    assert practice.conversations.partner_history(USER) == {}


@pytest.fixture(params=["memory", "postgres"])
def accounts(request: pytest.FixtureRequest) -> AccountRepository:
    if request.param == "memory":
        return InMemoryAccountRepository()
    return SqlAccountRepository(request.getfixturevalue("db"))


PICTURE = f"users/{USER}/picture/aaaaaaaa-aaaa-4aaa-8aaa-000000000001.jpg"


def test_a_learner_starts_without_a_picture(accounts: AccountRepository) -> None:
    assert accounts.picture_key(USER) is None


def test_a_picture_is_kept_per_learner_and_can_be_replaced(accounts: AccountRepository) -> None:
    accounts.set_picture_key(USER, PICTURE)
    assert accounts.picture_key(USER) == PICTURE
    assert accounts.picture_key(OTHER_USER) is None

    newer = PICTURE.replace("000000000001", "000000000002")
    accounts.set_picture_key(USER, newer)

    assert accounts.picture_key(USER) == newer


def test_a_picture_can_be_taken_away(accounts: AccountRepository) -> None:
    accounts.set_picture_key(USER, PICTURE)

    accounts.set_picture_key(USER, None)

    assert accounts.picture_key(USER) is None


def test_a_deleted_learner_has_no_picture_left(accounts: AccountRepository) -> None:
    accounts.set_picture_key(USER, PICTURE)
    accounts.set_picture_key(OTHER_USER, PICTURE.replace(str(USER), str(OTHER_USER)))

    accounts.delete(USER, NOON)

    assert accounts.picture_key(USER) is None
    assert accounts.picture_key(OTHER_USER) is not None


def test_deleting_a_learner_who_stored_nothing_is_not_an_error(accounts: AccountRepository) -> None:
    accounts.delete(USER, NOON)


def test_a_deletion_is_remembered(accounts: AccountRepository) -> None:
    assert accounts.is_deleted(USER) is False

    accounts.delete(USER, NOON)
    accounts.delete(USER, NOON + timedelta(minutes=1))

    assert accounts.is_deleted(USER) is True
    assert accounts.is_deleted(OTHER_USER) is False


def test_a_deletion_is_forgotten_once_no_token_of_the_account_can_still_work(
    accounts: AccountRepository,
) -> None:
    """An access token lasts an hour. A day later the id of a deleted account is deleted too:
    it identified a person."""
    accounts.delete(USER, NOON)

    accounts.delete(OTHER_USER, NOON + timedelta(days=1, seconds=1))

    assert accounts.is_deleted(USER) is False
    assert accounts.is_deleted(OTHER_USER) is True


def test_a_remembered_deletion_can_be_taken_back(accounts: AccountRepository) -> None:
    """For an account whose sign-in could not be removed: it still exists."""
    accounts.delete(USER, NOON)

    accounts.restore(USER)
    accounts.restore(OTHER_USER)

    assert accounts.is_deleted(USER) is False
    accounts.set_picture_key(USER, PICTURE)
    assert accounts.picture_key(USER) == PICTURE


def _second_connection(postgres_uri: str, db: SqlClient, **options: Any) -> psycopg.Connection[Any]:
    """Another connection to the test's own schema."""
    schema = db.execute("SELECT current_schema() AS name")[0]["name"]
    connection = psycopg.connect(postgres_uri, **options)
    connection.execute(f'SET search_path TO "{schema}"')
    connection.commit()
    return connection


@pytest.mark.parametrize("stored_before", [True, False], ids=["a known learner", "a new learner"])
def test_a_write_that_arrives_while_the_account_is_being_deleted_is_refused(
    db: SqlClient, postgres_uri: str, stored_before: bool
) -> None:
    """A deletion and a write for the same account never overlap: the write waits until the
    deletion is through, and then finds the account deleted. Without that, a request already
    on its way could put the account's row back."""
    if stored_before:
        SqlProfileRepository(db).save(USER, [change("goals", {"reasons": ["work"]})])
    deleting = _second_connection(postgres_uri, db)
    writing = _second_connection(postgres_uri, db, autocommit=True)
    try:
        # The deletion has done its work but is not through yet.
        SqlAccountRepository(LocalSqlClient(deleting)).delete(USER, NOON)

        def write() -> None:
            SqlOnboardingRepository(LocalSqlClient(writing)).save(USER, OnboardingState())

        with ThreadPoolExecutor(max_workers=1) as pool:
            attempt = pool.submit(write)
            # The write is waiting, not done.
            with pytest.raises(TimeoutError):
                attempt.result(timeout=0.5)
            deleting.commit()
            with pytest.raises(psycopg.Error):
                attempt.result(timeout=10)
    finally:
        deleting.close()
        writing.close()

    assert db.execute("SELECT count(*) AS users FROM app_user") == [{"users": 0}]
    assert db.execute("SELECT count(*) AS rows FROM onboarding") == [{"rows": 0}]


def test_a_deletion_waits_for_a_write_that_is_under_way_and_then_removes_it(
    db: SqlClient, postgres_uri: str
) -> None:
    writing = _second_connection(postgres_uri, db)
    deleting = _second_connection(postgres_uri, db, autocommit=True)
    try:
        # A first write for a new learner, not through yet.
        SqlOnboardingRepository(LocalSqlClient(writing)).save(USER, OnboardingState())

        def delete() -> None:
            SqlAccountRepository(LocalSqlClient(deleting)).delete(USER, NOON)

        with ThreadPoolExecutor(max_workers=1) as pool:
            deletion = pool.submit(delete)
            with pytest.raises(TimeoutError):
                deletion.result(timeout=0.5)
            writing.commit()
            deletion.result(timeout=10)
    finally:
        writing.close()
        deleting.close()

    assert db.execute("SELECT count(*) AS users FROM app_user") == [{"users": 0}]
    assert db.execute("SELECT count(*) AS rows FROM onboarding") == [{"rows": 0}]
    assert SqlAccountRepository(db).is_deleted(USER) is True


def test_nothing_can_be_stored_again_for_a_deleted_learner(db: SqlClient) -> None:
    """The database itself refuses: whatever the layers above let through, a deleted account
    gets no rows back."""
    SqlAccountRepository(db).delete(USER, NOON)

    writes: list[Callable[[], object]] = [
        lambda: SqlProfileRepository(db).save(USER, [change("goals", {"reasons": ["work"]})]),
        lambda: SqlOnboardingRepository(db).save(USER, OnboardingState()),
        lambda: SqlPersonaRepository(db).add(USER, "de", [persona(1, "Lena")]),
        lambda: SqlDraftLog(db).reserve(USER, TODAY, 5),
        lambda: SqlAccountRepository(db).set_picture_key(USER, PICTURE),
    ]
    for write in writes:
        with pytest.raises(psycopg.Error):
            write()

    assert db.execute("SELECT count(*) AS users FROM app_user") == [{"users": 0}]
    # Another learner is stored as before.
    SqlProfileRepository(db).save(OTHER_USER, [change("goals", {"reasons": ["work"]})])
    assert db.execute("SELECT count(*) AS users FROM app_user") == [{"users": 1}]


def test_deleting_a_learner_deletes_everything_stored_for_them(db: SqlClient) -> None:
    """Every table that holds a learner's data hangs on `app_user`, so one deletion empties
    them all. A new table without that link fails here."""
    for user in (USER, OTHER_USER):
        SqlProfileRepository(db).save(user, [change("goals", {"reasons": ["work"]})])
        SqlOnboardingRepository(db).save(user, OnboardingState(essentials_confirmed_at=NOON))
        SqlPlacementRepository(db).save(
            user, "de", PlacementResult({"speaking": "A2"}, "A2", ("Dativ",), NOON)
        )
    practice = Practice(
        SqlVoiceSessionRepository(db),
        SqlPersonaRepository(db),
        SqlConversationRepository(db),
        SqlRecordingRepository(db),
    )
    practice.personas.add(USER, "de", [LENA])
    talked(practice, "rtc_1", at=NOON)
    SqlTutorRepository(db).reserve(USER, NOON.date(), 5)
    SqlTutorRepository(db).save(USER, question(1, NOON))
    owned = [
        row["table_name"]
        for row in db.execute(
            "SELECT table_name FROM information_schema.columns "
            "WHERE table_schema = current_schema() AND column_name = 'user_id'"
        )
    ]
    assert len(owned) >= 6

    SqlAccountRepository(db).delete(USER, NOON)

    for table in owned:
        rows = db.execute(f"SELECT CAST(user_id AS text) AS user_id FROM {table}")
        assert str(USER) not in {row["user_id"] for row in rows}, table
    assert db.execute("SELECT count(*) AS turns FROM voice_turn") == [{"turns": 0}]
    assert db.execute("SELECT CAST(id AS text) AS id FROM app_user") == [{"id": str(OTHER_USER)}]


# --- Ask-the-Tutor -------------------------------------------------------------------------------


@pytest.fixture(params=["memory", "postgres"])
def tutor(request: pytest.FixtureRequest) -> TutorRepository:
    if request.param == "memory":
        return InMemoryTutorRepository()
    return SqlTutorRepository(request.getfixturevalue("db"))


def question(
    number: int, at: datetime, source: Any = "text", topic: str | None = "case_dative"
) -> TutorQuestion:
    return TutorQuestion(
        id=UUID(f"dddddddd-dddd-4ddd-8ddd-{number:012d}"),
        asked_at=at,
        question=f"Warum « dem » ? ({number})",
        answer=TutorAnswer(
            explanation="Après « mit », le datif.",
            examples=(Example("Ich fahre mit dem Bus.", "Je prends le bus."),),
            topic=topic,
            unsure=number % 2 == 0,
        ),
        source=source,
    )


def test_a_question_is_read_back_as_it_was_kept(tutor: TutorRepository) -> None:
    kept = question(1, NOON, source="report", topic=None)

    tutor.save(USER, kept)

    assert tutor.listed(USER, 10) == [kept]
    assert tutor.listed(OTHER_USER, 10) == []


def test_questions_are_listed_newest_first_up_to_a_limit(tutor: TutorRepository) -> None:
    for number in (1, 2, 3):
        tutor.save(USER, question(number, NOON + timedelta(minutes=number)))

    assert [str(q.id)[-1] for q in tutor.listed(USER, 2)] == ["3", "2"]


def test_questions_are_counted_per_learner_and_day_up_to_the_limit(tutor: TutorRepository) -> None:
    assert tutor.reserve(USER, NOON.date(), 2)
    assert tutor.reserve(USER, NOON.date(), 2)
    assert not tutor.reserve(USER, NOON.date(), 2)
    assert tutor.reserve(OTHER_USER, NOON.date(), 2)
    assert tutor.reserve(USER, NOON.date() + timedelta(days=1), 2)


# --- Session reports -------------------------------------------------------------------------


@dataclass
class Reports:
    calls: VoiceSessionRepository
    reports: ReportRepository


@pytest.fixture(params=["memory", "postgres"])
def reports(request: pytest.FixtureRequest) -> Reports:
    """Report storage, with the call `rtc_1` there to write a report for."""
    if request.param == "memory":
        calls = InMemoryVoiceSessionRepository()
        stored = Reports(calls, InMemoryReportRepository(calls))
    else:
        db: SqlClient = request.getfixturevalue("db")
        stored = Reports(SqlVoiceSessionRepository(db), SqlReportRepository(db))
    stored.calls.started(
        VoiceSession("rtc_1", USER, CallPurpose.PRACTICE, "gpt-realtime-2.1-mini", NOON)
    )
    return stored


REPORT = Report(
    target="de",
    language="fr",
    summary="Vous avez raconté votre week-end à Berlin : « très bien » !",
    mistakes=(
        Mistake(
            turn=1,
            original="mit der Bus",
            corrected="mit dem Bus",
            explanation="« mit » demande le datif.",
            category="case_dative",
            severity="minor",
            certain=True,
        ),
        Mistake(
            3, "weil es war gut", "weil es gut war", "Verbe à la fin.", "other", "noticeable", False
        ),
    ),
    rewrites=(Rewrite(3, "Ich habe ein Museum besucht", "Ich war im Museum", "Plus courant."),),
    words=(
        Word("das Wochenende", "le week-end", "Wie war dein Wochenende?"),
        Word("umsteigen", "changer (de train)", None),
    ),
    wins=("Un récit au passé.",),
    next_steps=("Le Perfekt avec « sein ».", "Le datif après « mit »."),
    stats=Stats(learner_words=22, partner_words=17, learner_turns=3, longest_turn_words=11),
)


STALE = timedelta(minutes=5)
MOST = 3


def ask(reports: ReportRepository, call_id: str, at: datetime) -> bool:
    """Asks for a report as the service does: one that has been pending for `STALE` counts as
    lost, and a report is asked for at most `MOST` times."""
    return reports.request(call_id, at, stale_before=at - STALE, max_requests=MOST)


def test_a_call_has_no_report_until_one_is_asked_for(reports: Reports) -> None:
    assert reports.reports.load("rtc_1") is None


def test_a_report_that_was_asked_for_is_pending_since_then(reports: Reports) -> None:
    berlin = timezone(timedelta(hours=2))

    ask(reports.reports, "rtc_1", NOON.astimezone(berlin))

    assert reports.reports.load("rtc_1") == StoredReport("pending", NOON, None)


def test_a_written_report_is_read_back_as_it_was_stored(reports: Reports) -> None:
    ask(reports.reports, "rtc_1", NOON)

    reports.reports.written("rtc_1", "ready", REPORT)

    assert reports.reports.load("rtc_1") == StoredReport("ready", NOON, REPORT)


@pytest.mark.parametrize("status", ["failed", "too_short"])
def test_a_report_that_was_not_written_keeps_why(reports: Reports, status: Status) -> None:
    ask(reports.reports, "rtc_1", NOON)

    reports.reports.written("rtc_1", status, None)

    assert reports.reports.load("rtc_1") == StoredReport(status, NOON, None)


def test_only_the_first_of_two_requests_gets_to_start_a_report(reports: Reports) -> None:
    first = ask(reports.reports, "rtc_1", NOON)
    second = ask(reports.reports, "rtc_1", NOON + timedelta(seconds=1))

    assert (first, second) == (True, False)
    assert reports.reports.load("rtc_1") == StoredReport("pending", NOON, None)


def test_a_failed_report_can_be_asked_for_again(reports: Reports) -> None:
    ask(reports.reports, "rtc_1", NOON)
    reports.reports.written("rtc_1", "failed", None)

    assert ask(reports.reports, "rtc_1", NOON + HOUR) is True
    assert reports.reports.load("rtc_1") == StoredReport("pending", NOON + HOUR, None)


def test_a_report_that_has_been_pending_too_long_can_be_asked_for_again(reports: Reports) -> None:
    ask(reports.reports, "rtc_1", NOON)

    too_soon = ask(reports.reports, "rtc_1", NOON + STALE)
    late_enough = ask(reports.reports, "rtc_1", NOON + STALE + timedelta(seconds=1))

    assert (too_soon, late_enough) == (False, True)


@pytest.mark.parametrize("status", ["ready", "too_short"])
def test_a_report_that_is_settled_is_not_started_again(reports: Reports, status: Status) -> None:
    ask(reports.reports, "rtc_1", NOON)
    reports.reports.written("rtc_1", status, REPORT if status == "ready" else None)
    settled = reports.reports.load("rtc_1")

    assert ask(reports.reports, "rtc_1", NOON + HOUR) is False
    assert reports.reports.load("rtc_1") == settled


def test_a_report_is_asked_for_only_so_many_times(reports: Reports) -> None:
    answers = []
    for attempt in range(MOST + 1):
        answers.append(ask(reports.reports, "rtc_1", NOON + attempt * HOUR))
        reports.reports.written("rtc_1", "failed", None)

    assert answers == [True] * MOST + [False]
    assert reports.reports.load("rtc_1") == StoredReport("failed", NOON + (MOST - 1) * HOUR, None)


def test_a_pending_report_is_taken_by_one_worker_only(reports: Reports) -> None:
    assert reports.reports.claim("rtc_1", NOON) is False
    ask(reports.reports, "rtc_1", NOON)

    first = reports.reports.claim("rtc_1", NOON)
    second = reports.reports.claim("rtc_1", NOON)

    assert (first, second) == (True, False)


def test_a_report_asked_for_again_can_be_taken_again(reports: Reports) -> None:
    ask(reports.reports, "rtc_1", NOON)
    reports.reports.claim("rtc_1", NOON)
    reports.reports.written("rtc_1", "failed", None)
    after_failure = reports.reports.claim("rtc_1", NOON)
    ask(reports.reports, "rtc_1", NOON + HOUR)

    assert after_failure is False
    assert reports.reports.claim("rtc_1", NOON + HOUR) is True


def test_requests_arriving_together_start_one_report(db: SqlClient, postgres_uri: str) -> None:
    """Checking and marking are one statement: of twelve requests at the same moment exactly
    one is told to start the writing, and of twelve workers exactly one gets to write."""
    SqlVoiceSessionRepository(db).started(
        VoiceSession("rtc_1", USER, CallPurpose.PRACTICE, "gpt-realtime-2.1-mini", NOON)
    )
    schema = db.execute("SELECT current_schema() AS name")[0]["name"]

    def together(act: Callable[[SqlReportRepository], bool]) -> list[bool]:
        barrier = threading.Barrier(12)

        def one() -> bool:
            with psycopg.connect(postgres_uri, autocommit=True) as connection:
                connection.execute(f'SET search_path TO "{schema}"')
                barrier.wait()
                return act(SqlReportRepository(LocalSqlClient(connection)))

        with ThreadPoolExecutor(max_workers=12) as pool:
            return [future.result() for future in [pool.submit(one) for _ in range(12)]]

    asked = together(lambda reports: ask(reports, "rtc_1", NOON))
    taken = together(lambda reports: reports.claim("rtc_1", NOON))

    assert sorted(asked) == [False] * 11 + [True]
    assert sorted(taken) == [False] * 11 + [True]


def test_nothing_is_stored_for_a_call_that_does_not_exist(reports: Reports) -> None:
    asked = ask(reports.reports, "rtc_ghost", NOON)
    reports.reports.written("rtc_ghost", "ready", REPORT)

    assert asked is False

    assert reports.reports.load("rtc_ghost") is None


def test_a_report_nobody_asked_for_is_not_stored(reports: Reports) -> None:
    reports.reports.written("rtc_1", "ready", REPORT)

    assert reports.reports.load("rtc_1") is None


def test_a_deleted_learner_has_no_reports_left(db: SqlClient) -> None:
    stored = SqlReportRepository(db)
    SqlVoiceSessionRepository(db).started(
        VoiceSession("rtc_1", USER, CallPurpose.PRACTICE, "gpt-realtime-2.1-mini", NOON)
    )
    ask(stored, "rtc_1", NOON)
    stored.written("rtc_1", "ready", REPORT)

    SqlAccountRepository(db).delete(USER, NOON)

    assert stored.load("rtc_1") is None


def test_the_latest_report_is_the_ready_one_of_the_learners_newest_conversation(
    reports: Reports,
) -> None:
    def call(call_id: str, at: datetime, user: UUID = USER) -> None:
        reports.calls.started(
            VoiceSession(call_id, user, CallPurpose.PRACTICE, "gpt-realtime-2.1-mini", at)
        )
        ask(reports.reports, call_id, at)

    older = replace(REPORT, summary="Avant-hier.")
    newer = replace(REPORT, summary="Hier.")
    call("rtc_2", NOON + 2 * HOUR)
    call("rtc_3", NOON + HOUR)
    call("rtc_4", NOON + 3 * HOUR)
    call("rtc_theirs", NOON + 4 * HOUR, user=OTHER_USER)
    # Written in another order than the conversations took place.
    reports.reports.written("rtc_2", "ready", newer)
    reports.reports.written("rtc_3", "ready", older)
    reports.reports.written("rtc_4", "failed", None)
    reports.reports.written("rtc_theirs", "ready", replace(REPORT, summary="Le leur."))

    assert reports.reports.latest(USER) == newer


def test_a_learner_without_a_ready_report_has_no_latest_one(reports: Reports) -> None:
    ask(reports.reports, "rtc_1", NOON)

    assert reports.reports.latest(USER) is None
    assert reports.reports.latest(OTHER_USER) is None


# --- Flashcards ------------------------------------------------------------------------------


@pytest.fixture(params=["memory", "postgres"])
def cards(request: pytest.FixtureRequest) -> CardRepository:
    if request.param == "memory":
        return InMemoryCardRepository()
    return SqlCardRepository(request.getfixturevalue("db"))


def card(number: int, front: str = "das Wochenende", **changes: Any) -> Card:
    """A new word card, made `number` minutes after noon and due at once."""
    made = NOON + timedelta(minutes=number)
    fields: dict[str, Any] = {
        "id": UUID(f"cccccccc-cccc-4ccc-8ccc-{number:012d}"),
        "kind": "word",
        "front": front,
        "back": "le week-end : « samedi et dimanche »",
        "note": "Wie war dein Wochenende?",
        "explained_in": "fr",
        "source_call_id": None,
        "created_at": made,
        "due_at": made,
        "reviewed_at": None,
        "memory": None,
        "reviews": 0,
        "lapses": 0,
    }
    return Card(**{**fields, **changes})


def add(cards: CardRepository, new: Card, *, user: UUID = USER, language: str = "de") -> bool:
    return cards.add(user, language, card_key(new.front), new, 100)


def test_a_card_is_read_back_as_it_was_stored(cards: CardRepository) -> None:
    berlin = timezone(timedelta(hours=2))
    new = card(1, note=None, created_at=NOON.astimezone(berlin), due_at=NOON.astimezone(berlin))

    stored = add(cards, new)

    assert stored is True
    assert cards.get(USER, new.id) == card(1, note=None, created_at=NOON, due_at=NOON)
    assert cards.by_key(USER, "de", "word", "das wochenende") == cards.get(USER, new.id)


def test_a_card_is_found_only_by_its_owner_kind_language_and_words(cards: CardRepository) -> None:
    add(cards, card(1))

    assert cards.get(OTHER_USER, card(1).id) is None
    assert cards.get(USER, card(2).id) is None
    assert cards.by_key(OTHER_USER, "de", "word", "das wochenende") is None
    assert cards.by_key(USER, "fr", "word", "das wochenende") is None
    assert cards.by_key(USER, "de", "correction", "das wochenende") is None
    assert cards.by_key(USER, "de", "word", "wochenende") is None


def test_the_same_card_is_not_stored_twice(cards: CardRepository) -> None:
    add(cards, card(1))

    assert add(cards, card(2, "Das Wochenende!")) is False
    assert cards.get(USER, card(2).id) is None
    # The same words are another card as a correction, in another language, for someone else.
    assert add(cards, card(3, kind="correction")) is True
    assert add(cards, card(4), language="fr") is True
    assert add(cards, card(5), user=OTHER_USER) is True


def test_a_deck_takes_only_so_many_cards(cards: CardRepository) -> None:
    for number in (1, 2):
        cards.add(USER, "de", f"wort{number}", card(number, f"Wort{number}"), 2)

    assert cards.add(USER, "de", "wort3", card(3, "Wort3"), 2) is False
    # The limit is per learner and language.
    assert cards.add(USER, "fr", "mot", card(4, "mot"), 2) is True
    assert cards.add(OTHER_USER, "de", "wort5", card(5, "Wort5"), 2) is True
    assert cards.counts(USER, "de", NOON + HOUR) == (2, 2)


def test_cards_are_listed_newest_first_page_by_page(cards: CardRepository) -> None:
    for number in (1, 2, 3):
        add(cards, card(number, f"Wort{number}"))
    add(cards, card(4, "mot"), language="fr")
    add(cards, card(5, "Wort5"), user=OTHER_USER)

    assert [c.front for c in cards.listed(USER, "de", 2, None)] == ["Wort3", "Wort2"]
    assert [c.front for c in cards.listed(USER, "de", 2, card(2).created_at)] == ["Wort1"]
    assert cards.listed(USER, "it", 10, None) == []


def test_the_cards_that_are_due_come_longest_waiting_first(cards: CardRepository) -> None:
    add(cards, card(1, "Wort1", due_at=NOON + 3 * HOUR))
    add(cards, card(2, "Wort2", due_at=NOON + HOUR))
    add(cards, card(3, "Wort3", due_at=NOON + 2 * HOUR))
    add(cards, card(4, "mot", due_at=NOON), language="fr")

    at_two = NOON + 2 * HOUR

    assert [c.front for c in cards.due(USER, "de", at_two, 10)] == ["Wort2", "Wort3"]
    assert [c.front for c in cards.due(USER, "de", at_two, 1)] == ["Wort2"]
    assert cards.counts(USER, "de", at_two) == (3, 2)
    assert cards.counts(USER, "de", NOON) == (3, 0)
    assert cards.counts(OTHER_USER, "de", at_two) == (0, 0)


def test_a_review_is_stored_with_the_cards_new_memory(cards: CardRepository) -> None:
    add(cards, card(1))
    after = card(
        1,
        due_at=NOON + timedelta(days=2),
        reviewed_at=NOON + HOUR,
        memory=Memory(stability=2.3065, difficulty=2.118103970459015),
        reviews=1,
        lapses=0,
    )

    stored = cards.reviewed(USER, after, "good", 0)

    assert stored is True
    assert cards.get(USER, after.id) == after


def test_a_review_is_stored_only_for_the_card_as_it_was_read(cards: CardRepository) -> None:
    add(cards, card(1))
    after = card(1, reviewed_at=NOON, memory=Memory(2.3065, 2.1181), reviews=1)
    cards.reviewed(USER, after, "good", 0)
    twice = replace(after, reviews=1, due_at=NOON + timedelta(days=9))

    assert cards.reviewed(USER, twice, "good", 0) is False
    assert cards.reviewed(OTHER_USER, replace(after, reviews=2), "good", 1) is False
    assert cards.reviewed(USER, replace(card(2), reviews=1), "good", 0) is False
    assert cards.get(USER, after.id) == after


def test_a_card_is_removed_by_its_owner_only(cards: CardRepository) -> None:
    add(cards, card(1))

    assert cards.remove(OTHER_USER, card(1).id) is False
    assert cards.remove(USER, card(2).id) is False
    assert cards.remove(USER, card(1).id) is True
    assert cards.get(USER, card(1).id) is None
    # Its words are free for a new card.
    assert add(cards, card(3)) is True


def test_the_cards_a_learner_has_are_told_apart_from_those_they_have_not(
    cards: CardRepository,
) -> None:
    add(cards, card(1))
    add(cards, card(2, "mit der Bus", kind="correction"))
    add(cards, card(3, "umsteigen"), user=OTHER_USER)

    known = cards.known(
        USER,
        "de",
        [("word", "das wochenende"), ("word", "umsteigen"), ("correction", "mit der bus")],
    )

    assert known == {("word", "das wochenende"), ("correction", "mit der bus")}
    assert cards.known(USER, "de", []) == set()


def test_a_card_remembers_the_conversation_it_came_from(db: SqlClient) -> None:
    SqlVoiceSessionRepository(db).started(
        VoiceSession("rtc_1", USER, CallPurpose.PRACTICE, "gpt-realtime-2.1-mini", NOON)
    )
    cards = SqlCardRepository(db)

    add(cards, card(1, source_call_id="rtc_1"))

    stored = cards.get(USER, card(1).id)
    assert stored is not None
    assert stored.source_call_id == "rtc_1"


def test_every_review_is_logged(db: SqlClient) -> None:
    cards = SqlCardRepository(db)
    add(cards, card(1))
    first = card(1, reviewed_at=NOON, memory=Memory(0.212, 6.4133), reviews=1)
    cards.reviewed(USER, first, "again", 0)
    cards.reviewed(USER, replace(first, reviewed_at=NOON + HOUR, reviews=2), "good", 1)
    cards.reviewed(USER, replace(first, reviews=2), "easy", 1)

    log = db.execute("SELECT position, rating FROM card_review ORDER BY position")

    assert [(row["position"], row["rating"]) for row in log] == [(1, "again"), (2, "good")]


def test_a_deleted_learner_has_no_cards_left(db: SqlClient) -> None:
    cards = SqlCardRepository(db)
    add(cards, card(1))
    cards.reviewed(USER, card(1, reviewed_at=NOON, memory=Memory(1.0, 5.0), reviews=1), "good", 0)

    SqlAccountRepository(db).delete(USER, NOON)

    assert cards.get(USER, card(1).id) is None
    assert db.execute("SELECT 1 AS left FROM card_review") == []


def test_a_review_sent_twice_at_the_same_moment_is_stored_once(
    db: SqlClient, postgres_uri: str
) -> None:
    """Checking that the card is as it was read and storing the review are one statement: of
    twelve reviews at once, one is stored."""
    add(SqlCardRepository(db), card(1))
    after = card(1, reviewed_at=NOON, memory=Memory(2.3065, 2.1181), reviews=1)
    schema = db.execute("SELECT current_schema() AS name")[0]["name"]
    barrier = threading.Barrier(12)

    def review() -> bool:
        with psycopg.connect(postgres_uri, autocommit=True) as connection:
            connection.execute(f'SET search_path TO "{schema}"')
            barrier.wait()
            return SqlCardRepository(LocalSqlClient(connection)).reviewed(USER, after, "good", 0)

    with ThreadPoolExecutor(max_workers=12) as pool:
        answers = [future.result() for future in [pool.submit(review) for _ in range(12)]]

    assert sorted(answers) == [False] * 11 + [True]
    assert db.execute("SELECT CAST(count(*) AS integer) AS n FROM card_review")[0]["n"] == 1


# --- What the Progress screen reads ----------------------------------------------------------

DAY = timedelta(days=1)
# NOON is Friday 9 October 2026; its week starts on Monday 5.
THIS_MONDAY = date(2026, 10, 5)
LAST_MONDAY = date(2026, 9, 28)


def test_the_longest_conversation_is_the_longest_one_that_counts(partners: Practice) -> None:
    assert partners.conversations.longest(USER) == 0

    talked(partners, "rtc_1", at=NOON - 3 * HOUR, minutes=5)
    talked(partners, "rtc_2", at=NOON - 2 * HOUR, minutes=9)
    # Nothing was said in the longest call, and the other one is someone else's.
    talked(partners, "rtc_3", at=NOON - HOUR, minutes=10, learner_says=())
    talked(partners, "rtc_4", at=NOON, minutes=10, partner=None, user=OTHER_USER)

    assert partners.conversations.longest(USER) == 540


def reported(
    reports: Reports,
    call_id: str,
    at: datetime,
    *,
    user: UUID = USER,
    categories: tuple[str, ...] = (),
    unconfirmed: tuple[str, ...] = (),
    words: tuple[int, int] = (20, 15),
    target: str = "de",
) -> None:
    """A conversation at `at` whose ready report has a confirmed mistake of each of
    `categories`, an unconfirmed one of each of `unconfirmed`, and `words` said by the learner
    and by the partner."""
    reports.calls.started(
        VoiceSession(call_id, user, CallPurpose.PRACTICE, "gpt-realtime-2.1-mini", at)
    )
    mistakes = tuple(
        Mistake(1, f"falsch {n}", f"richtig {n}", "…", category, "minor", certain)
        for certain, group in ((True, categories), (False, unconfirmed))
        for n, category in enumerate(group)
    )
    ask(reports.reports, call_id, at)
    reports.reports.written(
        call_id,
        "ready",
        replace(
            REPORT,
            target=target,
            mistakes=mistakes,
            stats=Stats(words[0], words[1], learner_turns=3, longest_turn_words=9),
        ),
    )


def by_week(found: list[WeekMistakes]) -> list[tuple[date, str, int]]:
    return sorted((item.week, item.category, item.count) for item in found)


def test_confirmed_mistakes_are_counted_per_kind_and_week(reports: Reports) -> None:
    reported(reports, "rtc_a", NOON - 7 * DAY, categories=("case_dative", "case_dative"))
    reported(
        reports,
        "rtc_b",
        NOON - DAY,
        categories=("case_dative", "word_order_v2"),
        unconfirmed=("negation",),
    )
    reported(reports, "rtc_c", NOON, categories=("word_order_v2", "word_order_v2"))
    # Before the weeks asked for, in another language, or someone else's.
    reported(reports, "rtc_d", NOON - 30 * DAY, categories=("plural_form",))
    reported(reports, "rtc_e", NOON, categories=("conjugation",), target="fr")
    reported(reports, "rtc_f", NOON, categories=("conjugation",), user=OTHER_USER)

    found = reports.reports.mistakes_by_week(USER, "de", None, LAST_MONDAY)

    assert by_week(found) == [
        (LAST_MONDAY, "case_dative", 2),
        (THIS_MONDAY, "case_dative", 1),
        (THIS_MONDAY, "word_order_v2", 3),
    ]


def test_a_report_that_is_not_ready_has_no_mistakes_to_count(reports: Reports) -> None:
    ask(reports.reports, "rtc_1", NOON)

    assert reports.reports.mistakes_by_week(USER, "de", None, LAST_MONDAY) == []


@pytest.mark.parametrize("unknown", ["Mars/Olympus", "", None])
def test_the_week_of_a_mistake_is_cut_in_the_learners_time_zone(
    reports: Reports, unknown: str | None
) -> None:
    # Sunday 4 October, 23:30 in UTC: already Monday in Zurich.
    late_sunday = datetime(2026, 10, 4, 23, 30, tzinfo=UTC)
    reported(reports, "rtc_a", late_sunday, categories=("case_dative",))

    zurich = reports.reports.mistakes_by_week(USER, "de", "Europe/Zurich", LAST_MONDAY)
    utc = reports.reports.mistakes_by_week(USER, "de", unknown, LAST_MONDAY)

    assert by_week(zurich) == [(THIS_MONDAY, "case_dative", 1)]
    assert by_week(utc) == [(LAST_MONDAY, "case_dative", 1)]


def test_words_are_added_up_since_a_moment_and_the_most_in_one_conversation_ever(
    reports: Reports,
) -> None:
    reported(reports, "rtc_a", NOON - 40 * DAY, words=(400, 10))
    reported(reports, "rtc_b", NOON - 3 * DAY, words=(60, 40))
    reported(reports, "rtc_c", NOON, words=(90, 60))
    reported(reports, "rtc_d", NOON, words=(900, 900), target="fr")
    reported(reports, "rtc_e", NOON, words=(700, 700), user=OTHER_USER)
    # A report that is not ready has no words yet.
    ask(reports.reports, "rtc_1", NOON)

    totals = reports.reports.totals(USER, "de", NOON - 30 * DAY)

    assert totals == ReportTotals(learner_words=150, partner_words=100, most_words=400)
    assert reports.reports.totals(USER, "it", NOON - 30 * DAY) == ReportTotals(0, 0, 0)


def test_reviews_are_added_up_for_a_learners_deck(cards: CardRepository) -> None:
    def review(number: int, position: int, rating: Rating, at: datetime) -> None:
        after = card(number, reviewed_at=at, memory=Memory(2.0, 5.0), reviews=position)
        assert cards.reviewed(USER, after, rating, position - 1) is True

    for number in (1, 2, 3, 4):
        add(cards, card(number, f"Wort{number}"))
    add(cards, card(5, "mot"), language="fr")
    add(cards, card(6, "Wort6"), user=OTHER_USER)
    review(1, 1, "good", NOON - 45 * DAY)
    review(1, 2, "good", NOON - 5 * DAY)
    review(2, 1, "again", NOON - 5 * DAY)
    review(3, 1, "easy", NOON)
    cards.reviewed(
        OTHER_USER, card(6, reviewed_at=NOON, memory=Memory(2.0, 5.0), reviews=1), "good", 0
    )

    totals = cards.totals(USER, "de", NOON - 30 * DAY)

    assert totals == CardTotals(learned=3, reviews=3, remembered=2, reviews_ever=4)
    assert cards.totals(USER, "fr", NOON - 30 * DAY) == CardTotals(0, 0, 0, 0)


def test_a_removed_card_takes_its_reviews_with_it(cards: CardRepository) -> None:
    add(cards, card(1))
    cards.reviewed(USER, card(1, reviewed_at=NOON, memory=Memory(2.0, 5.0), reviews=1), "good", 0)

    cards.remove(USER, card(1).id)

    assert cards.totals(USER, "de", NOON - DAY) == CardTotals(0, 0, 0, 0)


# --- Memories --------------------------------------------------------------------------------


@dataclass
class Memories:
    personas: PersonaRepository
    memories: MemoryRepository


@pytest.fixture(params=["memory", "postgres"])
def memories(request: pytest.FixtureRequest) -> Memories:
    """Memory storage for a learner with two partners and the call `rtc_1`."""
    if request.param == "memory":
        calls: VoiceSessionRepository = InMemoryVoiceSessionRepository()
        stored = Memories(InMemoryPersonaRepository(), InMemoryMemoryRepository(calls))  # type: ignore[arg-type]
    else:
        db: SqlClient = request.getfixturevalue("db")
        calls = SqlVoiceSessionRepository(db)
        stored = Memories(SqlPersonaRepository(db), SqlMemoryRepository(db))
    stored.personas.add(USER, "de", [LENA, JONAS])
    calls.started(VoiceSession("rtc_1", USER, CallPurpose.PRACTICE, "gpt-realtime-2.1-mini", NOON))
    return stored


def remembered(number: int, text: str = "Habite à Zurich.", **changes: Any) -> Remembered:
    """A fact every partner knows, written down `number` minutes after noon."""
    made = NOON + timedelta(minutes=number)
    fields: dict[str, Any] = {
        "id": UUID(f"eeeeeeee-eeee-4eee-8eee-{number:012d}"),
        "kind": "fact",
        "text": text,
        "day": None,
        "importance": 2,
        "persona_id": None,
        "source_call_id": None,
        "created_at": made,
        "updated_at": made,
    }
    return Remembered(**{**fields, **changes})


def keep(memories: MemoryRepository, new: Remembered, *, user: UUID = USER) -> bool:
    return memories.add(user, memory_key(new.text), new, 100)


def test_a_memory_is_read_back_as_it_was_stored(memories: Memories) -> None:
    berlin = timezone(timedelta(hours=2))
    new = remembered(
        1,
        "A un entretien : « logistique » !",
        kind="event",
        day=date(2026, 10, 16),
        importance=3,
        source_call_id="rtc_1",
        created_at=NOON.astimezone(berlin),
        updated_at=(NOON + HOUR).astimezone(berlin),
    )

    stored = keep(memories.memories, new)

    assert stored is True
    assert memories.memories.get(USER, new.id) == replace(
        new, created_at=NOON, updated_at=NOON + HOUR
    )
    assert memories.memories.listed(USER) == [memories.memories.get(USER, new.id)]


def test_a_memory_can_belong_to_one_partner(memories: Memories) -> None:
    new = remembered(1, "Lena a parlé de sa chatte.", kind="relationship", persona_id=LENA.id)

    keep(memories.memories, new)

    assert memories.memories.get(USER, new.id) == new


def test_the_same_memory_is_not_stored_twice(memories: Memories) -> None:
    keep(memories.memories, remembered(1))

    assert keep(memories.memories, remembered(2, "habite à ZURICH !")) is False
    assert memories.memories.get(USER, remembered(2).id) is None
    # The same words are another memory when they are one partner's, or another learner's.
    assert keep(memories.memories, remembered(3, persona_id=LENA.id)) is True
    assert keep(memories.memories, remembered(4, persona_id=LENA.id)) is False
    assert keep(memories.memories, remembered(5, persona_id=JONAS.id)) is True
    assert keep(memories.memories, remembered(6), user=OTHER_USER) is True


def test_a_learner_has_room_for_only_so_many_memories(memories: Memories) -> None:
    for number in (1, 2):
        memories.memories.add(
            USER, f"souvenir {number}", remembered(number, f"Souvenir {number}"), 2
        )

    assert memories.memories.add(USER, "souvenir 3", remembered(3, "Souvenir 3"), 2) is False
    # The limit is each learner's own.
    assert memories.memories.add(OTHER_USER, "souvenir 4", remembered(4, "Souvenir 4"), 2) is True
    assert len(memories.memories.listed(USER)) == 2


def test_memories_are_listed_newest_first_for_their_owner_only(memories: Memories) -> None:
    for number in (1, 2, 3):
        keep(memories.memories, remembered(number, f"Souvenir {number}"))
    # Written down at the same moment as the third: the later id comes first.
    keep(memories.memories, remembered(4, "Souvenir 4", created_at=remembered(3).created_at))
    keep(memories.memories, remembered(5, "Souvenir 5"), user=OTHER_USER)

    assert [memory.text for memory in memories.memories.listed(USER)] == [
        "Souvenir 4",
        "Souvenir 3",
        "Souvenir 2",
        "Souvenir 1",
    ]
    assert memories.memories.get(OTHER_USER, remembered(1).id) is None
    assert memories.memories.get(USER, remembered(9).id) is None


def test_a_memory_is_stored_anew_by_its_owner_only(memories: Memories) -> None:
    keep(memories.memories, remembered(1, kind="event", day=date(2026, 10, 16)))
    now = replace(
        remembered(1),
        kind="fact",
        text="Habite à Winterthour.",
        importance=3,
        persona_id=LENA.id,
        source_call_id="rtc_1",
        updated_at=NOON + HOUR,
    )

    assert memories.memories.replace(OTHER_USER, "habite à winterthour", now) is False
    assert memories.memories.get(USER, now.id) == remembered(
        1, kind="event", day=date(2026, 10, 16)
    )

    assert memories.memories.replace(USER, "habite à winterthour", now) is True
    assert memories.memories.get(USER, now.id) == now
    # Its old words are free again, and its new ones taken.
    assert keep(memories.memories, remembered(2, persona_id=LENA.id)) is True
    assert (
        keep(memories.memories, remembered(3, "Habite à Winterthour", persona_id=LENA.id)) is False
    )


def test_a_memory_that_is_not_there_cannot_be_stored_anew(memories: Memories) -> None:
    assert memories.memories.replace(USER, "habite à zurich", remembered(1)) is False
    assert memories.memories.listed(USER) == []


def test_a_memory_cannot_take_the_words_of_another_one(memories: Memories) -> None:
    keep(memories.memories, remembered(1))
    keep(memories.memories, remembered(2, "Aime le football."))

    same = replace(remembered(2), text="Habite à Zurich !")

    assert memories.memories.replace(USER, "habite à zurich", same) is False
    assert memories.memories.get(USER, same.id) == remembered(2, "Aime le football.")
    # Storing a memory again under its own words is not taking another one's.
    assert (
        memories.memories.replace(USER, "aime le football", remembered(2, "Aime le football !"))
        is True
    )


def test_a_memory_is_forgotten_by_its_owner_only(memories: Memories) -> None:
    keep(memories.memories, remembered(1))

    assert memories.memories.remove(OTHER_USER, remembered(1).id) is False
    assert memories.memories.remove(USER, remembered(2).id) is False
    assert memories.memories.get(USER, remembered(1).id) is not None

    assert memories.memories.remove(USER, remembered(1).id) is True
    assert memories.memories.listed(USER) == []
    # What was forgotten can be learned again.
    assert keep(memories.memories, remembered(2)) is True


def test_a_call_nobody_allowed_cannot_be_taken(memories: Memories) -> None:
    """Without a record that it may be read, a conversation is not read: the record is made
    when it ends with memory on, and whatever goes wrong before that leaves it unread."""
    assert memories.memories.claim("rtc_1", NOON) is False


def test_an_allowed_call_is_taken_once_to_write_its_memories_down(memories: Memories) -> None:
    memories.memories.allow("rtc_1", NOON)

    assert memories.memories.claim("rtc_1", NOON + HOUR) is True
    assert memories.memories.claim("rtc_1", NOON + HOUR) is False


def test_a_call_that_was_taken_is_not_allowed_anew(memories: Memories) -> None:
    memories.memories.allow("rtc_1", NOON)
    memories.memories.claim("rtc_1", NOON)

    memories.memories.allow("rtc_1", NOON + HOUR)

    assert memories.memories.claim("rtc_1", NOON + HOUR) is False


def test_a_call_that_was_let_go_can_be_taken_again(memories: Memories) -> None:
    memories.memories.allow("rtc_1", NOON)
    memories.memories.claim("rtc_1", NOON)

    memories.memories.release("rtc_1")

    assert memories.memories.claim("rtc_1", NOON + HOUR) is True


def test_letting_go_does_not_allow_a_call_that_never_was(memories: Memories) -> None:
    memories.memories.release("rtc_1")

    assert memories.memories.claim("rtc_1", NOON) is False


def test_a_call_that_does_not_exist_cannot_be_allowed_or_taken(memories: Memories) -> None:
    memories.memories.allow("rtc_ghost", NOON)

    assert memories.memories.claim("rtc_ghost", NOON) is False
    memories.memories.release("rtc_ghost")


def test_workers_arriving_together_take_a_call_once(db: SqlClient, postgres_uri: str) -> None:
    """Of twelve workers started for one conversation at the same moment, one reads it."""
    SqlVoiceSessionRepository(db).started(
        VoiceSession("rtc_1", USER, CallPurpose.PRACTICE, "gpt-realtime-2.1-mini", NOON)
    )
    SqlMemoryRepository(db).allow("rtc_1", NOON)
    schema = db.execute("SELECT current_schema() AS name")[0]["name"]
    barrier = threading.Barrier(12)

    def claim() -> bool:
        with psycopg.connect(postgres_uri, autocommit=True) as connection:
            connection.execute(f'SET search_path TO "{schema}"')
            barrier.wait()
            return SqlMemoryRepository(LocalSqlClient(connection)).claim("rtc_1", NOON)

    with ThreadPoolExecutor(max_workers=12) as pool:
        taken = [future.result() for future in [pool.submit(claim) for _ in range(12)]]

    assert sorted(taken) == [False] * 11 + [True]


def test_removing_a_partner_forgets_what_was_theirs(db: SqlClient) -> None:
    personas, stored = SqlPersonaRepository(db), SqlMemoryRepository(db)
    personas.add(USER, "de", [LENA])
    keep(stored, remembered(1))
    keep(stored, remembered(2, "Lena a parlé de sa chatte.", persona_id=LENA.id))

    personas.remove(USER, LENA.id)

    assert stored.listed(USER) == [remembered(1)]


def test_a_deleted_learner_has_no_memories_left(db: SqlClient) -> None:
    stored = SqlMemoryRepository(db)
    SqlVoiceSessionRepository(db).started(
        VoiceSession("rtc_1", USER, CallPurpose.PRACTICE, "gpt-realtime-2.1-mini", NOON)
    )
    stored.allow("rtc_1", NOON)
    keep(stored, remembered(1, source_call_id="rtc_1"))

    SqlAccountRepository(db).delete(USER, NOON)

    assert stored.listed(USER) == []
    assert db.execute("SELECT 1 AS left FROM memory_extraction") == []
    # Nothing can be written down for them again.
    with pytest.raises(psycopg.Error):
        keep(stored, remembered(2))


# --- Role-play ---------------------------------------------------------------------------------


def test_a_role_play_keeps_its_scenario_and_the_goals_reached(partners: Practice) -> None:
    partners.calls.started(
        VoiceSession(
            "rtc_bakery", USER, CallPurpose.PRACTICE, "m", NOON, LENA.id, scenario="bakery"
        )
    )
    turns = (Turn("persona", "Guten Morgen!"), Turn("learner", "Zwei Brötchen, bitte."))
    partners.calls.finish("rtc_bakery", FinishedCall(NOON + HOUR, "closed", USAGE, turns))

    partners.calls.goals_reached("rtc_bakery", ("order", "pay"))

    stored = partners.calls.get("rtc_bakery")
    assert stored is not None
    assert stored.scenario == "bakery"
    conversation = partners.conversations.get(USER, "rtc_bakery")
    assert conversation is not None
    assert (conversation.scenario, conversation.goals_reached) == ("bakery", ("order", "pay"))
    assert partners.conversations.listed(USER, 5, None)[0].goals_reached == ("order", "pay")


def test_a_free_conversation_has_no_scenario_and_no_goals(partners: Practice) -> None:
    talked(partners, "rtc_1", at=NOON)

    conversation = partners.conversations.get(USER, "rtc_1")

    assert conversation is not None
    assert (conversation.scenario, conversation.goals_reached) == (None, ())
