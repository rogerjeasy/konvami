"""Italian dictionary determiners and regular inflections for review (§13)."""

from konvami_api.domain.word_use import WordRules

RULES = WordRules(
    minor=frozenset({"il", "lo", "la", "i", "gli", "le", "l", "un", "uno", "una"}),
    endings=("are", "ere", "ire", "o", "a", "i", "e"),
    separable=(),
    participle="",
    # First-person plural -iamo has four letters; German keeps its existing bound of three.
    max_ending=4,
)
