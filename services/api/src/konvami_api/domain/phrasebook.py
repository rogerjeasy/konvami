"""The phrasebook (spec §6.7): a personal list of the phrases a learner needs in their life
("Ich hätte gern einen Termin", "Könnten Sie das bitte wiederholen?"), each with its meaning in
the language they read.

The learner says what they need (a situation, or a phrase in their own language); a text model
suggests a few phrases at their level; they keep the ones they want. A kept phrase can become a
flashcard (`CardService.save_phrase`), so the list is both a reference and something to learn.
Phrases are the learner's own list, not report content, so the server stores what they keep; a
suggestion is never stored until they keep it.
"""

import datetime as dt
import json
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from typing import Protocol
from uuid import UUID, uuid4

from pydantic import BaseModel, ConfigDict, ValidationError

from konvami_api.domain.accounts import AccountDirectory, AccountNotFound
from konvami_api.domain.cards import Card, CardService, card_key
from konvami_api.domain.costs import Charge, Feature
from konvami_api.domain.profile import Profile, ProfileService
from konvami_api.domain.reports import DEFAULT_LEVEL
from konvami_api.domain.text import (
    TextModel,
    TextModelError,
    TextTask,
    answer_list,
    answer_object,
    familiar_address,
)
from konvami_api.domain.tutor import explanation_languages

# A learner's phrases per language. A bound on storage; nobody keeps this many.
MAX_PHRASES = 500
# The most phrases one request suggests.
MAX_SUGGESTIONS = 6
# The longest a situation, a phrase and a meaning are, in characters.
SITUATION_MAX = 200
PHRASE_MAX = 200
MEANING_MAX = 300
# How long a suggestion may take: the learner is waiting, and the API has 29 seconds in all.
SUGGEST_SECONDS = 25.0
# Suggestions count against the Tutor's questions of the day (`TutorRepository.reserve`): both
# are requests to the strong text model, and no learner needs more than this in all.
DAILY_LIMIT = 40


@dataclass(frozen=True)
class Phrase:
    id: UUID
    phrase: str
    meaning: str
    # What the learner asked for when it was suggested; None for a phrase they typed.
    situation: str | None
    # The language `meaning` is written in.
    explained_in: str
    created_at: dt.datetime


@dataclass(frozen=True)
class Suggestion:
    phrase: str
    meaning: str
    # The learner keeps this phrase already, so it is not offered to keep twice.
    saved: bool = False


@dataclass(frozen=True)
class PhrasebookEntry:
    phrase: Phrase
    # The learner has a flashcard of the phrase.
    in_deck: bool


class PhrasebookError(Exception):
    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


class PhraseRepository(Protocol):
    def add(self, user_id: UUID, language: str, key: str, phrase: Phrase, limit: int) -> bool:
        """Stores a new phrase. Not when the learner has one with that key in the language
        already, nor when they have `limit` in it: then nothing is stored and the answer is
        False."""

    def by_key(self, user_id: UUID, language: str, key: str) -> Phrase | None: ...

    def get(self, user_id: UUID, phrase_id: UUID) -> Phrase | None: ...

    def listed(self, user_id: UUID, language: str) -> list[Phrase]:
        """The learner's phrases in a language, newest first."""

    def remove(self, user_id: UUID, phrase_id: UUID) -> bool: ...

    def known(self, user_id: UUID, language: str, keys: Sequence[str]) -> set[str]:
        """Those of the given keys the learner has a phrase for."""


class DailyLimit(Protocol):
    def reserve(self, user_id: UUID, day: dt.date, limit: int) -> bool:
        """Counts one more request for that day and returns True, unless the learner has
        reached `limit`."""


class _Suggested(BaseModel):
    model_config = ConfigDict(extra="ignore")
    phrase: str
    meaning: str


class _Suggestions(BaseModel):
    model_config = ConfigDict(extra="ignore")
    phrases: list[_Suggested]


_SCHEMA = answer_object(
    {
        "phrases": answer_list(
            answer_object({"phrase": {"type": "string"}, "meaning": {"type": "string"}}),
            MAX_SUGGESTIONS,
        )
    }
)


def _instructions(target: str, written_in: str) -> str:
    return f"""You write phrasebook entries for a learner of {target}. The learner says what they
need: a situation in their life ("making a doctor's appointment"), or a phrase in their own
language they want to be able to say. You also get their level.

Answer with up to {MAX_SUGGESTIONS} {target} phrases they can say in that situation, the most
useful first. Each is one natural, complete sentence or fixed expression that a native speaker
really says, polite where the situation calls for it, in standard {target} and as simple as the
situation allows for the learner's level. Give only phrases you are certain are correct and
idiomatic; fewer is better than a doubtful one. Do not repeat a phrase with only a word changed.

`meaning` is what the phrase means, written in {written_in}: a natural translation, not word by
word. {familiar_address(written_in)} Never put a {target} phrase in `meaning` unless
{written_in} is {target}; then `meaning` is a short plain explanation of when to use it."""


def _clean(text: str, most: int) -> str:
    return " ".join(text.split())[:most]


def _explained_in(profile: Profile, language: str) -> str:
    """The language code explanations are written in (see `explanation_languages`)."""
    if profile.value(language, "explanation_usage") == "never":
        return language
    return str(profile.value(language, "explanation_language") or "en")


class PhrasebookService:
    def __init__(
        self,
        *,
        profiles: ProfileService,
        accounts: AccountDirectory,
        cards: CardService,
        repository: PhraseRepository,
        limit: DailyLimit,
        text_model: TextModel,
        model: str,
        clock: Callable[[], dt.datetime],
        new_id: Callable[[], UUID] = uuid4,
    ) -> None:
        self._profiles = profiles
        self._accounts = accounts
        self._cards = cards
        self._repository = repository
        self._limit = limit
        self._text_model = text_model
        # An empty name: no suggestions (the learner can still keep phrases they type).
        self._model = model
        self._clock = clock
        self._new_id = new_id

    def _language(self, user_id: UUID) -> str:
        """The language whose phrasebook the learner sees: the one they are learning now."""
        return self._profiles.get(user_id).target_language or ""

    def phrases(self, user_id: UUID) -> list[PhrasebookEntry]:
        """The learner's phrases, newest first, each with whether it is a flashcard too."""
        found = self._repository.listed(user_id, self._language(user_id))
        in_deck = self._cards.has_words(user_id, [phrase.phrase for phrase in found])
        return [PhrasebookEntry(phrase, flag) for phrase, flag in zip(found, in_deck, strict=True)]

    def save(
        self, user_id: UUID, phrase: str, meaning: str, situation: str | None = None
    ) -> Phrase:
        """Keeps a phrase. Keeping what is kept already answers with that phrase. Raises
        `PhrasebookError` (`invalid_value`, `no_language`, `too_many`)."""
        text, said = _clean(phrase, PHRASE_MAX), _clean(meaning, MEANING_MAX)
        if not text or not said or len(phrase.strip()) > PHRASE_MAX:
            raise PhrasebookError("invalid_value")
        language = self._language(user_id)
        if not language:
            raise PhrasebookError("no_language")
        key = card_key(text)
        if not key:
            raise PhrasebookError("invalid_value")
        existing = self._repository.by_key(user_id, language, key)
        if existing is not None:
            return existing
        profile = self._profiles.get(user_id)
        kept = Phrase(
            id=self._new_id(),
            phrase=text,
            meaning=said,
            situation=_clean(situation or "", SITUATION_MAX) or None,
            explained_in=_explained_in(profile, language),
            created_at=self._clock(),
        )
        if self._repository.add(user_id, language, key, kept, MAX_PHRASES):
            return kept
        # Not stored: another request kept the same phrase meanwhile, or the book is full.
        existing = self._repository.by_key(user_id, language, key)
        if existing is None:
            raise PhrasebookError("too_many")
        return existing

    def remove(self, user_id: UUID, phrase_id: UUID) -> None:
        if not self._repository.remove(user_id, phrase_id):
            raise PhrasebookError("not_found")

    def make_card(self, user_id: UUID, phrase_id: UUID) -> Card:
        """Makes a flashcard of a kept phrase. Making what is a card already answers with that
        card. Raises `PhrasebookError` (`not_found`) or `CardError`."""
        kept = self._repository.get(user_id, phrase_id)
        if kept is None:
            raise PhrasebookError("not_found")
        return self._cards.save_phrase(user_id, kept.phrase, kept.meaning, kept.explained_in)

    def suggest(self, user_id: UUID, situation: str) -> list[Suggestion]:
        """Phrases for what the learner needs, not yet kept. Raises `PhrasebookError`
        (`invalid_value`, `unavailable`, `consent_required`, `no_language`, `suggestion_limit`)."""
        need = _clean(situation, SITUATION_MAX)
        if not need or len(situation.strip()) > SITUATION_MAX:
            raise PhrasebookError("invalid_value")
        if not self._model:
            raise PhrasebookError("unavailable")
        # The need goes to the text model's provider, which the learner must have agreed to
        # (Apple guideline 5.1.2(i)); they may have withdrawn.
        try:
            consented = self._accounts.get(user_id).voice_consent
        except AccountNotFound:
            consented = False
        if not consented:
            raise PhrasebookError("consent_required")
        profile = self._profiles.get(user_id)
        language = profile.target_language
        if not language:
            raise PhrasebookError("no_language")
        if not self._limit.reserve(user_id, self._clock().date(), DAILY_LIMIT):
            raise PhrasebookError("suggestion_limit")
        target, written_in = explanation_languages(profile, self._profiles.catalog, language)
        task = TextTask(
            model=self._model,
            instructions=_instructions(target, written_in),
            content=json.dumps(
                {"level": profile.level(language) or DEFAULT_LEVEL, "need": need},
                ensure_ascii=False,
            ),
            answer_name="phrasebook_suggestions",
            answer_schema=_SCHEMA,
            max_seconds=SUGGEST_SECONDS,
            charge=Charge(user_id, Feature.PHRASEBOOK),
        )
        try:
            found = _Suggestions.model_validate(self._text_model.answer(task))
        except (TextModelError, ValidationError) as error:
            raise PhrasebookError("unavailable") from error
        seen: set[str] = set()
        chosen: list[Suggestion] = []
        for item in found.phrases[:MAX_SUGGESTIONS]:
            phrase, meaning = _clean(item.phrase, PHRASE_MAX), _clean(item.meaning, MEANING_MAX)
            key = card_key(phrase)
            if not phrase or not meaning or not key or key in seen:
                continue
            seen.add(key)
            chosen.append(Suggestion(phrase, meaning))
        if not chosen:
            raise PhrasebookError("unavailable")
        kept = self._repository.known(user_id, language, [card_key(s.phrase) for s in chosen])
        return [Suggestion(s.phrase, s.meaning, saved=card_key(s.phrase) in kept) for s in chosen]
