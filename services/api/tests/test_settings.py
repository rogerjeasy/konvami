import json
from uuid import UUID

import pytest

from konvami_api.domain.costs import Budget
from konvami_api.domain.voice import CallPurpose
from konvami_api.settings import cost_settings, text_models, voice_settings

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
        "weekly_minutes": 60,
        "economy_models": {"onboarding": "gpt-realtime-2.1-mini"},
    }
)


def test_voice_settings_are_read_from_the_json_terraform_sets() -> None:
    settings = voice_settings(CONFIGURED)

    assert settings.models == {
        CallPurpose.ONBOARDING: "gpt-realtime-2.1-mini",
        CallPurpose.PLACEMENT: "gpt-realtime-2.1",
        CallPurpose.PRACTICE: "gpt-realtime-2.1-mini",
        # Settings written before exam simulations: an exam is voiced and timed as practice.
        CallPurpose.EXAM: "gpt-realtime-2.1-mini",
    }
    assert settings.max_seconds[CallPurpose.EXAM] == 600
    assert settings.max_seconds[CallPurpose.PLACEMENT] == 720
    assert settings.max_seconds[CallPurpose.PRACTICE] == 600
    assert (settings.voice, settings.transcription_model, settings.weekly_seconds) == (
        "marin",
        "gpt-transcribe",
        3600,
    )
    assert settings.economy_models == {CallPurpose.ONBOARDING: "gpt-realtime-2.1-mini"}


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


def test_the_report_model_is_read_with_the_text_models() -> None:
    models = text_models(
        '{"assessment": "gpt-6.1-sol", "personas": "gpt-6-luna", "report": "gpt-6.1-sol"}'
    )

    assert models.report == "gpt-6.1-sol"


def test_settings_written_before_there_were_reports_still_work() -> None:
    models = text_models('{"assessment": "gpt-6.1-sol", "personas": "gpt-6-luna"}')

    # Without a report model no report is written; everything else works.
    assert models.report == ""


def test_the_memory_model_is_read_with_the_text_models() -> None:
    models = text_models(
        '{"assessment": "gpt-6.1-sol", "personas": "gpt-6-luna", "memory": "gpt-6-luna"}'
    )

    assert models.memory == "gpt-6-luna"


def test_settings_written_before_there_was_memory_still_work() -> None:
    models = text_models('{"assessment": "gpt-6.1-sol", "personas": "gpt-6-luna"}')

    # Without a memory model nothing is written down after a conversation; everything else works.
    assert models.memory == ""


def test_the_verbatim_model_is_read_with_the_text_models() -> None:
    models = text_models('{"assessment": "a", "personas": "p", "verbatim": "gpt-transcribe"}')

    assert models.verbatim == "gpt-transcribe"


def test_settings_written_before_there_were_recordings_have_no_verbatim_pass() -> None:
    assert text_models('{"assessment": "a", "personas": "p"}').verbatim == ""


def test_the_tutor_model_is_read_with_the_text_models() -> None:
    assert text_models('{"assessment": "a", "personas": "p", "tutor": "gpt-6.1-sol"}').tutor == (
        "gpt-6.1-sol"
    )
    assert text_models('{"assessment": "a", "personas": "p"}').tutor == ""


def test_cost_settings_are_read_from_the_json_terraform_sets() -> None:
    settings = cost_settings(
        json.dumps(
            {
                "prices": {"gpt-6.1-sol": {"input_tokens": 2, "output_tokens": 10.5}},
                "target_usd": 150,
                "ceiling_usd": 250,
                "owners": ["33333333-3333-4333-8333-333333333333"],
            }
        )
    )

    assert settings.prices == {"gpt-6.1-sol": {"input_tokens": 2.0, "output_tokens": 10.5}}
    assert settings.budget == Budget(target_usd=150, ceiling_usd=250)
    assert settings.owners == frozenset({UUID("33333333-3333-4333-8333-333333333333")})


@pytest.mark.parametrize("missing", [None, ""])
def test_without_cost_settings_nothing_is_priced_and_nothing_is_spent(missing: str | None) -> None:
    settings = cost_settings(missing)

    assert settings.prices == {}
    assert settings.owners == frozenset()
    # No ceiling to reach: an environment without the setting is not stopped by it.
    assert settings.budget.ceiling_usd == float("inf")


def test_a_broken_cost_setting_is_named_at_start_up() -> None:
    with pytest.raises(RuntimeError, match="KONVAMI_COSTS"):
        cost_settings('{"prices": {}, "target_usd": 150, "ceiling_usd": 100, "owners": []}')


def test_the_live_checks_model_is_read_with_the_text_models() -> None:
    models = text_models('{"assessment": "a", "personas": "p", "spotter": "gpt-6-luna"}')

    assert models.spotter == "gpt-6-luna"
    # Settings from before the Live Error Spotter: no live checks.
    assert text_models('{"assessment": "a", "personas": "p"}').spotter == ""


def test_the_weekly_check_in_model_is_read_with_the_text_models() -> None:
    models = text_models('{"assessment": "gpt-6.1-sol", "personas": "gpt-6-luna", "week": "m"}')

    assert models.week == "m"
    # Written before weekly check-ins: none is set, and the memory model writes them.
    assert text_models('{"assessment": "a", "personas": "p"}').week == ""
