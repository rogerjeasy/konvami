""" "Say it better" (spec §6.5): the learner says a corrected sentence again and hears whether it
is right now."""

from dataclasses import replace
from datetime import timedelta

import pytest

from konvami_api.domain.accounts import Account
from konvami_api.domain.conversations import ConversationError
from konvami_api.domain.costs import Feature
from konvami_api.domain.reports import Mistake
from konvami_api.domain.retries import MAX_RETRIES_PER_DAY, Retried, RetryError
from konvami_api.domain.speech import TranscriptionError
from tests.world import NOON, OTHER_USER, USER, World

AUDIO = b"\x00\x01" * 400
PERFEKT = Mistake(
    turn=1,
    original="Ich habe nach Berlin gefahren",
    corrected="Ich bin nach Berlin gefahren",
    explanation="« fahren » forme le Perfekt avec « sein ».",
    category="perfekt_auxiliary",
    severity="noticeable",
    certain=True,
)
UNSURE = replace(PERFEKT, original="mit der Bus", corrected="mit dem Bus", certain=False)


def reported(world: World, *mistakes: Mistake) -> str:
    lena, _ = world.onboard()
    call_id = world.talk(lena, at=NOON - timedelta(hours=1))
    world.reported(call_id, mistakes=mistakes or (PERFEKT, UNSURE))
    return call_id


def retry(world: World, call_id: str, heard: str, index: int = 0, fmt: str = "m4a") -> Retried:
    world.retry_transcriber.answers.append(heard)
    return world.retries.retry(USER, call_id, index, AUDIO, fmt, seconds=2.5)


def test_a_sentence_said_with_the_correction_is_right() -> None:
    world = World()
    call_id = reported(world)

    result = retry(
        world, call_id, "Gestern bin ich nach Berlin gefahren, ich bin nach Berlin gefahren."
    )

    assert result == Retried(
        heard="Gestern bin ich nach Berlin gefahren, ich bin nach Berlin gefahren.",
        right=True,
        said="Ich habe nach Berlin gefahren",
        better="Ich bin nach Berlin gefahren",
    )


def test_a_sentence_that_still_has_the_mistake_is_not_right_yet() -> None:
    world = World()
    call_id = reported(world)

    assert not retry(world, call_id, "Ich habe nach Berlin gefahren.").right


def test_a_sentence_that_says_both_is_not_right_yet() -> None:
    world = World()
    call_id = reported(world)

    assert not retry(world, call_id, "Ich habe, ich bin nach Berlin gefahren.").right


def test_a_sentence_without_the_corrected_words_is_not_right() -> None:
    world = World()
    call_id = reported(world)

    assert not retry(world, call_id, "Ich war in Berlin.").right


def test_the_attempt_is_written_down_as_said_keeping_mistakes() -> None:
    world = World()
    call_id = reported(world)

    retry(world, call_id, "Ich bin nach Berlin gefahren.", fmt="webm")

    (task,) = world.retry_transcriber.tasks
    assert (task.model, task.language, task.format, task.audio, task.seconds) == (
        "gpt-4o-transcribe",
        "de",
        "webm",
        AUDIO,
        2.5,
    )
    assert "Keep every mistake" in task.prompt
    assert task.charge is not None
    assert task.charge.feature is Feature.RETRY


def test_an_attempt_is_metered_at_least_by_its_size_whatever_the_app_says() -> None:
    world = World()
    call_id = reported(world)
    big = b"\x00" * 40_000  # 10 seconds at the lowest bitrate a recording has
    world.retry_transcriber.answers.append("Ich bin nach Berlin gefahren.")

    world.retries.retry(USER, call_id, 0, big, "m4a", seconds=0.5)

    assert world.retry_transcriber.tasks[0].seconds == 10.0


def test_attempts_are_remembered_with_whether_one_was_right() -> None:
    world = World()
    call_id = reported(world)
    retry(world, call_id, "Ich habe nach Berlin gefahren.")
    retry(world, call_id, "Ich bin nach Berlin gefahren.")

    assert world.retries.of_conversation(USER, call_id) == {0: True}


def test_a_correction_the_second_check_doubted_cannot_be_practised() -> None:
    world = World()
    call_id = reported(world)

    with pytest.raises(RetryError) as raised:
        retry(world, call_id, "mit dem Bus", index=1)

    assert raised.value.code == "unsure"


def test_a_correction_that_does_not_exist_is_not_found() -> None:
    world = World()
    call_id = reported(world)

    with pytest.raises(RetryError) as raised:
        retry(world, call_id, "…", index=7)

    assert raised.value.code == "not_found"


def test_a_conversation_without_a_ready_report_has_nothing_to_retry() -> None:
    world = World()
    lena, _ = world.onboard()
    call_id = world.talk(lena, at=NOON - timedelta(hours=1))

    with pytest.raises(RetryError) as raised:
        retry(world, call_id, "…")

    assert raised.value.code == "not_found"


def test_only_the_learner_whose_conversation_it_is_can_retry() -> None:
    world = World()
    call_id = reported(world)
    world.onboard(OTHER_USER)

    with pytest.raises(ConversationError):
        world.retries.retry(OTHER_USER, call_id, 0, AUDIO, "m4a")


def test_an_unknown_audio_format_is_refused() -> None:
    world = World()
    call_id = reported(world)

    with pytest.raises(RetryError) as raised:
        retry(world, call_id, "…", fmt="exe")

    assert raised.value.code == "invalid_value"


def test_a_learner_may_retry_only_so_often_a_day() -> None:
    world = World()
    call_id = reported(world)
    for _ in range(MAX_RETRIES_PER_DAY):
        retry(world, call_id, "Ich bin nach Berlin gefahren.")

    with pytest.raises(RetryError) as raised:
        retry(world, call_id, "Ich bin nach Berlin gefahren.")

    assert raised.value.code == "retry_limit"


def test_a_learner_who_withdrew_their_consent_is_not_sent_to_the_model() -> None:
    world = World()
    call_id = reported(world)
    world.accounts.accounts[USER] = Account("Amara", "fr", voice_consent=False)

    with pytest.raises(RetryError) as raised:
        retry(world, call_id, "…")

    assert raised.value.code == "consent_required"
    assert world.retry_transcriber.tasks == []


def test_an_attempt_that_cannot_be_written_down_is_unavailable() -> None:
    world = World()
    call_id = reported(world)
    world.retry_transcriber.answers.append(TranscriptionError("timeout"))

    with pytest.raises(RetryError) as raised:
        world.retries.retry(USER, call_id, 0, AUDIO, "m4a")

    assert raised.value.code == "unavailable"
