"""The grammar notes a language pack gives the Tutor to rest its answers on (spec §6.8, §16.1)."""

from konvami_api.domain.catalog import CATALOG
from konvami_api.domain.planner import NOT_ELICITABLE


def test_every_kind_of_mistake_the_german_pack_knows_has_one_note() -> None:
    pack = CATALOG.available_pack("de")
    assert pack is not None

    assert [note.topic for note in pack.grammar] == list(pack.error_categories)


def test_a_note_states_its_rule_with_a_correct_and_a_wrong_example() -> None:
    pack = CATALOG.available_pack("de")
    assert pack is not None

    for note in pack.grammar:
        assert note.title.strip(), note.topic
        assert len(note.rule) >= 60, note.topic
        assert note.right, note.topic
        assert note.wrong, note.topic
        # A wrong example is never also given as right.
        assert not set(note.right) & set(note.wrong), note.topic


def test_a_note_is_found_by_its_topic() -> None:
    pack = CATALOG.available_pack("de")
    assert pack is not None

    found = pack.note("case_dative")

    assert found is not None
    assert found.topic == "case_dative"
    assert pack.note("klingon_grammar") is None


def test_every_structure_a_partner_can_steer_towards_says_how() -> None:
    pack = CATALOG.available_pack("de")
    assert pack is not None
    for note in pack.grammar:
        if note.topic in NOT_ELICITABLE:
            assert note.elicit == "", note.topic
        else:
            # A sentence for the partner, with questions in German that call for the structure.
            assert len(note.elicit) > 40, note.topic
            assert "?" in note.elicit, note.topic
