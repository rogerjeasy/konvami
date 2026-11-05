"""What a persona is made of: roles, the parts and colors of a portrait, voices, and the shape of
a language pack's built-in partners. A module of its own, without imports from the rest of the
domain, so both the catalog and the persona service can use it.
"""

from dataclasses import dataclass, field
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
# Parts added with the avatar editor (spec §6.20.1: face shapes, eyes, age features). A look stored
# before they existed has none of them, so each has a default that draws the original portrait.
Face = Literal["oval", "round", "narrow"]
EyeColor = Literal["brown", "hazel", "green", "blue", "grey"]
DEFAULT_FACE: Face = "oval"
DEFAULT_EYES: EyeColor = "brown"

# What a persona's face can show (spec §6.20.1 "Expressions"); "neutral" is the face at rest. The
# partner picks one with the `set_expression` tool, and the app draws it for a few seconds.
Expression = Literal[
    "neutral", "happy", "surprised", "empathetic", "encouraging", "confused", "amused"
]
# A teaching gesture the face can make on top of an expression: "thumbs_up" for a correct use of
# a structure the learner is practising.
Gesture = Literal["none", "thumbs_up"]

# The voice provider's voices a persona can have (OpenAI Realtime).
Voice = Literal["marin", "cedar", "coral", "sage", "shimmer", "ash", "echo", "verse"]


# How a persona addresses the learner: the familiar form ("du"), the polite one ("Sie"), or
# whichever fits the situation.
FormOfAddress = Literal["informal", "formal", "auto"]
# How a persona keeps a conversation going.
Style = Literal["questions", "stories", "debate"]
# When a persona corrects a mistake (spec §6.2 E): by using the right form in passing, at once,
# only at the end, or never.
CorrectionTiming = Literal["recast", "immediate", "end", "off"]
# Which mistakes are worth a correction: those that hide the meaning, the important ones, all.
Strictness = Literal["meaning", "important", "everything"]


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
    occupation: str = ""
    # Settings of their own (see `domain/personas.py`); empty means: as their role does.
    personality: dict[str, Any] = field(default_factory=dict)
    teaching: dict[str, Any] = field(default_factory=dict)
