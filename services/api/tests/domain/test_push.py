"""Push from the server (spec §6.18): reports, scores and a weekly nudge."""

from datetime import UTC, datetime, timedelta

import pytest

from konvami_api.domain.push import MAX_PHONES, PushDevice, PushRequestError
from tests.domain import test_exam_centre as exam_centre
from tests.domain import test_reports as reports
from tests.world import NOON, OTHER_USER, USER, World

PHONE = "ExponentPushToken[phone-1]"
DAY = timedelta(days=1)


def phone(world: World, token: str = PHONE, *, language: str = "fr", time: str = "18:00") -> None:
    world.push.register(
        USER, token=token, platform="ios", timezone="Europe/Zurich", language=language, time=time
    )


def test_a_report_is_announced_by_its_partner_on_the_learners_phones() -> None:
    world = World()
    lena, _ = world.onboard()
    phone(world)
    phone(world, "ExponentPushToken[phone-2]", language="en")

    world.push.report_ready(USER, "rtc_1", lena.id)

    assert [(m.token, m.title, m.body, dict(m.data)) for m in world.push_sender.sent] == [
        (
            PHONE,
            "Lena",
            "Ton bilan de notre conversation est prêt.",
            {"open": "report", "id": "rtc_1"},
        ),
        (
            "ExponentPushToken[phone-2]",
            "Lena",
            "Your report on our conversation is ready.",
            {"open": "report", "id": "rtc_1"},
        ),
    ]


def test_a_learner_without_a_phone_gets_nothing_and_a_failure_breaks_nothing() -> None:
    world = World()
    lena, _ = world.onboard()
    world.push.report_ready(USER, "rtc_1", lena.id)
    phone(world)
    world.push_sender.failing = True

    world.push.report_ready(USER, "rtc_1", lena.id)

    assert world.push_sender.sent == []


def test_a_phone_the_provider_no_longer_reaches_is_forgotten() -> None:
    world = World()
    lena, _ = world.onboard()
    phone(world)
    world.push_sender.gone.add(PHONE)

    world.push.report_ready(USER, "rtc_1", lena.id)

    assert world.push_store.of(USER) == []


def test_a_phone_belongs_to_the_account_that_registered_it_last() -> None:
    world = World()
    world.onboard()
    world.onboard(OTHER_USER)
    phone(world)
    world.push.register(
        OTHER_USER, token=PHONE, platform="ios", timezone="UTC", language="de", time="18:00"
    )
    # The first learner cannot take it back from the second.
    world.push.unregister(USER, PHONE)

    assert world.push_store.of(USER) == []
    assert [device.language for device in world.push_store.of(OTHER_USER)] == ["de"]


def test_a_push_comes_only_in_an_app_language() -> None:
    world = World()
    world.onboard()

    with pytest.raises(PushRequestError):
        phone(world, language="es")


def at_zurich(day: datetime, hour: int) -> datetime:
    # October in Zurich is two hours ahead of UTC.
    return datetime(day.year, day.month, day.day, hour - 2, 0, tzinfo=UTC)


def test_a_learner_quiet_for_a_week_is_nudged_once_at_their_reminder_hour() -> None:
    world = World()
    lena, _ = world.onboard()
    world.talk(lena, at=NOON)
    phone(world)
    week_later = NOON + 7 * DAY

    world.clock.now = at_zurich(week_later, 17)
    early = world.push.nudge()
    world.clock.now = at_zurich(week_later, 18)
    on_time = world.push.nudge()
    world.clock.now = at_zurich(week_later + DAY, 18)
    next_day = world.push.nudge()

    assert (early, on_time, next_day) == (0, 1, 0)
    assert [(m.title, m.body, dict(m.data)) for m in world.push_sender.sent] == [
        ("Lena", "Ça fait un moment ! Tu as cinq minutes pour parler ?", {"open": "today"})
    ]


def test_a_learner_who_talked_this_week_is_not_nudged() -> None:
    world = World()
    lena, _ = world.onboard()
    phone(world)
    world.talk(lena, at=NOON + 5 * DAY)
    world.clock.now = at_zurich(NOON + 8 * DAY, 18)

    assert world.push.nudge() == 0


def test_a_written_report_reaches_the_learners_phone() -> None:
    world = World()
    call_id = reports.talked(world)
    phone(world)
    world.text.answers += [reports.ANALYSIS, reports.CONFIRMED]

    world.reports.write(call_id)

    assert [(m.title, dict(m.data)) for m in world.push_sender.sent] == [
        ("Lena", {"open": "report", "id": call_id})
    ]


def test_a_scored_simulation_reaches_the_learners_phone() -> None:
    world = World()
    world.onboard(exam={"type": "goethe", "target_level": "B1", "date": "2027-04-15"})
    phone(world)
    call_id = world.simulate()
    world.text.answers.append(exam_centre.scored())

    world.exams.score(call_id)

    assert [(m.title, m.body, dict(m.data)) for m in world.push_sender.sent] == [
        (
            "Goethe-Zertifikat B1",
            "Ta simulation est notée. Regarde comment ça s’est passé.",
            {"open": "simulation", "id": call_id},
        )
    ]


def test_a_time_zone_the_server_does_not_know_is_refused() -> None:
    world = World()
    world.onboard()

    for zone in ("Mars/Olympus", "Europe", "../etc"):
        with pytest.raises(PushRequestError):
            world.push.register(
                USER, token=PHONE, platform="ios", timezone=zone, language="fr", time="18:00"
            )


def test_a_learner_is_reached_on_their_newest_phones_only() -> None:
    world = World()
    world.onboard()
    for number in range(MAX_PHONES + 1):
        world.clock.now = NOON + number * DAY
        phone(world, f"ExponentPushToken[{number}]")

    tokens = {device.token for device in world.push_store.of(USER)}
    assert len(tokens) == MAX_PHONES
    assert "ExponentPushToken[0]" not in tokens


def test_a_phone_that_cannot_be_read_does_not_stop_the_nudge() -> None:
    world = World()
    lena, _ = world.onboard()
    world.talk(lena, at=NOON)
    phone(world)
    # Stored by other means than registering: its time zone is not one.
    broken = PushDevice("ExponentPushToken[broken]", USER, "ios", "Europe/", "fr", "18:00", NOON)
    world.push_store.devices[broken.token] = broken
    world.clock.now = at_zurich(NOON + 7 * DAY, 18)

    assert world.push.nudge() >= 1
    assert PHONE in {message.token for message in world.push_sender.sent}
