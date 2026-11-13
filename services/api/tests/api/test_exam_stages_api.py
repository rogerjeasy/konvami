"""Visual prompts and resumable task metadata survive the HTTP boundary (§6.13)."""

from tests.api.conftest import Call
from tests.api.test_api import onboarded
from tests.fakes import ScriptedTextModel


def test_chart_task_exposes_its_data_and_full_task_timing(
    call: Call, text_model: ScriptedTextModel
) -> None:
    onboarded(call, text_model)
    upcoming = call("GET", "/v1/exams/testdaf_paper_3/next")
    assert upcoming.status == 200
    exam = upcoming.body["exam"]
    assert (exam["series"], exam["stage"], exam["stages"]) == ("testdaf_paper", 3, 7)
    assert exam["prepSeconds"] == 60
    assert exam["parts"][0]["seconds"] == 90
    figure = upcoming.body["cards"][0]["figure"]
    assert figure["labels"] == ["Bus/Bahn", "Fahrrad", "Zu Fuß", "Auto"]
    assert figure["values"] == [45, 30, 15, 10]


def test_dtz_card_contains_a_real_scene_reference(
    call: Call, text_model: ScriptedTextModel
) -> None:
    onboarded(call, text_model)
    upcoming = call("GET", "/v1/exams/dtz/next")
    assert upcoming.status == 200
    pictures = [card["picture"] for card in upcoming.body["cards"] if card["picture"]]
    assert pictures == ["waiting_room"]
