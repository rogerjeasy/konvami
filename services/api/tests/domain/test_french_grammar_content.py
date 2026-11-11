"""The french reference is internally consistent before catalog activation (§13)."""

from konvami_api.domain.language_packs.french_grammar import NOTES, TOPICS


def test_reference_covers_the_level_path_without_unexplained_categories() -> None:
    assert {topic.level for topic in TOPICS} == {"A1", "A2", "B1", "B2", "C1", "C2"}
    notes = {note.topic: note for note in NOTES}
    assert len(notes) == len(NOTES)
    for topic in TOPICS:
        for category in topic.categories:
            note = notes[category]
            assert note.right
            assert note.wrong
            assert not set(note.right) & set(note.wrong)
            assert topic.examples == note.right
