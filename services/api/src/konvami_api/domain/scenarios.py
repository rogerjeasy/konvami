"""Role-play scenarios (spec §6.3): a real-life situation the learner rehearses with one of their
partners, who plays the other person. Each has goals; the partner marks one reached when the
learner has done it, and the conversation counts them.

Scenarios are configuration, like the rest of a language pack. They are written in English for
the partner's instructions; the app names them and their goals in its own strings, by id.
"""

from dataclasses import dataclass

MARK_GOAL = "mark_goal"


class ScenarioError(Exception):
    """A role-play the language pack does not have (`not_found`)."""

    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


@dataclass(frozen=True)
class Goal:
    id: str
    # What the learner has to get done, for the partner to recognise.
    description: str


@dataclass(frozen=True)
class Scenario:
    id: str
    # The lowest CEFR level at which it works without help.
    level: str
    # Who the partner plays, and how.
    character: str
    # Where it happens and what the learner wants there.
    situation: str
    goals: tuple[Goal, ...]


def role_play_instructions(scenario: Scenario) -> str:
    """The part of a partner's instructions that makes the conversation this role-play."""
    goals = "\n".join(f"- {goal.id}: the learner {goal.description}" for goal in scenario.goals)
    return f"""# This conversation is a role-play
The learner chose to rehearse a real-life situation. You play {scenario.character}, for the
whole conversation: keep your name and your manner, and leave your own life out of it.
Situation: {scenario.situation}
Begin as that person would, in the situation, without explaining the role-play.

The learner's goals:
{goals}
When they have reached one, call {MARK_GOAL} with its id and carry on in the role. Never tell
them the goals, never say that you mark them, and do not do the goals for them: give them the
chance. When every goal is reached, bring the scene to a natural close, then ask whether they
want to try it again or talk about how it went.
"""


GERMAN_SCENARIOS: tuple[Scenario, ...] = (
    Scenario(
        id="bakery",
        level="A1",
        character="the friendly person behind the counter of a small bakery",
        situation=(
            "The learner comes into the bakery in the morning to buy bread and something sweet."
        ),
        goals=(
            Goal("order", "orders at least two things, saying how many of each"),
            Goal("price", "asks what it costs and understands the price"),
            Goal("pay", "pays and says goodbye politely"),
        ),
    ),
    Scenario(
        id="doctor",
        level="A2",
        character="a calm, kind general practitioner in a doctor's surgery",
        situation=(
            "The learner has felt unwell for a few days and sees the doctor about it. The "
            "learner decides what is wrong: ask them rather than inventing it."
        ),
        goals=(
            Goal("symptoms", "describes what hurts or what is wrong"),
            Goal("since_when", "says since when they have had it"),
            Goal("advice", "understands what to do and asks one question about it"),
        ),
    ),
    Scenario(
        id="pharmacy",
        level="A2",
        character="a helpful pharmacist",
        situation="The learner needs something for a cold and goes to the pharmacy.",
        goals=(
            Goal("need", "says what they need it for"),
            Goal("dose", "asks how often to take it"),
            Goal("pay", "pays and says goodbye"),
        ),
    ),
    Scenario(
        id="train_ticket",
        level="A2",
        character="a person at the ticket counter of a railway station",
        situation="The learner wants to travel to another city tomorrow morning.",
        goals=(
            Goal("destination", "says where and when they want to travel"),
            Goal("ticket", "chooses a ticket: one way or return, which class"),
            Goal("platform", "asks for the departure time or the platform"),
        ),
    ),
    Scenario(
        id="registration",
        level="B1",
        character="a clerk at the residents' registration office (Bürgeramt), busy but correct",
        situation=(
            "The learner has moved into a new flat and comes to register their address "
            "(Anmeldung). Ask for the usual papers: passport and the landlord's confirmation."
        ),
        goals=(
            Goal("purpose", "explains why they have come"),
            Goal("documents", "answers what papers they have, and what is missing"),
            Goal("next_step", "understands what happens next and asks one question about it"),
        ),
    ),
    Scenario(
        id="flat_viewing",
        level="B1",
        character="a landlord showing a flat to people who might rent it",
        situation="The learner is viewing a flat they would like to rent.",
        goals=(
            Goal("rent", "asks about the rent and what it includes"),
            Goal("about_me", "says something about themselves: work, how long they will stay"),
            Goal("move_in", "asks when they could move in"),
        ),
    ),
    Scenario(
        id="job_interview",
        level="B1",
        character="a friendly but professional interviewer at a mid-sized company",
        situation=(
            "The learner has a job interview. The learner decides what the job is: ask them "
            "at the start rather than inventing it."
        ),
        goals=(
            Goal("introduce", "introduces themselves and their experience"),
            Goal("strength", "names a strength with an example"),
            Goal("question", "asks the interviewer a question about the job"),
        ),
    ),
    Scenario(
        id="complaint",
        level="B1",
        character="a shop assistant in an electronics shop",
        situation=(
            "The learner bought headphones last week and one side no longer works. They want "
            "their money back or a new pair."
        ),
        goals=(
            Goal("problem", "explains what is wrong and when they bought it"),
            Goal("solution", "says what they want: a refund or a new pair"),
            Goal("agree", "agrees on what happens next"),
        ),
    ),
)
