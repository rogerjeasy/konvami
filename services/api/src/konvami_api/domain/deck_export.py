"""Lossless UTF-8 text export for Anki's documented tab-separated importer (§6.7)."""

from __future__ import annotations

import csv
import io
from collections.abc import Sequence
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from konvami_api.domain.cards import Card

# Anki reads these before CSV records. Literal learner text must not become executable HTML.
_HEADER = "#separator:Tab\n#html:false\n#columns:Front\tBack\tNotes\n"


def anki_tsv(cards: Sequence[Card]) -> str:
    output = io.StringIO(newline="")
    output.write(_HEADER)
    # Quoting every field also protects a front beginning with # from looking like a comment.
    writer = csv.writer(output, delimiter="\t", lineterminator="\n", quoting=csv.QUOTE_ALL)
    writer.writerows((card.front, card.back, card.note or "") for card in cards)
    return output.getvalue()
