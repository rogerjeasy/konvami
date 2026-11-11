"""Anki text imports preserve content and do not activate HTML (§6.7)."""

import csv
import io
from datetime import UTC, datetime
from uuid import UUID

from konvami_api.domain.cards import Card
from konvami_api.domain.deck_export import anki_tsv


def test_export_round_trips_unicode_tabs_newlines_quotes_and_literal_markup() -> None:
    now = datetime(2026, 11, 11, tzinfo=UTC)
    card = Card(
        UUID(int=1),
        "word",
        'l\'école\t"primaire"',
        "school\n学校",
        "<script>literal</script>",
        "en",
        None,
        now,
        now,
        None,
        None,
        0,
        0,
    )
    exported = anki_tsv([card])
    assert exported.startswith("#separator:Tab\n#html:false\n#columns:Front\tBack\tNotes\n")
    rows = list(csv.reader(io.StringIO(exported.split("\n", 3)[3]), delimiter="\t"))
    assert rows == [[card.front, card.back, card.note]]


def test_empty_deck_has_headers_without_invented_cards() -> None:
    assert anki_tsv([]).splitlines() == [
        "#separator:Tab",
        "#html:false",
        "#columns:Front\tBack\tNotes",
    ]
