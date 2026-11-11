"""Searchable, curated grammar evidence shared by the topic page and Tutor (§6.8).

Retrieval is local and deterministic: a query never needs to leave the learner's account just
to find a rule. Topics without a rule retain their examples, rather than inventing a rule.
"""

import re
import unicodedata
from dataclasses import dataclass

from konvami_api.domain.catalog import LanguagePack


@dataclass(frozen=True)
class GrammarReference:
    id: str
    title: str
    level: str
    rules: tuple[str, ...]
    examples: tuple[str, ...]
    categories: tuple[str, ...]


def references(pack: LanguagePack) -> tuple[GrammarReference, ...]:
    return tuple(
        GrammarReference(
            topic.id,
            topic.title,
            topic.level,
            tuple(note.rule for category in topic.categories if (note := pack.note(category))),
            topic.examples,
            topic.categories,
        )
        for topic in pack.grammar_map
    )


def _tokens(value: str) -> set[str]:
    return set(re.findall(r"\w+", unicodedata.normalize("NFKC", value).casefold()))


def search_references(
    pack: LanguagePack, query: str, *, limit: int | None = None
) -> tuple[GrammarReference, ...]:
    entries = references(pack)
    terms = _tokens(query)
    if terms:
        # A title match outweighs rule prose, which repeats common words across many topics.
        def score(entry: GrammarReference) -> int:
            title = _tokens(f"{entry.id.replace('_', ' ')} {entry.title}")
            body = _tokens(" ".join((*entry.rules, *entry.examples)))
            return len(terms & title) * 3 + len(terms & body)

        entries = tuple(sorted((e for e in entries if score(e)), key=score, reverse=True))
    return entries if limit is None else entries[: max(0, limit)]
