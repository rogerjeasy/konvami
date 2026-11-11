"""French dictionary determiners and regular inflections for review (§13)."""

from konvami_api.domain.word_use import WordRules

RULES = WordRules(
    minor=frozenset({"le", "la", "les", "l", "un", "une", "des", "du", "de", "se", "s"}),
    endings=("er", "ir", "re", "es", "s", "e"),
    separable=(),
    participle="",
)
