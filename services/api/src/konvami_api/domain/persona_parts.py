"""What a persona is made of: roles, the parts and colors of a portrait, voices, and the shape of
a language pack's built-in partners. A module of its own, without imports from the rest of the
domain, so both the catalog and the persona service can use it.
"""

from dataclasses import dataclass
from typing import Any, Literal

Role = Literal["buddy", "teacher", "exam_coach"]
Gender = Literal["female", "male"]

# The parts and colors a portrait is drawn from. The app draws exactly these (its `AvatarLook`
# type is checked against the API schema), and their colors live in @konvami/design-tokens.
Skin = Literal["porcelain", "sand", "honey", "chestnut", "umber"]
Hair = Literal["short", "parted", "bob", "long", "bun", "curls", "bald"]
HairColor = Literal["black", "espresso", "chestnut", "auburn", "blond", "silver"]
Top = Literal["teal", "graphite", "stone", "amber"]
Backdrop = Literal["stone", "mist", "sand", "slate"]

# The voice provider's voices a persona can have (OpenAI Realtime).
Voice = Literal["marin", "cedar", "coral", "sage", "shimmer", "ash", "echo", "verse"]


@dataclass(frozen=True)
class PersonaTemplate:
    """A built-in partner of a language pack."""

    role: Role
    name: str
    gender: Gender
    age: int
    origin: str
    backstory: str
    look: dict[str, Any]
    voice: Voice
