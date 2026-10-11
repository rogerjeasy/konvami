"""The Progress screen over HTTP: one answer with everything it charts."""

from konvami_api.api.app import Services
from konvami_api.domain.reports import MAX_REQUESTS, Mistake, Report, Stats, Word
from tests.api.conftest import OTHER_USER, Call
from tests.api.test_api import onboarded
from tests.api.test_report_api import talked
from tests.fakes import FixedClock, InMemoryVoiceSessionRepository, ScriptedTextModel

REPORT = Report(
    target="de",
    language="en",
    summary="You talked about your weekend in Berlin.",
    mistakes=(
        Mistake(
            1, "mit der Bus", "mit dem Bus", "mit takes the dative.", "case_dative", "minor", True
        ),
        Mistake(1, "in der Bus", "im Bus", "…", "case_dative", "minor", True),
        Mistake(
            3, "weil es war gut", "weil es gut war", "…", "word_order_subordinate", "minor", False
        ),
    ),
    rewrites=(),
    words=(Word("das Wochenende", "weekend", None),),
    wins=(),
    next_steps=(),
    stats=Stats(learner_words=120, partner_words=80, learner_turns=9, longest_turn_words=22),
)


def test_a_new_learner_has_an_empty_chart_and_every_milestone_ahead(
    call: Call, text_model: ScriptedTextModel, calls: InMemoryVoiceSessionRepository
) -> None:
    onboarded(call, text_model)

    response = call("GET", "/v1/progress")

    assert response.status == 200
    progress = response.body
    assert progress["language"] == "de"
    assert progress["level"] == {"level": "A2", "source": "asked", "skills": None}
    assert progress["activity"]["conversations"] == 0
    assert progress["longestStreakDays"] == 0
    assert [week["seconds"] for week in progress["weeks"]] == [0] * 8
    assert progress["weeks"][-1] == {"start": "2026-10-05", "seconds": 0, "conversations": 0}
    assert progress["talk"] is None
    assert progress["mistakes"] == {
        "weeks": [
            "2026-08-31",
            "2026-09-07",
            "2026-09-14",
            "2026-09-21",
            "2026-09-28",
            "2026-10-05",
        ],
        "kinds": [],
    }
    assert progress["cards"] == {
        "total": 0,
        "due": 0,
        "learned": 0,
        "reviews": 0,
        "remembered": 0,
    }
    assert progress["milestones"][0] == {
        "id": "first_conversation",
        "current": 0,
        "target": 1,
        "reached": False,
    }
    assert [m["id"] for m in progress["milestones"]] == [
        "first_conversation",
        "five_conversations",
        "long_conversation",
        "hour_of_talking",
        "week_streak",
        "hundred_words",
        "first_card",
        "fifty_reviews",
    ]


def test_progress_charts_what_the_learner_did(
    call: Call,
    text_model: ScriptedTextModel,
    calls: InMemoryVoiceSessionRepository,
    services: Services,
    clock: FixedClock,
) -> None:
    # A five-minute conversation an hour ago, with a report and a card reviewed from it.
    talked(call, text_model, calls)
    reports = services.reports._repository
    reports.request("rtc_1", clock.now, stale_before=clock.now, max_requests=MAX_REQUESTS)
    reports.written("rtc_1", "ready", REPORT)
    card = call("POST", "/v1/cards", {"conversationId": "rtc_1", "kind": "word", "index": 0}).body
    call("POST", f"/v1/cards/{card['id']}/review", {"rating": "good"})

    progress = call("GET", "/v1/progress?tz=Europe%2FZurich").body

    assert progress["activity"]["streakDays"] == 1
    assert progress["longestStreakDays"] == 1
    assert progress["weeks"][-1] == {"start": "2026-10-05", "seconds": 300, "conversations": 1}
    assert progress["talk"] == {"learnerWords": 120, "partnerWords": 80}
    # Only what the second check confirmed is counted.
    assert progress["mistakes"]["kinds"] == [
        {"category": "case_dative", "counts": [0, 0, 0, 0, 0, 2]}
    ]
    assert progress["cards"] == {
        "total": 1,
        "due": 0,
        "learned": 1,
        "reviews": 1,
        "remembered": 1,
    }
    reached = [m["id"] for m in progress["milestones"] if m["reached"]]
    assert reached == ["first_conversation", "hundred_words", "first_card"]


def test_progress_is_each_learners_own_and_needs_onboarding(
    call: Call,
    text_model: ScriptedTextModel,
    calls: InMemoryVoiceSessionRepository,
) -> None:
    talked(call, text_model, calls)

    theirs = call("GET", "/v1/progress", subject=OTHER_USER)
    too_long = call("GET", "/v1/progress?tz=" + "x" * 65)

    # The other learner has not finished onboarding.
    assert (theirs.status, theirs.body["error"]["code"]) == (409, "wrong_stage")
    assert too_long.status == 422
