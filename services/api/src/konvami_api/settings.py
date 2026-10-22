"""Settings the functions read from their environment (set by Terraform; never secrets)."""

import json
from dataclasses import dataclass

from pydantic import BaseModel, ConfigDict, ValidationError

from konvami_api.domain.voice import CallPurpose, VoiceSettings

VOICE_VARIABLE = "KONVAMI_VOICE"
TEXT_MODELS_VARIABLE = "KONVAMI_TEXT_MODELS"


class _Voice(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    models: dict[str, str]
    max_seconds: dict[str, int]
    voice: str
    transcription_model: str
    daily_call_limit: int


def voice_settings(raw: str | None) -> VoiceSettings:
    """The voice settings from the `KONVAMI_VOICE` JSON. Without it, no call can be started."""
    if not raw:
        return VoiceSettings({}, {}, voice="", transcription_model="", daily_call_limit=0)
    try:
        voice = _Voice.model_validate(json.loads(raw))
        return VoiceSettings(
            models={CallPurpose(purpose): model for purpose, model in voice.models.items()},
            max_seconds={CallPurpose(p): seconds for p, seconds in voice.max_seconds.items()},
            voice=voice.voice,
            transcription_model=voice.transcription_model,
            daily_call_limit=voice.daily_call_limit,
        )
    except (ValueError, ValidationError) as error:
        raise RuntimeError(f"{VOICE_VARIABLE} is not valid") from error


@dataclass(frozen=True)
class TextModels:
    """The text model for each background job (spec §17.3: the smallest that does the job well).
    An empty name means the job has no model and uses its fallback."""

    # Reads a placement test's transcript: accuracy matters.
    assessment: str
    # Writes the starter partners and drafts a partner from a description.
    personas: str
    # Speaks a voice's sample (Persona Studio). Not a text model, but set the same way.
    speech: str = ""
    # Writes a conversation's Session Report and checks its corrections a second time: accuracy
    # matters (spec §17.3 lever 5).
    report: str = ""
    # Reads a conversation for what is worth remembering about the learner (spec §6.11). A
    # small model (spec §17.3 lever 5): what it writes down the learner can see and put right.
    memory: str = ""
    # Writes a recorded learner turn down a second time, keeping their mistakes (spec §9.4).
    # A transcription model, set the same way. Empty: no verbatim pass.
    verbatim: str = ""


class _TextModels(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    assessment: str
    personas: str
    # Left out by settings written before voice samples, reports, memory or recordings existed.
    speech: str = ""
    report: str = ""
    memory: str = ""
    verbatim: str = ""


def text_models(raw: str | None) -> TextModels:
    """The text models from the `KONVAMI_TEXT_MODELS` JSON."""
    if not raw:
        return TextModels(assessment="", personas="")
    try:
        models = _TextModels.model_validate(json.loads(raw))
    except (ValueError, ValidationError) as error:
        raise RuntimeError(f"{TEXT_MODELS_VARIABLE} is not valid") from error
    return TextModels(
        assessment=models.assessment,
        personas=models.personas,
        speech=models.speech,
        report=models.report,
        memory=models.memory,
        verbatim=models.verbatim,
    )
