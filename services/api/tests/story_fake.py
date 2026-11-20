"""Listening-story doubles (5.29), shared by the service and storage contract tests."""

import datetime as dt
from collections.abc import Sequence
from dataclasses import replace
from uuid import UUID

from konvami_api.domain.stories import Episode, StoryAnswer
from tests.vocabulary_fake import MemoryVocabularyRepository


class InMemoryStoryRepository:
    def __init__(self, vocabulary: MemoryVocabularyRepository | None = None) -> None:
        self.episodes: dict[UUID, Episode] = {}
        self.attempts: dict[UUID, int] = {}
        # The words heard, as (episode, key): what the SQL table keeps.
        self.heard: dict[tuple[UUID, str], str] = {}
        self._vocabulary = vocabulary

    def add(self, episode: Episode) -> None:
        self.episodes[episode.id] = episode

    def get(self, episode_id: UUID) -> Episode | None:
        return self.episodes.get(episode_id)

    def listed(self, user_id: UUID, language: str, limit: int) -> list[Episode]:
        mine = [
            e for e in self.episodes.values() if e.user_id == user_id and e.language == language
        ]
        return sorted(mine, key=lambda e: (e.number, e.created_at), reverse=True)[:limit]

    def made_since(self, user_id: UUID, since: dt.datetime) -> int:
        return sum(
            1 for e in self.episodes.values() if e.user_id == user_id and e.created_at >= since
        )

    def claim(
        self, episode_id: UUID, at: dt.datetime, stale_before: dt.datetime, max_attempts: int
    ) -> bool:
        episode = self.episodes.get(episode_id)
        if episode is None or episode.status != "pending":
            return False
        if self.attempts.get(episode_id, 0) >= max_attempts:
            return False
        if episode.claimed_at is not None and episode.claimed_at > stale_before:
            return False
        self.attempts[episode_id] = self.attempts.get(episode_id, 0) + 1
        self.episodes[episode_id] = replace(episode, claimed_at=at)
        return True

    def finish(self, episode: Episode) -> None:
        stored = self.episodes[episode.id]
        self.episodes[episode.id] = replace(
            stored,
            status=episode.status,
            title=episode.title,
            summary=episode.summary,
            lines=episode.lines,
            questions=episode.questions,
            words=episode.words,
        )

    def listened(self, episode_id: UUID, at: dt.datetime, heard: Sequence[tuple[str, str]]) -> None:
        episode = self.episodes[episode_id]
        if episode.listened_at is not None:
            return
        self.episodes[episode_id] = replace(episode, listened_at=at)
        for key, word in heard:
            self.heard.setdefault((episode_id, key), word)
            if self._vocabulary is not None:
                self._vocabulary.story_words.add((episode.user_id, episode.language, key))

    def answered(self, episode_id: UUID, answer: StoryAnswer) -> None:
        episode = self.episodes[episode_id]
        others = tuple(a for a in episode.answers if a.question != answer.question)
        self.episodes[episode_id] = replace(
            episode, answers=tuple(sorted((*others, answer), key=lambda a: a.question))
        )


class RecordingStoryStarter:
    def __init__(self) -> None:
        self.started: list[UUID] = []
        self.fail: Exception | None = None

    def start(self, episode_id: UUID) -> None:
        if self.fail:
            raise self.fail
        self.started.append(episode_id)
