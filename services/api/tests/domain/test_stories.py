"""Listening stories (5.29): episodes written around the learner's words, in a series."""

import json
from datetime import timedelta
from typing import Any
from uuid import UUID

import pytest

from konvami_api.domain.costs import Feature
from konvami_api.domain.speech import SpeechError
from konvami_api.domain.stories import (
    MAX_PER_DAY,
    PENDING_FOR,
    StoryError,
    is_right_answer,
    story_instructions,
    written_episode,
)
from konvami_api.domain.text import TextModelError
from konvami_api.domain.vocabulary import VocabularyCounts
from tests.domain.test_planner import card
from tests.world import OTHER_USER, USER, World


def episode_text(
    *,
    speakers: tuple[int, ...] = (0, 0, 0, 0),
    words_used: tuple[str, ...] = ("der Termin",),
    title: str = "Lenas Wohnung",
) -> dict[str, Any]:
    lines = [
        "Heute habe ich einen Termin bei der Wohnung.",
        "Die Wohnung ist klein, aber hell.",
        "Der Vermieter heißt Herr Keller.",
        "Morgen rufe ich ihn an.",
    ]
    return {
        "title": title,
        "summary": "Lena visits a small, bright flat; the landlord is Herr Keller.",
        "lines": [
            {"speaker": speaker, "text": lines[index % len(lines)]}
            for index, speaker in enumerate(speakers)
        ],
        "questions": [{"question": "Wie heißt der Vermieter?", "answer": "Herr Keller"}],
        "words_used": list(words_used),
    }


def onboarded(world: World) -> tuple[UUID, UUID]:
    lena, jonas = world.onboard()
    return lena.id, jonas.id


def written(world: World, answer: dict[str, Any] | Exception | None = None) -> UUID:
    """Asks for the next episode and has the worker write it."""
    episode = world.stories.make(USER)
    world.text.answers.append(episode_text() if answer is None else answer)
    world.stories.write(episode.id)
    return episode.id


def test_an_episode_is_written_in_the_background_and_spoken_line_by_line() -> None:
    world = World()
    lena, _ = onboarded(world)
    card(world, "der Termin", "le rendez-vous", due_in=-timedelta(days=1))

    pending = world.stories.make(USER)

    assert pending.status == "pending"
    assert pending.number == 1
    assert pending.cast == (lena,)
    assert world.story_starter.started == [pending.id]
    world.text.answers.append(episode_text())
    world.stories.write(pending.id)

    view = world.stories.episode(USER, pending.id)
    episode = view.episode
    assert episode.status == "ready"
    assert episode.title == "Lenas Wohnung"
    assert len(episode.lines) == 4
    assert all(line.audio_key for line in episode.lines)
    assert all(address for address in view.addresses)
    assert view.names == ("Lena",)
    assert episode.words == ("der Termin",)
    # Each line in the partner's voice, metered as the story's sound.
    lena_voice = world.personas.partners(USER)[0].voice
    assert {task.voice for task in world.story_speech.tasks} == {lena_voice}
    assert {task.charge.feature for task in world.story_speech.tasks if task.charge} == {
        Feature.STORY_AUDIO
    }


def test_the_writer_gets_the_learners_words_level_and_never_about_but_no_facts_as_facts() -> None:
    world = World()
    onboarded(world)
    card(world, "der Termin", "le rendez-vous", due_in=-timedelta(days=1))

    written(world)

    task = world.text.tasks[-1]
    content = json.loads(task.content)
    assert content["words"] == ["der Termin"]
    assert content["level"]
    assert content["episode"] == 1
    assert "never_about" in content
    assert task.charge is not None
    assert task.charge.feature == Feature.STORY
    said = " ".join(task.instructions.split())
    assert "never address them" in said
    assert "hints, never facts" in said


def test_the_series_goes_on_with_the_story_so_far_and_every_second_episode_is_a_dialogue() -> None:
    world = World()
    lena, jonas = onboarded(world)
    first = written(world)
    world.clock.now += timedelta(hours=1)

    second = world.stories.make(USER)

    assert second.number == 2
    assert second.cast == (lena, jonas)
    world.text.answers.append(episode_text(speakers=(0, 1, 0, 1)))
    world.stories.write(second.id)
    content = json.loads(world.text.tasks[-1].content)
    assert [e["number"] for e in content["story_so_far"]] == [1]
    assert "dialogue between" in " ".join(world.text.tasks[-1].instructions.split())
    voices = {task.voice for task in world.story_speech.tasks[-4:]}
    assert len(voices) == 2
    assert world.stories.episode(USER, first).episode.status == "ready"


def test_the_learner_can_choose_who_tells_the_next_episode() -> None:
    world = World()
    _, jonas = onboarded(world)

    assert world.stories.make(USER, [jonas]).cast == (jonas,)


@pytest.mark.parametrize("cast", [[UUID(int=7)], "three"])
def test_a_cast_that_is_not_the_learners_is_refused(cast: object) -> None:
    world = World()
    lena, jonas = onboarded(world)
    wanted = [lena, jonas, UUID(int=9)] if cast == "three" else cast

    with pytest.raises(StoryError, match="invalid_value"):
        world.stories.make(USER, wanted)  # type: ignore[arg-type]


def test_one_episode_at_a_time_and_a_few_a_day() -> None:
    world = World()
    onboarded(world)
    world.stories.make(USER)

    with pytest.raises(StoryError, match="pending"):
        world.stories.make(USER)

    for _ in range(MAX_PER_DAY - 1):
        world.clock.now += PENDING_FOR + timedelta(minutes=1)
        world.stories.make(USER)
    world.clock.now += PENDING_FOR + timedelta(minutes=1)
    with pytest.raises(StoryError, match="daily_limit"):
        world.stories.make(USER)
    assert world.stories.series(USER).left_today == 0
    world.clock.now += timedelta(days=1)
    assert world.stories.series(USER).left_today == MAX_PER_DAY


@pytest.mark.parametrize(
    "answer",
    [
        TextModelError("down"),
        episode_text(speakers=(0, 0)),
        episode_text(speakers=(0, 1, 0, 0)),
        {**episode_text(), "questions": []},
    ],
)
def test_an_episode_that_cannot_be_told_fails_and_can_be_asked_for_again(
    answer: dict[str, Any] | Exception,
) -> None:
    world = World()
    onboarded(world)

    episode = written(world, answer)

    assert world.stories.episode(USER, episode).episode.status == "failed"
    assert world.story_speech.tasks == []
    world.stories.make(USER)


def test_an_episode_whose_line_cannot_be_spoken_fails() -> None:
    world = World()
    onboarded(world)
    world.story_speech.fail = SpeechError("down")

    episode = written(world)

    assert world.stories.episode(USER, episode).episode.status == "failed"


def test_a_worker_that_was_never_started_fails_the_episode_at_once() -> None:
    world = World()
    onboarded(world)
    world.story_starter.fail = RuntimeError("no lambda")

    assert world.stories.make(USER).status == "failed"


def test_a_pending_episode_left_too_long_shows_as_failed() -> None:
    world = World()
    onboarded(world)
    pending = world.stories.make(USER)
    world.clock.now += PENDING_FOR + timedelta(seconds=1)

    assert world.stories.episode(USER, pending.id).episode.status == "failed"


def test_an_episode_is_written_once_even_if_delivered_twice() -> None:
    world = World()
    onboarded(world)
    episode = written(world)

    world.stories.write(episode)

    stories = [t for t in world.text.tasks if t.charge and t.charge.feature == Feature.STORY]
    assert len(stories) == 1


def test_only_words_the_episode_says_count_as_heard_and_only_once() -> None:
    world = World()
    onboarded(world)
    episode = written(world, episode_text(words_used=("der Termin", "umsteigen")))

    assert world.stories.episode(USER, episode).episode.words == ("der Termin",)
    world.stories.listened(USER, episode)
    world.stories.listened(USER, episode)

    assert world.vocabulary.counts(USER, "de") == VocabularyCounts(0, 1)
    assert world.stories.episode(USER, episode).episode.listened_at is not None


def test_a_spoken_answer_is_checked_against_the_episodes_answer() -> None:
    world = World()
    onboarded(world)
    episode = written(world)
    world.story_transcriber.answers += ["Er heißt Herr Keller.", "Ich weiß nicht."]

    right = world.stories.answer(USER, episode, 0, b"audio", "m4a", 2.0)
    wrong = world.stories.answer(USER, episode, 0, b"audio", "m4a", 2.0)

    assert right.right
    assert not wrong.right
    # The latest answer is kept, one per question.
    assert world.stories.episode(USER, episode).episode.answers == (wrong,)
    task = world.story_transcriber.tasks[-1]
    assert task.charge is not None
    assert task.charge.feature == Feature.STORY_LISTEN


def test_an_unknown_question_or_someone_elses_episode_is_not_found() -> None:
    world = World()
    onboarded(world)
    episode = written(world)

    with pytest.raises(StoryError, match="not_found"):
        world.stories.answer(USER, episode, 5, b"audio", "m4a", None)
    with pytest.raises(StoryError, match="not_found"):
        world.stories.episode(OTHER_USER, episode)


def test_without_partners_there_is_no_story() -> None:
    world = World()
    world.onboard()
    world.personas.partners = lambda user_id: []  # type: ignore[method-assign]

    with pytest.raises(StoryError, match="no_partner"):
        world.stories.make(USER)


def test_the_series_lists_episodes_newest_first_with_the_casts_names() -> None:
    world = World()
    lena, _ = onboarded(world)
    written(world)
    world.clock.now += timedelta(hours=1)
    written(world, episode_text(speakers=(0, 1, 0, 1)))

    series = world.stories.series(USER)

    assert [e.number for e in series.episodes] == [2, 1]
    assert series.names[lena] == "Lena"
    assert series.available


def test_answers_count_plain_words_in_any_order() -> None:
    assert is_right_answer("Er heißt Herr Keller", "Herr Keller")
    assert is_right_answer("keller herr", "Herr Keller")
    assert not is_right_answer("Herr Müller", "Herr Keller")
    assert not is_right_answer("anything", "")


def test_a_written_episode_must_fit_its_cast_and_length() -> None:
    assert written_episode(episode_text(), 1) is not None
    assert written_episode(episode_text(speakers=(0, 1, 0, 1)), 1) is None
    assert written_episode({"title": "x"}, 1) is None
    assert written_episode(episode_text(title=" "), 1) is None


def test_the_instructions_say_what_kind_of_episode() -> None:
    assert "dialogue between the two characters" in " ".join(
        story_instructions("German", True).split()
    )
    assert "scene told by one character" in " ".join(story_instructions("German", False).split())
