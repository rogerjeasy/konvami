"""What the backend needs to know about an account: who to greet, in which language, and whether
they agreed to send their voice to the voice provider.

The account itself lives with the identity provider (Amazon Cognito). The consent record stays
there too for now (onboarding design O7); the backend reads it before every voice call, because
a check made only in the app could be skipped (Apple guideline 5.1.2(i)).
"""

import datetime as dt
from collections.abc import Mapping
from dataclasses import dataclass
from typing import Literal, Protocol, get_args
from uuid import UUID

# The languages of the app's interface (spec D15); the setup guide speaks these.
InterfaceLanguage = Literal["en", "de", "fr", "it"]
INTERFACE_LANGUAGES: tuple[InterfaceLanguage, ...] = get_args(InterfaceLanguage)
DEFAULT_LANGUAGE: InterfaceLanguage = "en"

# The provider that receives live voice: without consent to it there is no voice call.
VOICE_PROVIDER = "openai"


@dataclass(frozen=True)
class Account:
    # Empty when the account has none; never a made-up name.
    first_name: str
    language: InterfaceLanguage
    voice_consent: bool


class AccountNotFound(Exception):  # noqa: N818 - reads as a fact, like KeyError
    """No such account (it was deleted while its last token was still valid)."""


class AccountDirectory(Protocol):
    def get(self, user_id: UUID) -> Account:
        """The account, or `AccountNotFound`."""


def _voice_consent(stored: str | None) -> bool:
    """Reads the app's consent record: `v1|<ISO time>|openai=1,elevenlabs=1,bedrock=0`.

    The format is written by apps/mobile/src/auth/consent.ts. Anything that cannot be read in
    full counts as no consent.
    """
    parts = (stored or "").split("|")
    if len(parts) != 3 or not all(parts):
        return False
    try:
        dt.datetime.fromisoformat(parts[1])
    except ValueError:
        return False
    flags = dict(pair.split("=", 1) for pair in parts[2].split(",") if "=" in pair)
    return flags.get(VOICE_PROVIDER) == "1"


def account_from_attributes(attributes: Mapping[str, str]) -> Account:
    """An account from the identity provider's attributes (names as in infra/modules/auth)."""
    locale = attributes.get("locale")
    language = next((code for code in INTERFACE_LANGUAGES if code == locale), DEFAULT_LANGUAGE)
    return Account(
        first_name=attributes.get("given_name", "").strip(),
        language=language,
        voice_consent=_voice_consent(attributes.get("custom:ai_consent")),
    )
