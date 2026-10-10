import pytest

from konvami_api.domain.onboarding import OnboardingError
from konvami_api.domain.personas import PersonaError
from konvami_api.domain.practice import PracticeTools
from konvami_api.domain.profile import Change, Origin, Source
from tests.world import NOON, OTHER_USER, USER, World

TODAY = NOON.date()


def instructions(world: World, partner_index: int = 0, **onboard: object) -> str:
    partners = world.onboard(**onboard)  # type: ignore[arg-type]
    account = world.accounts.get(USER)
    return world.practice.prepare(USER, account, TODAY, partners[partner_index].id).instructions


def test_the_partner_is_told_who_they_are() -> None:
    text = instructions(World())

    assert "You are Lena" in text
    assert "27" in text
    assert "Leipzig" in text
    assert "Katze namens Krümel" in text


def test_the_partner_speaks_with_their_own_voice() -> None:
    world = World()
    lena, jonas = world.onboard()
    account = world.accounts.get(USER)

    assert world.practice.prepare(USER, account, TODAY, lena.id).voice == "marin"
    assert world.practice.prepare(USER, account, TODAY, jonas.id).voice == "cedar"


def test_the_partner_knows_the_learner_and_what_they_are_learning_for() -> None:
    text = instructions(World())

    assert "Amara" in text
    assert "Speak German" in text
    assert "work" in text
    assert "job in Zurich" in text


def test_a_beginner_is_spoken_to_slowly_and_simply() -> None:
    text = instructions(World(), level="A1")

    assert "level is A1" in text
    assert "Speak slowly" in text
    assert "natural speed" not in text


def test_an_advanced_learner_is_spoken_to_like_a_native() -> None:
    text = instructions(World(), level="C1")

    assert "level is C1" in text
    assert "natural speed" in text
    assert "Speak slowly" not in text


@pytest.mark.parametrize(
    ("usage", "expected"),
    [
        ("never", "Never switch to French"),
        ("when_stuck", "only when the learner is clearly stuck"),
        ("for_grammar", "to explain grammar or a new word"),
        ("freely", "whenever it helps"),
    ],
)
def test_the_partner_uses_the_explanation_language_as_much_as_the_learner_asked(
    usage: str, expected: str
) -> None:
    assert expected in instructions(World(), usage=usage)


def test_a_buddy_repeats_mistakes_correctly_instead_of_stopping_the_talk() -> None:
    text = instructions(World(), partner_index=0)

    assert "casual friend" in text
    assert "Never point a mistake out" in text
    # A real call (2026-10-10) showed the efficient model quoting the corrected sentence back
    # ("a possible form would be ...") until it was told not to in so many words.
    assert "never quote their sentence back" in text


@pytest.mark.parametrize(
    ("level", "limit"),
    [
        ("A0", "at most two short sentences"),
        ("A2", "at most two short sentences"),
        ("B1", "at most three sentences"),
        ("C1", "at most four sentences"),
    ],
)
def test_the_lower_the_level_the_shorter_the_partner_speaks(level: str, limit: str) -> None:
    assert limit in instructions(World(), level=level)


def test_the_partner_asks_one_question_at_a_time_and_offers_no_lists() -> None:
    text = instructions(World())

    assert "exactly one question" in text
    assert "Do not list possible answers" in text
    # The efficient model announced its own lines ("A short goodbye: Tschüss!") in a real call.
    assert "Never announce what you are about to say" in text


def test_a_phrase_the_learner_asks_for_is_given_in_the_language_they_are_learning() -> None:
    text = instructions(World())

    assert "give the German phrase only" in text


def test_the_partner_knows_the_weekday_of_the_date_they_are_given() -> None:
    world = World()
    lena, _ = world.onboard()
    saturday = TODAY.replace(day=10)

    text = world.practice.prepare(USER, world.accounts.get(USER), saturday, lena.id).instructions

    assert "Saturday, 2026-10-10" in text


def test_a_teacher_corrects_briefly_and_explains_why() -> None:
    text = instructions(World(), partner_index=1)

    assert "patient teacher" in text
    assert "say the correct form and why in one short sentence" in text


def test_an_exam_coach_practises_the_learners_exam() -> None:
    exam = {"type": "goethe", "target_level": "B1", "date": "2026-12-01"}

    text = instructions(World(), partner_index=2, exam=exam)

    assert "Goethe-Zertifikat B1" in text
    assert "2026-12-01" in text
    assert "speaking tasks" in text


def test_the_partner_works_on_what_the_placement_test_found() -> None:
    text = instructions(World(), measured=True)

    assert "Le datif après « mit »" in text
    assert "L'ordre des mots" in text


def test_without_a_placement_test_nothing_is_made_up_to_work_on() -> None:
    assert "worth practising" not in instructions(World())


def test_a_partner_introduces_themselves_the_first_time_only() -> None:
    world = World()
    lena, _ = world.onboard()
    account = world.accounts.get(USER)

    first = world.practice.prepare(USER, account, TODAY, lena.id).instructions
    world.talk(lena, at=NOON)
    later = world.practice.prepare(USER, account, TODAY, lena.id).instructions

    assert "first conversation" in first
    assert "first conversation" not in later
    assert "talked 1 time before" in later
    assert "Do not introduce yourself again" in later


def test_a_learner_without_a_first_name_is_not_given_one() -> None:
    world = World()
    lena, _ = world.onboard(OTHER_USER)
    nameless = world.accounts.get(OTHER_USER).__class__("", "de", voice_consent=True)

    text = world.practice.prepare(OTHER_USER, nameless, TODAY, lena.id).instructions

    assert "do not know the learner's name" in text


def test_practice_starts_only_after_onboarding() -> None:
    world = World()
    world.profiles.apply(
        USER, [Change("target_language", "de")], source=Source.ASKED, origin=Origin.FORM
    )

    with pytest.raises(OnboardingError) as error:
        world.practice.prepare(USER, world.accounts.get(USER), TODAY, None)

    assert error.value.code == "wrong_stage"


def test_a_learner_can_only_talk_with_their_own_partners() -> None:
    world = World()
    world.onboard(USER)
    someone_elses = world.onboard(OTHER_USER)[0]
    account = world.accounts.get(USER)

    with pytest.raises(PersonaError) as error:
        world.practice.prepare(USER, account, TODAY, someone_elses.id)

    assert error.value.code == "not_found"


def test_a_practice_call_needs_a_partner() -> None:
    world = World()
    world.onboard()

    with pytest.raises(PersonaError) as error:
        world.practice.prepare(USER, world.accounts.get(USER), TODAY, None)

    assert error.value.code == "not_found"


def test_the_partner_can_end_the_conversation_when_the_learner_says_goodbye() -> None:
    tools = PracticeTools()

    assert [tool["name"] for tool in tools.definitions()] == ["end_conversation"]
    result = tools.run("end_conversation", {})
    assert result.finished
    # The same answer as the guide's finishing tools, so the app follows every call alike.
    assert result.output == {"done": True}


def test_a_tool_the_partner_does_not_have_changes_nothing() -> None:
    result = PracticeTools().run("save_target_language", {"language": "de"})

    assert not result.finished
    assert result.output == {"done": False, "reason": "unknown_tool"}
