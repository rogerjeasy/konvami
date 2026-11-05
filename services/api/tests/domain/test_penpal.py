"""Voice-note pen-pal mode (spec §6.16, §12.5): a partner who writes first, the learner's voice
notes written down word for word, and answers with corrections that were checked twice."""

from datetime import timedelta
from typing import Any
from uuid import UUID

import pytest

from konvami_api.domain.accounts import Account
from konvami_api.domain.costs import Feature
from konvami_api.domain.penpal import (
    MAX_ATTEMPTS,
    MAX_REPLIES_PER_DAY,
    PENDING_FOR,
    PenPalError,
    Settings,
)
from konvami_api.domain.personas import Persona
from konvami_api.domain.text import TextModelError
from tests.world import NOON, OTHER_USER, USER, World

NOTE: dict[str, Any] = {"text": "Hallo! Heute habe ich Kuchen gebacken. Und du?", "hook": "own_day"}
SAID = "Ich habe gestern ein Film gesehen und er war sehr gut"
PHONE = "ExponentPushToken[phone-1]"


def reviewed(*verdicts: str) -> dict[str, Any]:
    return {
        "mistakes": [{"id": i, "verdict": v} for i, v in enumerate(verdicts)],
        "rewrites": [],
    }


def answer(corrections: list[dict[str, str]], memories: list[dict[str, Any]] | None = None) -> Any:
    return {
        "reply": "Das klingt schön! Welchen Film hast du gesehen?",
        "correction_lead": "Kleine Korrektur:",
        "corrections": corrections,
        "memories": memories or [],
    }


FILM = {
    "original": "ein Film",
    "corrected": "einen Film",
    "spoken": "Man sagt: einen Film gesehen.",
    "explanation": "Après « sehen », l’accusatif : einen.",
    "category": "case",
}


@pytest.fixture
def world() -> World:
    world = World()
    world.onboard()
    # Onboarding asked the text model for partners: only the pen-pal's requests count below.
    world.text.tasks.clear()
    world.push.register(
        USER,
        token=PHONE,
        platform="ios",
        timezone="Europe/Zurich",
        language="en",
        time="18:00",
    )
    return world


def withdraw_consent(world: World) -> None:
    world.accounts.accounts[USER] = Account("Amara", "fr", voice_consent=False)


def lena(world: World) -> Persona:
    return world.personas.partners(USER)[0]


def voice_note(world: World, text: str = SAID, *, partner: Persona | None = None) -> Any:
    world.penpal_transcriber.answers.append(text)
    return world.penpal.reply(USER, (partner or lena(world)).id, b"audio", "m4a", 4.0)


def written_reply(world: World, *answers: Any, text: str = SAID) -> Any:
    heard, pending = voice_note(world, text)
    world.text.answers.extend(answers)
    world.penpal.write(pending.id)
    return heard, world.penpal_store.get(pending.id)


# --- Settings ----------------------------------------------------------------------------------


def test_the_partners_write_first_only_once_the_learner_turns_it_on(world: World) -> None:
    assert world.penpal.settings(USER) == Settings(enabled=False)

    settings = world.penpal.configure(USER, enabled=True, per_week=5, timezone="Europe/Zurich")

    assert (settings.enabled, settings.per_week, settings.timezone) == (
        True,
        5,
        "Europe/Zurich",
    )
    assert world.penpal.settings(USER) == settings


@pytest.mark.parametrize(
    "changes",
    [{"per_week": 0}, {"per_week": 8}, {"quiet_from": 24}, {"quiet_to": -1}, {"timezone": "Mars"}],
)
def test_a_setting_out_of_range_changes_nothing(world: World, changes: dict[str, Any]) -> None:
    with pytest.raises(PenPalError) as refused:
        world.penpal.configure(USER, enabled=True, **changes)

    assert refused.value.code == "invalid_value"
    assert world.penpal.settings(USER).enabled is False


# --- A note the partner sends on its own -------------------------------------------------------


def turned_on(world: World, **changes: Any) -> None:
    world.penpal.configure(USER, enabled=True, timezone="UTC", **changes)


def test_a_due_note_is_written_in_the_partners_voice_and_announced(world: World) -> None:
    turned_on(world)
    world.text.answers.append(NOTE)

    assert world.penpal.send_due() == 1

    [note] = world.penpal_store.notes.values()
    assert (note.sender, note.status, note.text) == ("partner", "ready", NOTE["text"])
    assert note.persona_id == lena(world).id
    assert note.audio_key == f"users/{USER}/penpal/{note.id}.mp3"
    assert world.files.files[note.audio_key] == (f"mp3:{lena(world).voice}".encode(), "audio/mpeg")
    assert [(m.title, m.body, dict(m.data)) for m in world.push_sender.sent] == [
        ("Lena", "Sent you a voice note.", {"open": "pen_pal", "id": str(lena(world).id)})
    ]
    task = world.text.tasks[0]
    assert task.charge is not None
    assert task.charge.feature is Feature.PEN_PAL
    assert world.speech.tasks[0].charge is not None
    assert world.speech.tasks[0].charge.feature is Feature.PEN_PAL_AUDIO


def test_the_note_is_written_from_what_the_partner_remembers(world: World) -> None:
    turned_on(world)
    world.memories.remember(
        USER,
        lena(world),
        "Nächste Woche habe ich ein Vorstellungsgespräch",
        [
            {
                "kind": "event",
                "text": "Has a job interview",
                "day": "2026-10-14",
                "importance": 3,
                "ask": "Wie war das Gespräch?",
            }
        ],
        NOON.date(),
    )
    world.text.answers.append(NOTE)

    world.penpal.send_due()

    content = world.text.tasks[0].content
    assert "Has a job interview" in content
    assert "gespräch" not in content.lower().replace("vorstellungsgespräch", "")


def test_nothing_is_sent_to_a_learner_who_did_not_turn_it_on(world: World) -> None:
    assert world.penpal.send_due() == 0
    assert world.text.tasks == []


@pytest.mark.parametrize("hour", [21, 23, 3, 7])
def test_nothing_is_sent_in_the_quiet_hours(world: World, hour: int) -> None:
    turned_on(world)
    world.clock.now = NOON.replace(hour=hour)

    assert world.penpal.send_due() == 0


def test_quiet_hours_follow_the_learners_own_clock(world: World) -> None:
    # 12:00 in UTC is 21:00 in Tokyo: quiet there.
    world.penpal.configure(USER, enabled=True, timezone="Asia/Tokyo")

    assert world.penpal.send_due() == 0


def test_equal_quiet_hours_mean_there_are_none(world: World) -> None:
    turned_on(world, quiet_from=0, quiet_to=0)
    world.clock.now = NOON.replace(hour=3)
    world.text.answers.append(NOTE)

    assert world.penpal.send_due() == 1


def test_notes_are_spread_over_the_week(world: World) -> None:
    turned_on(world, per_week=2)
    world.text.answers.extend([NOTE, NOTE, NOTE])

    assert world.penpal.send_due() == 1
    # A day later is too soon for two a week (a gap of about 2.6 days).
    world.clock.now += timedelta(days=1)
    assert world.penpal.send_due() == 0
    world.clock.now += timedelta(days=2)
    # The partner has waited for an answer for three days; one unanswered note is still fine.
    assert world.penpal.send_due() == 1


def test_a_partner_waits_for_an_answer_before_piling_up(world: World) -> None:
    turned_on(world, per_week=7)
    world.text.answers.extend([NOTE] * 4)

    for _ in range(4):
        world.penpal.send_due()
        world.clock.now += timedelta(days=1)

    assert len(world.penpal_store.notes) == 2


def test_a_learner_without_consent_gets_nothing(world: World) -> None:
    turned_on(world)
    withdraw_consent(world)

    assert world.penpal.send_due() == 0
    assert world.text.tasks == []


def test_a_note_whose_sound_cannot_be_made_is_not_sent(world: World) -> None:
    from konvami_api.domain.speech import SpeechError

    turned_on(world)
    world.text.answers.append(NOTE)
    world.speech.fail = SpeechError("down")

    assert world.penpal.send_due() == 0

    [note] = world.penpal_store.notes.values()
    assert note.status == "failed"
    # A failed note does not use up the week's notes.
    assert world.penpal_store.partner_notes_since(USER, NOON - timedelta(days=7)) == 0
    assert world.push_sender.sent == []


def test_one_learner_failing_does_not_stop_the_others(world: World) -> None:
    turned_on(world)
    world.text.answers.append(TextModelError("down"))

    assert world.penpal.send_due() == 0
    [note] = world.penpal_store.notes.values()
    assert note.status == "failed"


def test_a_learner_can_ask_for_a_note_now(world: World) -> None:
    pending = world.penpal.ask(USER, lena(world).id)

    assert (pending.status, pending.sender) == ("pending", "partner")
    assert world.penpal_starter.started == [pending.id]
    world.text.answers.append(NOTE)
    world.penpal.write(pending.id)
    assert world.penpal_store.get(pending.id).status == "ready"  # type: ignore[union-attr]


def test_asking_is_limited_per_day(world: World) -> None:
    world.penpal.ask(USER, lena(world).id)
    world.penpal.ask(USER, lena(world).id)

    with pytest.raises(PenPalError) as refused:
        world.penpal.ask(USER, lena(world).id)

    assert refused.value.code == "limit"


def test_a_partner_that_is_not_the_learners_is_not_found(world: World) -> None:
    other = World()
    other.onboard(OTHER_USER)
    stranger = other.personas.partners(OTHER_USER)[0]

    with pytest.raises(PenPalError) as refused:
        world.penpal.ask(USER, stranger.id)

    assert refused.value.code == "not_found"


# --- The learner's voice note ------------------------------------------------------------------


def test_a_voice_note_is_written_down_word_for_word_and_answered_later(world: World) -> None:
    heard, pending = voice_note(world)

    assert (heard.sender, heard.status, heard.text) == ("learner", "ready", SAID)
    assert (pending.sender, pending.status, pending.reply_to) == ("partner", "pending", heard.id)
    assert world.penpal_starter.started == [pending.id]
    task = world.penpal_transcriber.tasks[0]
    assert task.charge is not None
    assert task.charge.feature is Feature.PEN_PAL_LISTEN
    # Mistakes are kept, not tidied away (spec §9.4).
    assert "mistake" in task.prompt.lower()


def test_the_recording_is_kept_only_if_the_learner_keeps_recordings(world: World) -> None:
    heard, _ = voice_note(world)
    assert heard.audio_key == f"users/{USER}/recordings/penpal/{heard.id}.m4a"
    assert world.files.files[heard.audio_key][0] == b"audio"

    world.recordings.configure(USER, kept=False)
    silent, _ = voice_note(world)

    # Turning recordings off deleted the one kept so far, and the new one is not kept.
    assert silent.audio_key is None
    assert world.files.files == {}


def test_a_cough_is_not_answered(world: World) -> None:
    world.penpal_transcriber.answers.append("Äh")

    with pytest.raises(PenPalError) as refused:
        world.penpal.reply(USER, lena(world).id, b"audio", "m4a", 1.0)

    assert refused.value.code == "too_short"
    assert world.penpal_store.notes == {}


def test_a_learner_without_consent_cannot_send_a_voice_note(world: World) -> None:
    withdraw_consent(world)

    with pytest.raises(PenPalError) as refused:
        world.penpal.reply(USER, lena(world).id, b"audio", "m4a", 4.0)

    assert refused.value.code == "consent_required"


def test_a_recording_that_is_not_audio_is_refused(world: World) -> None:
    with pytest.raises(PenPalError) as refused:
        world.penpal.reply(USER, lena(world).id, b"audio", "exe", 4.0)

    assert refused.value.code == "invalid_value"


def test_voice_notes_are_limited_per_day(world: World) -> None:
    for _ in range(MAX_REPLIES_PER_DAY):
        voice_note(world)

    with pytest.raises(PenPalError) as refused:
        voice_note(world)

    assert refused.value.code == "limit"


def test_an_answer_that_cannot_be_started_is_failed_and_can_be_tried_again(world: World) -> None:
    world.penpal_starter.fail = RuntimeError("lambda down")

    _, pending = voice_note(world)

    assert world.penpal_store.get(pending.id).status == "failed"  # type: ignore[union-attr]
    world.penpal_starter.fail = None
    again = world.penpal.retry(USER, pending.id)
    assert again.status == "pending"
    assert world.penpal_starter.started == [pending.id]


# --- The partner's answer, and its corrections -------------------------------------------------


def test_a_confirmed_correction_is_spoken_and_shown(world: World) -> None:
    _, reply = written_reply(world, answer([FILM]), reviewed("correct"))

    assert reply.status == "ready"
    assert reply.text == (
        "Das klingt schön! Welchen Film hast du gesehen? "
        "Kleine Korrektur: Man sagt: einen Film gesehen."
    )
    [correction] = reply.corrections
    assert (correction.original, correction.corrected, correction.certain) == (
        "ein Film",
        "einen Film",
        True,
    )
    assert world.speech.tasks[-1].text == reply.text
    assert [m.body for m in world.push_sender.sent] == ["Answered your voice note."]
    # The analysis, then the independent second check (spec §16.1).
    assert [t.answer_name for t in world.text.tasks] == ["pen_pal_reply", "correction_review"]


def test_a_correction_the_check_cannot_confirm_is_shown_as_a_possibility_not_spoken(
    world: World,
) -> None:
    _, reply = written_reply(world, answer([FILM]), reviewed("uncertain"))

    assert reply.text == "Das klingt schön! Welchen Film hast du gesehen?"
    [correction] = reply.corrections
    assert correction.certain is False
    assert "Korrektur" not in world.speech.tasks[-1].text


def test_a_correction_the_check_calls_wrong_is_dropped(world: World) -> None:
    _, reply = written_reply(world, answer([FILM]), reviewed("wrong"))

    assert reply.corrections == ()
    assert reply.text == "Das klingt schön! Welchen Film hast du gesehen?"


def test_without_a_second_check_a_correction_is_only_a_possibility(world: World) -> None:
    _, reply = written_reply(world, answer([FILM]), TextModelError("down"))

    assert reply.status == "ready"
    assert [c.certain for c in reply.corrections] == [False]
    assert "Korrektur" not in reply.text


def test_words_the_learner_never_said_are_not_corrected(world: World) -> None:
    invented = {**FILM, "original": "eine Katze", "corrected": "einer Katze"}

    _, reply = written_reply(world, answer([invented]))

    assert reply.corrections == ()
    # Nothing to check: the second check is not asked.
    assert [t.answer_name for t in world.text.tasks] == ["pen_pal_reply"]


def test_a_correction_that_changes_no_word_is_not_a_correction(world: World) -> None:
    same = {**FILM, "corrected": "Ein film"}

    _, reply = written_reply(world, answer([same]))

    assert reply.corrections == ()


def test_a_spoken_sentence_without_the_corrected_words_is_replaced_by_them(world: World) -> None:
    drifting = {**FILM, "spoken": "Das ist ein Fehler."}

    _, reply = written_reply(world, answer([drifting]), reviewed("correct"))

    assert reply.text.endswith("Kleine Korrektur: einen Film")


def test_what_the_learner_told_is_remembered(world: World) -> None:
    memory = {
        "kind": "fact",
        "text": "Likes going to the cinema",
        "day": None,
        "importance": 1,
        "ask": None,
    }

    written_reply(world, answer([], [memory]))

    assert [m.text for m in world.memory_store.listed(USER)] == ["Likes going to the cinema"]


def test_nothing_is_remembered_while_memory_is_off(world: World) -> None:
    world.memories.configure(USER, enabled=False)
    memory = {"kind": "fact", "text": "Likes the cinema", "day": None, "importance": 1, "ask": None}

    written_reply(world, answer([], [memory]))

    assert world.memory_store.listed(USER) == []


def test_an_answer_the_model_could_not_write_fails_and_can_be_asked_again(world: World) -> None:
    _, reply = written_reply(world, TextModelError("down"))

    assert reply.status == "failed"
    assert world.push_sender.sent == []
    again = world.penpal.retry(USER, reply.id)
    assert again.status == "pending"


def test_an_answer_is_written_once_when_the_worker_is_started_twice(world: World) -> None:
    _, pending = voice_note(world)
    world.text.answers.extend([answer([]), answer([])])

    world.penpal.write(pending.id)
    world.penpal.write(pending.id)

    assert len(world.text.tasks) == 1


def test_trying_again_is_limited(world: World) -> None:
    _, pending = voice_note(world)
    for _ in range(MAX_ATTEMPTS):
        world.text.answers.append(TextModelError("down"))
        world.penpal.write(pending.id)
        if world.penpal_store.get(pending.id).attempts < MAX_ATTEMPTS:  # type: ignore[union-attr]
            world.penpal.retry(USER, pending.id)

    with pytest.raises(PenPalError) as refused:
        world.penpal.retry(USER, pending.id)

    assert refused.value.code == "retry_limit"


# --- Reading the thread ------------------------------------------------------------------------


def test_the_thread_lists_every_note_with_an_address_to_play_it(world: World) -> None:
    turned_on(world)
    world.text.answers.append(NOTE)
    world.penpal.send_due()
    heard, reply = written_reply(world, answer([]))

    thread = world.penpal.thread(USER, lena(world).id)

    assert [(h.note.sender, h.note.status) for h in thread.notes] == [
        ("partner", "ready"),
        ("learner", "ready"),
        ("partner", "ready"),
    ]
    assert all(h.audio_url and h.audio_url.startswith("https://files.test/") for h in thread.notes)
    assert thread.unread == 2
    assert reply.id == thread.notes[-1].note.id
    assert heard.id == thread.notes[1].note.id


def test_opening_the_thread_reads_what_the_partner_sent(world: World) -> None:
    turned_on(world)
    world.text.answers.append(NOTE)
    world.penpal.send_due()
    assert world.penpal.overview(USER).threads[0].unread == 1

    world.penpal.opened(USER, lena(world).id)

    assert world.penpal.overview(USER).threads[0].unread == 0


def test_an_answer_pending_for_too_long_is_shown_as_failed(world: World) -> None:
    voice_note(world)
    world.clock.now += PENDING_FOR + timedelta(seconds=1)

    thread = world.penpal.thread(USER, lena(world).id)

    assert thread.notes[-1].note.status == "failed"
    assert thread.notes[-1].audio_url is None


def test_a_note_without_a_sound_has_no_address(world: World) -> None:
    world.recordings.configure(USER, kept=False)
    voice_note(world)

    assert world.penpal.thread(USER, lena(world).id).notes[0].audio_url is None


def test_a_learners_thread_is_theirs_alone(world: World) -> None:
    with pytest.raises(PenPalError) as refused:
        world.penpal.thread(OTHER_USER, lena(world).id)

    assert refused.value.code == "not_found"


def test_retrying_someone_elses_note_is_not_found(world: World) -> None:
    _, pending = voice_note(world)

    with pytest.raises(PenPalError) as refused:
        world.penpal.retry(OTHER_USER, pending.id)

    assert refused.value.code == "not_found"
    assert isinstance(pending.id, UUID)
