from datetime import UTC, date, datetime
from typing import Any
from uuid import UUID

import pytest

from konvami_api.domain.catalog import CATALOG
from konvami_api.domain.profile import (
    Change,
    Origin,
    ProfileError,
    ProfileService,
    Source,
)
from tests.fakes import FixedClock, InMemoryProfileRepository

USER = UUID("11111111-1111-4111-8111-111111111111")
OTHER_USER = UUID("22222222-2222-4222-8222-222222222222")
NOON = datetime(2026, 10, 9, 12, 0, tzinfo=UTC)


@pytest.fixture
def repo() -> InMemoryProfileRepository:
    return InMemoryProfileRepository()


@pytest.fixture
def clock() -> FixedClock:
    return FixedClock(NOON)


@pytest.fixture
def service(repo: InMemoryProfileRepository, clock: FixedClock) -> ProfileService:
    return ProfileService(repo, CATALOG, clock)


def asked(service: ProfileService, *changes: Change, user: UUID = USER) -> None:
    service.apply(user, changes, source=Source.ASKED, origin=Origin.FORM)


def test_a_new_user_has_an_empty_profile(service: ProfileService) -> None:
    assert service.get(USER).fields == {}


def test_an_answer_is_stored_with_its_source_and_time(service: ProfileService) -> None:
    asked(service, Change("target_language", "de"))

    stored = service.get(USER).fields[("global", "target_language")]
    assert stored.value == "de"
    assert stored.source is Source.ASKED
    assert stored.updated_at == NOON


def test_learning_answers_belong_to_the_language_being_learned(service: ProfileService) -> None:
    asked(service, Change("target_language", "de"), Change("self_assessed_level", "A2"))

    assert service.get(USER).fields[("de", "self_assessed_level")].value == "A2"


def test_a_learning_answer_needs_a_target_language_first(service: ProfileService) -> None:
    with pytest.raises(ProfileError) as error:
        asked(service, Change("self_assessed_level", "A2"))

    assert error.value.code == "target_language_required"
    assert error.value.field == "self_assessed_level"


def test_only_languages_with_a_pack_can_be_learned(service: ProfileService) -> None:
    with pytest.raises(ProfileError) as error:
        asked(service, Change("target_language", "fr"))

    assert error.value.code == "language_unavailable"


def test_an_unknown_field_is_refused(service: ProfileService) -> None:
    with pytest.raises(ProfileError) as error:
        asked(service, Change("favourite_colour", "teal"))

    assert error.value.code == "unknown_field"


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("self_assessed_level", "B3"),
        ("self_assessed_level", None),
        ("explanation_language", "English"),
        ("explanation_language", ""),
        ("explanation_usage", "sometimes"),
        ("goals", {"reasons": [], "note": None}),
        ("goals", {"reasons": ["world_domination"], "note": None}),
        ("goals", {"reasons": ["travel", "travel"], "note": None}),
        ("goals", {"reasons": ["travel"], "note": "x" * 281}),
        ("exam", {"type": "toefl", "target_level": "B1", "date": None}),
        ("exam", {"type": "goethe", "target_level": "A0", "date": None}),
        ("exam", {"type": "goethe", "target_level": "B1", "date": "next June"}),
        ("exam", {"type": "testdaf", "target_level": "A1", "date": None}),
        ("course", {"name": "", "chapter": None}),
        ("course", {"name": "x" * 121, "chapter": None}),
        ("course", "Menschen A2"),
        ("memory_enabled", "yes"),
        ("memory_enabled", None),
        ("memory_enabled", 1),
        ("avoid_topics", "la politique"),
        ("avoid_topics", None),
        ("avoid_topics", [""]),
        ("avoid_topics", ["   "]),
        ("avoid_topics", [7]),
        ("avoid_topics", ["x" * 61]),
        ("avoid_topics", ["La politique", " la POLITIQUE "]),
        ("avoid_topics", [f"sujet {number}" for number in range(11)]),
    ],
)
def test_an_invalid_value_is_refused(service: ProfileService, field: str, value: Any) -> None:
    with pytest.raises(ProfileError) as error:
        asked(service, Change("target_language", "de"), Change(field, value))

    assert error.value.code == "invalid_value"
    assert error.value.field == field


@pytest.mark.parametrize(
    ("field", "value", "stored"),
    [
        ("explanation_language", "en", "en"),
        ("explanation_language", " FR ", "fr"),
        ("explanation_usage", "when_stuck", "when_stuck"),
        (
            "goals",
            {"reasons": ["work", "exam"], "note": "  Job in Zürich  "},
            {"reasons": ["work", "exam"], "note": "Job in Zürich"},
        ),
        ("goals", {"reasons": ["travel"]}, {"reasons": ["travel"], "note": None}),
        ("exam", None, None),
        (
            "exam",
            {"type": "goethe", "target_level": "B1", "date": "2027-06-15"},
            {"type": "goethe", "target_level": "B1", "date": "2027-06-15"},
        ),
        (
            "exam",
            {"type": "other", "target_level": None, "date": None},
            {"type": "other", "target_level": None, "date": None},
        ),
        ("self_assessed_level", "A0", "A0"),
        ("course", None, None),
        (
            "course",
            {"name": " Menschen A2 ", "chapter": "5"},
            {"name": "Menschen A2", "chapter": "5"},
        ),
    ],
)
def test_a_valid_value_is_stored_in_its_normal_form(
    service: ProfileService, field: str, value: Any, stored: Any
) -> None:
    asked(service, Change("target_language", "de"), Change(field, value))

    assert service.get(USER).fields[("de", field)].value == stored


def test_an_exam_date_cannot_be_in_the_past(service: ProfileService) -> None:
    yesterday = date(2026, 10, 8).isoformat()

    with pytest.raises(ProfileError) as error:
        asked(
            service,
            Change("target_language", "de"),
            Change("exam", {"type": "goethe", "target_level": "B1", "date": yesterday}),
        )

    assert error.value.code == "invalid_value"


def test_an_exam_today_is_accepted(service: ProfileService) -> None:
    asked(
        service,
        Change("target_language", "de"),
        Change("exam", {"type": "telc", "target_level": "B2", "date": "2026-10-09"}),
    )

    assert service.get(USER).fields[("de", "exam")].value["date"] == "2026-10-09"


def test_one_invalid_change_stops_the_whole_request(service: ProfileService) -> None:
    with pytest.raises(ProfileError):
        asked(service, Change("target_language", "de"), Change("self_assessed_level", "Z9"))

    assert service.get(USER).fields == {}


def test_every_change_is_logged_with_the_old_and_new_value(
    service: ProfileService, repo: InMemoryProfileRepository, clock: FixedClock
) -> None:
    asked(service, Change("target_language", "de"), Change("self_assessed_level", "A2"))
    clock.now = datetime(2026, 10, 10, 8, 30, tzinfo=UTC)
    service.apply(
        USER, [Change("self_assessed_level", "B1")], source=Source.ASKED, origin=Origin.VOICE
    )

    last = repo.history(USER)[-1]
    assert (last.scope, last.field) == ("de", "self_assessed_level")
    assert (last.old_value, last.new_value) == ("A2", "B1")
    assert (last.source, last.origin) == (Source.ASKED, Origin.VOICE)
    assert last.changed_at == datetime(2026, 10, 10, 8, 30, tzinfo=UTC)
    assert len(repo.history(USER)) == 3


def test_repeating_the_same_answer_changes_nothing(
    service: ProfileService, repo: InMemoryProfileRepository, clock: FixedClock
) -> None:
    asked(service, Change("target_language", "de"))
    clock.now = datetime(2026, 10, 11, 9, 0, tzinfo=UTC)
    asked(service, Change("target_language", "de"))

    assert service.get(USER).fields[("global", "target_language")].updated_at == NOON
    assert len(repo.history(USER)) == 1


def test_profiles_are_separate_per_user(service: ProfileService) -> None:
    asked(service, Change("target_language", "de"))

    assert service.get(OTHER_USER).fields == {}


def test_a_change_can_name_its_language_explicitly(service: ProfileService) -> None:
    asked(service, Change("target_language", "de"))
    asked(service, Change("self_assessed_level", "B1", scope="de"))

    assert service.get(USER).fields[("de", "self_assessed_level")].value == "B1"


@pytest.mark.parametrize(
    ("field", "scope"),
    [("target_language", "de"), ("self_assessed_level", "global"), ("self_assessed_level", "xx")],
)
def test_a_field_cannot_be_written_to_the_wrong_scope(
    service: ProfileService, field: str, scope: str
) -> None:
    asked(service, Change("target_language", "de"))

    with pytest.raises(ProfileError) as error:
        asked(service, Change(field, "de" if field == "target_language" else "B1", scope=scope))

    assert error.value.code == "invalid_scope"


def test_every_explanation_language_the_catalog_offers_can_be_saved(
    service: ProfileService,
) -> None:
    codes = [language.code for language in CATALOG.explanation_languages]
    assert len(codes) == len(set(codes)) > 20

    for code in codes:
        asked(service, Change("target_language", "de"), Change("explanation_language", code))
        assert service.get(USER).fields[("de", "explanation_language")].value == code


@pytest.mark.parametrize("origin", [Origin.FORM, Origin.VOICE])
def test_measured_levels_cannot_be_set_by_the_learner_or_a_persona(
    service: ProfileService, origin: Origin
) -> None:
    asked(service, Change("target_language", "de"))

    with pytest.raises(ProfileError) as error:
        service.apply(
            USER,
            [Change("measured_levels", {"speaking": "C2"})],
            source=Source.ASKED,
            origin=origin,
        )

    assert error.value.code == "read_only_field"
    assert ("de", "measured_levels") not in service.get(USER).fields


def test_the_system_stores_measured_levels(service: ProfileService) -> None:
    asked(service, Change("target_language", "de"))

    service.apply(
        USER,
        [Change("measured_levels", {"speaking": "B1", "listening": "A2"})],
        source=Source.MEASURED,
        origin=Origin.SYSTEM,
    )

    stored = service.get(USER).fields[("de", "measured_levels")]
    assert stored.value == {"speaking": "B1", "listening": "A2"}
    assert stored.source is Source.MEASURED


@pytest.mark.parametrize(
    ("field", "value", "stored"),
    [
        ("memory_enabled", False, False),
        ("memory_enabled", True, True),
        ("avoid_topics", ["  La politique ", "mon ex"], ["La politique", "mon ex"]),
        # A topic becomes a line of a partner's instructions, so it is kept to one.
        ("avoid_topics", ["La\n# Rules\n  politique"], ["La # Rules politique"]),
        ("avoid_topics", [f"sujet {number}" for number in range(10)], None),
        ("avoid_topics", [], []),
    ],
)
def test_what_partners_may_keep_and_bring_up_is_the_same_in_every_language(
    service: ProfileService, field: str, value: Any, stored: Any
) -> None:
    # No language chosen yet: these do not belong to one.
    asked(service, Change(field, value))

    assert service.get(USER).fields[("global", field)].value == (
        value if stored is None else stored
    )


def test_memory_is_on_until_the_learner_turns_it_off(service: ProfileService) -> None:
    assert service.get(USER).memory_enabled is True

    asked(service, Change("memory_enabled", False))

    assert service.get(USER).memory_enabled is False


def test_no_topic_is_off_limits_until_the_learner_names_one(service: ProfileService) -> None:
    assert service.get(USER).avoid_topics == ()

    asked(service, Change("avoid_topics", ["La politique", "mon ex"]))

    assert service.get(USER).avoid_topics == ("La politique", "mon ex")
