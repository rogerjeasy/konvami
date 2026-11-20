"""The speaking part of the fide test (Switzerland's language test for residence permits and
naturalisation, a programme of the State Secretariat for Migration), simulated in German, French
and Italian (spec §6.13).

After the public test handbook (fide-info.ch, «fide-Test Testhandbuch», May 2026): a speaking
part of about 15 minutes with two examiners, opening with a short warm-up and the A2 tasks
(describe a picture, a simulated phone call to make, move or cancel an appointment with a reason,
a conversation about habits, an experience or a process), then either the A1 tasks or the B1
conversation (two topics to choose from: an experience, a process, the good and bad sides of a
situation, a hypothetical situation). The result is a level, not points. The listening part
(«Verstehen») and the written part are not simulated.

Two simulations follow the two level combinations of the real test, compressed to one call of
about nine minutes. The cards are our own, set in everyday Swiss life; nothing is copied from
fide's tasks or grids, and the result is an estimate, never a fide result.
"""

from collections.abc import Mapping
from dataclasses import dataclass

from konvami_api.domain.exams import ExamPart, ExamScale, Picture, SpeakingExam, exam_card

EXAM = "fide"
# The two drawn scenes the picture task takes turns with.
_PICTURES: tuple[tuple[str, Picture], ...] = (("a", "waiting_room"), ("b", "bus_stop"))
# A level combination, as the test names it.
_LOWER, _UPPER = "A1\u2013A2", "A2\u2013B1"

RUBRIC = (
    "Judge globally, as the public fide handbook describes: whether the learner manages each "
    "everyday situation counts more than grammatical correctness, and what is appropriate to "
    "the situation (polite forms on the phone, at a counter) counts more than accuracy. At A1 "
    "and A2 being understood is central; A1 needs a lot of help, A2 manages with some help; B1 "
    "describes experiences, processes and the good and bad sides of a situation with some "
    "detail, fairly fluently, and gives reasons for an opinion on a hypothetical situation."
)


@dataclass(frozen=True)
class _Texts:
    """One language's cards for the fide simulations."""

    warm_up: tuple[str, ...]
    picture_title: str
    picture_prompts: tuple[str, ...]
    phone: tuple[tuple[str, tuple[str, ...], str], ...]
    habits: tuple[tuple[str, tuple[str, ...]], ...]
    contact: tuple[tuple[str, tuple[str, ...]], ...]
    b1_topics: tuple[tuple[str, tuple[str, ...]], ...]
    name: str


_TEXTS: Mapping[str, _Texts] = {
    "de": _Texts(
        name="fide · Sprechen",
        warm_up=("Einstieg", "Name", "Wohnort", "Seit wann in der Schweiz?", "Arbeit oder Familie"),
        picture_title="Beschreiben Sie das Bild: Wer? Wo? Was passiert?",
        picture_prompts=("Personen", "Ort", "Was machen die Leute?"),
        phone=(
            (
                "Sie rufen in der Arztpraxis an und möchten einen Termin vereinbaren.",
                ("Grund nennen", "Wann haben Sie Zeit?", "Termin bestätigen"),
                "You are the practice assistant. Free slots: Tuesday 8:30, Thursday 16:15. "
                "Ask for the patient's name and date of birth.",
            ),
            (
                "Sie können nicht zum Elterngespräch in der Kita kommen. Rufen Sie an.",
                ("Termin absagen", "Grund nennen", "Neuen Termin vorschlagen"),
                "You are the Kita director. The appointment was Wednesday 17:00. You can offer "
                "Monday 7:30 or Friday 17:30.",
            ),
            (
                "Ihr Velo ist kaputt. Sie möchten den Reparaturtermin verschieben.",
                ("Termin verschieben", "Grund nennen", "Wann passt es?"),
                "You are the bicycle shop. The repair was booked for Saturday 10:00. You can do "
                "Monday after 14:00 or next Saturday.",
            ),
        ),
        habits=(
            ("Ihr Alltag", ("Wie sieht Ihr Tag aus?", "Was machen Sie am Wochenende?")),
            ("Einkaufen", ("Wo kaufen Sie ein?", "Was kaufen Sie oft?", "Ein Erlebnis?")),
            ("Wohnen", ("Ihre Wohnung", "Die Nachbarn", "Wie trennen Sie den Abfall?")),
        ),
        contact=(
            ("Im Treppenhaus", ("Die Nachbarin grüsst Sie.", "Sie fragt nach dem Paket.")),
            ("Am Schalter der Gemeinde", ("Grüezi! Was kann ich für Sie tun?", "Ausweis?")),
        ),
        b1_topics=(
            (
                "Wählen Sie ein Thema",
                (
                    "A: Ein Umzug, den Sie erlebt haben: Wie lief er ab?",
                    "B: Arbeiten in der Schweiz: Was ist gut, was ist schwierig?",
                ),
            ),
            (
                "Wählen Sie ein Thema",
                (
                    "A: Wie man in Ihrer Gemeinde einen Ausweis beantragt",
                    "B: Wenn Sie ein Jahr frei hätten: Was würden Sie tun?",
                ),
            ),
        ),
    ),
    "fr": _Texts(
        name="fide · Parler",
        warm_up=("Début", "Nom", "Domicile", "Depuis quand en Suisse ?", "Travail ou famille"),
        picture_title="Décrivez l'image : qui ? où ? que se passe-t-il ?",
        picture_prompts=("Les personnes", "Le lieu", "Que font les gens ?"),
        phone=(
            (
                "Vous téléphonez au cabinet médical pour prendre rendez-vous.",
                ("Dire pourquoi", "Quand êtes-vous libre ?", "Confirmer le rendez-vous"),
                "You are the medical assistant. Free slots: Tuesday 8:30, Thursday 16:15. Ask "
                "for the patient's name and date of birth.",
            ),
            (
                "Vous ne pouvez pas venir à l'entretien à la crèche. Vous téléphonez.",
                ("Annuler le rendez-vous", "Dire pourquoi", "Proposer une autre date"),
                "You are the crèche director. The meeting was Wednesday 17:00. You can offer "
                "Monday 7:30 or Friday 17:30.",
            ),
            (
                "Votre vélo est en panne. Vous voulez déplacer le rendez-vous de réparation.",
                ("Déplacer le rendez-vous", "Dire pourquoi", "Quand est-ce possible ?"),
                "You are the bicycle shop. The repair was booked for Saturday 10:00. You can do "
                "Monday after 14:00 or next Saturday.",
            ),
        ),
        habits=(
            ("Votre quotidien", ("Votre journée", "Que faites-vous le week-end ?")),
            ("Les courses", ("Où faites-vous vos courses ?", "Qu'achetez-vous souvent ?")),
            ("Le logement", ("Votre appartement", "Les voisins", "Le tri des déchets")),
        ),
        contact=(
            ("Dans l'escalier", ("La voisine vous salue.", "Elle demande pour le colis.")),
            (
                "Au guichet de la commune",
                ("Bonjour, que puis-je pour vous ?", "Une pièce d'identité ?"),
            ),
        ),
        b1_topics=(
            (
                "Choisissez un thème",
                (
                    "A : Un déménagement que vous avez vécu : comment ça s'est passé ?",
                    "B : Travailler en Suisse : qu'est-ce qui est bien ? Qu'est-ce qui est dur ?",
                ),
            ),
            (
                "Choisissez un thème",
                (
                    "A : Comment on demande une pièce d'identité dans votre commune",
                    "B : Si vous aviez une année libre, que feriez-vous ?",
                ),
            ),
        ),
    ),
    "it": _Texts(
        name="fide · Parlare",
        warm_up=("Inizio", "Nome", "Domicilio", "Da quando in Svizzera?", "Lavoro o famiglia"),
        picture_title="Descriva l'immagine: chi? dove? che cosa succede?",
        picture_prompts=("Le persone", "Il luogo", "Che cosa fanno?"),
        phone=(
            (
                "Telefona allo studio medico per fissare un appuntamento.",
                ("Dire il motivo", "Quando ha tempo?", "Confermare l'appuntamento"),
                "You are the medical assistant. Free slots: Tuesday 8:30, Thursday 16:15. Ask "
                "for the patient's name and date of birth.",
            ),
            (
                "Non può venire al colloquio all'asilo nido. Telefona.",
                ("Disdire l'appuntamento", "Dire il motivo", "Proporre un'altra data"),
                "You are the nursery director. The meeting was Wednesday 17:00. You can offer "
                "Monday 7:30 or Friday 17:30.",
            ),
            (
                "La sua bicicletta è rotta. Vuole spostare l'appuntamento per la riparazione.",
                ("Spostare l'appuntamento", "Dire il motivo", "Quando va bene?"),
                "You are the bicycle shop. The repair was booked for Saturday 10:00. You can do "
                "Monday after 14:00 or next Saturday.",
            ),
        ),
        habits=(
            ("La sua giornata", ("Com'è la sua giornata?", "Che cosa fa nel fine settimana?")),
            ("La spesa", ("Dove fa la spesa?", "Che cosa compra spesso?")),
            ("L'abitazione", ("Il suo appartamento", "I vicini", "La raccolta dei rifiuti")),
        ),
        contact=(
            ("Sulle scale", ("La vicina la saluta.", "Le chiede del pacco.")),
            ("Allo sportello del comune", ("Buongiorno, come posso aiutarla?", "Un documento?")),
        ),
        b1_topics=(
            (
                "Scelga un tema",
                (
                    "A: Un trasloco che ha vissuto: com'è andato?",
                    "B: Lavorare in Svizzera: che cosa è bello, che cosa è difficile?",
                ),
            ),
            (
                "Scelga un tema",
                (
                    "A: Come si chiede un documento d'identità nel suo comune",
                    "B: Se avesse un anno libero, che cosa farebbe?",
                ),
            ),
        ),
    ),
}


def _warm_up(lang: str, t: _Texts) -> ExamPart:
    return ExamPart(
        "einstieg",
        "interview",
        "Warm-up",
        "A short warm-up as the test opens: ask two or three simple questions along the card "
        "(name, where they live, since when in Switzerland, work or family). Friendly and calm.",
        60,
        (exam_card(f"fide_{lang}_0", t.warm_up[0], *t.warm_up[1:]),),
    )


def _picture(lang: str, t: _Texts) -> ExamPart:
    return ExamPart(
        "bild",
        "describe_picture",
        "Describe a picture",
        "The learner describes the picture on their card: who, where, what is happening. If "
        "they stop, point to one thing on the picture with a simple question.",
        90,
        tuple(
            exam_card(f"fide_{lang}_1{key}", t.picture_title, *t.picture_prompts, picture=picture)
            for key, picture in _PICTURES
        ),
    )


def _phone(lang: str, t: _Texts, seconds: int) -> ExamPart:
    return ExamPart(
        "telefon",
        "phone_call",
        "Simulated phone call",
        "Play the other side of a phone call: say the greeting of your office as you pick up. "
        "The learner makes, moves or cancels the appointment on their card and gives a reason; "
        "use what only you know to offer times, and let them settle it.",
        seconds,
        tuple(
            exam_card(f"fide_{lang}_2{key}", title, *prompts, examiner=note)
            for key, (title, prompts, note) in zip("abc", t.phone, strict=True)
        ),
    )


def _habits(lang: str, t: _Texts, seconds: int) -> ExamPart:
    return ExamPart(
        "gespraech",
        "talk_about_life",
        "Conversation: habits and experiences",
        "Ask open questions along the card: habits and preferences, something the learner "
        "experienced, or how something is done. Follow up once on what they say.",
        seconds,
        tuple(
            exam_card(f"fide_{lang}_3{key}", title, *prompts)
            for key, (title, prompts) in zip("abc", t.habits, strict=True)
        ),
    )


def _contact(lang: str, t: _Texts) -> ExamPart:
    return ExamPart(
        "kontakt",
        "role_play",
        "Everyday contact situations",
        "Play the person on the card, in short lines: greet, ask a simple question, say "
        "goodbye. The learner reacts with simple words; help if they are stuck.",
        90,
        tuple(
            exam_card(f"fide_{lang}_4{key}", title, *prompts)
            for key, (title, prompts) in zip("ab", t.contact, strict=True)
        ),
    )


def _b1(lang: str, t: _Texts) -> ExamPart:
    return ExamPart(
        "gespraech_b1",
        "topic_conversation",
        "Conversation: choose a topic",
        "The learner chooses topic A or B. Ask open questions so they describe an experience "
        "or a process with some detail, weigh the good and bad sides, and give a reasoned "
        "opinion on a hypothetical situation.",
        180,
        tuple(
            exam_card(f"fide_{lang}_5{key}", title, *prompts)
            for key, (title, prompts) in zip("ab", t.b1_topics, strict=True)
        ),
    )


def fide_exams(lang: str) -> tuple[SpeakingExam, ...]:
    """The two fide speaking simulations in a language of Switzerland."""
    t = _TEXTS[lang]
    lower = SpeakingExam(
        id=f"fide_{lang}_a1_a2",
        exam=EXAM,
        levels=("A1", "A2"),
        name=f"{t.name} {_LOWER}",
        prep_seconds=0,
        parts=(
            _warm_up(lang, t),
            _picture(lang, t),
            _phone(lang, t, 150),
            _habits(lang, t, 120),
            _contact(lang, t),
        ),
        language=lang,
        scale=ExamScale("level", levels=("below_A1", "A1", "A2")),
        rubric=RUBRIC,
    )
    upper = SpeakingExam(
        id=f"fide_{lang}_a2_b1",
        exam=EXAM,
        levels=("B1",),
        name=f"{t.name} {_UPPER}",
        prep_seconds=0,
        parts=(
            _warm_up(lang, t),
            _picture(lang, t),
            _phone(lang, t, 120),
            _habits(lang, t, 90),
            _b1(lang, t),
        ),
        language=lang,
        scale=ExamScale("level", levels=("A1", "A2", "B1")),
        rubric=RUBRIC,
    )
    return lower, upper
