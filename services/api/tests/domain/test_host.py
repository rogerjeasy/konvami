from datetime import UTC, datetime
from typing import Any
from uuid import UUID

import pytest

from konvami_api.domain.accounts import Account
from konvami_api.domain.catalog import CATALOG
from konvami_api.domain.host import HostTools, host_instructions
from konvami_api.domain.profile import Change, Origin, ProfileService, Source
from tests.fakes import FixedClock, InMemoryProfileRepository

USER = UUID("11111111-1111-4111-8111-111111111111")
NOON = datetime(2026, 10, 9, 12, 0, tzinfo=UTC)
AMARA = Account(first_name="Amara", language="fr", voice_consent=True)

EVERYTHING: list[tuple[str, dict[str, Any]]] = [
    ("save_target_language", {"language": "de"}),
    ("save_explanations", {"language": "fr", "usage": "when_stuck"}),
    ("save_goals", {"reasons": ["work", "exam"], "note": "Job in Zürich"}),
    ("save_exam", {"has_exam": True, "type": "goethe", "target_level": "B1", "date": None}),
    ("save_level", {"level": "A2"}),
    ("save_course", {"has_course": False, "name": None, "chapter": None}),
]


@pytest.fixture
def repo() -> InMemoryProfileRepository:
    return InMemoryProfileRepository()


@pytest.fixture
def profiles(repo: InMemoryProfileRepository) -> ProfileService:
    return ProfileService(repo, CATALOG, FixedClock(NOON))


@pytest.fixture
def tools(profiles: ProfileService) -> HostTools:
    return HostTools(USER, CATALOG, profiles)


def definition(tools: HostTools, name: str) -> dict[str, Any]:
    return next(tool for tool in tools.definitions() if tool["name"] == name)


def test_the_guide_gets_one_tool_per_question_and_one_to_finish(tools: HostTools) -> None:
    assert [tool["name"] for tool in tools.definitions()] == [
        "save_target_language",
        "save_explanations",
        "save_goals",
        "save_exam",
        "save_level",
        "save_course",
        "finish_setup",
    ]
    assert all(tool["type"] == "function" for tool in tools.definitions())


def test_tool_choices_come_from_the_catalog(tools: HostTools) -> None:
    language = definition(tools, "save_target_language")["parameters"]["properties"]["language"]
    exam = definition(tools, "save_exam")["parameters"]["properties"]
    level = definition(tools, "save_level")["parameters"]["properties"]["level"]

    assert language["enum"] == ["de"]
    assert exam["type"]["enum"] == ["goethe", "telc", "dtz", "testdaf", "osd", "other", None]
    assert level["enum"] == ["A0", "A1", "A2", "B1", "B2", "C1", "C2"]


def test_a_spoken_answer_is_saved_as_told_by_voice(
    tools: HostTools, profiles: ProfileService, repo: InMemoryProfileRepository
) -> None:
    result = tools.run("save_target_language", {"language": "de"})

    assert result.output == {
        "saved": True,
        "still_open": ["explanations", "goals", "exam", "level", "course"],
    }
    assert result.finished is False
    stored = profiles.get(USER).fields[("global", "target_language")]
    assert (stored.value, stored.source) == ("de", Source.ASKED)
    assert repo.history(USER)[0].origin is Origin.VOICE


def test_each_tool_writes_its_profile_fields(tools: HostTools, profiles: ProfileService) -> None:
    for name, arguments in EVERYTHING:
        assert tools.run(name, arguments).output["saved"] is True

    profile = profiles.get(USER)
    assert {field: profile.value("de", field) for _, field in profile.fields if _ == "de"} == {
        "explanation_language": "fr",
        "explanation_usage": "when_stuck",
        "goals": {"reasons": ["work", "exam"], "note": "Job in Zürich"},
        "exam": {"type": "goethe", "target_level": "B1", "date": None},
        "self_assessed_level": "A2",
        "course": None,
    }


def test_no_exam_and_a_course_are_saved_in_the_profiles_form(
    tools: HostTools, profiles: ProfileService
) -> None:
    tools.run("save_target_language", {"language": "de"})

    tools.run("save_exam", {"has_exam": False, "type": None, "target_level": None, "date": None})
    tools.run("save_course", {"has_course": True, "name": "Menschen A2", "chapter": "5"})

    profile = profiles.get(USER)
    assert ("de", "exam") in profile.fields
    assert profile.value("de", "exam") is None
    assert profile.value("de", "course") == {"name": "Menschen A2", "chapter": "5"}


@pytest.mark.parametrize(
    ("name", "arguments", "reason"),
    [
        ("save_target_language", {"language": "fr"}, "language_unavailable"),
        ("save_level", {"level": "B3"}, "invalid_value"),
        ("save_level", {}, "invalid_value"),
        ("save_goals", {"reasons": "work"}, "invalid_value"),
        ("save_exam", {"has_exam": True, "type": None}, "invalid_value"),
        ("save_course", {"has_course": True, "name": None}, "invalid_value"),
        ("order_pizza", {}, "unknown_tool"),
    ],
)
def test_an_answer_that_cannot_be_saved_is_reported_so_the_guide_can_ask_again(
    tools: HostTools, profiles: ProfileService, name: str, arguments: dict[str, Any], reason: str
) -> None:
    profiles.apply(USER, [Change("target_language", "de")], source=Source.ASKED, origin=Origin.FORM)
    before = dict(profiles.get(USER).fields)

    result = tools.run(name, arguments)

    assert result.output["saved"] is False
    assert result.output["reason"] == reason
    assert profiles.get(USER).fields == before


def test_a_learning_answer_before_the_language_is_reported(tools: HostTools) -> None:
    result = tools.run("save_level", {"level": "A2"})

    assert result.output == {"saved": False, "reason": "target_language_required"}


def test_setup_cannot_finish_with_questions_open(tools: HostTools) -> None:
    for name, arguments in EVERYTHING[:4]:
        tools.run(name, arguments)

    result = tools.run("finish_setup", {})

    assert result.output == {"done": False, "still_open": ["level", "course"]}
    assert result.finished is False


def test_setup_finishes_once_every_question_is_answered(tools: HostTools) -> None:
    for name, arguments in EVERYTHING:
        tools.run(name, arguments)

    result = tools.run("finish_setup", {})

    assert result.output == {"done": True}
    assert result.finished is True


def test_the_guide_greets_by_name_in_the_learners_language(profiles: ProfileService) -> None:
    text = host_instructions(AMARA, CATALOG, profiles.get(USER), NOON.date())

    assert "Amara" in text
    assert "Speak French" in text
    assert "2026-10-09" in text


def test_the_guide_is_told_what_is_saved_and_asks_only_what_is_open(
    tools: HostTools, profiles: ProfileService
) -> None:
    for name, arguments in EVERYTHING[:2]:
        tools.run(name, arguments)

    text = host_instructions(AMARA, CATALOG, profiles.get(USER), NOON.date())
    to_ask, saved = text.split("# Already saved")[0], text.split("# Already saved")[1]

    assert "save_goals" in to_ask
    assert "save_target_language" not in to_ask.split("# Still to ask")[1]
    assert "save_explanations" not in to_ask.split("# Still to ask")[1]
    assert "explanations in fr" in saved


def test_a_learner_without_a_name_is_not_called_anything(profiles: ProfileService) -> None:
    nameless = Account(first_name="", language="en", voice_consent=True)

    text = host_instructions(nameless, CATALOG, profiles.get(USER), NOON.date())

    assert "None" not in text
    assert "do not know the learner's name" in text
