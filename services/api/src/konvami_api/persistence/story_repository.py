"""Listening stories' episodes (5.29) and the words heard in them."""

import datetime as dt
import json
from collections.abc import Sequence
from typing import Any
from uuid import UUID

from konvami_api.domain.stories import Episode, StoryAnswer, StoryLine, StoryQuestion
from konvami_api.persistence.sql import SqlClient, epoch_micros, from_epoch_micros

_COLUMNS = f"""
    CAST(id AS text) AS id, CAST(user_id AS text) AS user_id, language, number,
    CAST(cast_ids AS text) AS cast_ids, status, title, summary, CAST(lines AS text) AS lines,
    CAST(questions AS text) AS questions, CAST(words AS text) AS words,
    CAST(answers AS text) AS answers, {epoch_micros("claimed_at")} AS claimed_at,
    {epoch_micros("listened_at")} AS listened_at, {epoch_micros("created_at")} AS created_at
"""
_ADD = """
    INSERT INTO story_episode (id, user_id, language, number, cast_ids, status, created_at)
    VALUES (CAST(:id AS uuid), CAST(:user_id AS uuid), :language, :number,
            CAST(:cast_ids AS jsonb), :status, CAST(:created_at AS timestamptz))
"""
_GET = f"SELECT {_COLUMNS} FROM story_episode WHERE id = CAST(:id AS uuid)"
_LIST = f"""
    SELECT {_COLUMNS} FROM story_episode
    WHERE user_id = CAST(:user_id AS uuid) AND language = :language
    ORDER BY number DESC, created_at DESC
    LIMIT :limit
"""
_MADE_SINCE = """
    SELECT count(*) AS made FROM story_episode
    WHERE user_id = CAST(:user_id AS uuid) AND created_at >= CAST(:since AS timestamptz)
"""
_CLAIM = """
    UPDATE story_episode SET claimed_at = CAST(:at AS timestamptz), attempts = attempts + 1
    WHERE id = CAST(:id AS uuid) AND status = 'pending' AND attempts < :max_attempts
        AND (claimed_at IS NULL OR claimed_at <= CAST(:stale AS timestamptz))
    RETURNING CAST(id AS text) AS id
"""
_FINISH = """
    UPDATE story_episode SET status = :status, title = :title, summary = :summary,
        lines = CAST(:lines AS jsonb), questions = CAST(:questions AS jsonb),
        words = CAST(:words AS jsonb)
    WHERE id = CAST(:id AS uuid)
"""
# Marking an episode listened and keeping its words is one statement, so a second "listened"
# finds it marked and adds nothing.
_LISTENED = """
    WITH marked AS (
        UPDATE story_episode SET listened_at = CAST(:at AS timestamptz)
        WHERE id = CAST(:id AS uuid) AND listened_at IS NULL
        RETURNING id, user_id, language
    )
    INSERT INTO story_word (episode_id, user_id, language, word_key, word)
    SELECT marked.id, marked.user_id, marked.language, item.word_key, item.word
    FROM marked, jsonb_to_recordset(CAST(:heard AS jsonb)) AS item(word_key text, word text)
    ON CONFLICT (episode_id, word_key) DO NOTHING
"""
# The latest answer to a question replaces an earlier one.
_ANSWERED = """
    UPDATE story_episode SET answers = COALESCE((
        SELECT jsonb_agg(item) FROM jsonb_array_elements(answers) AS item
        WHERE (item ->> 'question') <> :question
    ), CAST('[]' AS jsonb)) || jsonb_build_array(CAST(:answer AS jsonb))
    WHERE id = CAST(:id AS uuid)
"""


def _time(value: Any) -> dt.datetime | None:
    return from_epoch_micros(int(value)) if value is not None else None


def _episode(row: dict[str, Any]) -> Episode:
    return Episode(
        id=UUID(row["id"]),
        user_id=UUID(row["user_id"]),
        language=row["language"],
        number=int(row["number"]),
        cast=tuple(UUID(persona_id) for persona_id in json.loads(row["cast_ids"])),
        status=row["status"],
        created_at=from_epoch_micros(int(row["created_at"])),
        title=row["title"],
        summary=row["summary"],
        lines=tuple(
            StoryLine(int(line["speaker"]), line["text"], line.get("audio_key"))
            for line in json.loads(row["lines"])
        ),
        questions=tuple(
            StoryQuestion(question["question"], question["answer"])
            for question in json.loads(row["questions"])
        ),
        words=tuple(json.loads(row["words"])),
        claimed_at=_time(row["claimed_at"]),
        listened_at=_time(row["listened_at"]),
        answers=tuple(
            StoryAnswer(int(answer["question"]), answer["heard"], bool(answer["right"]))
            for answer in sorted(json.loads(row["answers"]), key=lambda item: int(item["question"]))
        ),
    )


class SqlStoryRepository:
    def __init__(self, client: SqlClient) -> None:
        self._client = client

    def add(self, episode: Episode) -> None:
        self._client.execute(
            _ADD,
            {
                "id": str(episode.id),
                "user_id": str(episode.user_id),
                "language": episode.language,
                "number": episode.number,
                "cast_ids": json.dumps([str(persona_id) for persona_id in episode.cast]),
                "status": episode.status,
                "created_at": episode.created_at.isoformat(),
            },
        )

    def get(self, episode_id: UUID) -> Episode | None:
        rows = self._client.execute(_GET, {"id": str(episode_id)})
        return _episode(rows[0]) if rows else None

    def listed(self, user_id: UUID, language: str, limit: int) -> list[Episode]:
        rows = self._client.execute(
            _LIST, {"user_id": str(user_id), "language": language, "limit": limit}
        )
        return [_episode(row) for row in rows]

    def made_since(self, user_id: UUID, since: dt.datetime) -> int:
        rows = self._client.execute(
            _MADE_SINCE, {"user_id": str(user_id), "since": since.isoformat()}
        )
        return int(rows[0]["made"])

    def claim(
        self, episode_id: UUID, at: dt.datetime, stale_before: dt.datetime, max_attempts: int
    ) -> bool:
        return bool(
            self._client.execute(
                _CLAIM,
                {
                    "id": str(episode_id),
                    "at": at.isoformat(),
                    "stale": stale_before.isoformat(),
                    "max_attempts": max_attempts,
                },
            )
        )

    def finish(self, episode: Episode) -> None:
        self._client.execute(
            _FINISH,
            {
                "id": str(episode.id),
                "status": episode.status,
                "title": episode.title,
                "summary": episode.summary,
                "lines": json.dumps(
                    [
                        {"speaker": line.speaker, "text": line.text, "audio_key": line.audio_key}
                        for line in episode.lines
                    ],
                    ensure_ascii=False,
                ),
                "questions": json.dumps(
                    [{"question": q.question, "answer": q.answer} for q in episode.questions],
                    ensure_ascii=False,
                ),
                "words": json.dumps(list(episode.words), ensure_ascii=False),
            },
        )

    def listened(self, episode_id: UUID, at: dt.datetime, heard: Sequence[tuple[str, str]]) -> None:
        unique = dict(heard)
        self._client.execute(
            _LISTENED,
            {
                "id": str(episode_id),
                "at": at.isoformat(),
                "heard": json.dumps(
                    [{"word_key": key, "word": word} for key, word in unique.items()],
                    ensure_ascii=False,
                ),
            },
        )

    def answered(self, episode_id: UUID, answer: StoryAnswer) -> None:
        self._client.execute(
            _ANSWERED,
            {
                "id": str(episode_id),
                "question": str(answer.question),
                "answer": json.dumps(
                    {"question": answer.question, "heard": answer.heard, "right": answer.right},
                    ensure_ascii=False,
                ),
            },
        )
