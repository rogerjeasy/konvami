"""Exam simulations (spec §6.13): the speaking parts of the exams a learner prepares for, as
configuration of the language pack, and the arithmetic of their scores.

The formats are simplified from the exam bodies' handbooks so that one candidate does a whole
speaking test in one call of at most ten minutes. Parts a real exam gives to two candidates
("plan something together") are played with the examiner, who also takes the second
candidate's role: a call has one voice. Pictures are described in words on the card. Scores are
estimates from a transcript, never an official result.
"""

import datetime as dt
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from typing import Literal

# What a part asks of the learner; the app names each kind in its own strings.
PartKind = Literal[
    "introduce",
    "ask_answer",
    "requests",
    "questions_about_you",
    "talk_about_life",
    "plan_together",
    "present_topic",
    "feedback_questions",
    "talk",
    "discussion",
    "topic_conversation",
    "picture_experience",
]

# How each part is judged, from 0 to 4 points each (spec §6.13 rubric). Pronunciation is left
# out: a transcript cannot show it.
CRITERIA = ("task", "coherence", "vocabulary", "grammar")
MAX_MARK = 4
# The share of the points most exams ask for to pass.
PASS_SHARE = 0.6
# A trend needs this many simulations.
TREND_SIMULATIONS = 3
# The weakest part is judged on the latest few simulations.
WEAKEST_OVER = 3
# Readiness is not projected further ahead than this.
MAX_PROJECTION = dt.timedelta(days=365)


@dataclass(frozen=True)
class ExamCard:
    id: str
    # What the card says, in the language of the exam, as the learner sees it.
    title: str
    prompts: tuple[str, ...]
    # What only the examiner knows (the second candidate's calendar), in English; empty for none.
    examiner: str = ""


@dataclass(frozen=True)
class ExamPart:
    id: str
    kind: PartKind
    # In English, for the examiner's and the scorer's instructions.
    title: str
    task: str
    # How long the part runs in the call.
    seconds: int
    cards: tuple[ExamCard, ...]


@dataclass(frozen=True)
class SpeakingExam:
    id: str
    # The exam type of the profile's `exam` field (`catalog.ExamFormat.id`).
    exam: str
    # The levels it is the format for.
    levels: tuple[str, ...]
    # Its proper name.
    name: str
    # Time to prepare before speaking, as in the real exam; the learner may start sooner.
    prep_seconds: int
    parts: tuple[ExamPart, ...]
    pass_share: float = PASS_SHARE

    def part(self, part_id: str) -> ExamPart | None:
        return next((part for part in self.parts if part.id == part_id), None)


def _card(id: str, title: str, *prompts: str, examiner: str = "") -> ExamCard:
    return ExamCard(id, title, prompts, examiner)


_PLAN_TOGETHER = (
    "Plan something together with the other candidate (played by you): the learner makes "
    "suggestions, reacts to yours, agrees or disagrees with reasons, and you reach a plan."
)

GERMAN_EXAMS: tuple[SpeakingExam, ...] = (
    SpeakingExam(
        id="goethe_a1",
        exam="goethe",
        levels=("A1",),
        name="Goethe-Zertifikat A1",
        prep_seconds=0,
        parts=(
            ExamPart(
                "teil_1",
                "introduce",
                "Introduce yourself",
                "The learner introduces themselves using the card's keywords; then ask them to "
                "spell their name or say a number (phone, house number).",
                90,
                (
                    _card(
                        "a1_1",
                        "Sich vorstellen",
                        "Name?",
                        "Alter?",
                        "Land?",
                        "Wohnort?",
                        "Sprachen?",
                        "Beruf?",
                        "Hobby?",
                    ),
                ),
            ),
            ExamPart(
                "teil_2",
                "ask_answer",
                "Ask for and give information",
                "Take turns: the learner asks you a question with each keyword of the card, "
                "you answer briefly; you ask them about the same keywords and they answer.",
                150,
                (
                    _card(
                        "a1_2a",
                        "Thema: Essen und Trinken",
                        "Frühstück",
                        "Lieblingsessen",
                        "Getränke",
                        "Restaurant",
                    ),
                    _card("a1_2b", "Thema: Wochenende", "Sport", "Freunde", "Kino", "Samstag"),
                    _card(
                        "a1_2c",
                        "Thema: Einkaufen",
                        "Supermarkt",
                        "Preis",
                        "Kleidung",
                        "Öffnungszeiten",
                    ),
                ),
            ),
            ExamPart(
                "teil_3",
                "requests",
                "Make requests and respond",
                "The learner makes a polite request for each item of the card; you react, "
                "then you make a request of them and they react.",
                120,
                (
                    _card(
                        "a1_3a",
                        "Bitten formulieren",
                        "das Fenster (öffnen)",
                        "ein Kugelschreiber",
                        "ein Glas Wasser",
                        "langsamer sprechen",
                    ),
                    _card(
                        "a1_3b",
                        "Bitten formulieren",
                        "die Tür (schließen)",
                        "das Salz",
                        "ein Taxi (rufen)",
                        "die Telefonnummer",
                    ),
                ),
            ),
        ),
    ),
    SpeakingExam(
        id="goethe_a2",
        exam="goethe",
        levels=("A2",),
        name="Goethe-Zertifikat A2",
        prep_seconds=0,
        parts=(
            ExamPart(
                "teil_1",
                "questions_about_you",
                "Questions about yourself",
                "Take turns asking and answering personal questions with the card's keywords.",
                120,
                (
                    _card(
                        "a2_1a",
                        "Fragen zur Person",
                        "Geburtstag?",
                        "Wohnung?",
                        "Beruf?",
                        "Freizeit?",
                    ),
                    _card(
                        "a2_1b",
                        "Fragen zur Person",
                        "Familie?",
                        "Reisen?",
                        "Lieblingsessen?",
                        "Sprachen?",
                    ),
                ),
            ),
            ExamPart(
                "teil_2",
                "talk_about_life",
                "Talk about your life",
                "The learner talks about the card's question for about a minute, using its "
                "points; then ask one or two follow-up questions.",
                180,
                (
                    _card(
                        "a2_2a",
                        "Was machen Sie am Wochenende?",
                        "Wo?",
                        "Mit wem?",
                        "Was?",
                        "Wann?",
                    ),
                    _card(
                        "a2_2b",
                        "Wie feiern Sie Ihren Geburtstag?",
                        "Wo?",
                        "Wer kommt?",
                        "Essen?",
                        "Geschenke?",
                    ),
                    _card(
                        "a2_2c",
                        "Was essen Sie gern?",
                        "Frühstück",
                        "Mittagessen",
                        "Kochen",
                        "Restaurant",
                    ),
                ),
            ),
            ExamPart(
                "teil_3",
                "plan_together",
                "Plan something together",
                "Find a time to meet together: the learner's calendar is on their card, yours "
                "is in your note. Only the free times you share work.",
                180,
                (
                    _card(
                        "a2_3a",
                        "Sie wollen am Samstag zusammen ins Kino gehen. Wann haben Sie beide Zeit?",
                        "9:00 Frühstück mit den Eltern",
                        "11:00-13:00 einkaufen",
                        "15:00-17:00 Fußball",
                        "ab 19:30 frei",
                        examiner=(
                            "Your Saturday: 10:00 sport, 14:00-16:00 work, 18:00-20:00 visiting "
                            "your grandmother, free after 20:00."
                        ),
                    ),
                    _card(
                        "a2_3b",
                        "Sie wollen zusammen für eine Freundin ein Geschenk kaufen. Wann?",
                        "Montag: bis 17:00 Arbeit",
                        "Dienstag: 18:00 Deutschkurs",
                        "Mittwoch: frei ab 16:00",
                        "Donnerstag: Zahnarzt um 17:30",
                        examiner=(
                            "Your week: Monday free after 18:00, Tuesday free, Wednesday work "
                            "until 17:00, Thursday free after 16:00."
                        ),
                    ),
                ),
            ),
        ),
    ),
    SpeakingExam(
        id="goethe_b1",
        exam="goethe",
        levels=("B1",),
        name="Goethe-Zertifikat B1",
        prep_seconds=15 * 60,
        parts=(
            ExamPart(
                "teil_1",
                "plan_together",
                "Plan something together",
                _PLAN_TOGETHER,
                180,
                (
                    _card(
                        "b1_1a",
                        "Eine Kollegin hört auf zu arbeiten. Planen Sie eine Abschiedsfeier.",
                        "Wann?",
                        "Wo?",
                        "Essen und Getränke?",
                        "Geschenk?",
                    ),
                    _card(
                        "b1_1b",
                        "Ein Freund hat Geburtstag. Organisieren Sie eine Überraschung.",
                        "Wann und wo?",
                        "Wer wird eingeladen?",
                        "Was gibt es zu essen?",
                        "Wer kümmert sich um was?",
                    ),
                    _card(
                        "b1_1c",
                        "Ihr Deutschkurs macht einen Ausflug. Planen Sie ihn.",
                        "Wohin?",
                        "Wie kommen Sie dorthin?",
                        "Was nehmen Sie mit?",
                        "Was kostet es?",
                    ),
                ),
            ),
            ExamPart(
                "teil_2",
                "present_topic",
                "Present a topic",
                "The learner presents the card's topic in five steps, about two minutes, "
                "without your help: introduce it, own experience, the situation in their home "
                "country, advantages and disadvantages with their opinion, conclusion and thanks.",
                180,
                (
                    _card(
                        "b1_2a",
                        "Sollen Kinder ein eigenes Handy haben?",
                        "Thema vorstellen",
                        "Eigene Erfahrung",
                        "Situation in Ihrem Heimatland",
                        "Vor- und Nachteile, Ihre Meinung",
                        "Abschluss und Dank",
                    ),
                    _card(
                        "b1_2b",
                        "Homeoffice: Arbeiten von zu Hause",
                        "Thema vorstellen",
                        "Eigene Erfahrung",
                        "Situation in Ihrem Heimatland",
                        "Vor- und Nachteile, Ihre Meinung",
                        "Abschluss und Dank",
                    ),
                    _card(
                        "b1_2c",
                        "Mit dem Fahrrad zur Arbeit",
                        "Thema vorstellen",
                        "Eigene Erfahrung",
                        "Situation in Ihrem Heimatland",
                        "Vor- und Nachteile, Ihre Meinung",
                        "Abschluss und Dank",
                    ),
                ),
            ),
            ExamPart(
                "teil_3",
                "feedback_questions",
                "Respond to feedback and questions",
                "Give short feedback on the presentation as the other candidate would, then ask "
                "one or two questions about it; the learner answers.",
                120,
                (
                    _card(
                        "b1_3",
                        "Über die Präsentation sprechen",
                        "Auf die Rückmeldung reagieren",
                        "Fragen beantworten",
                    ),
                ),
            ),
        ),
    ),
    SpeakingExam(
        id="goethe_b2",
        exam="goethe",
        levels=("B2",),
        name="Goethe-Zertifikat B2",
        prep_seconds=15 * 60,
        parts=(
            ExamPart(
                "teil_1",
                "talk",
                "Give a talk",
                "The learner gives a structured talk of about four minutes on the card's topic "
                "without your help; then ask one question about it.",
                300,
                (
                    _card(
                        "b2_1a",
                        "Wohnen in der Stadt oder auf dem Land?",
                        "Zwei Möglichkeiten beschreiben",
                        "Vor- und Nachteile nennen",
                        "Die Möglichkeiten bewerten",
                        "Eine Empfehlung geben",
                    ),
                    _card(
                        "b2_1b",
                        "Soziale Medien im Alltag",
                        "Zwei Möglichkeiten beschreiben",
                        "Vor- und Nachteile nennen",
                        "Die Möglichkeiten bewerten",
                        "Eine Empfehlung geben",
                    ),
                ),
            ),
            ExamPart(
                "teil_2",
                "discussion",
                "Discussion",
                "Discuss the card's question with the learner as the other candidate: exchange "
                "arguments, challenge theirs politely, and let them defend a position.",
                240,
                (
                    _card(
                        "b2_2a",
                        "Sollte in Städten überall Tempo 30 gelten?",
                        "Argumente austauschen",
                        "Auf Argumente reagieren",
                        "Eine eigene Position vertreten",
                    ),
                    _card(
                        "b2_2b",
                        "Sollte das Studium für alle kostenlos sein?",
                        "Argumente austauschen",
                        "Auf Argumente reagieren",
                        "Eine eigene Position vertreten",
                    ),
                ),
            ),
        ),
    ),
    SpeakingExam(
        id="telc_b1",
        exam="telc",
        levels=("B1",),
        name="telc Deutsch B1",
        prep_seconds=20 * 60,
        parts=(
            ExamPart(
                "teil_1",
                "introduce",
                "Make contact",
                "Get to know each other: the learner tells about themselves along the card and "
                "asks you about the same things.",
                120,
                (
                    _card(
                        "telc_1",
                        "Kontaktaufnahme",
                        "Name",
                        "Herkunft",
                        "Wohnort",
                        "Familie",
                        "Beruf",
                        "Sprachen",
                        "Freizeit",
                    ),
                ),
            ),
            ExamPart(
                "teil_2",
                "topic_conversation",
                "Conversation about a topic",
                "Talk about the statement on the card: the learner gives their opinion and "
                "experience and says how it is in their country; you do the same and react.",
                180,
                (
                    _card(
                        "telc_2a",
                        "„Ohne Auto kann man auf dem Land nicht leben.“",
                        "Ihre Meinung",
                        "Ihre Erfahrungen",
                        "Wie ist das in Ihrem Land?",
                    ),
                    _card(
                        "telc_2b",
                        "„Fernsehen ist heute nicht mehr wichtig.“",
                        "Ihre Meinung",
                        "Ihre Erfahrungen",
                        "Wie ist das in Ihrem Land?",
                    ),
                ),
            ),
            ExamPart(
                "teil_3",
                "plan_together",
                "Plan something together",
                _PLAN_TOGETHER,
                180,
                (
                    _card(
                        "telc_3a",
                        "Sie organisieren einen Kochabend für Ihre Nachbarn.",
                        "Termin",
                        "Ort",
                        "Gerichte",
                        "Einkauf",
                        "Wer macht was?",
                    ),
                    _card(
                        "telc_3b",
                        "Eine Freundin zieht um. Sie helfen ihr.",
                        "Wann?",
                        "Transport",
                        "Wer hilft noch?",
                        "Essen",
                        "Kosten",
                    ),
                ),
            ),
        ),
    ),
    SpeakingExam(
        id="dtz",
        exam="dtz",
        levels=("A2", "B1"),
        name="Deutsch-Test für Zuwanderer",
        prep_seconds=0,
        parts=(
            ExamPart(
                "teil_1",
                "introduce",
                "Introduce yourself",
                "The learner introduces themselves along the card; ask one or two questions.",
                120,
                (
                    _card(
                        "dtz_1",
                        "Sich vorstellen",
                        "Name",
                        "Herkunft",
                        "Wohnort",
                        "Familie",
                        "Arbeit oder Beruf",
                        "Sprachen",
                    ),
                ),
            ),
            ExamPart(
                "teil_2",
                "picture_experience",
                "Talk about experiences (picture)",
                "The card describes a picture: the learner says what is happening and tells of "
                "their own experiences with such a situation; ask follow-up questions.",
                180,
                (
                    _card(
                        "dtz_2a",
                        "Auf dem Bild: Eine Familie wartet beim Arzt im Wartezimmer.",
                        "Beschreiben Sie die Situation",
                        "Erzählen Sie von Ihren Erfahrungen",
                    ),
                    _card(
                        "dtz_2b",
                        "Auf dem Bild: Menschen warten im Regen an einer Bushaltestelle.",
                        "Beschreiben Sie die Situation",
                        "Erzählen Sie von Ihren Erfahrungen",
                    ),
                ),
            ),
            ExamPart(
                "teil_3",
                "plan_together",
                "Plan something together",
                _PLAN_TOGETHER,
                180,
                (
                    _card(
                        "dtz_3a",
                        "Ihr Deutschkurs macht ein Abschlussfest. Planen Sie zusammen.",
                        "Wann?",
                        "Wo?",
                        "Essen und Trinken?",
                        "Musik?",
                        "Wer bezahlt?",
                    ),
                    _card(
                        "dtz_3b",
                        "Sie wollen zusammen einen Nachbarn im Krankenhaus besuchen.",
                        "Wann?",
                        "Wie kommen Sie hin?",
                        "Was bringen Sie mit?",
                        "Wer ruft vorher an?",
                    ),
                ),
            ),
        ),
    ),
)


def format_for(exams: Sequence[SpeakingExam], exam: str, level: str | None) -> SpeakingExam | None:
    """The speaking test of an exam at a level; a test for several levels needs no level."""
    for found in exams:
        if found.exam == exam and (level in found.levels or len(found.levels) > 1):
            return found
    return None


def cards_for(exam: SpeakingExam, done_before: int) -> tuple[ExamCard, ...]:
    """One card per part, taking turns from one simulation to the next."""
    return tuple(part.cards[done_before % len(part.cards)] for part in exam.parts)


# --- Scores --------------------------------------------------------------------------------------


@dataclass(frozen=True)
class PartScore:
    part: str
    # Points per criterion, 0 to `MAX_MARK`.
    marks: Mapping[str, int]
    # Why, in the learner's explanation language.
    feedback: str
    # A strong answer at the exam's level, in the language of the exam.
    model_answer: str

    @property
    def share(self) -> float:
        return sum(self.marks.values()) / (MAX_MARK * len(CRITERIA))


def total_share(parts: Sequence[PartScore]) -> float:
    """A simulation's share of the points: the parts count the same."""
    return sum(part.share for part in parts) / len(parts) if parts else 0.0


@dataclass(frozen=True)
class Readiness:
    # The latest simulation's share of the points, and its change from the one before.
    latest: float
    change: float | None
    passing: bool
    # The part with the lowest share over the latest few simulations.
    weakest: str | None
    # When a steady rise would reach the pass mark; None without one (or once passing).
    ready_on: dt.date | None


def readiness(
    results: Sequence[tuple[dt.datetime, Mapping[str, float]]], *, pass_share: float
) -> Readiness | None:
    """How ready the learner is, from their simulations of one exam, newest first, each with
    its share of the points per part."""
    if not results:
        return None
    totals = [(at, sum(parts.values()) / len(parts)) for at, parts in results if parts]
    if not totals:
        return None
    latest = totals[0][1]
    shares: dict[str, list[float]] = {}
    for _, parts in results[:WEAKEST_OVER]:
        for part, share in parts.items():
            shares.setdefault(part, []).append(share)
    weakest = min(shares, key=lambda part: (sum(shares[part]) / len(shares[part]), part))
    return Readiness(
        latest=round(latest, 4),
        change=round(latest - totals[1][1], 4) if len(totals) > 1 else None,
        passing=latest >= pass_share,
        weakest=weakest,
        ready_on=None if latest >= pass_share else _projected(totals, pass_share),
    )


def _projected(totals: Sequence[tuple[dt.datetime, float]], pass_share: float) -> dt.date | None:
    """When the line through the scores reaches the pass mark, if it rises."""
    if len(totals) < TREND_SIMULATIONS:
        return None
    first = totals[-1][0]
    days = [(at - first).total_seconds() / 86400 for at, _ in totals]
    values = [share for _, share in totals]
    mean_day, mean_value = sum(days) / len(days), sum(values) / len(values)
    spread = sum((day - mean_day) ** 2 for day in days)
    if not spread:
        return None
    slope = sum((d - mean_day) * (v - mean_value) for d, v in zip(days, values, strict=True))
    slope /= spread
    if slope <= 0:
        return None
    # From where the line stands at the latest simulation.
    now_value = mean_value + slope * (days[0] - mean_day)
    wait = dt.timedelta(days=(pass_share - now_value) / slope)
    if wait > MAX_PROJECTION:
        return None
    return (totals[0][0] + max(wait, dt.timedelta(0))).date()
