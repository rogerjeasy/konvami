"""Flashcards over HTTP: making cards from a report, the deck, and reviewing."""

import base64
from datetime import timedelta
from typing import Any
from uuid import UUID

from konvami_api.api.app import Services
from konvami_api.domain.cards import MAX_CARDS
from konvami_api.domain.reports import MAX_REQUESTS, Mistake, Report, Stats, Word
from konvami_api.domain.voice_review import MAX_ANSWERS_PER_DAY
from tests.api.conftest import OTHER_USER, USER, Call
from tests.api.test_report_api import talked
from tests.fakes import (
    FakeSpeechModel,
    FixedClock,
    InMemoryVoiceSessionRepository,
    ScriptedTextModel,
    ScriptedTranscriber,
)

REPORT = Report(
    target="de",
    language="en",
    summary="You talked about your weekend in Berlin.",
    mistakes=(
        Mistake(
            turn=1,
            original="Ich habe nach Berlin gefahren",
            corrected="Ich bin nach Berlin gefahren",
            explanation="Verbs of movement form the Perfekt with sein.",
            category="perfekt_auxiliary",
            severity="noticeable",
            certain=True,
        ),
        Mistake(
            1, "mit der Bus", "mit dem Bus", "mit takes the dative.", "case_dative", "minor", False
        ),
    ),
    rewrites=(),
    words=(
        Word("das Wochenende", "weekend", "Wie war dein Wochenende?"),
        Word("die Ausstellung", "exhibition", None),
    ),
    wins=(),
    next_steps=(),
    stats=Stats(19, 14, 2, 10),
)
AUDIO = base64.b64encode(b"\x00\x01" * 400).decode()
WORD = {"conversationId": "rtc_1", "kind": "word", "index": 0}
FIRST_ID = "cccccccc-cccc-4ccc-8ccc-000000000001"


def reported(
    call: Call,
    text_model: ScriptedTextModel,
    calls: InMemoryVoiceSessionRepository,
    services: Services,
) -> None:
    """An onboarded learner whose conversation `rtc_1` has a report with two words and two
    mistakes (the second one unconfirmed)."""
    talked(call, text_model, calls)
    reports = services.reports._repository
    now = services.cards._clock()
    reports.request("rtc_1", now, stale_before=now, max_requests=MAX_REQUESTS)
    reports.written("rtc_1", "ready", REPORT)


def test_a_word_of_a_report_is_saved_as_a_card(
    call: Call,
    text_model: ScriptedTextModel,
    calls: InMemoryVoiceSessionRepository,
    services: Services,
) -> None:
    reported(call, text_model, calls, services)

    response = call("POST", "/v1/cards", WORD)

    assert response.status == 200
    assert response.body == {
        "id": FIRST_ID,
        "kind": "word",
        "front": "das Wochenende",
        "back": "weekend",
        "note": "Wie war dein Wochenende?",
        "explainedIn": "en",
        "conversationId": "rtc_1",
        "createdAt": "2026-10-09T12:00:00Z",
        "dueAt": "2026-10-09T12:00:00Z",
        "reviewedAt": None,
        "reviews": 0,
        "lapses": 0,
        # The forms come a moment later, from the worker.
        "details": None,
    }
    # Saving it again answers with the same card.
    assert call("POST", "/v1/cards", WORD).body["id"] == FIRST_ID


def test_a_cards_forms_and_sound_are_read_with_it(
    call: Call,
    text_model: ScriptedTextModel,
    calls: InMemoryVoiceSessionRepository,
    services: Services,
    speech: FakeSpeechModel,
) -> None:
    reported(call, text_model, calls, services)
    card_id = call("POST", "/v1/cards", WORD).body["id"]
    text_model.answers.append(
        {
            "cards": [
                {
                    "id": 0,
                    "part": "noun",
                    "article": "das",
                    "plural": "die Wochenenden",
                    "present": None,
                    "preterite": None,
                    "perfect": None,
                    "separable": None,
                    "case": None,
                    "comparative": None,
                    "superlative": None,
                }
            ]
        }
    )
    services.card_details.fill_in(UUID(USER))

    card = call("GET", "/v1/cards").body["cards"][0]
    sound = call("GET", f"/v1/cards/{card_id}/audio")

    assert card["details"] == {
        "part": "noun",
        "article": "das",
        "plural": "die Wochenenden",
        "present": None,
        "preterite": None,
        "perfect": None,
        "separable": None,
        "case": None,
        "comparative": None,
        "superlative": None,
    }
    assert sound.status == 200
    assert sound.body["url"].startswith("https://files.test/")
    assert speech.tasks[0].text == "das Wochenende. Wie war dein Wochenende?"


def test_a_card_that_is_not_the_learners_has_no_sound(call: Call) -> None:
    response = call("GET", f"/v1/cards/{UUID(int=7)}/audio")

    assert (response.status, response.body["error"]["code"]) == (404, "not_found")


def test_a_card_answered_out_loud_says_what_was_heard_and_the_rating_it_points_to(
    call: Call,
    text_model: ScriptedTextModel,
    calls: InMemoryVoiceSessionRepository,
    services: Services,
    answer_transcriber: ScriptedTranscriber,
) -> None:
    reported(call, text_model, calls, services)
    card_id = call("POST", "/v1/cards", WORD).body["id"]
    answer_transcriber.answers.append("Wochenende")

    response = call(
        "POST", f"/v1/cards/{card_id}/answers", {"audio": AUDIO, "format": "m4a", "durationMs": 900}
    )

    assert (response.status, response.body) == (
        200,
        {
            "heard": "Wochenende",
            "outcome": "article",
            "expected": "das Wochenende",
            "suggested": "hard",
        },
    )
    assert answer_transcriber.tasks[0].seconds == 0.9
    # The rating is still the learner's.
    assert call("GET", "/v1/cards/due").body["due"] == 1


def test_an_answer_to_a_card_that_is_not_the_learners_is_refused(call: Call) -> None:
    response = call("POST", f"/v1/cards/{UUID(int=7)}/answers", {"audio": AUDIO, "format": "m4a"})

    assert (response.status, response.body["error"]["code"]) == (404, "not_found")


def test_an_answer_that_is_not_base64_is_refused(
    call: Call,
    text_model: ScriptedTextModel,
    calls: InMemoryVoiceSessionRepository,
    services: Services,
) -> None:
    reported(call, text_model, calls, services)
    card_id = call("POST", "/v1/cards", WORD).body["id"]

    response = call(
        "POST", f"/v1/cards/{card_id}/answers", {"audio": "not audio!", "format": "m4a"}
    )

    assert (response.status, response.body["error"]["code"]) == (422, "invalid_value")


def test_answers_past_the_days_limit_are_refused(
    call: Call,
    text_model: ScriptedTextModel,
    calls: InMemoryVoiceSessionRepository,
    services: Services,
    answer_transcriber: ScriptedTranscriber,
) -> None:
    reported(call, text_model, calls, services)
    card_id = call("POST", "/v1/cards", WORD).body["id"]
    answer_transcriber.answers += ["das Wochenende"] * MAX_ANSWERS_PER_DAY
    for _ in range(MAX_ANSWERS_PER_DAY):
        call("POST", f"/v1/cards/{card_id}/answers", {"audio": AUDIO, "format": "m4a"})

    response = call("POST", f"/v1/cards/{card_id}/answers", {"audio": AUDIO, "format": "m4a"})

    assert (response.status, response.body["error"]["code"]) == (429, "answer_limit")


def test_a_correction_is_saved_as_a_card(
    call: Call,
    text_model: ScriptedTextModel,
    calls: InMemoryVoiceSessionRepository,
    services: Services,
) -> None:
    reported(call, text_model, calls, services)

    card = call("POST", "/v1/cards", {**WORD, "kind": "correction"}).body

    assert (card["kind"], card["front"], card["back"], card["note"]) == (
        "correction",
        "Ich habe nach Berlin gefahren",
        "Ich bin nach Berlin gefahren",
        "Verbs of movement form the Perfekt with sein.",
    )


def test_what_cannot_become_a_card_is_refused_with_the_reason(
    call: Call,
    text_model: ScriptedTextModel,
    calls: InMemoryVoiceSessionRepository,
    services: Services,
) -> None:
    reported(call, text_model, calls, services)

    def refused(body: Any, subject: str = USER) -> tuple[int, str]:
        response = call("POST", "/v1/cards", body, subject=subject)
        return response.status, response.body["error"]["code"]

    assert refused({**WORD, "kind": "correction", "index": 1}) == (422, "not_certain")
    assert refused({**WORD, "index": 7}) == (422, "no_such_item")
    assert refused({**WORD, "index": -1}) == (422, "invalid_request")
    assert refused({**WORD, "kind": "phrase"}) == (422, "invalid_request")
    assert refused({**WORD, "front": "anything"}) == (422, "invalid_request")
    assert refused({**WORD, "conversationId": "rtc_nothing"}) == (404, "not_found")
    assert refused(WORD, subject=OTHER_USER) == (404, "not_found")


def test_a_card_needs_a_report_that_is_ready(
    call: Call, text_model: ScriptedTextModel, calls: InMemoryVoiceSessionRepository
) -> None:
    talked(call, text_model, calls)

    response = call("POST", "/v1/cards", WORD)

    assert (response.status, response.body["error"]["code"]) == (409, "no_report")


def test_the_deck_is_read_with_what_is_due(
    call: Call,
    text_model: ScriptedTextModel,
    calls: InMemoryVoiceSessionRepository,
    services: Services,
    clock: FixedClock,
) -> None:
    reported(call, text_model, calls, services)
    call("POST", "/v1/cards", WORD)
    clock.now += timedelta(minutes=1)
    second = call("POST", "/v1/cards", {**WORD, "index": 1}).body
    call("POST", f"/v1/cards/{second['id']}/review", {"rating": "good"})

    deck = call("GET", "/v1/cards").body
    page = call("GET", "/v1/cards?limit=1").body
    rest = call("GET", "/v1/cards?limit=1&before=2026-10-09T12%3A01%3A00Z").body

    assert [card["front"] for card in deck["cards"]] == ["die Ausstellung", "das Wochenende"]
    assert (deck["total"], deck["due"], deck["next"]) == (2, 1, None)
    assert ([card["front"] for card in page["cards"]], page["next"]) == (
        ["die Ausstellung"],
        "2026-10-09T12:01:00Z",
    )
    assert [card["front"] for card in rest["cards"]] == ["das Wochenende"]
    assert call("GET", "/v1/cards?limit=many").status == 422
    assert call("GET", "/v1/cards", subject=OTHER_USER).body == {
        "cards": [],
        "next": None,
        "total": 0,
        "due": 0,
    }


def test_the_review_queue_says_when_each_card_would_come_back(
    call: Call,
    text_model: ScriptedTextModel,
    calls: InMemoryVoiceSessionRepository,
    services: Services,
) -> None:
    reported(call, text_model, calls, services)
    call("POST", "/v1/cards", WORD)
    call("POST", "/v1/cards", {**WORD, "kind": "correction"})

    queue = call("GET", "/v1/cards/due").body
    short = call("GET", "/v1/cards/due?limit=1").body

    assert queue["due"] == 2
    # The language the cards are in, for the app to find a word in its sentence.
    assert queue["language"] == "de"
    assert [item["card"]["front"] for item in queue["cards"]] == [
        "das Wochenende",
        "Ich habe nach Berlin gefahren",
    ]
    # Seconds until the card is due again: ten minutes, one day, two days, eight days.
    assert queue["cards"][0]["dueIn"] == {
        "again": 600,
        "hard": 86400,
        "good": 172800,
        "easy": 691200,
    }
    assert (len(short["cards"]), short["due"]) == (1, 2)


def test_a_review_moves_the_card_to_when_it_is_due_next(
    call: Call,
    text_model: ScriptedTextModel,
    calls: InMemoryVoiceSessionRepository,
    services: Services,
) -> None:
    reported(call, text_model, calls, services)
    call("POST", "/v1/cards", WORD)

    response = call("POST", f"/v1/cards/{FIRST_ID}/review", {"rating": "good"})

    assert response.status == 200
    assert response.body["dueAt"] == "2026-10-11T12:00:00Z"
    assert (response.body["reviewedAt"], response.body["reviews"]) == ("2026-10-09T12:00:00Z", 1)
    assert call("GET", "/v1/cards/due").body == {"cards": [], "due": 0, "language": "de"}


def test_a_review_is_refused_for_a_card_that_is_not_the_learners_or_a_rating_that_is_none(
    call: Call,
    text_model: ScriptedTextModel,
    calls: InMemoryVoiceSessionRepository,
    services: Services,
) -> None:
    reported(call, text_model, calls, services)
    call("POST", "/v1/cards", WORD)
    review = f"/v1/cards/{FIRST_ID}/review"

    theirs = call("POST", review, {"rating": "good"}, subject=OTHER_USER)
    unknown = call("POST", f"/v1/cards/{UUID(int=7)}/review", {"rating": "good"})
    invalid = call("POST", review, {"rating": "perfect"})
    malformed = call("POST", "/v1/cards/not-an-id/review", {"rating": "good"})

    assert (theirs.status, theirs.body["error"]["code"]) == (404, "not_found")
    assert unknown.status == 404
    assert (invalid.status, invalid.body["error"]["code"]) == (422, "invalid_request")
    assert malformed.status == 422


def test_a_card_can_be_removed(
    call: Call,
    text_model: ScriptedTextModel,
    calls: InMemoryVoiceSessionRepository,
    services: Services,
) -> None:
    reported(call, text_model, calls, services)
    call("POST", "/v1/cards", WORD)
    call("POST", "/v1/cards", {**WORD, "index": 1})

    theirs = call("DELETE", f"/v1/cards/{FIRST_ID}", subject=OTHER_USER)
    removed = call("DELETE", f"/v1/cards/{FIRST_ID}")

    assert theirs.status == 404
    assert (removed.status, removed.body) == (200, {"total": 1, "due": 1})
    assert call("DELETE", f"/v1/cards/{FIRST_ID}").status == 404


def test_a_full_deck_takes_no_more_cards(
    call: Call,
    text_model: ScriptedTextModel,
    calls: InMemoryVoiceSessionRepository,
    services: Services,
) -> None:
    reported(call, text_model, calls, services)
    full = services.cards._repository
    for number in range(MAX_CARDS):
        card = services.cards.save(UUID(USER), "rtc_1", "word", 1)
        full.remove(UUID(USER), card.id)
        full.add(UUID(USER), "de", f"wort{number}", card, MAX_CARDS)

    response = call("POST", "/v1/cards", WORD)

    assert (response.status, response.body["error"]["code"]) == (409, "too_many")


def test_a_report_says_which_of_its_words_and_corrections_are_cards(
    call: Call,
    text_model: ScriptedTextModel,
    calls: InMemoryVoiceSessionRepository,
    services: Services,
) -> None:
    reported(call, text_model, calls, services)
    before = call("GET", "/v1/conversations/rtc_1/report").body["report"]
    call("POST", "/v1/cards", {**WORD, "index": 1})
    call("POST", "/v1/cards", {**WORD, "kind": "correction"})

    after = call("GET", "/v1/conversations/rtc_1/report").body["report"]

    assert [word["saved"] for word in before["words"]] == [False, False]
    assert [mistake["saved"] for mistake in before["mistakes"]] == [False, False]
    assert [word["saved"] for word in after["words"]] == [False, True]
    assert [mistake["saved"] for mistake in after["mistakes"]] == [True, False]


def test_home_counts_the_cards_that_are_due(
    call: Call,
    text_model: ScriptedTextModel,
    calls: InMemoryVoiceSessionRepository,
    services: Services,
) -> None:
    reported(call, text_model, calls, services)
    none_yet = call("GET", "/v1/home").body["cardsDue"]
    call("POST", "/v1/cards", WORD)
    call("POST", "/v1/cards", {**WORD, "index": 1})
    call("POST", f"/v1/cards/{FIRST_ID}/review", {"rating": "easy"})

    assert none_yet == 0
    assert call("GET", "/v1/home").body["cardsDue"] == 1


def test_a_card_is_read_by_its_owner_and_is_todays_word_on_home(
    call: Call,
    text_model: ScriptedTextModel,
    calls: InMemoryVoiceSessionRepository,
    services: Services,
) -> None:
    reported(call, text_model, calls, services)
    saved = call("POST", "/v1/cards", WORD).body

    read = call("GET", f"/v1/cards/{FIRST_ID}")
    words = call("GET", "/v1/home").body["reminders"]["words"]

    assert (read.status, read.body) == (200, saved)
    assert call("GET", f"/v1/cards/{UUID(int=7)}").status == 404
    # One word for each of the next seven days: the learner has only this one.
    assert [word["day"] for word in words][:2] == ["2026-10-09", "2026-10-10"]
    assert {word["card"]["id"] for word in words} == {FIRST_ID}
