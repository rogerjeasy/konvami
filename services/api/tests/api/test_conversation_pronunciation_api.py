from dataclasses import replace

import pytest

from konvami_api.api.app import Services
from konvami_api.domain.plan import SessionPlan
from tests.api.conftest import Call
from tests.api.test_recordings_api import recorded
from tests.domain.test_conversation_pronunciation import Assessor
from tests.fakes import InMemoryVoiceSessionRepository, ScriptedTextModel


def test_saved_recording_assessment_requires_consent_and_returns_provider_scores(
    call: Call,
    text_model: ScriptedTextModel,
    calls: InMemoryVoiceSessionRepository,
    services: Services,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    recorded(call, text_model, calls, services)
    calls.sessions["rtc_1"] = replace(calls.sessions["rtc_1"], plan=SessionPlan(language="de"))
    assessor = Assessor()
    monkeypatch.setattr(services.pronunciation, "_assessor", assessor)
    path = "/v1/pronunciation/conversations/rtc_1/turns/1"
    payload = {"recording": {"audio": "AAEAAQAB" * 40, "format": "wav"}}
    refused = call("POST", path, payload)
    assert refused.body["error"]["code"] == "consent_required"
    assert assessor.references == []
    accepted = call("POST", path, {**payload, "assessmentConsent": True})
    assert accepted.status == 200
    assert accepted.body["assessment"]["provider"] == assessor.provider
    assert accepted.body["assessment"]["accuracy"] == 80
    assert assessor.references == ["Gut, dank."]
