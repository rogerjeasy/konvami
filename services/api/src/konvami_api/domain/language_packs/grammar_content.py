"""Keep a topic and its grounding note together so their categories cannot drift (§13)."""

from dataclasses import dataclass

from konvami_api.domain.grammar import GrammarNote
from konvami_api.domain.grammar_topics import GrammarTopic


@dataclass(frozen=True)
class GrammarEntry:
    id: str
    level: str
    title: str
    rule: str
    examples: tuple[str, ...]
    mistakes: tuple[str, ...]
    elicit: str

    def note(self) -> GrammarNote:
        return GrammarNote(self.id, self.title, self.rule, self.examples, self.mistakes)

    def topic(self) -> GrammarTopic:
        return GrammarTopic(self.id, self.level, self.title, (self.id,), self.elicit, self.examples)
