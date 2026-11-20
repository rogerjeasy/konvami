"""The shared check of what learners hear or read (Two Halves and Radio Konvami)."""

from uuid import UUID

from konvami_api.domain.voice_messages import MessageChecker
from tests.fakes import FakeModerator, ScriptedTextModel

USER = UUID(int=1)


def checker(moderator: FakeModerator) -> MessageChecker:
    return MessageChecker(
        moderator=moderator,
        text_model=ScriptedTextModel(),
        check_model="small",
        review_model="strong",
        language_name=lambda code: code,
    )


def test_flagged_tells_a_flag_from_a_provider_that_cannot_say() -> None:
    moderator = FakeModerator("Idiot")
    check = checker(moderator)
    assert check.flagged(USER, ["Um 14:20 Uhr am Gleis 4."]) is False
    assert check.flagged(USER, ["Du Idiot"]) is True
    assert check.flagged(USER, ["Schreib mir: lena@example.com"]) is True
    assert check.flagged(None, ["Um 14:20 Uhr."]) is None
    moderator.fail = True
    assert check.flagged(USER, ["Um 14:20 Uhr."]) is None


def test_clean_fails_closed() -> None:
    moderator = FakeModerator("Idiot")
    check = checker(moderator)
    assert check.clean(USER, ["Um 14:20 Uhr am Gleis 4."])
    assert not check.clean(USER, ["Du Idiot"])
    assert not check.clean(None, ["Um 14:20 Uhr."])
    moderator.fail = True
    assert not check.clean(USER, ["Um 14:20 Uhr."])
