"""A new target language must never receive German noun or verb instructions (§13)."""

import pytest

from konvami_api.domain.card_details import _details, _Found, _instructions


@pytest.mark.parametrize(
    ("language", "name", "article", "past"),
    [
        ("en", "English", "the", "present perfect"),
        ("fr", "French", "la", "passé composé"),
        ("it", "Italian", "lo", "passato prossimo"),
    ],
)
def test_forms_follow_the_target_language(
    language: str, name: str, article: str, past: str
) -> None:
    instructions = _instructions(name, language)
    assert past in instructions
    assert "er/sie/es" not in instructions
    assert "der, die or das" not in instructions
    found = _Found(
        id=0,
        part="noun",
        article=article,
        plural="forms",
        present=None,
        preterite=None,
        perfect=None,
        separable=None,
        case=None,
        comparative=None,
        superlative=None,
    )
    assert _details(found, language).article == article
    assert _details(found, "de").article is None


def test_german_forms_keep_the_original_guidance() -> None:
    assert "er/sie/es" in _instructions("German", "de")
    assert "der, die or das" in _instructions("German", "de")
