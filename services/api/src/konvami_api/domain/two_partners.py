"""Two partners in one conversation (5.24; design note 2026-11-20-two-partners).

One realtime session has one voice. The lead partner speaks with it; the second partner (the
"guest") speaks through `speak_partner`: the server says the line with the speech model in the
guest's own voice, keeps it as the turn's recording, and the app plays it as a clip. The model
writes both characters, so the lead is told here who the guest is and how to let them speak.
"""

from typing import Any
from uuid import UUID

from konvami_api.domain.accounts import AccountDirectory
from konvami_api.domain.candidate_speech import SecondVoice
from konvami_api.domain.costs import Feature
from konvami_api.domain.live_speech import PcmSpeech
from konvami_api.domain.personas import Persona, personality_of
from konvami_api.domain.tools import ToolResult

SPEAK_PARTNER = "speak_partner"
# A line of the second partner stays short, so the learner keeps most of the speaking time and a
# speech request stays cheap (characters).
GUEST_TEXT_MAX = 600
# Standard voices the second partner takes when they would sound like the lead: the speech model
# has every partner voice, and these two are clearly different from each other.
_FALLBACK_VOICES = ("ash", "coral")


def distinct_voice(lead: str, guest: str) -> str:
    """The guest's voice, unless it is the lead's: two people never sound the same."""
    if guest != lead:
        return guest
    return next(voice for voice in _FALLBACK_VOICES if voice != lead)


def speak_partner_definition(name: str) -> dict[str, Any]:
    return {
        "type": "function",
        "name": SPEAK_PARTNER,
        "description": (
            f"Let {name}, the second partner in this conversation, say one short line in their "
            "own voice. Say nothing yourself in the same reply."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "text": {
                    "type": "string",
                    "description": f"What {name} says, in their words.",
                    "minLength": 1,
                    "maxLength": GUEST_TEXT_MAX,
                }
            },
            "required": ["text"],
            "additionalProperties": False,
        },
    }


def speak_partner(arguments: dict[str, Any]) -> ToolResult:
    """The guest's line, to be spoken. Silent: the learner answers it, the lead does not."""
    text = arguments.get("text")
    if not isinstance(text, str) or not 0 < len(text.strip()) <= GUEST_TEXT_MAX:
        return ToolResult({"spoken": False, "reason": "invalid_arguments"})
    return ToolResult({"spoken": True}, silent=True, guest=text.strip())


def guest_instructions(lead: Persona, guest: Persona, *, met_before: bool) -> str:
    """The section that brings the second partner into the lead's instructions."""
    character = ""
    if guest.personality:
        traits = personality_of(guest)
        character = (
            f"\nTheir manner: warmth {traits.warmth}, playfulness {traits.playfulness}, "
            f"talkativeness {traits.talkativeness}, humour {traits.humour} (1 to 5)."
        )
    work = f" They work as: {guest.occupation}." if guest.occupation else ""
    known = (
        "The learner has talked with them before."
        if met_before
        else "The learner meets them for the first time: they introduce themselves briefly."
    )
    return f"""
# A second partner is here
This conversation has three people: the learner, you ({lead.name}) and {guest.name}, another of
the learner's partners. You meet at a café, as friends do. {known}
Who {guest.name} is: {guest.age}, from {guest.origin}.{work}
{guest.backstory}{character}
How {guest.name} speaks:
- Only through {SPEAK_PARTNER}, with their line as the text. Say nothing yourself in a reply in
  which you call it, and never speak their lines in your own voice.
- Each line of theirs follows the same rules as yours: short, at the learner's level, one
  question or prompt at most.
- Let {guest.name} speak about every second or third time, most often with a question to the
  learner or a reaction to what the learner said. You and {guest.name} may disagree, joke and ask
  each other something, but the learner must always have the next turn: never let the two of
  you talk on without them.
- When the learner speaks to {guest.name} by name, {guest.name} answers.
- {guest.name} never corrects the learner and never calls a tool other than this one: you do.
- They are an AI too and say so if asked.
"""


class GuestSpeech:
    """Speaks the guest's lines: the exam's second-candidate voice (`SecondVoice`), in the
    guest's own voice and metered as practice."""

    def __init__(self, accounts: AccountDirectory, speech: PcmSpeech, model: str) -> None:
        self._second = SecondVoice(accounts, speech, model)

    @property
    def available(self) -> bool:
        return self._second.available

    def speak(self, user_id: UUID, text: str, voice: str) -> bytes:
        return self._second.speak(user_id, text, voice, Feature.VOICE_PRACTICE, GUEST_TEXT_MAX)
