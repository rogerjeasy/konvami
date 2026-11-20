import datetime as dt
from uuid import UUID

from konvami_api.domain.radio import Call
from konvami_api.domain.radio_check import ModelBrain
from konvami_api.domain.text import TextModelError
from konvami_api.domain.voice_messages import MessageChecker
from tests.fakes import FakeModerator, FakeSpeechModel, InMemoryFileStore, ScriptedTextModel

NOW = dt.datetime(2026, 11, 20, 12, 0, tzinfo=dt.UTC)
USER = UUID("11111111-1111-4111-8111-111111111111")
EPISODE = UUID("22222222-2222-4222-8222-222222222222")
CALL = UUID("44444444-4444-4444-8444-444444444444")
NAMES = {"de": "German", "fr": "French", "en": "English", "it": "Italian"}


def call(text: str, number: int = 0) -> Call:
    return Call(UUID(int=CALL.int + number), EPISODE, USER, "checking", text, NOW, broadcast=True)


def brain(
    *answers: dict[str, object] | Exception,
    models: bool = True,
    files: InMemoryFileStore | None = None,
) -> tuple[ModelBrain, ScriptedTextModel]:
    text = ScriptedTextModel(*answers)
    checker = MessageChecker(
        moderator=FakeModerator(),
        text_model=text,
        check_model="small" if models else "",
        review_model="strong" if models else "",
        language_name=NAMES.__getitem__,
    )
    return (
        ModelBrain(
            checker=checker,
            text_model=text,
            write_model="small" if models else "",
            speech=FakeSpeechModel(),
            speech_model="tts" if models else "",
            files=files or InMemoryFileStore(),
            language_name=NAMES.__getitem__,
        ),
        text,
    )


def test_a_call_is_checked_against_the_shows_question() -> None:
    radio, text = brain({"label": "on_task"})
    assert radio.check(call("Mein Zug war voll."), "adult", "de", "Deine Zugfahrt?") == ()
    assert text.tasks[0].answer_name == "radio_call_check"
    assert "Deine Zugfahrt?" in text.tasks[0].content
    assert "radio show" in text.tasks[0].instructions


def test_contact_details_hold_a_call_before_any_model_is_asked() -> None:
    radio, text = brain()
    assert radio.check(call("Ruf mich an: +41 79 123 45 67"), "adult", "de", "?") == (
        "contact_or_meetup",
    )
    assert text.tasks == []


def test_a_call_that_cannot_be_checked_answers_none() -> None:
    radio, _ = brain(TextModelError("down"))
    assert radio.check(call("Mein Zug war voll."), "adult", "de", "?") is None


def test_the_screening_keeps_only_numbers_of_the_calls_given() -> None:
    radio, _ = brain({"picked": [2, 9, 0, 2]})
    calls = [call("eins zwei drei", n) for n in range(3)]
    assert radio.screen("?", "de", calls, 4, USER) == [calls[2].id, calls[0].id]


def test_no_screening_without_a_model_or_someone_to_charge() -> None:
    radio, _ = brain(models=False)
    assert radio.screen("?", "de", [call("eins zwei drei")], 4, USER) is None
    radio, _ = brain({"picked": [0]})
    assert radio.screen("?", "de", [call("eins zwei drei")], 4, None) is None


def test_a_script_needs_a_clean_line_for_every_caller() -> None:
    radio, _ = brain({"intro": "Hallo!", "after": ["Danke, Nova!"], "outro": "Tschüss!"})
    script = radio.script("?", "de", [("Nova", False, "Hallo Mia")], USER)
    assert script is not None
    assert script.after == ("Danke, Nova!",)
    radio, _ = brain({"intro": "Hallo!", "after": [], "outro": "Tschüss!"})
    assert radio.script("?", "de", [("Nova", False, "Hallo Mia")], USER) is None
    radio, _ = brain({"intro": "Hallo!", "after": ["Besuch www.example.com"], "outro": "Tschüss!"})
    assert radio.script("?", "de", [("Nova", False, "Hallo Mia")], USER) is None


def test_an_ai_callers_words_are_clipped_and_checked() -> None:
    radio, _ = brain({"text": "  Ich esse   gern Brot.  "})
    assert radio.ai_call("?", "de", "Klara", USER) == "Ich esse gern Brot."
    radio, _ = brain({"text": "   "})
    assert radio.ai_call("?", "de", "Klara", USER) is None


def test_a_veiled_call_is_the_same_words_in_the_neutral_voice() -> None:
    files = InMemoryFileStore()
    radio, _ = brain(files=files)
    key = radio.veil(call("Mein Zug war voll."))
    assert key == f"radio/{USER}/{EPISODE}/{CALL}-veil.mp3"
    assert key in files.files


def test_nothing_is_spoken_without_a_speech_model() -> None:
    radio, _ = brain(models=False)
    assert radio.speak(USER, "coral", "Hallo", "radio/shows/x/0.mp3") is None
