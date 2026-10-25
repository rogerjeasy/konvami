"""The Live Error Spotter (spec §8.2): a learner's turn checked within seconds, during the call."""

import io
import json
import wave
from dataclasses import replace
from datetime import timedelta
from typing import Any

from konvami_api.domain.costs import Feature
from konvami_api.domain.live_call import LiveCorrection, Spot, Spotted
from konvami_api.domain.reports import Mistake
from konvami_api.domain.speech import TranscriptionError
from konvami_api.domain.spotter import MAX_LIVE_CORRECTIONS, LiveCheck, LiveSpotter
from konvami_api.domain.text import TextModelError
from konvami_api.domain.voice import CallPurpose
from tests.fakes import ScriptedTextModel, ScriptedTranscriber
from tests.world import NOON, USER, World

OFFER = "v=0 offer"
PCM = b"\x01\x00\x02\x00" * 100
SAID = "Gestern ich habe nach Berlin gefahren mit meine Freundin."
LIVE = "Gestern bin ich nach Berlin gefahren mit meiner Freundin."
PARTNER = "Was hast du am Wochenende gemacht?"
PERFEKT = {
    "original": "ich habe nach Berlin gefahren",
    "corrected": "ich bin nach Berlin gefahren",
    "explanation": "Avec « fahren », le Perfekt se forme avec « sein ».",
    "category": "perfekt_auxiliary",
    "severity": "noticeable",
    "sure": True,
}
DATIVE = {
    "original": "mit meine Freundin",
    "corrected": "mit meiner Freundin",
    "explanation": "« mit » est toujours suivi du datif.",
    "category": "case_dative",
    "severity": "noticeable",
    "sure": True,
}


class Setup:
    def __init__(self, *answers: dict[str, Any] | Exception, heard: str | Exception = SAID):
        self.world = World()
        self.lena, self.jonas = self.world.onboard()
        self.transcriber = ScriptedTranscriber(heard)
        self.text = ScriptedTextModel(*answers)
        self.spotter = LiveSpotter(
            profiles=self.world.profiles,
            personas=self.world.personas,
            check=LiveCheck(
                transcriber=self.transcriber,
                text_model=self.text,
                transcription_model="gpt-transcribe",
                model="gpt-6-luna",
            ),
        )

    def call(self, partner_id: Any = None) -> str:
        persona = partner_id or self.lena.id
        return self.world.voice.start(USER, CallPurpose.PRACTICE, OFFER, persona).call_id

    def check(self, spot: Spot | None = None) -> Spotted:
        session = self.world.sessions.get(self.call())
        assert session is not None
        check = self.spotter.for_call(session)
        assert check is not None
        return check(spot or Spot("item_2", LIVE, PCM, PARTNER))


def found(*mistakes: dict[str, Any]) -> dict[str, Any]:
    return {"mistakes": list(mistakes)}


def test_a_turn_is_written_down_again_from_its_audio_and_checked() -> None:
    setup = Setup(found(PERFEKT))

    spotted = setup.check()

    assert spotted == Spotted(
        "item_2",
        SAID,
        (
            LiveCorrection(
                said="ich habe nach Berlin gefahren",
                better="ich bin nach Berlin gefahren",
                why="Avec « fahren », le Perfekt se forme avec « sein ».",
                topic="perfekt_auxiliary",
                focus=False,
            ),
        ),
    )


def test_the_audio_is_written_down_keeping_the_learners_mistakes() -> None:
    setup = Setup(found())

    setup.check()

    (task,) = setup.transcriber.tasks
    assert task.model == "gpt-transcribe"
    assert task.language == "de"
    assert "Keep every mistake" in task.prompt
    with wave.open(io.BytesIO(task.audio)) as audio:
        assert (audio.getframerate(), audio.getnchannels()) == (24_000, 1)
    assert task.charge is not None
    assert task.charge.feature is Feature.VERBATIM


def test_the_checker_reads_what_was_said_what_was_heard_and_what_it_answers() -> None:
    setup = Setup(found())

    setup.check()

    (task,) = setup.text.tasks
    content = json.loads(task.content)
    assert content == {
        "level": "A2",
        "partner": PARTNER,
        "said": SAID,
        "live": LIVE,
        "focus": [],
    }
    assert task.model == "gpt-6-luna"
    assert "French" in task.instructions
    assert "worse than none" in task.instructions
    assert task.charge is not None
    assert task.charge.feature is Feature.LIVE_CORRECTIONS
    # Someone is waiting: a slow answer is no use.
    assert task.max_seconds is not None


def test_only_mistakes_the_checker_is_sure_of_are_shown() -> None:
    setup = Setup(found({**PERFEKT, "sure": False}, DATIVE))

    assert [c.topic for c in setup.check().corrections] == ["case_dative"]


def test_minor_mistakes_are_left_for_the_report() -> None:
    setup = Setup(found({**PERFEKT, "severity": "minor"}))

    assert setup.check().corrections == ()


def test_a_correction_of_words_the_learner_did_not_say_is_dropped() -> None:
    setup = Setup(found({**PERFEKT, "original": "ich habe nach Hamburg gefahren"}))

    assert setup.check().corrections == ()


def test_words_the_live_recognition_heard_count_as_said() -> None:
    setup = Setup(found({**DATIVE, "original": "mit meiner Freundin", "corrected": "mit Anna"}))

    assert [c.said for c in setup.check().corrections] == ["mit meiner Freundin"]


def test_a_correction_that_changes_no_word_is_dropped() -> None:
    setup = Setup(found({**DATIVE, "corrected": "Mit meine Freundin!"}))

    assert setup.check().corrections == ()


def test_an_unknown_kind_of_mistake_is_filed_under_other() -> None:
    setup = Setup(found({**DATIVE, "category": "dative_case"}))

    assert [c.topic for c in setup.check().corrections] == ["other"]


def test_a_mistake_of_the_plans_focus_comes_first_and_says_so() -> None:
    preposition = {
        **PERFEKT,
        "original": "nach Berlin",
        "corrected": "in Berlin",
        "category": "preposition_choice",
    }
    setup = Setup(found(PERFEKT, preposition, DATIVE))
    called = setup.world.talk(setup.lena, at=NOON - timedelta(days=1))
    mistake = Mistake(1, "mit der Bus", "mit dem Bus", "Datif.", "case_dative", "noticeable", True)
    setup.world.reported(called, mistakes=(mistake,))

    corrections = setup.check().corrections

    assert len(corrections) == MAX_LIVE_CORRECTIONS == 2
    assert [(c.topic, c.focus) for c in corrections] == [
        ("case_dative", True),
        ("perfekt_auxiliary", False),
    ]
    assert json.loads(setup.text.tasks[0].content)["focus"] == ["case_dative"]


def test_a_short_turn_is_not_checked() -> None:
    setup = Setup()

    spotted = setup.check(Spot("item_2", "Ja, gern.", PCM, PARTNER))

    assert spotted == Spotted("item_2", None, ())
    assert setup.transcriber.tasks == []


def test_without_its_audio_a_turn_is_checked_from_what_was_heard() -> None:
    setup = Setup(found())

    spotted = setup.check(Spot("item_2", LIVE, b"", None))

    assert spotted.verbatim is None
    assert setup.transcriber.tasks == []
    assert json.loads(setup.text.tasks[0].content)["said"] == LIVE


def test_when_writing_down_fails_the_live_text_is_checked() -> None:
    setup = Setup(found(), heard=TranscriptionError("timeout"))

    spotted = setup.check()

    assert spotted.verbatim is None
    content = json.loads(setup.text.tasks[0].content)
    assert content["said"] == LIVE
    assert "live" not in content


def test_when_the_checker_fails_the_verbatim_text_is_still_kept() -> None:
    setup = Setup(TextModelError("timeout"))

    assert setup.check() == Spotted("item_2", SAID, ())


def test_a_checker_answer_in_the_wrong_shape_finds_nothing() -> None:
    setup = Setup({"mistakes": [{"original": "x"}]})

    assert setup.check().corrections == ()


def test_a_partner_told_not_to_correct_has_no_live_checks() -> None:
    setup = Setup()
    teaching = {"correction_timing": "off", "strictness": "meaning"}
    setup.world.personas.change(USER, setup.jonas.id, teaching=teaching)
    session = setup.world.sessions.get(setup.call(setup.jonas.id))

    assert session is not None
    assert setup.spotter.for_call(session) is None


def test_the_guides_calls_have_no_live_checks() -> None:
    setup = Setup()
    session = setup.world.sessions.get(setup.call())
    assert session is not None

    assert setup.spotter.for_call(replace(session, purpose=CallPurpose.PLACEMENT)) is None


def test_without_a_model_there_are_no_live_checks() -> None:
    world = World()
    lena, _ = world.onboard()
    spotter = LiveSpotter(
        profiles=world.profiles,
        personas=world.personas,
        check=LiveCheck(
            transcriber=ScriptedTranscriber(),
            text_model=ScriptedTextModel(),
            transcription_model="gpt-transcribe",
            model="",
        ),
    )
    call_id = world.voice.start(USER, CallPurpose.PRACTICE, OFFER, lena.id).call_id
    session = world.sessions.get(call_id)

    assert session is not None
    assert spotter.for_call(session) is None
