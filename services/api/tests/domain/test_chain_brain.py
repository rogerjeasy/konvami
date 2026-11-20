import datetime as dt
from uuid import UUID

from konvami_api.domain.chain import ChainSeat, Line, Story
from konvami_api.domain.chain_brain import ModelNarrator
from konvami_api.domain.chain_openings import FALLBACK_LINES
from tests.fakes import FakeModerator, FakeSpeechModel, InMemoryFileStore, ScriptedTextModel

NOW = dt.datetime(2026, 11, 20, 12, 0, tzinfo=dt.UTC)
USER = UUID("11111111-1111-4111-8111-111111111111")
STORY = UUID("33333333-3333-4333-8333-333333333333")


def story(host: UUID | None = USER) -> Story:
    return Story(
        STORY,
        "night-train",
        "de",
        "A2",
        "solo",
        host,
        "open",
        NOW,
        (
            ChainSeat(1, host),
            ChainSeat(2, None, "Lena"),
            ChainSeat(3, None, "Max"),
            ChainSeat(4, None, "Pia"),
        ),
        NOW,
    )


def line(text: str, position: int = 1) -> Line:
    return Line(UUID(int=position), STORY, position, 1, USER, "delivered", text, NOW)


def narrator(
    *answers: dict[str, object], moderator: FakeModerator | None = None, models: bool = True
) -> tuple[ModelNarrator, ScriptedTextModel, InMemoryFileStore]:
    text = ScriptedTextModel(*answers)
    files = InMemoryFileStore()
    return (
        ModelNarrator(
            moderator=moderator or FakeModerator(),
            text_model=text,
            check_model="small" if models else "",
            write_model="small" if models else "",
            review_model="strong" if models else "",
            speech=FakeSpeechModel(),
            speech_model="tts" if models else "",
            files=files,
            language_name={"de": "German", "fr": "French", "en": "English", "it": "Italian"}.get,  # type: ignore[arg-type]
            clock=lambda: NOW,
        ),
        text,
        files,
    )


def test_a_line_is_checked_as_a_story_and_held_for_contact_details() -> None:
    brain, _, _ = narrator()
    assert brain.check(line("Schreib mir an max@example.com"), "adult", "de") == (
        "contact_or_meetup",
    )
    brain, text, _ = narrator({"label": "on_task"})
    assert brain.check(line("Der Zug hält plötzlich im Wald"), "adult", "de") == ()
    assert "story" in text.tasks[0].instructions


def test_an_ai_line_the_moderator_flags_is_replaced_by_the_hand_written_one() -> None:
    brain, _, _ = narrator({"text": "Ein grausames Blutbad"}, moderator=FakeModerator("Blutbad"))
    said = brain.go_on(story(), [line("Ich sehe einen Mann")], ChainSeat(2, None, "Lena"), "ash")
    assert said.transcript == FALLBACK_LINES["de"][1]
    assert said.audio_key == f"halves/chain/{STORY}/ai-2.mp3"


def test_narration_that_cannot_be_checked_falls_back_to_the_opening_and_ending() -> None:
    moderator = FakeModerator()
    moderator.fail = True
    brain, _, _ = narrator(
        {"links": ["Er sah einen Mann."], "ending": "Alle waren froh."}, moderator=moderator
    )
    segments = brain.narrate(story(), [line("Ich sehe einen Mann")])
    assert [s.text for s in segments] == [
        "Es ist Mitternacht im Zug nach Wien. Plötzlich geht das Licht aus, und als es wieder "
        "angeht, ist ein roter Koffer verschwunden.",
        "Am Morgen kam der Zug in Wien an, und alle wussten: Diese Nacht vergessen sie nie.",
    ]


def test_a_clean_recap_is_used_and_a_link_retells_the_line() -> None:
    brain, _, _ = narrator(
        {"text": "Ein Mann mit Hut steht im dunklen Zug."},
        {"links": ["Ein Mann mit Hut war da."], "ending": "Und alle lachten."},
    )
    lines = [line("Ich sehe ein Mann mit Hut")]
    assert brain.recap(story(), lines) == "Ein Mann mit Hut steht im dunklen Zug."
    segments = brain.narrate(story(), lines)
    assert [(s.position, s.text) for s in segments][1:] == [
        (1, "Ein Mann mit Hut war da."),
        (1, "Und alle lachten."),
    ]


def test_with_nobody_to_meter_it_the_narrator_writes_nothing() -> None:
    brain, text, _ = narrator()
    recap = brain.recap(story(host=None), [line("Ich sehe einen Mann")])
    assert recap.startswith("Es ist Mitternacht")
    assert text.tasks == []
