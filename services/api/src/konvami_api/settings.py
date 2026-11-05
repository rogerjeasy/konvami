"""Settings the functions read from their environment (set by Terraform; never secrets)."""

import json
from dataclasses import dataclass
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, ValidationError, model_validator

from konvami_api.domain.costs import Budget, Prices
from konvami_api.domain.plans import PlanSettings, Tier
from konvami_api.domain.premium_voices import PremiumVoice, PremiumVoices
from konvami_api.domain.voice import CallPurpose, VoiceSettings

VOICE_VARIABLE = "KONVAMI_VOICE"
TEXT_MODELS_VARIABLE = "KONVAMI_TEXT_MODELS"
COSTS_VARIABLE = "KONVAMI_COSTS"
PREMIUM_VOICES_VARIABLE = "KONVAMI_PREMIUM_VOICES"

PLANS_VARIABLE = "KONVAMI_PLANS"


class _Voice(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    models: dict[str, str]
    max_seconds: dict[str, int]
    voice: str
    transcription_model: str
    weekly_minutes: int
    economy_models: dict[str, str] = {}


def voice_settings(raw: str | None) -> VoiceSettings:
    """The voice settings from the `KONVAMI_VOICE` JSON. Without it, no call can be started."""
    if not raw:
        return VoiceSettings({}, {}, voice="", transcription_model="", weekly_seconds=0)
    try:
        voice = _Voice.model_validate(json.loads(raw))
        models = {CallPurpose(purpose): model for purpose, model in voice.models.items()}
        max_seconds = {CallPurpose(p): seconds for p, seconds in voice.max_seconds.items()}
        economy = {CallPurpose(p): m for p, m in voice.economy_models.items()}
        # Settings written before exam simulations: an exam is timed and voiced as practice.
        for settings in (models, max_seconds, economy):
            if CallPurpose.EXAM not in settings and CallPurpose.PRACTICE in settings:
                settings[CallPurpose.EXAM] = settings[CallPurpose.PRACTICE]  # type: ignore[assignment]
        return VoiceSettings(
            models=models,
            max_seconds=max_seconds,
            voice=voice.voice,
            transcription_model=voice.transcription_model,
            weekly_seconds=voice.weekly_minutes * 60,
            economy_models=economy,
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
    # Answers the learner's questions about the language (spec §6.8): accuracy matters.
    tutor: str = ""
    # Checks each of the learner's turns during a call (the Live Error Spotter, spec §8.2):
    # speed matters, and the report checks every mistake again. Empty: no live checks.
    spotter: str = ""
    # Writes a word card's forms (spec §6.7): accuracy matters, a wrong form is learnt by heart.
    # Empty: cards keep only their word, meaning and sentence.
    cards: str = ""
    # Writes the weekly check-in from last week's numbers (spec §6.12): a small model is
    # enough. Empty: the memory model writes it.
    week: str = ""


class _TextModels(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    assessment: str
    personas: str
    # Left out by settings written before voice samples, reports, memory, recordings, the Tutor
    # or the Live Error Spotter existed.
    speech: str = ""
    report: str = ""
    memory: str = ""
    verbatim: str = ""
    tutor: str = ""
    spotter: str = ""
    cards: str = ""
    week: str = ""


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
        tutor=models.tutor,
        spotter=models.spotter,
        cards=models.cards,
        week=models.week,
    )


@dataclass(frozen=True)
class CostSettings:
    """Prices, the monthly budget and who may see the costs (spec §6.19, decision D5)."""

    prices: Prices
    budget: Budget
    # The accounts (user pool subjects) that may open the owner's view.
    owners: frozenset[UUID]


class _Costs(BaseModel):
    model_config = ConfigDict(extra="forbid")

    # Per model, US dollars per million of each unit (tokens, characters, seconds of audio).
    prices: dict[str, dict[str, float]]
    target_usd: float = Field(gt=0)
    ceiling_usd: float = Field(gt=0)
    owners: list[UUID]

    @model_validator(mode="after")
    def _ceiling_above_target(self) -> "_Costs":
        if self.ceiling_usd < self.target_usd:
            raise ValueError("the ceiling is below the target")
        return self


def cost_settings(raw: str | None) -> CostSettings:
    """The cost settings from the `KONVAMI_COSTS` JSON. Without it nothing is priced, no level is
    ever reached and nobody sees the costs."""
    if not raw:
        return CostSettings({}, Budget(float("inf"), float("inf")), frozenset())
    try:
        costs = _Costs.model_validate(json.loads(raw))
    except (ValueError, ValidationError) as error:
        raise RuntimeError(f"{COSTS_VARIABLE} is not valid") from error
    return CostSettings(
        prices=costs.prices,
        budget=Budget(target_usd=costs.target_usd, ceiling_usd=costs.ceiling_usd),
        owners=frozenset(costs.owners),
    )


@dataclass(frozen=True)
class PremiumVoiceSettings:
    """The premium voices and who may use them (spec §6.21.2)."""

    voices: PremiumVoices
    # Everyone may use them while the app is in the testers' hands; off: the owners only. Replaced
    # by the subscription once there is one (`PremiumVoiceAccess`).
    open_to_testers: bool


class _PremiumVoice(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    id: str = Field(pattern=r"^[A-Za-z0-9]{1,64}$")
    name: str = Field(min_length=1)


class _PremiumVoices(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    # ElevenLabs' model id (its price is in the costs settings under the same name).
    model: str = ""
    voices: list[_PremiumVoice] = []
    open_to_testers: bool = True


def premium_voice_settings(raw: str | None) -> PremiumVoiceSettings:
    """The premium voices from the `KONVAMI_PREMIUM_VOICES` JSON. Without it, none are offered."""
    if not raw:
        return PremiumVoiceSettings(PremiumVoices(model=""), open_to_testers=True)
    try:
        parsed = _PremiumVoices.model_validate(json.loads(raw))
    except (ValueError, ValidationError) as error:
        raise RuntimeError(f"{PREMIUM_VOICES_VARIABLE} is not valid") from error
    voices = tuple(PremiumVoice(voice.id, voice.name) for voice in parsed.voices)
    return PremiumVoiceSettings(
        PremiumVoices(model=parsed.model, voices=voices), parsed.open_to_testers
    )


class _Plans(BaseModel):
    model_config = ConfigDict(extra="forbid")

    enforce: bool = False
    # Minutes per week of a tier where this environment differs from `plans.TIERS`.
    weekly_minutes: dict[Tier, int] = {}
    # Store product ids (as RevenueCat names them) of the subscriptions, and of the minute packs
    # with the minutes each adds.
    products: dict[str, Tier] = {}
    pack_minutes: dict[str, int] = {}


def plan_settings(raw: str | None) -> PlanSettings:
    """The plan settings from the `KONVAMI_PLANS` JSON. Without it plans are not enforced and no
    store product is known."""
    if not raw:
        return PlanSettings()
    try:
        plans = _Plans.model_validate(json.loads(raw))
    except (ValueError, ValidationError) as error:
        raise RuntimeError(f"{PLANS_VARIABLE} is not valid") from error
    return PlanSettings(
        enforce=plans.enforce,
        weekly_minutes=plans.weekly_minutes,
        products=plans.products,
        packs={product: minutes * 60 for product, minutes in plans.pack_minutes.items()},
    )
