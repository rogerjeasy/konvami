"""Conservative English inflection matching for conversation review (§13)."""

from konvami_api.domain.word_use import WordRules

RULES = WordRules(
    minor=frozenset({"a", "an", "the", "to", "oneself"}),
    endings=("ing", "es", "ed", "s"),
    separable=(),
    participle="",
)
