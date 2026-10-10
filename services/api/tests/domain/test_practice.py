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


# --- A partner the learner designed (Persona Studio, spec §6.2) -----------------------------------

LOOK = {
    "skin": "honey",
    "hair": "bob",
    "hair_color": "auburn",
    "top": "amber",
    "backdrop": "sand",
    "glasses": True,
    "beard": False,
}
BALANCED = {
    "warmth": 3,
    "playfulness": 3,
    "talkativeness": 3,
    "curiosity": 3,
    "humour": 3,
    "form_of_address": "auto",
    "style": "questions",
}
USUAL = {
    "correction_timing": "recast",
    "strictness": "meaning",
    "explanation_usage": None,
    "level": None,
    "focus": None,
    "speed": None,
}


def designed(world: World, **changes: object):  # type: ignore[no-untyped-def]
    """The briefing of a partner made in Persona Studio, for a learner at A2."""
    world.onboard()
    fields = {
        "role": "buddy",
        "name": "Greta",
        "gender": "female",
        "age": 30,
        "origin": "Hamburg",
        "backstory": "Greta segelt jedes Wochenende auf der Elbe.",
        "look": LOOK,
        "voice": "coral",
        **changes,
    }
    greta = world.personas.create(USER, fields)
    return world.practice.prepare(USER, world.accounts.get(USER), TODAY, greta.id)


def test_a_partner_is_told_what_they_do_for_a_living() -> None:
    text = designed(World(), occupation="Marketing-Managerin").instructions

    assert "You are Greta, 30, from Hamburg" in text
    assert "You work as: Marketing-Managerin." in text


def test_a_partner_without_an_occupation_is_not_given_one() -> None:
    assert "You work as" not in designed(World()).instructions


@pytest.mark.parametrize(
    ("trait", "value", "expected"),
    [
        ("warmth", 5, "very warm and affectionate"),
        ("warmth", 4, "warm"),
        ("warmth", 2, "a little reserved"),
        ("warmth", 1, "reserved and matter-of-fact"),
        ("playfulness", 5, "very playful"),
        ("playfulness", 1, "serious and earnest"),
        ("talkativeness", 5, "love to talk"),
        ("talkativeness", 1, "few words"),
        ("curiosity", 5, "very curious"),
        ("curiosity", 1, "laid-back"),
        ("humour", 5, "joke"),
        ("humour", 1, "dry"),
    ],
)
def test_a_partner_is_told_their_character(trait: str, value: int, expected: str) -> None:
    text = designed(World(), personality={**BALANCED, trait: value}).instructions

    assert "# Your character" in text
    assert expected in text


def test_a_trait_in_the_middle_is_not_mentioned() -> None:
    text = designed(World(), personality=BALANCED).instructions

    for word in ("reserved", "playful", "love to talk", "few words", "laid-back", "dry"):
        assert word not in text


@pytest.mark.parametrize(
    ("form", "expected"),
    [
        ("informal", "familiar form of address"),
        ("formal", "polite form of address"),
        ("auto", "form of address that fits"),
    ],
)
def test_a_partner_addresses_the_learner_as_they_were_designed_to(form: str, expected: str) -> None:
    text = designed(World(), personality={**BALANCED, "form_of_address": form}).instructions

    assert expected in text


@pytest.mark.parametrize(
    ("style", "expected"),
    [
        ("questions", "asking about them"),
        ("stories", "short stories from your own life"),
        ("debate", "invite them to disagree"),
    ],
)
def test_a_partner_keeps_the_talk_going_in_their_own_way(style: str, expected: str) -> None:
    text = designed(World(), personality={**BALANCED, "style": style}).instructions

    assert expected in text


def test_a_starter_partner_has_no_character_section() -> None:
    assert "# Your character" not in instructions(World())


def test_a_friend_who_corrects_at_once_says_so_instead_of_recasting() -> None:
    teaching = {**USUAL, "correction_timing": "immediate", "strictness": "important"}

    text = designed(World(), teaching=teaching).instructions

    assert "casual friend" in text
    assert "say the correct form and why in one short sentence" in text
    assert "Never point a mistake out" not in text


def test_a_strict_partner_corrects_every_mistake() -> None:
    teaching = {**USUAL, "correction_timing": "immediate", "strictness": "everything"}

    text = designed(World(), teaching=teaching).instructions

    assert "Correct every mistake you notice" in text


def test_a_partner_can_keep_corrections_for_the_end() -> None:
    teaching = {**USUAL, "correction_timing": "end", "strictness": "important"}

    text = designed(World(), teaching=teaching).instructions

    assert "Do not correct anything while you talk" in text
    # The goodbye is the one moment after which nothing is cut off (the call ends by itself).
    assert "Keep the corrections for your goodbye" in text
    assert "Never point a mistake out" not in text


def test_a_partner_can_leave_mistakes_alone_entirely() -> None:
    text = designed(World(), teaching={**USUAL, "correction_timing": "off"}).instructions

    assert "Do not correct mistakes at all" in text
    assert "say the correct form" not in text


def test_a_teacher_can_be_made_to_recast_like_a_friend() -> None:
    text = designed(World(), role="teacher", teaching=USUAL).instructions

    assert "patient teacher" in text
    assert "Never point a mistake out" in text
    assert "say the correct form and why in one short sentence" not in text


def test_a_partner_can_use_another_amount_of_the_explanation_language() -> None:
    world = World()

    text = designed(world, teaching={**USUAL, "explanation_usage": "never"}).instructions

    # The learner's profile says "when stuck"; this partner was told never to switch.
    assert "Never switch to French" in text


def test_a_partner_can_be_fixed_to_a_level() -> None:
    text = designed(World(), teaching={**USUAL, "level": "C1"}).instructions

    assert "Their level is C1" in text
    assert "at most four sentences" in text


def test_a_partner_steers_towards_what_the_learner_asked_to_practise() -> None:
    text = designed(World(), teaching={**USUAL, "focus": "Dativ und Perfekt"}).instructions

    assert "The learner asked this partner to practise: Dativ und Perfekt" in text
    assert "never drill" in text


def test_a_partner_speaks_at_the_pace_they_were_given() -> None:
    assert designed(World(), teaching={**USUAL, "speed": 0.8}).speed == 0.8
    assert designed(World()).speed is None
