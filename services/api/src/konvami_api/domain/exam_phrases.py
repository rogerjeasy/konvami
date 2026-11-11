"""Original practice phrases, not copied exam answers (§6.13)."""

from collections.abc import Mapping
from dataclasses import dataclass


@dataclass(frozen=True)
class ExamPhrase:
    text: str
    meanings: Mapping[str, str]


def _phrase(text: str, en: str, fr: str, it: str) -> ExamPhrase:
    return ExamPhrase(text, {"de": text, "en": en, "fr": fr, "it": it})


_INTRODUCE = (
    _phrase(
        "Ich möchte mich kurz vorstellen.",
        "I'd like to introduce myself briefly.",
        "Je voudrais me présenter brièvement.",
        "Vorrei presentarmi brevemente.",
    ),
)
_QUESTION = (
    _phrase(
        "Könnten Sie mir bitte sagen, wann das beginnt?",
        "Could you please tell me when it starts?",
        "Pourriez-vous me dire quand cela commence ?",
        "Potrebbe dirmi quando inizia?",
    ),
)
_REQUEST = (
    _phrase(
        "Könnten Sie mir bitte helfen?",
        "Could you please help me?",
        "Pourriez-vous m'aider ?",
        "Potrebbe aiutarmi?",
    ),
)
_LIFE = (
    _phrase(
        "In meiner Freizeit gehe ich gern spazieren.",
        "In my free time I enjoy going for walks.",
        "Pendant mon temps libre, j'aime me promener.",
        "Nel tempo libero mi piace passeggiare.",
    ),
)
_PLAN = (
    _phrase(
        "Ich schlage vor, dass wir uns am Samstag treffen.",
        "I suggest we meet on Saturday.",
        "Je propose de nous retrouver samedi.",
        "Propongo di incontrarci sabato.",
    ),
    _phrase(
        "Das klingt gut. Wie wäre es mit zehn Uhr?",
        "That sounds good. How about ten o'clock?",
        "Cela me semble bien. Et à dix heures ?",
        "Mi sembra una buona idea. Che ne dici delle dieci?",
    ),
)
_PRESENT = (
    _phrase(
        "Zuerst möchte ich über meine Erfahrungen sprechen.",
        "First I'd like to talk about my experiences.",
        "Je voudrais d'abord parler de mes expériences.",
        "Per prima cosa vorrei parlare delle mie esperienze.",
    ),
)
_FEEDBACK = (
    _phrase(
        "Vielen Dank für die Frage. Meiner Meinung nach ist das wichtig.",
        "Thank you for the question. In my opinion that is important.",
        "Merci pour la question. À mon avis, c'est important.",
        "Grazie per la domanda. Secondo me è importante.",
    ),
)
_DISCUSS = (
    _phrase(
        "Ich verstehe deinen Standpunkt, aber ich sehe das anders.",
        "I understand your point of view, but I see it differently.",
        "Je comprends ton point de vue, mais je vois les choses autrement.",
        "Capisco il tuo punto di vista, ma la penso diversamente.",
    ),
)
_PICTURE = (
    _phrase(
        "Auf dem Bild sehe ich mehrere Menschen.",
        "In the picture I can see several people.",
        "Sur l'image, je vois plusieurs personnes.",
        "Nell'immagine vedo diverse persone.",
    ),
)

_PHRASES: Mapping[str, tuple[ExamPhrase, ...]] = {
    "introduce": _INTRODUCE,
    "ask_answer": _QUESTION,
    "requests": _REQUEST,
    "questions_about_you": _INTRODUCE,
    "talk_about_life": _LIFE,
    "plan_together": _PLAN,
    "present_topic": _PRESENT,
    "feedback_questions": _FEEDBACK,
    "talk": _PRESENT,
    "discussion": _DISCUSS,
    "topic_conversation": _DISCUSS,
    "picture_experience": _PICTURE,
}


def phrases_for(kind: str) -> tuple[ExamPhrase, ...]:
    return _PHRASES.get(kind, ())
