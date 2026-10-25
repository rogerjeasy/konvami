"""Whether a learner used a word in what they said, to count a card as reviewed when its word
came up in a conversation (spec §6.7 "review conversation", §7 "review inside conversation").

Words change their form as they are used, so a word counts when its main part appears with a
usual ending; a language pack's rules (German articles and separable verbs) make the guess
closer. The app shows the same during a call (`apps/mobile/src/lib/word-use.ts`); the two keep
the same rules and the same test cases.
"""

import re
from dataclasses import dataclass

# How much longer than the shared part a form may be ("Termin" → "Termine").
MAX_ENDING = 3
# A shared part shorter than this matches too much ("Rad" would match "Rate").
MIN_STEM = 3


@dataclass(frozen=True)
class WordRules:
    # Little words of a dictionary entry that are not the word itself ("der", "sich").
    minor: frozenset[str]
    # Endings a word drops to give the part its forms share ("besuch-en"), longest first.
    endings: tuple[str, ...]
    # Prefixes of separable verbs, which can stand apart at the end of a sentence.
    separable: tuple[str, ...]
    # What a past participle puts before the verb ("ge-besucht").
    participle: str


GERMAN_WORD_RULES = WordRules(
    minor=frozenset(
        [
            "der",
            "die",
            "das",
            "den",
            "dem",
            "des",
            "ein",
            "eine",
            "einen",
            "einem",
            "einer",
            "eines",
            "sich",
            "etwas",
            "jemand",
            "jemanden",
            "jemandem",
            "auf",
            "an",
            "für",
            "mit",
            "über",
            "von",
            "zu",
            "um",
            "in",
            "aus",
        ]
    ),
    endings=("ern", "eln", "en", "er", "es", "e", "n", "s"),
    separable=(
        "zurück",
        "fest",
        "fern",
        "nach",
        "weg",
        "vor",
        "mit",
        "ein",
        "aus",
        "auf",
        "los",
        "her",
        "hin",
        "ab",
        "an",
        "um",
        "zu",
    ),
    participle="ge",
)


def _words(text: str) -> list[str]:
    """A text's words, without capitals and punctuation, which speech does not have."""
    return re.findall(r"[^\W_]+", text.casefold())


def _stem(word: str, rules: WordRules) -> str:
    ending = next(
        (end for end in rules.endings if word.endswith(end) and len(word) - len(end) >= MIN_STEM),
        None,
    )
    return word[: -len(ending)] if ending else word


def _form_of(form: str, stem: str) -> bool:
    """Whether `form` is the stem with one of its endings (or none)."""
    return form.startswith(stem) and len(form) - len(stem) <= MAX_ENDING


def _uses_under(entry: str, said: list[str], rules: WordRules) -> bool:
    parts = [part for part in _words(entry) if part not in rules.minor]
    # The main word of a phrase is its longest one ("sich freuen auf" → "freuen").
    main = max(parts, key=len, default="")
    if not main:
        return False
    stem = _stem(main, rules)
    prefix = next(
        (
            start
            for start in rules.separable
            if main.startswith(start) and len(main) - len(start) > MIN_STEM
        ),
        None,
    )
    if prefix is None:
        return any(_form_of(form, stem) or _form_of(form, rules.participle + stem) for form in said)
    core = stem[len(prefix) :]
    return any(
        _form_of(form, stem)
        or _form_of(form, prefix + rules.participle + core)
        # The prefix went to the end: "Ich steige in Köln um."
        or (_form_of(form, core) and prefix in said[index + 1 :])
        for index, form in enumerate(said)
    )


def uses_word(word: str, text: str, rules: WordRules | None) -> bool:
    """Whether `text` uses the dictionary entry `word`, under a language pack's rules."""
    said = _words(text)
    if rules is not None:
        return _uses_under(word, said, rules)
    # No rules: the entry's words, together and in order.
    entry = _words(word)
    return bool(entry) and any(
        said[start : start + len(entry)] == entry for start in range(len(said) - len(entry) + 1)
    )
