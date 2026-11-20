"""Speaking simulations for Italian exams (spec §6.13): the CELI of the Università per Stranieri
di Perugia and the CILS of the Università per Stranieri di Siena, A2 to C1.

After their public descriptions: the CELI oral is an interview with an interlocutor from
prepared material, often an image; the CILS oral is a short conversation, then a monologue on a
situation chosen from two. Each is simplified to one call of up to nine minutes. Their marking
scales are not modelled (the result is the share of the points); the cards are our own and a
score is an estimate, never official.
"""

from collections.abc import Mapping

from konvami_api.domain.exams import ExamPart, PartKind, Picture, SpeakingExam, exam_card

_CELI_RUBRIC = (
    "The CELI oral weighs how well the learner carries out each task with the interlocutor, "
    "the range and accuracy of vocabulary and grammar for the level, and fluency and "
    "appropriateness (the formal Lei). Judge at the CELI's level."
)
_CILS_RUBRIC = (
    "The CILS oral weighs how well the learner handles the conversation and the monologue: "
    "content and task fulfilment, coherence, range and accuracy of vocabulary and grammar for "
    "the level, and appropriateness. Judge at the CILS level."
)

_LEVELS = ("A2", "B1", "B2", "C1")
_CELI_NUMBER = {"A2": "1", "B1": "2", "B2": "3", "C1": "4"}
_CILS_NAME = {"A2": "A2", "B1": "UNO B1", "B2": "DUE B2", "C1": "TRE C1"}

_INTERVIEW = {
    "A2": ("Presentazione", "Nome e provenienza", "Famiglia", "Lavoro o studio", "Tempo libero"),
    "B1": ("Presentazione", "La sua storia", "Perché studia l'italiano", "I suoi progetti"),
    "B2": ("Presentazione", "La sua formazione", "Il suo lavoro", "Esperienze all'estero"),
    "C1": ("Presentazione", "Il suo percorso", "Interessi culturali", "Ambizioni"),
}
# The second task per level: its kind, title, task, seconds and two cards.
_SECOND: Mapping[
    str, tuple[PartKind, str, str, int, tuple[tuple[str, tuple[str, ...], Picture | None], ...]]
] = {
    "A2": (
        "describe_picture",
        "Describe a picture",
        "The learner describes the picture on the card and says something about their own "
        "experience of such a situation; ask simple questions.",
        150,
        (
            ("Descriva l'immagine.", ("Chi c'è?", "Dove sono?", "Che cosa fanno?"), "waiting_room"),
            ("Descriva l'immagine.", ("Chi c'è?", "Dove sono?", "Che tempo fa?"), "bus_stop"),
        ),
    ),
    "B1": (
        "describe_picture",
        "Describe a picture and talk about it",
        "The learner describes the picture, imagines what happened before and after, and "
        "relates it to their own experience; ask one or two questions.",
        150,
        (
            (
                "Descriva l'immagine e racconti.",
                ("La scena", "Prima e dopo", "La sua esperienza"),
                "waiting_room",
            ),
            (
                "Descriva l'immagine e racconti.",
                ("La scena", "Prima e dopo", "La sua esperienza"),
                "bus_stop",
            ),
        ),
    ),
    "B2": (
        "point_of_view",
        "Discuss a short text",
        "The learner sums up the card's short text and gives a reasoned opinion; challenge it "
        "politely with one or two questions.",
        240,
        (
            (
                "Testo: « Sempre più persone lavorano da casa almeno due giorni a settimana. »",
                ("Riassumere", "La sua opinione", "Vantaggi e svantaggi"),
                None,
            ),
            (
                "Testo: « Le città italiane chiudono i centri storici alle auto. »",
                ("Riassumere", "La sua opinione", "Vantaggi e svantaggi"),
                None,
            ),
        ),
    ),
    "C1": (
        "talk",
        "Presentation",
        "The learner gives a structured presentation of about four minutes on the card's "
        "theme, with an introduction, arguments and a conclusion; then ask one probing question.",
        240,
        (
            (
                "Tema: il turismo nelle città d'arte",
                ("Il problema", "Argomenti a favore e contro", "La sua posizione"),
                None,
            ),
            (
                "Tema: l'intelligenza artificiale a scuola",
                ("Il problema", "Argomenti a favore e contro", "La sua posizione"),
                None,
            ),
        ),
    ),
}
_ROLE_PLAY = {
    "A2": ("Al bar: ordini la colazione e paghi.", ("Ordinare", "Chiedere il prezzo", "Pagare")),
    "B1": (
        "In albergo: la camera ha un problema. Parli con la reception.",
        ("Spiegare il problema", "Chiedere una soluzione", "Accettare o proporre"),
    ),
    "B2": (
        "Discussione con un collega: dove organizzare la cena aziendale?",
        ("Proporre", "Argomentare", "Trovare un accordo"),
    ),
    "C1": (
        "Dibattito: la settimana corta conviene alle aziende?",
        ("Prendere posizione", "Rispondere alle obiezioni", "Concludere"),
    ),
}
_MONOLOGUE = {
    "A2": (
        ("Racconti la sua giornata tipica.", ("Mattina", "Pomeriggio", "Sera")),
        ("Racconti le sue ultime vacanze.", ("Dove", "Con chi", "Che cosa ha fatto")),
    ),
    "B1": (
        (
            "Racconti un viaggio che ricorda bene.",
            ("Dove", "Che cosa è successo", "Perché lo ricorda"),
        ),
        (
            "Parli di una persona importante per lei.",
            ("Chi è", "Che cosa avete fatto insieme", "Perché è importante"),
        ),
    ),
    "B2": (
        (
            "Parli di un cambiamento importante nella sua vita.",
            ("Che cosa", "Come l'ha vissuto", "Che cosa ha imparato"),
        ),
        ("Vivere all'estero: vantaggi e difficoltà.", ("Esperienze", "Vantaggi", "Difficoltà")),
    ),
    "C1": (
        (
            "La tecnologia ci rende più soli? Esponga la sua posizione.",
            ("Argomenti", "Esempi", "Conclusione"),
        ),
        (
            "Il ruolo della cultura nello sviluppo di un paese.",
            ("Argomenti", "Esempi", "Conclusione"),
        ),
    ),
}
_MONOLOGUE_KIND: Mapping[str, PartKind] = {
    "A2": "talk_about_life",
    "B1": "talk_about_life",
    "B2": "talk",
    "C1": "talk",
}


def _celi(level: str) -> SpeakingExam:
    kind, title, task, seconds, cards = _SECOND[level]
    key = f"celi_{level.lower()}"
    interview = _INTERVIEW[level]
    role_title, role_prompts = _ROLE_PLAY[level]
    return SpeakingExam(
        id=key,
        exam="celi",
        levels=(level,),
        name=f"CELI {_CELI_NUMBER[level]} {level} · Produzione orale",
        prep_seconds=0,
        language="it",
        rubric=_CELI_RUBRIC,
        parts=(
            ExamPart(
                "presentazione",
                "interview",
                "Interview",
                "Ask the learner about themselves along the card and follow up on their "
                "answers, as the interlocutor.",
                90,
                (exam_card(f"{key}_1", interview[0], *interview[1:]),),
            ),
            ExamPart(
                "materiale",
                kind,
                title,
                task,
                seconds,
                tuple(
                    exam_card(f"{key}_2{letter}", card_title, *prompts, picture=picture)
                    for letter, (card_title, prompts, picture) in zip("ab", cards, strict=True)
                ),
            ),
            ExamPart(
                "interazione",
                "role_play" if level in ("A2", "B1") else "discussion",
                "Role-play" if level in ("A2", "B1") else "Discussion",
                "Play the other person in the card's situation and let the learner lead it."
                if level in ("A2", "B1")
                else "Discuss the card's question with the learner, challenging their view.",
                150,
                (exam_card(f"{key}_3", role_title, *role_prompts),),
            ),
        ),
    )


def _cils(level: str) -> SpeakingExam:
    key = f"cils_{level.lower()}"
    interview = _INTERVIEW[level]
    return SpeakingExam(
        id=key,
        exam="cils",
        levels=(level,),
        name=f"CILS {_CILS_NAME[level]} · Produzione orale",
        prep_seconds=60,
        language="it",
        rubric=_CILS_RUBRIC,
        parts=(
            ExamPart(
                "dialogo",
                "interview",
                "Conversation",
                "A conversation of about two minutes along the card: ask open questions and "
                "react naturally.",
                150,
                (exam_card(f"{key}_1", interview[0], *interview[1:]),),
            ),
            ExamPart(
                "monologo",
                _MONOLOGUE_KIND[level],
                "Monologue",
                "The learner speaks alone about the card's situation for about two to three "
                "minutes, without help; then thank them.",
                210,
                tuple(
                    exam_card(f"{key}_2{letter}", title, *prompts)
                    for letter, (title, prompts) in zip("ab", _MONOLOGUE[level], strict=True)
                ),
            ),
        ),
    )


ITALIAN_EXAMS: tuple[SpeakingExam, ...] = (
    *(_celi(level) for level in _LEVELS),
    *(_cils(level) for level in _LEVELS),
)
