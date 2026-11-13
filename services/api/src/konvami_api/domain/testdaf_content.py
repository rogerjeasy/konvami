"""Original paper-based TestDaF practice tasks; timing source is in the exam stages plan.

Content is ours, including the explicitly fictional chart data. Separate stages retain every
speaking allowance without fitting an entire examination into one short voice session.
"""

from dataclasses import dataclass
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from konvami_api.domain.exams import PartKind


@dataclass(frozen=True)
class Task:
    title: str
    kind: "PartKind"
    prep: int
    speaking: int
    instruction: str
    prompts: tuple[str, ...]
    figure_title: str | None = None
    figure_labels: tuple[str, ...] = ()
    figure_values: tuple[int, ...] = ()


TASKS = (
    Task(
        "Informationen zum Hochschulsport",
        "ask_answer",
        30,
        30,
        "You answer the university sports office phone. Briefly invite the caller to say "
        "why they are calling. Listen without interruption; no coaching or extra questions.",
        (
            "Sie möchten einen Schwimmkurs an Ihrer Hochschule besuchen und rufen im Sportbüro an.",
            "Stellen Sie sich kurz vor und nennen Sie den Grund Ihres Anrufs.",
            "Fragen Sie nach Kurszeiten und Anmeldung.",
        ),
    ),
    Task(
        "Lernen vor einer Prüfung",
        "talk_about_life",
        60,
        60,
        "As a fellow student, ask how students prepare for important exams in the learner's "
        "home country. Let the learner give an uninterrupted account.",
        (
            "Ein Studienfreund möchte wissen, wie Studierende in Ihrem Heimatland lernen.",
            "Beschreiben Sie typische Lernorte und Lernmethoden.",
            "Erzählen Sie von Ihren eigenen Erfahrungen.",
        ),
    ),
    Task(
        "Wie kommen Studierende zur Hochschule?",
        "present_topic",
        60,
        90,
        "Ask the learner to describe the provided fictional chart to a university seminar. "
        "They should explain its structure and summarize the most important comparisons.",
        (
            "Stellen Sie die Grafik in Ihrem Landeskundekurs vor.",
            "Erklären Sie, was dargestellt wird und wie die Grafik aufgebaut ist.",
            "Vergleichen Sie die wichtigsten Ergebnisse. Die Daten sind ein Übungsbeispiel.",
        ),
        "Verkehrsmittel zum Campus · fiktive Befragung von 100 Studierenden (%)",
        ("Bus/Bahn", "Fahrrad", "Zu Fuß", "Auto"),
        (45, 30, 15, 10),
    ),
    Task(
        "Eine offene Hochschulbibliothek",
        "discussion",
        180,
        120,
        "In a formal university discussion, ask for the learner's position on keeping the "
        "library open overnight. Listen to their balanced argument without a debate or help.",
        (
            "Ihre Hochschule überlegt, die Bibliothek auch nachts zu öffnen.",
            "Wägen Sie Nutzen, Kosten und mögliche Probleme ab.",
            "Begründen Sie, ob Sie den Vorschlag unterstützen.",
        ),
    ),
    Task(
        "Ein Praktikum während des Semesters",
        "discussion",
        120,
        90,
        "A fellow student has been offered a demanding internship during term and wants "
        "advice. Ask what they should do, then listen without coaching.",
        (
            "Eine Freundin kann ein interessantes Praktikum machen, müsste dafür aber "
            "Lehrveranstaltungen verpassen.",
            "Vergleichen Sie die Vorteile und Nachteile.",
            "Geben Sie Ihrer Freundin einen begründeten Rat.",
        ),
    ),
    Task(
        "Digitale Bücher im Studium",
        "present_topic",
        180,
        120,
        "In a seminar, ask the learner for hypotheses about the fictional chart's trend. "
        "They should support possible causes and consequences with the displayed data, "
        "rather than merely describe every value.",
        (
            "In einem Seminar besprechen Sie die Nutzung digitaler Lehrbücher.",
            "Vermuten Sie Gründe für die Entwicklung und begründen Sie Ihre Vermutungen.",
            "Welche Folgen erwarten Sie für Studierende und Bibliotheken? Nutzen Sie die Grafik.",
            "Die Zahlen sind fiktive Übungsdaten.",
        ),
        "Studierende, die digitale Lehrbücher nutzen · fiktive Übungsdaten (%)",
        ("2014", "2018", "2022", "2026"),
        (20, 35, 60, 75),
    ),
    Task(
        "Eine neue Lerngruppe",
        "discussion",
        90,
        90,
        "A fellow student asks whether a regular study group or independent learning is a "
        "better choice. Invite a reasoned recommendation, without interrupting or helping.",
        (
            "Ein Studienfreund möchte sich auf eine schwierige Prüfung vorbereiten.",
            "Er kann allein lernen oder sich einer festen Lerngruppe anschließen.",
            "Sagen Sie, was Sie empfehlen, und begründen Sie Ihre Meinung.",
        ),
    ),
)
