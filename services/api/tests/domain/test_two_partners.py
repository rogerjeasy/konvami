"""Two partners in one conversation (5.24, design note 2026-11-20-two-partners)."""

import json
from dataclasses import replace
from uuid import uuid4

import pytest

from konvami_api.domain.costs import Feature
from konvami_api.domain.live_call import LiveCall, Send, Speak, Spoken, Turn, TurnAudio
from konvami_api.domain.memory_voice import FORGET_MEMORY
from konvami_api.domain.personas import PersonaError
from konvami_api.domain.speech import SpeechError, SpeechTask
from konvami_api.domain.two_partners import (
    GUEST_TEXT_MAX,
    SPEAK_PARTNER,
    GuestSpeech,
    distinct_voice,
)
from konvami_api.domain.voice import CallPurpose, FinishedCall, VoiceError
from tests.domain.test_live_call import function_call
from tests.world import NOON, USER, World

TODAY = NOON.date()


class Speech:
    def __init__(self) -> None:
        self.tasks: list[SpeechTask] = []

    def speak_pcm(self, task: SpeechTask) -> bytes:
        self.tasks.append(task)
        return b"\x01\x00" * 24000


def with_guest_speech(world: World) -> Speech:
    provider = Speech()
    world.voice._guest_speech = GuestSpeech(world.accounts, provider, "tts")
    return provider


def test_the_lead_is_told_who_the_second_partner_is_and_how_they_speak() -> None:
    world = World()
    lena, jonas = world.onboard()
    briefing = world.practice.prepare_duo(USER, world.accounts.get(USER), TODAY, lena.id, jonas.id)

    assert "You are Lena" in briefing.instructions
    assert "Jonas" in briefing.instructions
    assert SPEAK_PARTNER in briefing.instructions
    assert briefing.voice == lena.voice


def test_two_partners_must_be_two_of_the_learners_own() -> None:
    world = World()
    lena, _ = world.onboard()
    account = world.accounts.get(USER)
    with pytest.raises(PersonaError):
        world.practice.prepare_duo(USER, account, TODAY, lena.id, lena.id)
    with pytest.raises(PersonaError):
        world.practice.prepare_duo(USER, account, TODAY, lena.id, uuid4())


def test_the_learner_can_ask_to_forget_something_with_two_partners() -> None:
    world = World()
    _, jonas = world.onboard()
    names = {item["name"] for item in world.practice.duo_tools(USER, jonas.id).definitions()}
    assert {FORGET_MEMORY, SPEAK_PARTNER} <= names


def test_the_second_partner_speaks_through_a_tool_with_a_bounded_line() -> None:
    world = World()
    _, jonas = world.onboard()
    tools = world.practice.duo_tools(USER, jonas.id)

    assert SPEAK_PARTNER in {item["name"] for item in tools.definitions()}
    for invalid in (None, 3, "", "  ", "a" * (GUEST_TEXT_MAX + 1)):
        result = tools.run(SPEAK_PARTNER, {"text": invalid})
        assert result.guest is None
        assert result.output["spoken"] is False
    result = tools.run(SPEAK_PARTNER, {"text": "Ich nehme einen Kaffee."})
    assert result.guest == "Ich nehme einen Kaffee."
    assert result.silent
    # A one-partner call has no such tool.
    single = world.practice.tools(USER)
    assert SPEAK_PARTNER not in {item["name"] for item in single.definitions()}
    assert single.run(SPEAK_PARTNER, {"text": "Hallo"}).guest is None


def test_a_second_partner_line_is_a_marked_turn_spoken_in_another_voice() -> None:
    world = World()
    _, jonas = world.onboard()
    call = LiveCall(
        world.practice.duo_tools(USER, jonas.id),
        max_seconds=600,
        wrap_up_seconds=45,
        goodbye_grace_seconds=8,
        record=True,
    )
    event = {
        "type": "response.done",
        "response": {
            "status": "completed",
            "output": [function_call(SPEAK_PARTNER, json.dumps({"text": "Und du?"}))],
        },
    }
    actions = call.handle(event, 1)
    speech = [action for action in actions if isinstance(action, Speak)]

    assert [s.role for s in speech] == ["guest"]
    assert call.turns == [Turn("persona", "Und du?", guest=True)]
    # The learner answers next: no reply of the lead is asked for.
    assert not any(isinstance(a, Send) and a.event["type"] == "response.create" for a in actions)
    receipt = call.spoken(
        Spoken(speech[0].item_id, "Und du?", TurnAudio("g.wav", 900), "https://clip"), 2
    )
    note = receipt[0]
    assert isinstance(note, Send)
    text = note.event["item"]["content"][0]["text"]
    assert json.loads(text.removeprefix("premium_audio: "))["speaker"] == "guest"
    assert call.turns[0].audio == TurnAudio("g.wav", 900)


def test_a_two_partner_call_stores_both_and_speaks_the_guest_in_their_voice() -> None:
    world = World()
    lena, jonas = world.onboard()
    provider = with_guest_speech(world)

    started = world.voice.start(
        USER, CallPurpose.PRACTICE, "offer", lena.id, guest_persona_id=jonas.id
    )
    session = world.sessions.get(started.call_id)
    assert session is not None
    assert session.guest_persona_id == jonas.id
    created = world.provider.created[-1][1]
    assert SPEAK_PARTNER in {tool["name"] for tool in created["tools"]}
    call = world.voice.live_call(started.call_id)
    assert call is not None
    assert SPEAK_PARTNER in {item["name"] for item in call.tools.definitions()}

    speak = world.voice.speaker(started.call_id)
    assert speak is not None
    spoken = speak(Speak("guest_1", "Ich bin Jonas.", role="guest"))
    assert spoken.audio.key in world.files.files
    task = provider.tasks[0]
    assert task.voice == jonas.voice
    assert task.charge is not None
    assert task.charge.feature == Feature.VOICE_PRACTICE
    with pytest.raises(SpeechError):
        speak(Speak("lead", "Hallo", role="partner"))


def test_the_second_partner_never_shares_the_leads_voice() -> None:
    assert distinct_voice("marin", "cedar") == "cedar"
    assert distinct_voice("marin", "marin") != "marin"


def test_two_partner_calls_are_refused_where_they_cannot_work() -> None:
    world = World()
    lena, jonas = world.onboard()
    # No speech model: the second partner would be silent.
    with pytest.raises(VoiceError) as refused:
        world.voice.start(USER, CallPurpose.PRACTICE, "offer", lena.id, guest_persona_id=jonas.id)
    assert refused.value.code == "voice_unavailable"
    with_guest_speech(world)
    for kwargs in (
        {"scenario": "bakery"},
        {"practise": "words"},
        {"premium": True},
    ):
        with pytest.raises(VoiceError):
            world.voice.start(
                USER,
                CallPurpose.PRACTICE,
                "offer",
                lena.id,
                guest_persona_id=jonas.id,
                **kwargs,
            )
    with pytest.raises(VoiceError):
        world.voice.start(USER, CallPurpose.EXAM, "offer", guest_persona_id=jonas.id)
    assert world.provider.created == []


def test_guest_speech_rechecks_consent_and_bounds_each_line() -> None:
    world = World()
    world.onboard()
    provider = Speech()
    speech = GuestSpeech(world.accounts, provider, "tts")
    assert speech.speak(USER, "Hallo", "cedar")
    for text in ("", "a" * (GUEST_TEXT_MAX + 1)):
        with pytest.raises(SpeechError):
            speech.speak(USER, text, "cedar")
    world.accounts.accounts[USER] = replace(world.accounts.get(USER), voice_consent=False)
    with pytest.raises(SpeechError):
        speech.speak(USER, "Hallo", "cedar")
    assert len(provider.tasks) == 1
    with pytest.raises(SpeechError):
        GuestSpeech(world.accounts, provider, "").speak(USER, "Hallo", "cedar")


def test_the_conversation_names_both_partners_and_counts_for_both() -> None:
    world = World()
    lena, jonas = world.onboard()
    with_guest_speech(world)
    started = world.voice.start(
        USER, CallPurpose.PRACTICE, "offer", lena.id, guest_persona_id=jonas.id
    )
    world.sessions.finish(
        started.call_id,
        FinishedCall(
            NOON,
            "closed",
            {},
            (
                Turn("persona", "Hallo!"),
                Turn("persona", "Servus!", guest=True),
                Turn("learner", "Hallo ihr zwei!"),
            ),
        ),
    )
    transcript = world.conversations.transcript(USER, started.call_id)

    assert transcript.conversation.partner == lena
    assert transcript.conversation.guest == jonas
    assert [turn.guest for turn in transcript.turns] == [False, True, False]
    history = world.conversations.partner_history(USER)
    assert set(history) == {lena.id, jonas.id}
