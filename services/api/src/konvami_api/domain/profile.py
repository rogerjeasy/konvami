"""The Learner Configuration Profile (spec §6.1.2): what the app was told about a learner.

One value per field, each with where it came from and when it last changed. A field is either
global or belongs to one target language. Every change is validated here, whoever makes it (the
form, a persona's `update_profile` tool, a system step), and is logged so it can be undone.
"""

import datetime as dt
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass
from enum import StrEnum
from typing import Annotated, Any, Protocol
from uuid import UUID

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    StringConstraints,
    TypeAdapter,
    ValidationError,
    field_validator,
)

from konvami_api.domain.catalog import (
    OTHER_EXAM,
    Catalog,
    CefrLevel,
    ExplanationUsage,
    GoalReason,
    LanguagePack,
    StartingLevel,
)

# A JSON-compatible value: what a profile field holds and what the database stores.
type Json = Any

GLOBAL_SCOPE = "global"
TARGET_LANGUAGE = "target_language"


class Source(StrEnum):
    """Where a value came from (spec §11.2)."""

    ASKED = "asked"
    MEASURED = "measured"
    INFERRED_CONFIRMED = "inferred_confirmed"


class Origin(StrEnum):
    """Which part of the product made a change."""

    FORM = "form"
    VOICE = "voice"
    SYSTEM = "system"


@dataclass(frozen=True)
class FieldValue:
    value: Json
    source: Source
    updated_at: dt.datetime


@dataclass(frozen=True)
class Profile:
    """Field values keyed by (scope, field); scope is `global` or a target-language code."""

    fields: Mapping[tuple[str, str], FieldValue]

    def value(self, scope: str, field: str) -> Json:
        stored = self.fields.get((scope, field))
        return stored.value if stored else None

    @property
    def target_language(self) -> str | None:
        target: str | None = self.value(GLOBAL_SCOPE, TARGET_LANGUAGE)
        return target

    def level(self, language: str) -> str | None:
        """The level practice runs at in a language: the one settled after the placement test,
        or until then the learner's own estimate."""
        level: str | None = self.value(language, "starting_level") or self.value(
            language, "self_assessed_level"
        )
        return level


@dataclass(frozen=True)
class Change:
    """A requested change. `scope` may be left out: it is then the language being learned."""

    field: str
    value: Json
    scope: str | None = None


@dataclass(frozen=True)
class ChangeRecord:
    scope: str
    field: str
    old_value: Json
    new_value: Json
    source: Source
    origin: Origin
    changed_at: dt.datetime


class ProfileError(Exception):
    """A refused change. Carries a stable code and the field, never the rejected value."""

    def __init__(self, code: str, field: str) -> None:
        super().__init__(f"{code}: {field}")
        self.code = code
        self.field = field


class ProfileRepository(Protocol):
    def load(self, user_id: UUID) -> Profile: ...

    def save(self, user_id: UUID, changes: Sequence[ChangeRecord]) -> None:
        """Stores the new values and their log entries together, or nothing."""


# --- Field definitions ---------------------------------------------------------------------------

GOAL_NOTE_MAX = 280
COURSE_NAME_MAX = 120
COURSE_CHAPTER_MAX = 60

# An ISO 639 code, as the app sends it ("en", "fr", "gsw"). Pydantic checks the pattern before it
# lowercases, so the pattern accepts both cases.
LanguageCode = Annotated[
    str, StringConstraints(strip_whitespace=True, to_lower=True, pattern=r"^[A-Za-z]{2,3}$")
]


class _Value(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class Goals(_Value):
    reasons: list[GoalReason] = Field(min_length=1)
    note: str | None = Field(default=None, max_length=GOAL_NOTE_MAX)

    @field_validator("reasons")
    @classmethod
    def _no_repeats(cls, reasons: list[GoalReason]) -> list[GoalReason]:
        if len(set(reasons)) != len(reasons):
            raise ValueError("a reason is listed twice")
        return reasons

    @field_validator("note")
    @classmethod
    def _blank_is_none(cls, note: str | None) -> str | None:
        return note or None


class Exam(_Value):
    type: str = Field(min_length=1)
    target_level: CefrLevel | None = None
    # Named as in the API; the module alias keeps the type reachable inside this class.
    date: dt.date | None = None


class Course(_Value):
    name: str = Field(min_length=1, max_length=COURSE_NAME_MAX)
    chapter: str | None = Field(default=None, max_length=COURSE_CHAPTER_MAX)

    @field_validator("chapter")
    @classmethod
    def _blank_is_none(cls, chapter: str | None) -> str | None:
        return chapter or None


@dataclass(frozen=True)
class _Context:
    """What a field needs to check a value: the catalog, the language it is for, and today."""

    catalog: Catalog
    pack: LanguagePack | None
    today: dt.date


_LANGUAGE_CODE: TypeAdapter[str] = TypeAdapter(LanguageCode)
_EXAM: TypeAdapter[Exam | None] = TypeAdapter(Exam | None)


def _typed(adapter: TypeAdapter[Any]) -> Callable[[Json, _Context], Json]:
    def parse(value: Json, _: _Context) -> Json:
        return adapter.dump_python(adapter.validate_python(value, strict=True), mode="json")

    return parse


def _target_language(value: Json, context: _Context) -> Json:
    code: str = _LANGUAGE_CODE.validate_python(value, strict=True)
    if context.catalog.available_pack(code) is None:
        raise ProfileError("language_unavailable", TARGET_LANGUAGE)
    return code


def _exam(value: Json, context: _Context) -> Json:
    exam: Exam | None = _EXAM.validate_python(value)
    if exam is None:
        return None
    if exam.type != OTHER_EXAM:
        known = context.pack.exam(exam.type) if context.pack else None
        if known is None:
            raise ValueError("unknown exam")
        if exam.target_level is not None and exam.target_level not in known.levels:
            raise ValueError("this exam has no such level")
    if exam.date is not None and exam.date < context.today:
        raise ValueError("the exam date has passed")
    return exam.model_dump(mode="json")


@dataclass(frozen=True)
class FieldSpec:
    per_language: bool
    parse: Callable[[Json, _Context], Json]
    # Written by the system only (a measurement): neither the form nor a persona may set it.
    system_only: bool = False


FIELDS: Mapping[str, FieldSpec] = {
    TARGET_LANGUAGE: FieldSpec(per_language=False, parse=_target_language),
    "explanation_language": FieldSpec(True, _typed(_LANGUAGE_CODE)),
    "explanation_usage": FieldSpec(True, _typed(TypeAdapter(ExplanationUsage))),
    "goals": FieldSpec(True, _typed(TypeAdapter(Goals))),
    "exam": FieldSpec(True, _exam),
    "self_assessed_level": FieldSpec(True, _typed(TypeAdapter(StartingLevel))),
    "course": FieldSpec(True, _typed(TypeAdapter(Course | None))),
    # The level practice starts at: the self-assessment, or the measured level if the learner
    # prefers it after the placement test (spec §6.1.1 step 4).
    "starting_level": FieldSpec(True, _typed(TypeAdapter(StartingLevel))),
    # The level per skill from the placement test (spec D2): written by the system, never asked.
    "measured_levels": FieldSpec(
        True, _typed(TypeAdapter(dict[str, StartingLevel])), system_only=True
    ),
}


# --- Service -------------------------------------------------------------------------------------


class ProfileService:
    def __init__(
        self, repository: ProfileRepository, catalog: Catalog, clock: Callable[[], dt.datetime]
    ) -> None:
        self._repository = repository
        self._catalog = catalog
        self._clock = clock

    @property
    def catalog(self) -> Catalog:
        return self._catalog

    def get(self, user_id: UUID) -> Profile:
        return self._repository.load(user_id)

    def apply(
        self, user_id: UUID, changes: Sequence[Change], *, source: Source, origin: Origin
    ) -> Profile:
        """Validates every change, then stores them all. One refused change stores nothing."""
        now = self._clock()
        current = dict(self._repository.load(user_id).fields)
        records: list[ChangeRecord] = []

        for change in changes:
            spec = FIELDS.get(change.field)
            if spec is None:
                raise ProfileError("unknown_field", change.field)
            if spec.system_only and origin is not Origin.SYSTEM:
                raise ProfileError("read_only_field", change.field)
            target = current.get((GLOBAL_SCOPE, TARGET_LANGUAGE))
            scope = self._scope(spec, change, target.value if target else None)
            context = _Context(self._catalog, self._catalog.available_pack(scope), now.date())
            try:
                value = spec.parse(change.value, context)
            except (ValidationError, ValueError) as error:
                raise ProfileError("invalid_value", change.field) from error

            stored = current.get((scope, change.field))
            if stored is not None and stored.value == value:
                continue
            records.append(
                ChangeRecord(
                    scope=scope,
                    field=change.field,
                    old_value=stored.value if stored else None,
                    new_value=value,
                    source=source,
                    origin=origin,
                    changed_at=now,
                )
            )
            current[(scope, change.field)] = FieldValue(value, source, now)

        if records:
            self._repository.save(user_id, records)
        return Profile(current)

    def _scope(self, spec: FieldSpec, change: Change, target_language: str | None) -> str:
        if not spec.per_language:
            if change.scope not in (None, GLOBAL_SCOPE):
                raise ProfileError("invalid_scope", change.field)
            return GLOBAL_SCOPE
        if change.scope is None:
            if target_language is None:
                raise ProfileError("target_language_required", change.field)
            return target_language
        if self._catalog.available_pack(change.scope) is None:
            raise ProfileError("invalid_scope", change.field)
        return change.scope
