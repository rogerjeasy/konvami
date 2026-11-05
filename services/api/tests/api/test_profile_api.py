"""Over HTTP: what a partner changed by voice, undoing it (spec §6.1.3), and the question about
a setting that is due (spec §6.1.2)."""

from datetime import timedelta
from uuid import UUID

import pytest

from konvami_api.api.app import Services
from konvami_api.domain.profile import Change, Origin, Source
from tests.api.conftest import USER, Call
from tests.api.test_api import NOON, onboarded, talked
from tests.fakes import InMemoryVoiceSessionRepository, ScriptedTextModel

# --- Changes made by voice ---------------------------------------------------------------------


@pytest.fixture
def changed(call: Call, text_model: ScriptedTextModel, services: Services) -> int:
    """A learner who asked a partner to explain in French; returns the change's number."""
    onboarded(call, text_model)
    return _change_by_voice(services, "explanation_language", "fr")


def _change_by_voice(services: Services, field: str, value: str) -> int:
    """What the partner's tool does: a change with the origin voice."""
    services.profiles.apply(
        UUID(USER), [Change(field, value)], source=Source.ASKED, origin=Origin.VOICE
    )
    target = services.profiles.get(UUID(USER)).target_language or ""
    change_id = services.profiles.history(UUID(USER), target, field)[-1].id
    assert change_id is not None
    return change_id


def test_a_learner_reads_what_a_partner_changed_by_voice(call: Call, changed: int) -> None:
    response = call("GET", "/v1/profile/changes")

    assert response.status == 200
    [entry] = response.body["changes"]
    assert entry["id"] == changed
    assert (entry["field"], entry["oldValue"], entry["newValue"]) == (
        "explanation_language",
        "en",
        "fr",
    )
    assert entry["undoable"] is True


def test_a_learner_undoes_a_change(call: Call, changed: int, services: Services) -> None:
    response = call("POST", f"/v1/profile/changes/{changed}/undo")

    assert response.status == 200
    assert response.body["changes"][0]["undoable"] is False
    profile = services.profiles.get(UUID(USER))
    assert profile.value("de", "explanation_language") == "en"


def test_a_change_that_something_changed_since_cannot_be_undone(
    call: Call, changed: int, services: Services
) -> None:
    _change_by_voice(services, "explanation_language", "it")

    response = call("POST", f"/v1/profile/changes/{changed}/undo")

    assert (response.status, response.body["error"]["code"]) == (409, "superseded")


def test_a_change_that_does_not_exist_is_not_found(call: Call, changed: int) -> None:
    response = call("POST", f"/v1/profile/changes/{changed + 99}/undo")

    assert (response.status, response.body["error"]["code"]) == (404, "not_found")


# --- Questions ---------------------------------------------------------------------------------


def test_nothing_is_asked_before_the_first_conversation(
    call: Call, text_model: ScriptedTextModel
) -> None:
    onboarded(call, text_model)

    response = call("GET", "/v1/profile/question")

    assert (response.status, response.body) == (200, {"question": None})


def test_the_audio_question_comes_after_the_first_conversation_and_is_answered(
    call: Call,
    text_model: ScriptedTextModel,
    calls: InMemoryVoiceSessionRepository,
    services: Services,
) -> None:
    [lena, _] = onboarded(call, text_model)
    talked(calls, "rtc_1", lena, at=NOON - timedelta(days=1))

    asked = call("GET", "/v1/profile/question")
    answered = call("POST", "/v1/profile/questions/recordings/answer", {"option": "stop"})

    assert asked.body == {"question": {"id": "recordings", "options": ["keep", "stop"]}}
    assert (answered.status, answered.body) == (200, {"question": None})
    assert not services.profiles.get(UUID(USER)).recordings_kept
    assert call("GET", "/v1/profile/question").body == {"question": None}


def test_a_dismissed_question_is_not_asked_again_at_once(
    call: Call,
    text_model: ScriptedTextModel,
    calls: InMemoryVoiceSessionRepository,
) -> None:
    [lena, _] = onboarded(call, text_model)
    talked(calls, "rtc_1", lena, at=NOON - timedelta(days=1))

    dismissed = call("POST", "/v1/profile/questions/recordings/dismiss")

    assert dismissed.status == 200
    assert call("GET", "/v1/profile/question").body == {"question": None}


@pytest.mark.parametrize(
    ("path", "body", "status", "code"),
    [
        ("/v1/profile/questions/recordings/answer", {"option": "maybe"}, 422, "invalid_option"),
        ("/v1/profile/questions/colour/answer", {"option": "keep"}, 404, "not_found"),
        ("/v1/profile/questions/colour/dismiss", None, 404, "not_found"),
    ],
)
def test_a_question_or_answer_that_does_not_exist_is_refused(
    call: Call,
    text_model: ScriptedTextModel,
    path: str,
    body: dict[str, str] | None,
    status: int,
    code: str,
) -> None:
    onboarded(call, text_model)

    response = call("POST", path, body)

    assert (response.status, response.body["error"]["code"]) == (status, code)
