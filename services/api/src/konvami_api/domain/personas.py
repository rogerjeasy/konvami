"""Starter partners (spec §6.1.1 step 5, §6.2): the two or three personas a new learner is
offered, fitted to their goals. A text model writes them; when it cannot, the language pack's
built-in partners are offered instead, so onboarding never waits on a model.

A persona here is its identity and its look. Voice previews, personality sliders and the rest of
Persona Studio (§6.2) build on this later.
"""

import json
from collections.abc import Sequence
from dataclasses import dataclass, replace
from typing import Any, Protocol, get_args
from uuid import UUID, uuid4

from pydantic import BaseModel, ConfigDict, Field, ValidationError

from konvami_api.domain.onboarding import OnboardingError, OnboardingService, Stage
from konvami_api.domain.persona_parts import (
    Backdrop,
    Gender,
    Hair,
    HairColor,
    Role,
    Skin,
    Top,
    Voice,
)
from konvami_api.domain.profile import ProfileService
from konvami_api.domain.text import TextModel, TextModelError, TextTask

NAME_MAX = 40
# The writer answers inside an API request, which may take 29 seconds in all (it usually needs
# about 7). Past this limit the built-in partners are offered instead.
WRITER_MAX_SECONDS = 20.0
MIN_AGE, MAX_AGE = 18, 80


class _Model(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class Look(_Model):
    skin: Skin
    hair: Hair
    hair_color: HairColor
    top: Top
    backdrop: Backdrop
    glasses: bool
    beard: bool


class _Written(_Model):
    """One persona as the text model must write it."""

    role: Role
    name: str = Field(min_length=1, max_length=NAME_MAX)
    gender: Gender
    age: int = Field(ge=MIN_AGE, le=MAX_AGE)
    origin: str = Field(min_length=1, max_length=60)
    tagline: str = Field(min_length=1, max_length=120)
    backstory: str = Field(min_length=1, max_length=600)
    look: Look
    voice: Voice


class _WrittenSet(_Model):
    personas: list[_Written]


@dataclass(frozen=True)
class Persona:
    id: UUID
    role: Role
    name: str
    gender: Gender
    age: int
    # Where the persona is from (a city or region); it colors vocabulary and references.
    origin: str
    # One line about them in the learner's explanation language. None for a built-in partner:
    # the app then shows its own line for the role.
    tagline: str | None
    # Who they are, for the persona's own instructions later.
    backstory: str
    look: dict[str, Any]
    voice: str


class PersonaError(Exception):
    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


class PersonaRepository(Protocol):
    def add(self, user_id: UUID, language: str, personas: Sequence[Persona]) -> None: ...

    def for_learner(self, user_id: UUID, language: str) -> list[Persona]:
        """The learner's personas for a language, in the order they were added."""

    def update(self, user_id: UUID, persona: Persona) -> bool:
        """Stores a changed persona. False when the learner has no such persona."""

    def remove(self, user_id: UUID, persona_id: UUID) -> bool:
        """Deletes a persona. False when the learner has no such persona."""


def _enum(options: Any) -> dict[str, Any]:
    return {"type": "string", "enum": list(get_args(options))}


_LOOK_SCHEMA: dict[str, Any] = {
    "type": "object",
    "additionalProperties": False,
    "required": ["skin", "hair", "hair_color", "top", "backdrop", "glasses", "beard"],
    "properties": {
        "skin": _enum(Skin),
        "hair": _enum(Hair),
        "hair_color": _enum(HairColor),
        "top": _enum(Top),
        "backdrop": _enum(Backdrop),
        "glasses": {"type": "boolean"},
        "beard": {"type": "boolean"},
    },
}
_PERSONA_FIELDS = (
    "role",
    "name",
    "gender",
    "age",
    "origin",
    "tagline",
    "backstory",
    "look",
    "voice",
)
_ANSWER_SCHEMA: dict[str, Any] = {
    "type": "object",
    "additionalProperties": False,
    "required": ["personas"],
    "properties": {
        "personas": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "required": list(_PERSONA_FIELDS),
                "properties": {
                    "role": _enum(Role),
                    "name": {"type": "string"},
                    "gender": _enum(Gender),
                    "age": {"type": "integer"},
                    "origin": {"type": "string"},
                    "tagline": {"type": "string"},
                    "backstory": {"type": "string"},
                    "look": _LOOK_SCHEMA,
                    "voice": _enum(Voice),
                },
            },
        }
    },
}


def _writer_instructions(target: str, explanation: str) -> str:
    return f"""You invent conversation partners for someone learning {target} in a
language-learning app. Write exactly one persona for each role you are given, in that order.

- buddy: a casual friend to chat with about everyday life.
- teacher: a patient teacher who explains and checks understanding.
- exam_coach: a calm coach who prepares the learner for their exam.

Each persona is an adult from a place where {target} is spoken, with a first name typical there
(a teacher or coach may go by "Frau" or "Herr" and a surname if that fits), a believable age and
a short backstory written in {target} (two or three sentences: work, a hobby, one detail). Fit
them to the learner's goals where it is natural, without mentioning the learner.

`origin`: the city and country, written in {explanation}. `tagline`: one friendly line in
{explanation}, at most twelve words, saying what talking with this persona is like. `look` and
`voice` must suit the persona's gender and age (a beard only for a man; grey hair for an older
person). Make the personas clearly different from each other.
No real people."""


class PersonaService:
    def __init__(
        self,
        *,
        profiles: ProfileService,
        onboarding: OnboardingService,
        repository: PersonaRepository,
        text_model: TextModel,
        model: str,
    ) -> None:
        self._profiles = profiles
        self._onboarding = onboarding
        self._repository = repository
        self._text_model = text_model
        self._model = model

    def _language(self, user_id: UUID) -> str:
        return self._profiles.get(user_id).target_language or ""

    def partners(self, user_id: UUID) -> list[Persona]:
        """The learner's partners for the language they are learning."""
        return self._repository.for_learner(user_id, self._language(user_id))

    def propose(self, user_id: UUID) -> list[Persona]:
        """The learner's starter partners: the ones already proposed, or new ones."""
        if self._onboarding.status(user_id).stage is not Stage.PARTNERS:
            raise OnboardingError("wrong_stage")
        language = self._language(user_id)
        existing = self._repository.for_learner(user_id, language)
        if existing:
            return existing

        profile = self._profiles.get(user_id)
        roles: list[Role] = ["buddy", "teacher"]
        if profile.value(language, "exam") is not None:
            roles.append("exam_coach")
        personas = self._written(user_id, roles) or self._built_in(language, roles)
        self._repository.add(user_id, language, personas)
        return personas

    def _written(self, user_id: UUID, roles: list[Role]) -> list[Persona] | None:
        """Personas written for this learner, or None when the writer did not deliver."""
        profile = self._profiles.get(user_id)
        language = profile.target_language or ""
        catalog = self._profiles.catalog
        explanation = profile.value(language, "explanation_language") or "en"
        content = {
            "roles": roles,
            "learner": {
                "goals": profile.value(language, "goals"),
                "exam": profile.value(language, "exam"),
                "level": profile.value(language, "starting_level")
                or profile.value(language, "self_assessed_level"),
            },
        }
        task = TextTask(
            model=self._model,
            instructions=_writer_instructions(
                catalog.english_name(language), catalog.english_name(explanation)
            ),
            content=json.dumps(content, ensure_ascii=False),
            answer_name="starter_personas",
            answer_schema=_ANSWER_SCHEMA,
            max_seconds=WRITER_MAX_SECONDS,
        )
        try:
            written = _WrittenSet.model_validate(self._text_model.answer(task)).personas
        except (TextModelError, ValidationError):
            return None
        if [persona.role for persona in written] != roles:
            return None
        return [
            Persona(
                id=uuid4(),
                role=persona.role,
                name=persona.name,
                gender=persona.gender,
                age=persona.age,
                origin=persona.origin,
                tagline=persona.tagline,
                backstory=persona.backstory,
                look=persona.look.model_dump(),
                voice=persona.voice,
            )
            for persona in written
        ]

    def _built_in(self, language: str, roles: list[Role]) -> list[Persona]:
        pack = self._profiles.catalog.available_pack(language)
        templates = {
            template.role: template for template in (pack.starter_personas if pack else ())
        }
        return [
            Persona(
                id=uuid4(),
                role=template.role,
                name=template.name,
                gender=template.gender,
                age=template.age,
                origin=template.origin,
                tagline=None,
                backstory=template.backstory,
                look=dict(template.look),
                voice=template.voice,
            )
            for role in roles
            if (template := templates.get(role)) is not None
        ]

    def change(
        self,
        user_id: UUID,
        persona_id: UUID,
        *,
        name: str | None = None,
        look: dict[str, Any] | None = None,
    ) -> Persona:
        """Renames a partner or gives them another look."""
        persona = next((p for p in self.partners(user_id) if p.id == persona_id), None)
        if persona is None:
            raise PersonaError("not_found")
        try:
            if name is not None:
                cleaned = name.strip()
                if not 1 <= len(cleaned) <= NAME_MAX:
                    raise PersonaError("invalid_value")
                persona = replace(persona, name=cleaned)
            if look is not None:
                persona = replace(persona, look=Look.model_validate(look).model_dump())
        except ValidationError as error:
            raise PersonaError("invalid_value") from error
        if not self._repository.update(user_id, persona):
            raise PersonaError("not_found")
        return persona

    def remove(self, user_id: UUID, persona_id: UUID) -> None:
        if not self._repository.remove(user_id, persona_id):
            raise PersonaError("not_found")

    def confirm(self, user_id: UUID) -> None:
        """The learner keeps the partners that are left. There must be at least one."""
        if not self.partners(user_id):
            raise PersonaError("no_partners")
        self._onboarding.confirm_partners(user_id)
