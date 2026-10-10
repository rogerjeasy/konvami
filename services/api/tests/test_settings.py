import json

import pytest

from konvami_api.domain.voice import CallPurpose
from konvami_api.settings import text_models, voice_settings

CONFIGURED = json.dumps(
    {
        "models": {
            "onboarding": "gpt-realtime-2.1-mini",
            "placement": "gpt-realtime-2.1",
            "practice": "gpt-realtime-2.1-mini",
        },
        "max_seconds": {"onboarding": 480, "placement": 720, "practice": 600},
        "voice": "marin",
        "transcription_model": "gpt-transcribe",
        "daily_call_limit": 10,
    }
)


def test_voice_settings_are_read_from_the_json_terraform_sets() -> None:
    settings = voice_settings(CONFIGURED)

    assert settings.models == {
        CallPurpose.ONBOARDING: "gpt-realtime-2.1-mini",
        CallPurpose.PLACEMENT: "gpt-realtime-2.1",
        CallPurpose.PRACTICE: "gpt-realtime-2.1-mini",
    }
    assert settings.max_seconds[CallPurpose.PLACEMENT] == 720
    assert settings.max_seconds[CallPurpose.PRACTICE] == 600
    assert (settings.voice, settings.transcription_model, settings.daily_call_limit) == (
        "marin",
        "gpt-transcribe",
        10,
    )


@pytest.mark.parametrize("missing", [None, ""])
def test_without_voice_settings_no_call_purpose_is_available(missing: str | None) -> None:
    settings = voice_settings(missing)

    assert settings.models == {}
    assert settings.max_seconds == {}


def test_a_broken_setting_is_named_at_start_up() -> None:
    with pytest.raises(RuntimeError, match="KONVAMI_VOICE"):
        voice_settings('{"models": {"onboarding": 7}}')


def test_text_models_are_read_per_job() -> None:
    models = text_models('{"assessment": "gpt-6.1-sol", "personas": "gpt-6-luna"}')

    assert (models.assessment, models.personas) == ("gpt-6.1-sol", "gpt-6-luna")


@pytest.mark.parametrize("missing", [None, ""])
def test_without_text_models_the_jobs_get_none_and_fall_back(missing: str | None) -> None:
    models = text_models(missing)

    assert (models.assessment, models.personas, models.speech) == ("", "", "")


def test_broken_text_model_settings_are_named_at_start_up() -> None:
    with pytest.raises(RuntimeError, match="KONVAMI_TEXT_MODELS"):
        text_models('{"assessment": 7}')


def test_the_speech_model_is_read_with_the_text_models() -> None:
    models = text_models(
        '{"assessment": "gpt-6.1-sol", "personas": "gpt-6-luna", "speech": "gpt-4o-mini-tts"}'
    )

    assert models.speech == "gpt-4o-mini-tts"


def test_settings_written_before_there_was_a_speech_model_still_work() -> None:
    models = text_models('{"assessment": "gpt-6.1-sol", "personas": "gpt-6-luna"}')

    # Without a speech model there are no voice samples; everything else works.
    assert models.speech == ""
