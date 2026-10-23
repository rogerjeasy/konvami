import json
from datetime import timedelta
from typing import Any

import pytest

from konvami_api.domain.accounts import Account
from konvami_api.domain.conversations import ConversationError
from konvami_api.domain.costs import Charge, Feature
from konvami_api.domain.levels import LevelFit
from konvami_api.domain.live_call import Turn
from konvami_api.domain.reports import (
    MAX_MISTAKES,
    MAX_REQUESTS,
    MAX_WORDS,
    PENDING_FOR,
    SUMMARY_MAX,
    TEXT_MAX,
    Focus,
    Mistake,
    ReportError,
    ReportService,
    ReportState,
    Rewrite,
    Stats,
    Word,
    measure,
    what_to_practise,
)
from konvami_api.domain.text import TextModelError
from tests.world import NOON, OTHER_USER, USER, World

HOUR = timedelta(hours=1)

TURNS = (
    Turn("persona", "Hallo Amara! Wie war dein Wochenende?"),
    Turn("learner", "Gut. Ich habe nach Berlin gefahren mit der Bus."),
    Turn("persona", "Oh, schön! Was hast du in Berlin gemacht?"),
    Turn("learner", "Ich habe ein Museum besucht, weil es war sehr interessant – wirklich!"),
    Turn("persona", "Das klingt gut."),
    Turn("learner", "Ja. Tschüss!"),
)


def test_a_conversation_is_measured_in_words_and_turns() -> None:
    assert measure(TURNS) == Stats(
        learner_words=22, partner_words=17, learner_turns=3, longest_turn_words=11
    )


def test_punctuation_on_its_own_is_not_a_word() -> None:
    stats = measure((Turn("learner", "Ja – ... gut !"),))

    assert (stats.learner_words, stats.longest_turn_words) == (2, 2)


def test_a_conversation_without_a_word_measures_nothing() -> None:
    assert measure(()) == Stats(0, 0, 0, 0)


# --- Writing a report ----------------------------------------------------------------------------

ANALYSIS: dict[str, Any] = {
    "summary": "Vous avez raconté votre week-end à Berlin et la visite d'un musée.",
    "mistakes": [
        {
            "turn": 1,
            "original": "Ich habe nach Berlin gefahren",
            "corrected": "Ich bin nach Berlin gefahren",
            "explanation": "« fahren » forme le Perfekt avec « sein ».",
            "category": "perfekt_auxiliary",
            "severity": "noticeable",
        },
        {
            "turn": 1,
            "original": "mit der Bus",
            "corrected": "mit dem Bus",
            "explanation": "« mit » demande le datif : der Bus → dem Bus.",
            "category": "case_dative",
            "severity": "minor",
        },
        {
            "turn": 3,
            "original": "weil es war sehr interessant",
            "corrected": "weil es sehr interessant war",
            "explanation": "Après « weil », le verbe va à la fin.",
            "category": "word_order_subordinate",
            "severity": "noticeable",
        },
    ],
    "rewrites": [
        {
            "turn": 3,
            "original": "Ich habe ein Museum besucht",
            "natural": "Ich war im Museum",
            "note": "Plus courant à l'oral.",
        }
    ],
    "words": [
        {
            "word": "das Wochenende",
            "meaning": "le week-end",
            "example": "Wie war dein Wochenende?",
        }
    ],
    "wins": ["Vous avez raconté votre week-end au passé."],
    "next_steps": ["Le Perfekt avec « sein » pour les verbes de mouvement."],
}
CONFIRMED: dict[str, Any] = {
    "mistakes": [
        {"id": 0, "verdict": "correct"},
        {"id": 1, "verdict": "correct"},
        {"id": 2, "verdict": "correct"},
    ],
    "rewrites": [{"id": 0, "verdict": "keep"}],
}


def talked(world: World, turns: tuple[Turn, ...] = TURNS) -> str:
    """A learner of German (explained in French, level A2) and a conversation with Lena whose
    report has been asked for."""
    lena, _ = world.onboard()
    call_id = world.talk(lena, at=NOON - timedelta(minutes=10), turns=turns)
    world.reports.after_call(USER, call_id)
    return call_id


def written(*answers: dict[str, Any] | Exception, turns: tuple[Turn, ...] = TURNS) -> World:
    """The same, with the report written from the text model's `answers`."""
    world = World()
    call_id = talked(world, turns)
    world.text.answers += answers
    world.reports.write(call_id)
    return world


def report_of(world: World, call_id: str = "rtc_past_1") -> Any:
    state = world.reports.view(USER, call_id)
    assert state.status == "ready"
    assert state.report is not None
    return state.report


def test_a_report_is_asked_for_when_a_conversation_ends() -> None:
    world = World()

    call_id = talked(world)

    assert world.reports.view(USER, call_id).status == "pending"
    assert world.report_starter.started == [call_id]


def test_a_report_says_what_the_conversation_showed() -> None:
    world = written(ANALYSIS, CONFIRMED)

    report = report_of(world)

    assert (report.target, report.language) == ("de", "fr")
    assert report.summary == "Vous avez raconté votre week-end à Berlin et la visite d'un musée."
    assert report.mistakes[0] == Mistake(
        turn=1,
        original="Ich habe nach Berlin gefahren",
        corrected="Ich bin nach Berlin gefahren",
        explanation="« fahren » forme le Perfekt avec « sein ».",
        category="perfekt_auxiliary",
        severity="noticeable",
        certain=True,
    )
    assert [m.original for m in report.mistakes] == [
        "Ich habe nach Berlin gefahren",
        "mit der Bus",
        "weil es war sehr interessant",
    ]
    assert report.rewrites == (
        Rewrite(3, "Ich habe ein Museum besucht", "Ich war im Museum", "Plus courant à l'oral."),
    )
    assert report.words == (Word("das Wochenende", "le week-end", "Wie war dein Wochenende?"),)
    assert report.wins == ("Vous avez raconté votre week-end au passé.",)
    assert report.next_steps == ("Le Perfekt avec « sein » pour les verbes de mouvement.",)
    assert report.stats == measure(TURNS)


def test_a_report_keeps_how_the_learner_did_against_their_level() -> None:
    fit = {"grammar": "at", "vocabulary": "above", "speaking": "below"}
    world = written({**ANALYSIS, "level_fit": fit}, CONFIRMED)

    assert report_of(world).level_fit == LevelFit("at", "above", "below")


def test_the_analyst_is_asked_to_compare_each_skill_with_the_level() -> None:
    world = written(ANALYSIS, CONFIRMED)

    task = world.text.tasks[-2]

    assert task.answer_schema["required"][-1] == "level_fit"
    fit = task.answer_schema["properties"]["level_fit"]
    assert fit["required"] == ["grammar", "vocabulary", "speaking"]
    assert fit["properties"]["speaking"]["enum"] == ["below", "at", "above", "unclear"]
    assert "level_fit" in task.instructions


def test_a_report_written_without_a_level_fit_has_none() -> None:
    world = written(ANALYSIS, CONFIRMED)

    assert report_of(world).level_fit is None


def test_level_fits_are_the_newest_first_since_a_moment_in_one_language() -> None:
    world = World()
    world.onboard()
    fits = [
        LevelFit("above", "at", "at"),
        LevelFit("below", "at", "at"),
        LevelFit("at", "at", "at"),
    ]
    calls = []
    for hours, fit in enumerate(fits):
        call_id = world.talk(None, at=NOON + timedelta(hours=hours))
        world.reported(call_id, level_fit=fit)
        calls.append(call_id)
    world.reported(world.talk(None, at=NOON + timedelta(hours=5)))
    world.reported(world.talk(None, at=NOON + timedelta(hours=6)), target="fr", level_fit=fits[0])

    found = world.reports.level_fits(USER, "de", since=NOON + timedelta(hours=1))

    assert found == [fits[2], fits[1]]
    assert world.reports.level_fits(OTHER_USER, "de", since=NOON) == []


def test_the_analyst_reads_the_numbered_transcript_knowing_the_learner() -> None:
    world = written(ANALYSIS, CONFIRMED)

    task = world.text.tasks[-2]

    assert task.model == "gpt-6.1-sol"
    assert "German" in task.instructions
    assert "French" in task.instructions
    content = json.loads(task.content)
    assert content["level"] == "A2"
    assert content["partner"] == "Lena"
    assert content["transcript"][1] == {
        "turn": 1,
        "speaker": "learner",
        "text": "Gut. Ich habe nach Berlin gefahren mit der Bus.",
    }
    assert len(content["transcript"]) == len(TURNS)


def test_the_analyst_writes_as_the_app_speaks_and_keeps_next_steps_short() -> None:
    world = written(ANALYSIS, CONFIRMED)

    instructions = world.text.tasks[-2].instructions

    # The app says "tu" and "du"; a real report (2026-10-11) said "vous" until it was told.
    assert "familiar form of address" in instructions
    # Next steps are shown on Today and told to the partner: a phrase each, not an exercise.
    assert "one short phrase" in instructions


def test_the_analyst_names_mistakes_in_the_language_packs_categories() -> None:
    world = written(ANALYSIS, CONFIRMED)

    schema = world.text.tasks[-2].answer_schema
    categories = schema["properties"]["mistakes"]["items"]["properties"]["category"]["enum"]

    assert {"case_dative", "perfekt_auxiliary", "word_order_v2", "other"} <= set(categories)
    # What only a recording could show is not asked of a transcript.
    assert not [name for name in categories if name.startswith(("pronunciation", "fluency"))]


def test_every_correction_is_checked_a_second_time_against_what_the_learner_said() -> None:
    world = written(ANALYSIS, CONFIRMED)

    task = world.text.tasks[-1]
    content = json.loads(task.content)

    assert "German" in task.instructions
    assert content["mistakes"][1] == {
        "id": 1,
        "learner_said": "Gut. Ich habe nach Berlin gefahren mit der Bus.",
        "original": "mit der Bus",
        "corrected": "mit dem Bus",
        "explanation": "« mit » demande le datif : der Bus → dem Bus.",
    }
    assert content["rewrites"] == [
        {
            "id": 0,
            "learner_said": TURNS[3].text,
            "original": "Ich habe ein Museum besucht",
            "natural": "Ich war im Museum",
        }
    ]


def test_the_report_and_its_second_check_are_charged_to_the_learner() -> None:
    world = written(ANALYSIS, CONFIRMED)

    assert [task.charge for task in world.text.tasks[-2:]] == [
        Charge(USER, Feature.REPORT),
        Charge(USER, Feature.REPORT_CHECK),
    ]


# --- The second check ----------------------------------------------------------------------------


def reviewed(mistakes: list[dict[str, Any]], rewrites: list[dict[str, Any]]) -> Any:
    return report_of(written(ANALYSIS, {"mistakes": mistakes, "rewrites": rewrites}))


def test_a_correction_the_second_check_calls_wrong_is_left_out() -> None:
    report = reviewed(
        [
            {"id": 0, "verdict": "correct"},
            {"id": 1, "verdict": "wrong"},
            {"id": 2, "verdict": "correct"},
        ],
        CONFIRMED["rewrites"],
    )

    assert [(m.original, m.certain) for m in report.mistakes] == [
        ("Ich habe nach Berlin gefahren", True),
        ("weil es war sehr interessant", True),
    ]


def test_a_correction_the_second_check_cannot_confirm_is_kept_as_uncertain() -> None:
    report = reviewed(
        [
            {"id": 0, "verdict": "uncertain"},
            {"id": 1, "verdict": "correct"},
            # The third is not answered for at all.
        ],
        CONFIRMED["rewrites"],
    )

    assert [m.certain for m in report.mistakes] == [False, True, False]


def test_a_more_natural_wording_is_shown_only_when_the_second_check_keeps_it() -> None:
    assert reviewed(CONFIRMED["mistakes"], [{"id": 0, "verdict": "drop"}]).rewrites == ()
    assert reviewed(CONFIRMED["mistakes"], []).rewrites == ()
    assert len(reviewed(CONFIRMED["mistakes"], [{"id": 0, "verdict": "keep"}]).rewrites) == 1


def test_an_answer_for_a_correction_that_was_not_asked_about_changes_nothing() -> None:
    report = reviewed(
        [*CONFIRMED["mistakes"], {"id": 7, "verdict": "wrong"}, {"id": -1, "verdict": "wrong"}],
        [{"id": 0, "verdict": "keep"}, {"id": 3, "verdict": "keep"}],
    )

    assert [m.certain for m in report.mistakes] == [True, True, True]
    assert len(report.rewrites) == 1


@pytest.mark.parametrize("failure", [TextModelError("no answer"), {"mistakes": "all fine"}])
def test_without_the_second_check_nothing_is_shown_as_a_fact(failure: Any) -> None:
    report = report_of(written(ANALYSIS, failure))

    assert [m.certain for m in report.mistakes] == [False, False, False]
    assert report.rewrites == ()
    assert report.summary == ANALYSIS["summary"]


def test_a_conversation_without_mistakes_needs_no_second_check() -> None:
    world = written({**ANALYSIS, "mistakes": [], "rewrites": []})

    report = report_of(world)

    assert report.mistakes == ()
    assert report.wins == ("Vous avez raconté votre week-end au passé.",)
    assert len(world.text.tasks) == 2  # The partners' writer during onboarding, and the analyst.


# --- What the analyst's answer must stand up to --------------------------------------------------


def mistake(original: str, corrected: str, turn: int = 1, **changes: Any) -> dict[str, Any]:
    return {
        **ANALYSIS["mistakes"][0],
        "turn": turn,
        "original": original,
        "corrected": corrected,
        **changes,
    }


def analysed(**changes: Any) -> World:
    """A report from an analysis in which the second check confirms whatever it is asked about."""
    confirmed = {
        "mistakes": [{"id": number, "verdict": "correct"} for number in range(20)],
        "rewrites": [{"id": number, "verdict": "keep"} for number in range(20)],
    }
    return written({**ANALYSIS, **changes}, confirmed)


def test_a_mistake_the_learner_did_not_make_is_left_out() -> None:
    world = analysed(
        mistakes=[
            # Nobody said this.
            mistake("Ich habe nach Hamburg gefahren", "Ich bin nach Hamburg gefahren"),
            # The partner said this.
            mistake("Was hast du in Berlin gemacht", "Was hast du in Berlin getan", turn=2),
            # No such turn.
            mistake("Ich habe nach Rom gefahren", "Ich bin nach Rom gefahren", turn=40),
            mistake("mit der Bus", "mit dem Bus"),
        ],
        rewrites=[{**ANALYSIS["rewrites"][0], "original": "Ich habe einen Zoo besucht"}],
    )

    report = report_of(world)

    assert [m.original for m in report.mistakes] == ["mit der Bus"]
    assert report.rewrites == ()
    # The second check is not asked about what is left out.
    assert [m["original"] for m in json.loads(world.text.tasks[-1].content)["mistakes"]] == [
        "mit der Bus"
    ]


def test_a_quote_is_found_whatever_its_capitals_and_punctuation() -> None:
    report = report_of(
        analysed(mistakes=[mistake("gut, ich habe nach berlin", "gut, ich bin nach Berlin")])
    )

    assert [m.turn for m in report.mistakes] == [1]


def test_a_mistake_filed_under_the_wrong_turn_is_moved_to_the_learners_turn_it_is_in() -> None:
    world = analysed(
        mistakes=[mistake("weil es war sehr interessant", "weil es sehr interessant war", turn=2)],
        rewrites=[{**ANALYSIS["rewrites"][0], "turn": 0}],
    )

    report = report_of(world)

    assert [m.turn for m in report.mistakes] == [3]
    assert [r.turn for r in report.rewrites] == [3]
    assert json.loads(world.text.tasks[-1].content)["mistakes"][0]["learner_said"] == TURNS[3].text


def test_a_correction_that_changes_no_word_is_left_out() -> None:
    report = report_of(
        analysed(
            mistakes=[
                mistake("Ja. Tschüss!", "Ja, tschüss!", turn=5),
                mistake("mit der Bus", "mit dem Bus"),
            ],
            rewrites=[{**ANALYSIS["rewrites"][0], "natural": "ich habe ein Museum besucht."}],
        )
    )

    assert [m.original for m in report.mistakes] == ["mit der Bus"]
    assert report.rewrites == ()


def test_a_mistake_is_reported_once() -> None:
    report = report_of(
        analysed(
            mistakes=[mistake("mit der Bus", "mit dem Bus"), mistake("Mit der Bus.", "mit dem Bus")]
        )
    )

    assert len(report.mistakes) == 1


def test_a_kind_of_mistake_the_language_pack_does_not_know_is_filed_as_other() -> None:
    report = report_of(
        analysed(
            mistakes=[
                mistake("mit der Bus", "mit dem Bus", category="pronunciation_r"),
                mistake("Ich habe nach Berlin gefahren", "Ich bin nach Berlin gefahren"),
            ]
        )
    )

    assert [m.category for m in report.mistakes] == ["other", "perfekt_auxiliary"]


def test_a_report_is_kept_to_a_readable_size() -> None:
    long = "x" * 2000
    report = report_of(
        analysed(
            summary=f"  {long}  ",
            mistakes=[mistake("mit der Bus", "mit dem Bus", explanation=long)],
            wins=["  Bien joué  ", "", "   ", "Deux", "Trois", "Quatre"],
            next_steps=[long, "Deux", "Trois", "Quatre"],
            words=[
                {"word": f"das Wort{number}", "meaning": " un mot ", "example": ""}
                for number in range(12)
            ],
        )
    )

    assert len(report.summary) == SUMMARY_MAX
    assert len(report.mistakes[0].explanation) == TEXT_MAX
    assert report.wins == ("Bien joué", "Deux", "Trois")
    assert [len(step) for step in report.next_steps] == [TEXT_MAX, 4, 5]
    assert len(report.words) == MAX_WORDS
    assert report.words[0] == Word("das Wort0", "un mot", None)


def test_only_as_many_mistakes_as_a_learner_can_take_in_are_reported() -> None:
    said = " ".join(f"Wort{number} falsch{number}." for number in range(14))
    turns = (Turn("persona", "Erzähl mal!"), Turn("learner", said))
    world = World()
    call_id = talked(world, turns)
    world.text.answers += [
        {
            **ANALYSIS,
            "rewrites": [],
            "mistakes": [
                mistake(f"Wort{number} falsch{number}", f"Wort{number} richtig{number}")
                for number in range(14)
            ],
        },
        {"mistakes": [{"id": n, "verdict": "correct"} for n in range(14)], "rewrites": []},
    ]

    world.reports.write(call_id)

    assert len(report_of(world).mistakes) == MAX_MISTAKES


def test_a_word_keeps_its_example_only_when_it_was_said_in_the_conversation() -> None:
    report = report_of(
        analysed(
            words=[
                {
                    "word": "das Wochenende",
                    "meaning": "le week-end",
                    "example": "wie war dein wochenende",
                },
                {
                    "word": "das Museum",
                    "meaning": "le musée",
                    "example": "Das Museum ist heute zu.",
                },
                {"word": "  ", "meaning": "rien", "example": ""},
                {"word": "der Bus", "meaning": "", "example": ""},
            ]
        )
    )

    assert report.words == (
        Word("das Wochenende", "le week-end", "wie war dein wochenende"),
        Word("das Museum", "le musée", None),
    )


# --- When a report is written, and when not ------------------------------------------------------


def test_a_conversation_in_which_the_learner_said_too_little_gets_no_report() -> None:
    world = World()
    lena, _ = world.onboard()
    call_id = world.talk(lena, at=NOON - HOUR, learner_says=("Hallo Lena!", "Gut, danke."))
    world.reports.after_call(USER, call_id)
    asked = len(world.text.tasks)

    world.reports.write(call_id)

    assert world.reports.view(USER, call_id) == ReportState("too_short")
    assert len(world.text.tasks) == asked


@pytest.mark.parametrize("failure", [TextModelError("no answer"), {"summary": 3}])
def test_a_report_that_could_not_be_written_says_so(failure: Any) -> None:
    world = written(failure)

    assert world.reports.view(USER, "rtc_past_1") == ReportState("failed")


def test_a_report_is_written_only_when_it_was_asked_for() -> None:
    world = World()
    lena, _ = world.onboard()
    call_id = world.talk(lena, at=NOON - HOUR, turns=TURNS)
    asked = len(world.text.tasks)

    world.reports.write(call_id)
    world.reports.write("rtc_unknown")

    assert world.reports.view(USER, call_id) == ReportState("none")
    assert len(world.text.tasks) == asked


def test_a_report_is_not_written_twice() -> None:
    world = written(ANALYSIS, CONFIRMED)
    first = report_of(world)

    # No answers are left: asking the text model again would fail the test.
    world.reports.write("rtc_past_1")

    assert report_of(world) == first


def test_a_report_can_only_be_read_by_the_learner_whose_conversation_it_is() -> None:
    world = written(ANALYSIS, CONFIRMED)

    with pytest.raises(ConversationError):
        world.reports.view(OTHER_USER, "rtc_past_1")
    with pytest.raises(ConversationError):
        world.reports.view(USER, "rtc_unknown")


def test_a_report_that_was_never_finished_counts_as_failed_after_a_while() -> None:
    world = World()
    call_id = talked(world)

    world.clock.now += PENDING_FOR - timedelta(seconds=1)
    still = world.reports.view(USER, call_id).status
    world.clock.now += timedelta(seconds=2)

    assert still == "pending"
    assert world.reports.view(USER, call_id).status == "failed"


def test_nothing_is_asked_for_after_a_call_that_does_not_count() -> None:
    world = World()
    lena, _ = world.onboard()
    silent = world.talk(lena, at=NOON - HOUR, learner_says=())

    world.reports.after_call(USER, silent)
    world.reports.after_call(USER, "rtc_unknown")

    assert world.reports.view(USER, silent) == ReportState("none")
    assert world.report_starter.started == []


def test_a_report_that_could_not_be_started_counts_as_failed() -> None:
    world = World()
    lena, _ = world.onboard()
    call_id = world.talk(lena, at=NOON - HOUR, turns=TURNS)
    world.report_starter.fail = True

    world.reports.after_call(USER, call_id)

    assert world.reports.view(USER, call_id) == ReportState("failed")


# --- Asking for a report -------------------------------------------------------------------------


def unreported(world: World) -> str:
    """A conversation from before reports existed."""
    lena, _ = world.onboard()
    return world.talk(lena, at=NOON - HOUR, turns=TURNS)


def test_a_learner_can_ask_for_the_report_of_an_earlier_conversation() -> None:
    world = World()
    call_id = unreported(world)

    state = world.reports.request(USER, call_id)

    assert state == ReportState("pending")
    assert world.report_starter.started == [call_id]


def test_a_failed_report_can_be_asked_for_again() -> None:
    world = written(TextModelError("no answer"))

    state = world.reports.request(USER, "rtc_past_1")
    world.text.answers += [ANALYSIS, CONFIRMED]
    world.reports.write("rtc_past_1")

    assert state == ReportState("pending")
    assert world.report_starter.started == ["rtc_past_1", "rtc_past_1"]
    assert report_of(world).summary == ANALYSIS["summary"]


def test_asking_again_does_not_start_a_report_that_is_there_or_on_its_way() -> None:
    world = World()
    call_id = talked(world)

    on_its_way = world.reports.request(USER, call_id)
    world.text.answers += [ANALYSIS, CONFIRMED]
    world.reports.write(call_id)
    there = world.reports.request(USER, call_id)

    assert on_its_way == ReportState("pending")
    assert there.status == "ready"
    assert world.report_starter.started == [call_id]


def test_a_report_that_never_arrived_can_be_asked_for_again() -> None:
    world = World()
    call_id = talked(world)
    world.clock.now += PENDING_FOR + timedelta(seconds=1)

    state = world.reports.request(USER, call_id)

    assert state == ReportState("pending")
    assert world.report_starter.started == [call_id, call_id]


def test_a_request_that_loses_to_another_one_starts_nothing() -> None:
    """Two requests can both see that there is no report yet. Storage lets one of them start
    the writing (the contract tests show that with real connections); the other must not."""
    world = World()
    call_id = unreported(world)
    seen_before_the_other_request = world.report_store.load

    def none_yet(asked_for: str) -> None:
        # What this request saw; meanwhile the other one has asked.
        world.report_store.load = seen_before_the_other_request  # type: ignore[method-assign]
        world.report_store.request(
            asked_for, world.clock(), stale_before=world.clock(), max_requests=MAX_REQUESTS
        )
        return None

    world.report_store.load = none_yet  # type: ignore[method-assign, assignment]

    state = world.reports.request(USER, call_id)

    assert state == ReportState("pending")
    assert world.report_starter.started == []


def test_a_report_is_written_by_one_worker_only() -> None:
    world = World()
    call_id = talked(world)
    asked = len(world.text.tasks)
    # Another invocation of the worker has taken it.
    world.report_store.claim(call_id, world.clock())

    world.reports.write(call_id)

    assert len(world.text.tasks) == asked
    assert world.reports.view(USER, call_id) == ReportState("pending")


def test_a_report_that_keeps_failing_is_asked_for_only_so_many_times() -> None:
    world = World()
    call_id = talked(world)
    for _ in range(MAX_REQUESTS - 1):
        world.text.answers.append(TextModelError("no answer"))
        world.reports.write(call_id)
        world.reports.request(USER, call_id)
    world.text.answers.append(TextModelError("no answer"))
    world.reports.write(call_id)

    with pytest.raises(ReportError) as refused:
        world.reports.request(USER, call_id)

    assert refused.value.code == "report_limit"
    assert len(world.report_starter.started) == MAX_REQUESTS
    assert world.reports.view(USER, call_id) == ReportState("failed")


def test_asking_again_does_not_help_a_conversation_that_was_too_short() -> None:
    world = World()
    lena, _ = world.onboard()
    call_id = world.talk(lena, at=NOON - HOUR)
    world.reports.after_call(USER, call_id)
    world.reports.write(call_id)

    assert world.reports.request(USER, call_id) == ReportState("too_short")
    assert world.report_starter.started == [call_id]


def test_only_a_conversation_that_counts_has_a_report() -> None:
    world = World()
    lena, _ = world.onboard()
    running = world.talk(lena, at=NOON - HOUR, ended=False)
    silent = world.talk(lena, at=NOON - HOUR, learner_says=())

    for call_id in (running, silent):
        with pytest.raises(ReportError) as refused:
            world.reports.request(USER, call_id)
        assert refused.value.code == "nothing_to_report"
    with pytest.raises(ConversationError):
        world.reports.request(OTHER_USER, running)
    assert world.report_starter.started == []


def test_a_learner_who_withdrew_their_consent_is_not_sent_to_the_text_model() -> None:
    world = World()
    call_id = unreported(world)
    world.accounts.accounts[USER] = Account("Amara", "fr", voice_consent=False)

    with pytest.raises(ReportError) as refused:
        world.reports.request(USER, call_id)

    assert refused.value.code == "consent_required"
    assert world.report_starter.started == []
    assert world.reports.view(USER, call_id) == ReportState("none")


def test_asking_fails_when_the_report_cannot_be_started() -> None:
    world = World()
    call_id = unreported(world)
    world.report_starter.fail = True

    with pytest.raises(ReportError) as refused:
        world.reports.request(USER, call_id)

    assert refused.value.code == "unavailable"
    assert world.reports.view(USER, call_id) == ReportState("failed")


def without_a_model(world: World) -> ReportService:
    return ReportService(
        profiles=world.profiles,
        conversations=world.conversations,
        sessions=world.sessions,
        accounts=world.accounts,
        repository=world.report_store,
        starter=world.report_starter,
        text_model=world.text,
        model="",
        clock=world.clock,
    )


def test_without_a_model_no_report_is_started() -> None:
    world = World()
    call_id = unreported(world)
    reports = without_a_model(world)

    reports.after_call(USER, call_id)
    with pytest.raises(ReportError) as refused:
        reports.request(USER, call_id)

    assert refused.value.code == "unavailable"
    assert reports.view(USER, call_id) == ReportState("none")
    assert world.report_starter.started == []


# --- What to practise next -----------------------------------------------------------------------


def test_the_latest_report_says_what_to_practise_next() -> None:
    world = World()
    lena, jonas = world.onboard()
    world.onboard(OTHER_USER)
    first = world.talk(lena, at=NOON - 3 * HOUR, turns=TURNS)
    second = world.talk(jonas, at=NOON - 2 * HOUR, turns=TURNS)
    failed = world.talk(lena, at=NOON - HOUR, turns=TURNS)
    theirs = world.talk(lena, at=NOON, turns=TURNS, user=OTHER_USER)
    world.reported(first, "Le datif après « mit »")
    world.reported(second, "Le Perfekt avec « sein »", "La place du verbe")
    world.reports.after_call(USER, failed)
    world.report_store.written(failed, "failed", None)
    world.reported(theirs, "Les articles")

    assert world.reports.next_steps(USER) == ("Le Perfekt avec « sein »", "La place du verbe")
    assert world.reports.next_steps(OTHER_USER) == ("Les articles",)


def test_a_learner_without_a_report_has_no_next_steps() -> None:
    world = World()
    world.onboard()

    assert world.reports.next_steps(USER) == ()


def test_the_report_of_another_language_does_not_say_what_to_practise() -> None:
    world = World()
    lena, _ = world.onboard()
    call_id = world.talk(lena, at=NOON - HOUR, turns=TURNS)
    world.reported(call_id, "The past tense", target="en")

    assert world.reports.next_steps(USER) == ()


def test_what_to_practise_comes_from_the_last_report_and_until_then_from_the_placement_test() -> (
    None
):
    steps, areas = ("Le Perfekt",), ("Le datif", "L'ordre des mots")

    assert what_to_practise(steps, areas) == Focus(steps, "report")
    assert what_to_practise((), areas) == Focus(areas, "placement")
    assert what_to_practise((), ()) == Focus((), None)


# --- The verbatim text (spec §9.4) -------------------------------------------------------------

# The live transcription tidied the learner's first answer; the verbatim pass kept it as said.
VERBATIM_TURNS = (
    TURNS[0],
    Turn(
        "learner",
        "Gut. Ich bin nach Berlin gefahren mit dem Bus.",
        verbatim="Gut. Ich habe nach Berlin gefahren mit der Bus.",
    ),
    *TURNS[2:4],
    TURNS[4],
    Turn("learner", "Ja. Tschüss!", verbatim="ja tschüss"),
)


def test_the_analyst_reads_what_the_learner_said_and_what_the_live_pass_heard() -> None:
    world = written(ANALYSIS, CONFIRMED, turns=VERBATIM_TURNS)

    transcript = json.loads(world.text.tasks[-2].content)["transcript"]

    assert transcript[1] == {
        "turn": 1,
        "speaker": "learner",
        "text": "Gut. Ich habe nach Berlin gefahren mit der Bus.",
        "live": "Gut. Ich bin nach Berlin gefahren mit dem Bus.",
    }
    # The same words: nothing to compare.
    assert transcript[5] == {"turn": 5, "speaker": "learner", "text": "ja tschüss"}


def test_the_analyst_is_told_what_the_two_texts_are() -> None:
    world = written(ANALYSIS, CONFIRMED, turns=VERBATIM_TURNS)

    instructions = world.text.tasks[-2].instructions

    assert "`live`" in instructions
    assert "recording" in instructions


def test_a_mistake_only_the_verbatim_text_kept_is_reported() -> None:
    world = written(ANALYSIS, CONFIRMED, turns=VERBATIM_TURNS)

    report = report_of(world)

    assert [m.original for m in report.mistakes] == [
        "Ich habe nach Berlin gefahren",
        "mit der Bus",
        "weil es war sehr interessant",
    ]
    review = json.loads(world.text.tasks[-1].content)
    assert review["mistakes"][0]["learner_said"] == (
        "Gut. Ich habe nach Berlin gefahren mit der Bus."
    )


def test_a_quote_from_the_live_text_is_accepted_too() -> None:
    analysis = {
        **ANALYSIS,
        "mistakes": [],
        "rewrites": [
            {
                "turn": 1,
                "original": "Ich bin nach Berlin gefahren",
                "natural": "Ich war in Berlin",
                "note": "Plus court.",
            }
        ],
    }

    report = report_of(
        written(
            analysis,
            {"mistakes": [], "rewrites": [{"id": 0, "verdict": "keep"}]},
            turns=VERBATIM_TURNS,
        )
    )

    assert [rewrite.original for rewrite in report.rewrites] == ["Ich bin nach Berlin gefahren"]


def test_a_conversation_is_measured_by_what_the_learner_said() -> None:
    stats = measure((Turn("learner", "Ich bin gefahren.", verbatim="Ich ich habe gefahren."),))

    assert stats.learner_words == 4
