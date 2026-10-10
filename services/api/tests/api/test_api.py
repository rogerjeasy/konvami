from uuid import UUID

from konvami_api.api.app import Services
from konvami_api.domain.live_call import Turn
from konvami_api.domain.placement import MIN_TASKS, PlacementTools
from tests.api.conftest import OTHER_USER, USER, Call
from tests.fakes import FakeVoiceProvider, ScriptedTextModel

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
    assert {"code": "fr", "available": False, "exams": []} in body["languages"]
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
    assert response.body == {"callId": "rtc_1", "sdp": "v=0 answer", "maxSeconds": 480}
    assert voice_provider.created[0][0] == "v=0 offer"


def test_a_voice_call_needs_consent_to_the_voice_provider(call: Call) -> None:
    response = call("POST", "/v1/voice/calls", OFFER, subject=OTHER_USER)

    assert response.status == 403
    assert response.body == {"error": {"code": "consent_required", "field": None}}


def test_voice_calls_stop_at_the_daily_limit(call: Call) -> None:
    call("POST", "/v1/voice/calls", OFFER)
    call("POST", "/v1/voice/calls", OFFER)

    response = call("POST", "/v1/voice/calls", OFFER)

    assert response.status == 429
    assert response.body == {"error": {"code": "call_limit", "field": None}}


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
    assert personas[0] == {
        "id": personas[0]["id"],
        "role": "buddy",
        "name": "Lena",
        "age": 27,
        "origin": "Leipzig",
        "tagline": None,
        "look": {
            "skin": "sand",
            "hair": "long",
            "hairColor": "chestnut",
            "top": "teal",
            "backdrop": "mist",
            "glasses": False,
            "beard": False,
        },
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
