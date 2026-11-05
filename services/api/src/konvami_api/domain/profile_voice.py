"""Changing the profile by voice (spec §6.1.3, §12.7): "explain grammar in French from now on",
"my exam moved to June", "I'm on chapter 7 now".

The partner confirms what it understood with the learner, then calls `update_profile`. The call
runs here, on the server: the value is validated and written by `ProfileService` like any other
change, with the origin `voice`, so it is logged and can be undone from the app (a toast during the
call, the list of changes on the Profile).

Only settings that are safe to change on a spoken sentence are open to the voice. Privacy
switches (memory, recordings), the language being learned and the level are not: turning
recordings off deletes audio, a misheard sentence must not do that, and the level belongs to the
level engine.
"""

import json
from collections.abc import Callable
from typing import Any
from uuid import UUID

from konvami_api.domain.catalog import Catalog
from konvami_api.domain.profile import (
    Change,
    Json,
    Origin,
    Profile,
    ProfileError,
    ProfileService,
    Source,
)
from konvami_api.domain.tools import ToolResult

UPDATE_PROFILE = "update_profile"

# What the partner may change, with how each value is written. Objects are written as JSON.
VOICE_FIELDS: dict[str, str] = {
    "explanation_language": 'an ISO 639-1 code, for example "fr"',
    "explanation_usage": '"never", "when_stuck", "for_grammar" or "freely"',
    "exam": (
        'JSON like {"type": "goethe", "target_level": "B1", "date": "2026-06-14"}, or null for '
        "no exam; fields you leave out stay as they are"
    ),
    "level_goal": 'JSON like {"level": "B2", "by": "2027-01-31"}, or null for no goal',
    "weekly_habit": (
        'JSON like {"days": 3, "minutes": 60}, where minutes are the total for the week, or null '
        "for none"
    ),
    "course": (
        'JSON like {"name": "Menschen A2", "chapter": "7"}, or null for none; fields you leave '
        "out stay as they are"
    ),
}

# "Ask me again" (spec §14.2): a short spoken re-check of one group of settings, started as a
# practice call whose `practise` is `check:<group>`. The partner reads out each setting in turn.
CHECK_PREFIX = "check:"
CHECK_GROUPS: dict[str, tuple[str, ...]] = {
    "learning": ("explanation_language", "explanation_usage", "course"),
    "goals": ("exam", "level_goal", "weekly_habit"),
}

# Called with the field and its new value: what the partner should do from now on, in words, or
# None when the change only matters later (a date, a chapter).
type Effect = Callable[[str, Json], str | None]


def _no_effect(_field: str, _value: Json) -> str | None:
    return None


def _decoded(text: str) -> Json:
    """The value the partner sent: JSON, or for a plain word ("fr") the word itself."""
    try:
        return json.loads(text)
    except ValueError:
        return text


class ProfileVoice:
    """The `update_profile` tool of one learner's call."""

    def __init__(
        self, profiles: ProfileService, user_id: UUID, effect: Effect = _no_effect
    ) -> None:
        self._profiles = profiles
        self._user_id = user_id
        self._effect = effect

    def definition(self) -> dict[str, Any]:
        formats = "\n".join(f"- {field}: {how}" for field, how in VOICE_FIELDS.items())
        return {
            "type": "function",
            "name": UPDATE_PROFILE,
            "description": (
                "Changes one of the learner's settings after they asked for it and said yes when "
                "you repeated it back to them. Never call it before they confirmed. Values:\n"
                f"{formats}"
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "field": {"type": "string", "enum": list(VOICE_FIELDS)},
                    "value": {"type": "string", "description": "The new value, as written above."},
                    "confirmed": {
                        "type": "boolean",
                        "description": "True only when the learner said yes to your question.",
                    },
                },
                "required": ["field", "value", "confirmed"],
                "additionalProperties": False,
            },
        }

    def run(self, arguments: dict[str, Any]) -> ToolResult:
        field, value, confirmed = (
            arguments.get("field"),
            arguments.get("value"),
            arguments.get("confirmed"),
        )
        if not isinstance(field, str) or not isinstance(value, str):
            return _refused("invalid_arguments")
        if field not in VOICE_FIELDS:
            return _refused("not_changeable_by_voice")
        # The server cannot hear whether the learner said yes, but it can refuse a call in which
        # the partner did not even claim it.
        if confirmed is not True:
            return _refused("not_confirmed")
        try:
            return self._change(field, _decoded(value))
        except ProfileError as error:
            return _refused(error.code)

    def _change(self, field: str, value: Json) -> ToolResult:
        profile = self._profiles.get(self._user_id)
        language = profile.target_language
        if language is None:
            return _refused("target_language_required")
        current = profile.value(language, field)
        if isinstance(current, dict) and isinstance(value, dict):
            # "My exam moved to June" gives the date only: the rest of the exam stays.
            value = {**current, **value}
        before = self._profiles.history(self._user_id, language, field)
        self._profiles.apply(
            self._user_id,
            [Change(field, value, language)],
            source=Source.ASKED,
            origin=Origin.VOICE,
        )
        after = self._profiles.history(self._user_id, language, field)
        if len(after) == len(before):
            return _refused("unchanged")
        output: dict[str, Any] = {"changed": True, "change": after[-1].id, "field": field}
        effect = self._effect(field, after[-1].new_value)
        if effect:
            output["from_now_on"] = effect
        return ToolResult(output)


def _refused(reason: str) -> ToolResult:
    return ToolResult({"changed": False, "reason": reason})


def describe(catalog: Catalog, field: str, value: Json) -> str:
    """A setting's value in a plain English phrase, for the partner to read out."""
    if value is None:
        return "none"
    if field == "explanation_language":
        return catalog.english_name(str(value))
    if isinstance(value, dict):
        return ", ".join(f"{key.replace('_', ' ')} {item}" for key, item in value.items() if item)
    return str(value).replace("_", " ")


def check_lines(catalog: Catalog, profile: Profile, group: str) -> tuple[str, ...]:
    """What the partner reads out in a re-check of `group`: each setting and its value now.
    Empty for a group the app does not have."""
    language = profile.target_language
    if language is None:
        return ()
    return tuple(
        f"- {field.replace('_', ' ')}: {describe(catalog, field, profile.value(language, field))}"
        for field in CHECK_GROUPS.get(group, ())
    )
