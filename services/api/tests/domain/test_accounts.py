import pytest

from konvami_api.domain.accounts import Account, account_from_attributes

ATTRIBUTES = {
    "sub": "11111111-1111-4111-8111-111111111111",
    "email": "amara.diallo@mail.com",
    "email_verified": "true",
    "given_name": "Amara",
    "locale": "fr",
    "custom:age_bracket": "25-34",
    "custom:ai_consent": "v1|2026-10-09T12:30:00.000Z|openai=1,elevenlabs=1,bedrock=0",
}


def test_an_account_carries_the_name_the_language_and_the_voice_consent() -> None:
    assert account_from_attributes(ATTRIBUTES) == Account(
        first_name="Amara", language="fr", voice_consent=True
    )


@pytest.mark.parametrize(
    "stored",
    [
        None,
        "",
        "v1|2026-10-09T12:30:00.000Z|openai=0,elevenlabs=1,bedrock=1",
        "v1|2026-10-09T12:30:00.000Z|elevenlabs=1",
        "v1|not a date|openai=1",
        "openai=1",
    ],
)
def test_without_a_trustworthy_consent_record_there_is_no_voice_consent(
    stored: str | None,
) -> None:
    attributes = {key: value for key, value in ATTRIBUTES.items() if key != "custom:ai_consent"}
    if stored is not None:
        attributes["custom:ai_consent"] = stored

    assert account_from_attributes(attributes).voice_consent is False


@pytest.mark.parametrize(("locale", "language"), [("de", "de"), ("pt", "en"), (None, "en")])
def test_the_language_falls_back_to_english_outside_the_apps_languages(
    locale: str | None, language: str
) -> None:
    attributes = {key: value for key, value in ATTRIBUTES.items() if key != "locale"}
    if locale is not None:
        attributes["locale"] = locale

    assert account_from_attributes(attributes).language == language


def test_a_missing_name_is_empty_not_invented() -> None:
    attributes = {key: value for key, value in ATTRIBUTES.items() if key != "given_name"}

    assert account_from_attributes(attributes).first_name == ""
