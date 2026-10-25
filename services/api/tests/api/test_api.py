from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import UUID

from konvami_api.api.app import Services
from konvami_api.domain.live_call import Turn
from konvami_api.domain.placement import MIN_TASKS, PlacementTools
from konvami_api.domain.voice import CallPurpose, FinishedCall, VoiceSession
from tests.api.conftest import OTHER_USER, USER, Call
from tests.fakes import FakeVoiceProvider, InMemoryVoiceSessionRepository, ScriptedTextModel

ESSENTIALS = [
    {"field": "target_language", "value": "de"},
    {"field": "explanation_language", "value": "en"},
    {"field": "explanation_usage", "value": "when_stuck"},
    {"field": "goals", "value": {"reasons": ["work"], "note": None}},
    {"field": "exam", "value": None},
    {"field": "self_assessed_level", "value": "A2"},
    {"field": "course", "value": None},
]


def test_a_request_without_a_signed_in_user_is_refused(call: Call) -> None:
    response = call("GET", "/v1/profile", subject=None)

    assert response.status == 401
    assert response.body == {"error": {"code": "not_authenticated", "field": None}}


def test_a_new_user_reads_an_empty_profile(call: Call) -> None:
    response = call("GET", "/v1/profile")

    assert response.status == 200
    assert response.body == {"targetLanguage": None, "global": {}, "languages": {}}


def test_saved_answers_come_back_grouped_by_language(call: Call) -> None:
    response = call(
        "PATCH",
        "/v1/profile",
        {
            "changes": [
                {"field": "target_language", "value": "de"},
                {"field": "self_assessed_level", "value": "A2"},
            ]
        },
    )

    assert response.status == 200
    assert response.body == {
        "targetLanguage": "de",
        "global": {
            "target_language": {
                "value": "de",
                "source": "asked",
                "updatedAt": "2026-10-09T12:00:00Z",
            }
        },
        "languages": {
            "de": {
                "self_assessed_level": {
                    "value": "A2",
                    "source": "asked",
                    "updatedAt": "2026-10-09T12:00:00Z",
                }
            }
        },
    }
    assert call("GET", "/v1/profile").body == response.body


def test_a_refused_answer_names_the_field_and_the_reason(call: Call) -> None:
    response = call(
        "PATCH",
        "/v1/profile",
        {
            "changes": [
                {"field": "target_language", "value": "de"},
                {"field": "self_assessed_level", "value": "Z9"},
            ]
        },
    )

    assert response.status == 422
    assert response.body == {"error": {"code": "invalid_value", "field": "self_assessed_level"}}
    assert call("GET", "/v1/profile").body["targetLanguage"] is None


def test_a_malformed_request_is_refused_without_internal_detail(call: Call) -> None:
    response = call("PATCH", "/v1/profile", {"changes": "all of them"})

    assert response.status == 422
    assert response.body == {"error": {"code": "invalid_request", "field": None}}


def test_an_empty_list_of_changes_is_refused(call: Call) -> None:
    response = call("PATCH", "/v1/profile", {"changes": []})

    assert response.status == 422
    assert response.body == {"error": {"code": "invalid_request", "field": None}}


def test_each_user_sees_only_their_own_profile(call: Call) -> None:
    call("PATCH", "/v1/profile", {"changes": [{"field": "target_language", "value": "de"}]})

    assert call("GET", "/v1/profile", subject=OTHER_USER).body["targetLanguage"] is None


def test_a_subject_that_is_not_a_user_id_is_refused(call: Call) -> None:
    assert call("GET", "/v1/profile", subject="not-a-uuid").status == 401


def test_the_catalog_lists_what_can_be_learned_and_chosen(call: Call) -> None:
    body = call("GET", "/v1/catalog").body

    german = body["languages"][0]
    assert (german["code"], german["available"]) == ("de", True)
    assert {"id": "dtz", "name": "Deutsch-Test für Zuwanderer", "levels": ["A2", "B1"]} in german[
        "exams"
    ]
    assert {"code": "fr", "available": False, "exams": [], "scenarios": []} in body["languages"]
    assert body["startingLevels"] == ["A0", "A1", "A2", "B1", "B2", "C1", "C2"]
    assert body["examLevels"] == ["A1", "A2", "B1", "B2", "C1", "C2"]
    assert "living_abroad" in body["goalReasons"]
    assert body["explanationUsages"] == ["never", "when_stuck", "for_grammar", "freely"]
    assert {"code": "en", "name": "English"} in body["explanationLanguages"]
    assert {"code": "sq", "name": "Shqip"} in body["explanationLanguages"]


def test_onboarding_reports_the_stage_and_the_open_questions(call: Call) -> None:
    call("PATCH", "/v1/profile", {"changes": ESSENTIALS[:5]})

    response = call("GET", "/v1/onboarding")

    assert response.status == 200
    assert response.body == {
        "stage": "essentials",
        "missing": ["self_assessed_level", "course"],
        "placement": "not_started",
    }


def test_confirming_the_review_returns_the_next_stage(call: Call) -> None:
    call("PATCH", "/v1/profile", {"changes": ESSENTIALS})

    response = call("POST", "/v1/onboarding/essentials/confirm")

    assert response.status == 200
    assert response.body == {"stage": "placement", "missing": [], "placement": "not_started"}


def test_confirming_too_early_is_a_conflict(call: Call) -> None:
    response = call("POST", "/v1/onboarding/essentials/confirm")

    assert response.status == 409
    assert response.body == {"error": {"code": "essentials_incomplete", "field": None}}


def test_postponing_the_placement_test_moves_on_to_the_partners(call: Call) -> None:
    call("PATCH", "/v1/profile", {"changes": ESSENTIALS})
    call("POST", "/v1/onboarding/essentials/confirm")

    response = call("POST", "/v1/placement/skip")

    assert response.status == 200
    assert response.body == {"stage": "partners", "missing": [], "placement": "skipped"}
    assert call("GET", "/v1/profile").body["languages"]["de"]["starting_level"]["value"] == "A2"


def test_an_unknown_route_is_not_found(call: Call) -> None:
    response = call("GET", "/v1/nothing-here")

    assert response.status == 404
    assert response.body == {"error": {"code": "not_found", "field": None}}


OFFER = {"purpose": "onboarding", "sdp": "v=0 offer"}


def test_a_voice_call_returns_the_providers_answer_and_its_time_limit(
    call: Call, voice_provider: FakeVoiceProvider
) -> None:
    response = call("POST", "/v1/voice/calls", OFFER)

    assert response.status == 200
    assert response.body == {
        "callId": "rtc_1",
        "sdp": "v=0 answer",
        "maxSeconds": 480,
        # Only a practice conversation has a plan.
        "plan": None,
    }
    assert voice_provider.created[0][0] == "v=0 offer"


def test_a_voice_call_needs_consent_to_the_voice_provider(call: Call) -> None:
    response = call("POST", "/v1/voice/calls", OFFER, subject=OTHER_USER)

    assert response.status == 403
    assert response.body == {"error": {"code": "consent_required", "field": None}}


def test_a_voice_provider_outage_is_reported_as_unavailable(
    call: Call, voice_provider: FakeVoiceProvider
) -> None:
    voice_provider.fail = True

    response = call("POST", "/v1/voice/calls", OFFER)

    assert response.status == 503
    assert response.body == {"error": {"code": "voice_unavailable", "field": None}}


def test_a_voice_call_needs_a_known_purpose_and_an_offer(call: Call) -> None:
    assert call("POST", "/v1/voice/calls", {"purpose": "karaoke", "sdp": "v=0"}).status == 422
    assert call("POST", "/v1/voice/calls", {"purpose": "onboarding", "sdp": ""}).status == 422
    assert call("POST", "/v1/voice/calls", {"purpose": "onboarding"}).status == 422


# --- Placement test --------------------------------------------------------------------------

IMPRESSION = dict.fromkeys(
    ["speaking", "listening", "grammar", "vocabulary", "pronunciation"], "B1"
)
SPOKEN = tuple(Turn("learner", text) for text in ("Ich wohne in Zürich.", "Ja.", "Nein, nie."))


def measure(call: Call, services: Services, text_model: ScriptedTextModel, overall: str) -> None:
    """Brings the learner to a finished and assessed placement test."""
    call("PATCH", "/v1/profile", {"changes": ESSENTIALS})
    call("POST", "/v1/onboarding/essentials/confirm")
    text_model.answers.append(
        {"levels": IMPRESSION, "overall": overall, "weak_areas": ["Perfekt mit sein"]}
    )
    services.placement.begin(UUID(USER))
    tools = PlacementTools()
    for _ in range(MIN_TASKS):
        tools.run("note_task", {"task": "opinion", "level": "B1", "outcome": "handled"})
    tools.run("finish_test", IMPRESSION)
    services.placement.conclude(UUID(USER), tools, SPOKEN)


def test_a_test_not_taken_has_no_result(call: Call) -> None:
    call("PATCH", "/v1/profile", {"changes": ESSENTIALS})

    response = call("GET", "/v1/placement")

    assert response.status == 200
    assert response.body == {
        "status": "not_started",
        "selfAssessed": "A2",
        "differs": False,
        "result": None,
    }


def test_a_measured_result_shows_levels_what_to_work_on_and_that_it_differs(
    call: Call, services: Services, text_model: ScriptedTextModel
) -> None:
    measure(call, services, text_model, overall="B1")

    body = call("GET", "/v1/placement").body

    assert (body["status"], body["selfAssessed"], body["differs"]) == ("measured", "A2", True)
    assert body["result"] == {
        "levels": IMPRESSION,
        "overall": "B1",
        "weakAreas": ["Perfekt mit sein"],
        "measuredAt": "2026-10-09T12:00:00Z",
    }
    assert call("GET", "/v1/onboarding").body["placement"] == "measured"


def test_the_learner_chooses_the_measured_level(
    call: Call, services: Services, text_model: ScriptedTextModel
) -> None:
    measure(call, services, text_model, overall="B1")

    response = call("POST", "/v1/placement/decision", {"use": "measured"})

    assert response.status == 200
    assert response.body == {"stage": "partners", "missing": [], "placement": "decided"}
    starting = call("GET", "/v1/profile").body["languages"]["de"]["starting_level"]
    assert (starting["value"], starting["source"]) == ("B1", "measured")


def test_the_learner_keeps_their_own_estimate(
    call: Call, services: Services, text_model: ScriptedTextModel
) -> None:
    measure(call, services, text_model, overall="B1")

    call("POST", "/v1/placement/decision", {"use": "self"})

    starting = call("GET", "/v1/profile").body["languages"]["de"]["starting_level"]
    assert (starting["value"], starting["source"]) == ("A2", "asked")


def test_a_decision_needs_a_result_and_a_known_choice(call: Call) -> None:
    call("PATCH", "/v1/profile", {"changes": ESSENTIALS})
    call("POST", "/v1/onboarding/essentials/confirm")

    early = call("POST", "/v1/placement/decision", {"use": "measured"})
    unknown = call("POST", "/v1/placement/decision", {"use": "average"})

    assert (early.status, early.body["error"]["code"]) == (409, "wrong_stage")
    assert (unknown.status, unknown.body["error"]["code"]) == (422, "invalid_request")


def test_the_placement_call_is_refused_before_the_essentials_are_confirmed(call: Call) -> None:
    response = call("POST", "/v1/voice/calls", {"purpose": "placement", "sdp": "v=0 offer"})

    assert response.status == 409
    assert response.body == {"error": {"code": "wrong_stage", "field": None}}


def test_the_placement_call_starts_once_the_essentials_are_confirmed(
    call: Call, voice_provider: FakeVoiceProvider
) -> None:
    call("PATCH", "/v1/profile", {"changes": ESSENTIALS})
    call("POST", "/v1/onboarding/essentials/confirm")

    response = call("POST", "/v1/voice/calls", {"purpose": "placement", "sdp": "v=0 offer"})

    assert response.status == 200
    assert response.body["maxSeconds"] == 720
    assert call("GET", "/v1/onboarding").body["placement"] == "in_progress"


# --- Starter partners and finishing ------------------------------------------------------------


def at_partners(call: Call, text_model: ScriptedTextModel) -> None:
    """Brings the learner to the partners stage; the writer fails, so the built-in ones come."""
    call("PATCH", "/v1/profile", {"changes": ESSENTIALS})
    call("POST", "/v1/onboarding/essentials/confirm")
    call("POST", "/v1/placement/skip")
    text_model.answers.append(RuntimeError("no writer in this test"))


def test_starter_partners_are_proposed_with_their_looks(
    call: Call, text_model: ScriptedTextModel
) -> None:
    at_partners(call, text_model)
    text_model.answers[-1] = {"personas": []}

    response = call("POST", "/v1/personas/starter")

    assert response.status == 200
    personas = response.body["personas"]
    assert [(p["role"], p["name"]) for p in personas] == [("buddy", "Lena"), ("teacher", "Jonas")]
    # Everything else a partner carries is checked with Persona Studio (test_studio_api.py).
    lena = personas[0]
    assert (lena["age"], lena["origin"], lena["tagline"]) == (27, "Leipzig", None)
    assert lena["look"] == {
        "skin": "sand",
        "hair": "long",
        "hairColor": "chestnut",
        "top": "teal",
        "backdrop": "mist",
        "glasses": False,
        "beard": False,
    }
    assert call("GET", "/v1/personas").body == response.body


def test_partners_are_not_proposed_before_their_stage(call: Call) -> None:
    response = call("POST", "/v1/personas/starter")

    assert (response.status, response.body["error"]["code"]) == (409, "wrong_stage")


def test_a_partner_is_renamed_and_restyled(call: Call, text_model: ScriptedTextModel) -> None:
    at_partners(call, text_model)
    text_model.answers[-1] = {"personas": []}
    lena = call("POST", "/v1/personas/starter").body["personas"][0]
    look = {**lena["look"], "hair": "curls", "hairColor": "black", "glasses": True}

    response = call("PATCH", f"/v1/personas/{lena['id']}", {"name": "Lena Marie", "look": look})

    assert response.status == 200
    assert (response.body["name"], response.body["look"]) == ("Lena Marie", look)
    assert call("GET", "/v1/personas").body["personas"][0]["name"] == "Lena Marie"


def test_bad_changes_to_a_partner_are_refused(call: Call, text_model: ScriptedTextModel) -> None:
    at_partners(call, text_model)
    text_model.answers[-1] = {"personas": []}
    lena = call("POST", "/v1/personas/starter").body["personas"][0]

    empty = call("PATCH", f"/v1/personas/{lena['id']}", {"name": "   "})
    odd = call("PATCH", f"/v1/personas/{lena['id']}", {"look": {**lena["look"], "hair": "mohawk"}})
    missing = call("PATCH", "/v1/personas/aaaaaaaa-aaaa-4aaa-8aaa-000000000009", {"name": "X"})
    other = call("PATCH", f"/v1/personas/{lena['id']}", {"name": "Mine"}, subject=OTHER_USER)

    assert (empty.status, empty.body["error"]["code"]) == (422, "invalid_value")
    assert odd.status == 422
    assert (missing.status, missing.body["error"]["code"]) == (404, "not_found")
    assert other.status == 404


def test_a_removed_partner_is_gone_and_the_rest_come_back(
    call: Call, text_model: ScriptedTextModel
) -> None:
    at_partners(call, text_model)
    text_model.answers[-1] = {"personas": []}
    lena = call("POST", "/v1/personas/starter").body["personas"][0]

    response = call("DELETE", f"/v1/personas/{lena['id']}")

    assert response.status == 200
    assert [p["name"] for p in response.body["personas"]] == ["Jonas"]


def test_confirming_the_partners_and_finishing_completes_onboarding(
    call: Call, text_model: ScriptedTextModel
) -> None:
    at_partners(call, text_model)
    text_model.answers[-1] = {"personas": []}
    call("POST", "/v1/personas/starter")

    confirmed = call("POST", "/v1/onboarding/partners/confirm")
    finished = call("POST", "/v1/onboarding/complete")

    assert confirmed.body == {"stage": "ready", "missing": [], "placement": "skipped"}
    assert finished.body == {"stage": "done", "missing": [], "placement": "skipped"}


def test_onboarding_cannot_move_on_without_a_partner(
    call: Call, text_model: ScriptedTextModel
) -> None:
    at_partners(call, text_model)
    text_model.answers[-1] = {"personas": []}
    for persona in call("POST", "/v1/personas/starter").body["personas"]:
        call("DELETE", f"/v1/personas/{persona['id']}")

    response = call("POST", "/v1/onboarding/partners/confirm")

    assert (response.status, response.body["error"]["code"]) == (409, "no_partners")
    assert call("POST", "/v1/onboarding/complete").status == 409


# --- Practice conversations, the library and home ----------------------------------------------

NOON = datetime(2026, 10, 9, 12, 0, tzinfo=UTC)


def onboarded(call: Call, text_model: ScriptedTextModel) -> list[dict[str, Any]]:
    """Takes the learner through onboarding and returns their partners (Lena and Jonas)."""
    at_partners(call, text_model)
    # The writer delivers nothing usable, so the language pack's own partners are offered.
    text_model.answers[-1] = {"personas": []}
    partners: list[dict[str, Any]] = call("POST", "/v1/personas/starter").body["personas"]
    call("POST", "/v1/onboarding/partners/confirm")
    call("POST", "/v1/onboarding/complete")
    return partners


def talked(
    calls: InMemoryVoiceSessionRepository,
    call_id: str,
    partner: dict[str, Any],
    *,
    at: datetime,
    minutes: int = 5,
    user: str = USER,
) -> None:
    """A finished practice conversation, as the broker and the worker record it."""
    calls.started(
        VoiceSession(
            call_id,
            UUID(user),
            CallPurpose.PRACTICE,
            "gpt-realtime-2.1-mini",
            at,
            persona_id=UUID(partner["id"]),
        )
    )
    calls.finish(
        call_id,
        FinishedCall(
            ended_at=at + timedelta(minutes=minutes),
            outcome="closed",
            usage={},
            turns=(Turn("persona", "Hallo! Wie geht's?"), Turn("learner", "Gut, danke!")),
        ),
    )


def test_a_practice_call_starts_with_the_chosen_partner(
    call: Call, text_model: ScriptedTextModel, voice_provider: FakeVoiceProvider
) -> None:
    _, jonas = onboarded(call, text_model)

    response = call(
        "POST",
        "/v1/voice/calls",
        {"purpose": "practice", "sdp": "v=0 offer", "personaId": jonas["id"]},
    )

    assert response.status == 200
    assert response.body == {
        "callId": "rtc_1",
        "sdp": "v=0 answer",
        "maxSeconds": 600,
        # Nothing to plan from before the first report.
        "plan": {"language": "de", "focus": [], "words": []},
    }
    session = voice_provider.created[0][1]
    assert "You are Jonas" in session["instructions"]
    assert session["audio"]["output"] == {"voice": "cedar"}


def test_a_practice_call_needs_one_of_the_learners_partners(
    call: Call, text_model: ScriptedTextModel
) -> None:
    onboarded(call, text_model)
    stranger = "aaaaaaaa-aaaa-4aaa-8aaa-000000000009"

    missing = call("POST", "/v1/voice/calls", {"purpose": "practice", "sdp": "v=0 offer"})
    unknown = call(
        "POST",
        "/v1/voice/calls",
        {"purpose": "practice", "sdp": "v=0 offer", "personaId": stranger},
    )
    malformed = call(
        "POST", "/v1/voice/calls", {"purpose": "practice", "sdp": "v=0 offer", "personaId": "lena"}
    )

    assert (missing.status, missing.body["error"]["code"]) == (404, "not_found")
    assert (unknown.status, unknown.body["error"]["code"]) == (404, "not_found")
    assert (malformed.status, malformed.body["error"]["code"]) == (422, "invalid_request")


def test_practice_is_refused_before_onboarding_is_finished(call: Call) -> None:
    response = call("POST", "/v1/voice/calls", {"purpose": "practice", "sdp": "v=0 offer"})

    assert response.status == 409
    assert response.body == {"error": {"code": "wrong_stage", "field": None}}


def test_home_of_a_new_learner_has_partners_a_level_and_an_empty_week(
    call: Call, text_model: ScriptedTextModel
) -> None:
    lena, jonas = onboarded(call, text_model)

    response = call("GET", "/v1/home")

    assert response.status == 200
    assert response.body == {
        "language": "de",
        "level": {"level": "A2", "source": "asked", "skills": None},
        "focus": [],
        "focusSource": None,
        "cardsDue": 0,
        "exam": None,
        "partners": [
            {"persona": lena, "conversations": 0, "lastTalkedAt": None},
            {"persona": jonas, "conversations": 0, "lastTalkedAt": None},
        ],
        "suggestedPartnerId": lena["id"],
        "activity": {
            "today": "2026-10-09",
            "streakDays": 0,
            "practisedToday": False,
            "todaySeconds": 0,
            "weekSeconds": 0,
            "week": [{"day": f"2026-10-{day:02d}", "seconds": 0} for day in range(5, 12)],
            "conversations": 0,
            "seconds": 0,
        },
        "recent": [],
    }


def test_home_adds_up_practice_and_lists_the_latest_conversations(
    call: Call, text_model: ScriptedTextModel, calls: InMemoryVoiceSessionRepository
) -> None:
    lena, jonas = onboarded(call, text_model)
    talked(calls, "rtc_a", lena, at=NOON - timedelta(days=1), minutes=4)
    talked(calls, "rtc_b", jonas, at=NOON - timedelta(hours=1), minutes=10)

    home = call("GET", "/v1/home").body

    assert home["suggestedPartnerId"] == jonas["id"]
    assert home["partners"][1] == {
        "persona": jonas,
        "conversations": 1,
        "lastTalkedAt": "2026-10-09T11:00:00Z",
    }
    activity = home["activity"]
    assert (activity["streakDays"], activity["practisedToday"]) == (2, True)
    assert (activity["todaySeconds"], activity["weekSeconds"], activity["seconds"]) == (
        600,
        840,
        840,
    )
    assert activity["week"][3:5] == [
        {"day": "2026-10-08", "seconds": 240},
        {"day": "2026-10-09", "seconds": 600},
    ]
    assert home["recent"] == [
        {
            "id": "rtc_b",
            "partner": jonas,
            "startedAt": "2026-10-09T11:00:00Z",
            "endedAt": "2026-10-09T11:10:00Z",
            "seconds": 600,
            "learnerTurns": 1,
            "scenario": None,
            "goalsReached": [],
        },
        {
            "id": "rtc_a",
            "partner": lena,
            "startedAt": "2026-10-08T12:00:00Z",
            "endedAt": "2026-10-08T12:04:00Z",
            "seconds": 240,
            "learnerTurns": 1,
            "scenario": None,
            "goalsReached": [],
        },
    ]


def test_home_counts_days_in_the_time_zone_the_app_names(
    call: Call, text_model: ScriptedTextModel, calls: InMemoryVoiceSessionRepository
) -> None:
    lena, _ = onboarded(call, text_model)
    # 23:30 in UTC on Thursday is already Friday in Zurich.
    talked(calls, "rtc_late", lena, at=datetime(2026, 10, 8, 23, 30, tzinfo=UTC))

    zurich = call("GET", "/v1/home?tz=Europe%2FZurich").body["activity"]
    utc = call("GET", "/v1/home").body["activity"]
    unknown = call("GET", "/v1/home?tz=Mars%2FOlympus").body["activity"]

    assert zurich["practisedToday"] is True
    assert utc["practisedToday"] is False
    assert unknown == utc


def test_home_shows_the_exam_ahead(call: Call, text_model: ScriptedTextModel) -> None:
    onboarded(call, text_model)
    exam = {"type": "goethe", "target_level": "B1", "date": "2026-12-01"}
    call("PATCH", "/v1/profile", {"changes": [{"field": "exam", "value": exam}]})

    assert call("GET", "/v1/home").body["exam"] == {
        "type": "goethe",
        "name": "Goethe-Zertifikat",
        "targetLevel": "B1",
        "date": "2026-12-01",
        "daysLeft": 53,
    }


def test_home_shows_what_the_placement_test_measured(
    call: Call, services: Services, text_model: ScriptedTextModel
) -> None:
    measure(call, services, text_model, overall="B1")
    call("POST", "/v1/placement/decision", {"use": "measured"})
    text_model.answers.append({"personas": []})
    call("POST", "/v1/personas/starter")
    call("POST", "/v1/onboarding/partners/confirm")
    call("POST", "/v1/onboarding/complete")

    home = call("GET", "/v1/home").body

    assert home["level"] == {"level": "B1", "source": "measured", "skills": IMPRESSION}
    assert (home["focus"], home["focusSource"]) == (["Perfekt mit sein"], "placement")


def test_there_is_no_home_before_onboarding_is_finished(call: Call) -> None:
    response = call("GET", "/v1/home")

    assert response.status == 409
    assert response.body == {"error": {"code": "wrong_stage", "field": None}}


def test_the_library_lists_conversations_page_by_page(
    call: Call, text_model: ScriptedTextModel, calls: InMemoryVoiceSessionRepository
) -> None:
    lena, _ = onboarded(call, text_model)
    for hours in (1, 2, 3):
        talked(calls, f"rtc_{hours}", lena, at=NOON - timedelta(hours=hours))

    first = call("GET", "/v1/conversations?limit=2").body
    second = call("GET", "/v1/conversations?limit=2&before=2026-10-09T10%3A00%3A00Z").body

    assert [c["id"] for c in first["conversations"]] == ["rtc_1", "rtc_2"]
    assert first["next"] == "2026-10-09T10:00:00Z"
    assert [c["id"] for c in second["conversations"]] == ["rtc_3"]
    assert second["next"] is None


def test_the_library_refuses_a_page_it_cannot_read(call: Call) -> None:
    assert call("GET", "/v1/conversations?limit=many").status == 422
    assert call("GET", "/v1/conversations?before=yesterday").status == 422
    assert call("GET", "/v1/conversations?before=2026-10-09T10%3A00%3A00").status == 422


def test_a_new_learners_library_is_empty(call: Call) -> None:
    assert call("GET", "/v1/conversations").body == {"conversations": [], "next": None}


def test_a_transcript_is_read_with_its_conversation(
    call: Call, text_model: ScriptedTextModel, calls: InMemoryVoiceSessionRepository
) -> None:
    lena, _ = onboarded(call, text_model)
    talked(calls, "rtc_1", lena, at=NOON - timedelta(hours=1))

    response = call("GET", "/v1/conversations/rtc_1")

    assert response.status == 200
    assert response.body == {
        "conversation": {
            "id": "rtc_1",
            "partner": lena,
            "startedAt": "2026-10-09T11:00:00Z",
            "endedAt": "2026-10-09T11:05:00Z",
            "seconds": 300,
            "learnerTurns": 1,
            "scenario": None,
            "goalsReached": [],
        },
        "turns": [
            {"speaker": "persona", "text": "Hallo! Wie geht's?", "verbatim": None, "audio": None},
            {"speaker": "learner", "text": "Gut, danke!", "verbatim": None, "audio": None},
        ],
    }


def test_a_conversation_is_only_read_by_the_learner_who_had_it(
    call: Call, text_model: ScriptedTextModel, calls: InMemoryVoiceSessionRepository
) -> None:
    lena, _ = onboarded(call, text_model)
    talked(calls, "rtc_1", lena, at=NOON - timedelta(hours=1))

    theirs = call("GET", "/v1/conversations/rtc_1", subject=OTHER_USER)
    unknown = call("GET", "/v1/conversations/rtc_nothing")

    assert (theirs.status, theirs.body) == (404, {"error": {"code": "not_found", "field": None}})
    assert unknown.status == 404


def test_a_call_takes_the_learners_own_date(
    call: Call, text_model: ScriptedTextModel, voice_provider: FakeVoiceProvider
) -> None:
    lena, _ = onboarded(call, text_model)
    offer = {"purpose": "practice", "sdp": "v=0 offer", "personaId": lena["id"]}

    ahead = call("POST", "/v1/voice/calls", {**offer, "localDate": "2026-10-10"})
    malformed = call("POST", "/v1/voice/calls", {**offer, "localDate": "tomorrow"})

    assert ahead.status == 200
    assert "Saturday, 2026-10-10" in voice_provider.created[0][1]["instructions"]
    assert (malformed.status, malformed.body["error"]["code"]) == (422, "invalid_request")
