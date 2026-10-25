"""How the accuracy test of spec §16.2 judges a transcript and the live checks of a sentence."""

from evals.verbatim.golden import CONTROLS, MISTAKES, Sample
from evals.verbatim.scoring import (
    Heard,
    caught,
    false_alarms,
    heard,
    summarise,
    word_error_rate,
)

from konvami_api.domain.live_call import LiveCorrection

PERFEKT = Sample(
    "perfekt_1",
    "Ich habe nach Berlin gefahren.",
    "perfekt_auxiliary",
    error="habe nach Berlin",
    fixed="bin nach Berlin",
)
CONTROL = Sample("control_1", "Ich bin nach Berlin gefahren.")


def correction(said: str, topic: str = "perfekt_auxiliary") -> LiveCorrection:
    return LiveCorrection(said, "…", "…", topic, False)


def test_a_mistake_written_down_as_it_was_said_is_kept() -> None:
    assert heard(PERFEKT, "ich habe nach Berlin gefahren") is Heard.KEPT


def test_a_mistake_written_down_put_right_was_tidied_away() -> None:
    assert heard(PERFEKT, "Ich bin nach Berlin gefahren.") is Heard.TIDIED


def test_a_transcript_with_neither_misheard_the_sentence() -> None:
    assert heard(PERFEKT, "Ich war in Bern.") is Heard.MISHEARD


def test_a_correct_sentence_written_down_word_for_word_is_kept() -> None:
    assert heard(CONTROL, "Ich bin nach Berlin gefahren") is Heard.KEPT
    assert heard(CONTROL, "Ich bin nach Bern gefahren") is Heard.MISHEARD


def test_word_error_rate_counts_words_changed_added_or_left_out() -> None:
    assert word_error_rate("Ich bin nach Berlin gefahren.", "ich bin nach berlin gefahren") == 0
    assert word_error_rate("Ich bin nach Berlin gefahren", "Ich war nach Berlin") == 0.4


def test_a_mistake_is_caught_by_a_correction_of_its_words() -> None:
    assert caught(PERFEKT, (correction("Ich habe nach Berlin gefahren"),))
    assert caught(PERFEKT, (correction("habe", "conjugation"),))
    assert not caught(PERFEKT, (correction("gefahren", "participle_form"),))
    assert not caught(PERFEKT, ())


def test_a_word_order_mistake_is_caught_by_a_correction_of_its_words() -> None:
    order = Sample(
        "v2_1",
        "Gestern ich habe lange gearbeitet.",
        "word_order_v2",
        error="Gestern ich habe",
        fixed="Gestern habe ich",
    )

    assert caught(order, (correction("Gestern, ich habe", "word_order_v2"),))
    assert false_alarms(order, (correction("Gestern ich habe", "word_order_v2"),)) == 0
    assert not caught(order, (correction("lange gearbeitet"),))


def test_a_correction_of_other_words_or_of_a_correct_sentence_is_a_false_alarm() -> None:
    assert false_alarms(PERFEKT, (correction("habe nach"), correction("gefahren"))) == 1
    assert false_alarms(CONTROL, (correction("bin nach Berlin"),)) == 1


def test_the_summary_gives_shares_per_system() -> None:
    rows = [
        {"system": "live", "sample": "perfekt_1", "heard": "kept"},
        {"system": "live", "sample": "perfekt_2", "heard": "tidied"},
        {"system": "live", "sample": "control_1", "heard": "kept"},
    ]

    (live,) = summarise(rows, {"perfekt_1": PERFEKT, "perfekt_2": PERFEKT, "control_1": CONTROL})

    assert (live.system, live.mistakes, live.kept, live.tidied, live.misheard) == (
        "live",
        2,
        0.5,
        0.5,
        0.0,
    )
    assert (live.controls, live.controls_kept) == (1, 1.0)


def test_the_test_sentences_hold_what_they_claim() -> None:
    from konvami_api.domain.catalog import CATALOG
    from konvami_api.domain.reports import within, words_in

    pack = CATALOG.available_pack("de")
    assert pack is not None
    ids = [sample.id for sample in (*MISTAKES, *CONTROLS)]
    assert len(ids) == len(set(ids))
    for sample in MISTAKES:
        assert sample.error, sample.id
        assert sample.fixed, sample.id
        assert within(words_in(sample.error), words_in(sample.said)), sample.id
        assert words_in(sample.error) != words_in(sample.fixed), sample.id
        assert sample.category in pack.error_categories, sample.id
    # Every kind of mistake the pack knows, three times, and correct sentences to compare.
    for category in pack.error_categories:
        assert sum(sample.category == category for sample in MISTAKES) >= 3, category
    assert len(CONTROLS) >= 12
    assert all(sample.error is None for sample in CONTROLS)
