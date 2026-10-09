"""What can be learned and chosen: language packs and their option lists (spec §13).

A language pack is configuration, not code. Only languages with a pack can be learned; the
others are listed so the app can say they are coming.
"""

from dataclasses import dataclass
from typing import Literal, get_args

from konvami_api.domain.persona_parts import PersonaTemplate

CefrLevel = Literal["A1", "A2", "B1", "B2", "C1", "C2"]
# "A0" is a learner starting from zero, below the first CEFR level.
StartingLevel = Literal["A0", "A1", "A2", "B1", "B2", "C1", "C2"]
GoalReason = Literal[
    "travel", "work", "study", "exam", "living_abroad", "family_friends", "culture", "other"
]
# How much of the explanation language a persona may use (spec §6.1.2).
ExplanationUsage = Literal["never", "when_stuck", "for_grammar", "freely"]

CEFR_LEVELS: tuple[CefrLevel, ...] = get_args(CefrLevel)
STARTING_LEVELS: tuple[StartingLevel, ...] = get_args(StartingLevel)
GOAL_REASONS: tuple[GoalReason, ...] = get_args(GoalReason)
EXPLANATION_USAGES: tuple[ExplanationUsage, ...] = get_args(ExplanationUsage)

# An exam the pack does not list. Any level is possible, so none is checked.
OTHER_EXAM = "other"


@dataclass(frozen=True)
class ExamFormat:
    id: str
    # A proper name, the same in every interface language.
    name: str
    levels: tuple[CefrLevel, ...]


@dataclass(frozen=True)
class LanguagePack:
    code: str
    available: bool
    exams: tuple[ExamFormat, ...] = ()
    # The partners offered when none can be written for a learner (see `domain/personas.py`).
    starter_personas: tuple[PersonaTemplate, ...] = ()

    def exam(self, exam_id: str) -> ExamFormat | None:
        return next((exam for exam in self.exams if exam.id == exam_id), None)


@dataclass(frozen=True)
class NamedLanguage:
    code: str
    # The language's name in itself, so people find their own language whatever the app shows.
    name: str
    # Its English name, for the instructions given to models (which are written in English).
    english: str


@dataclass(frozen=True)
class Catalog:
    packs: tuple[LanguagePack, ...]
    # Languages offered for explanations. A learner may name another one by voice; these are the
    # ones the form lists.
    explanation_languages: tuple[NamedLanguage, ...]

    def available_pack(self, code: str) -> LanguagePack | None:
        return next((pack for pack in self.packs if pack.code == code and pack.available), None)

    def english_name(self, code: str) -> str:
        """A language's English name for model instructions; an unlisted one goes by its code."""
        listed = next((lang for lang in self.explanation_languages if lang.code == code), None)
        return listed.english if listed else f"the language with ISO code '{code}'"


GERMAN = LanguagePack(
    code="de",
    available=True,
    exams=(
        ExamFormat("goethe", "Goethe-Zertifikat", CEFR_LEVELS),
        ExamFormat("telc", "telc Deutsch", CEFR_LEVELS),
        ExamFormat("dtz", "Deutsch-Test für Zuwanderer", ("A2", "B1")),
        ExamFormat("testdaf", "TestDaF", ("B2", "C1")),
        ExamFormat("osd", "ÖSD", CEFR_LEVELS),
    ),
    starter_personas=(
        PersonaTemplate(
            role="buddy",
            name="Lena",
            gender="female",
            age=27,
            origin="Leipzig",
            backstory=(
                "Lena arbeitet als Grafikerin in Leipzig. Sie spielt Volleyball, kocht gern "
                "und hat eine Katze namens Krümel."
            ),
            look={
                "skin": "sand",
                "hair": "long",
                "hair_color": "chestnut",
                "top": "teal",
                "backdrop": "mist",
                "glasses": False,
                "beard": False,
            },
            voice="marin",
        ),
        PersonaTemplate(
            role="teacher",
            name="Jonas",
            gender="male",
            age=38,
            origin="Hamburg",
            backstory=(
                "Jonas unterrichtet seit zwölf Jahren Deutsch als Fremdsprache in Hamburg. "
                "Er segelt am Wochenende und erklärt Grammatik am liebsten mit Beispielen."
            ),
            look={
                "skin": "porcelain",
                "hair": "parted",
                "hair_color": "espresso",
                "top": "graphite",
                "backdrop": "slate",
                "glasses": True,
                "beard": True,
            },
            voice="cedar",
        ),
        PersonaTemplate(
            role="exam_coach",
            name="Frau Weber",
            gender="female",
            age=47,
            origin="München",
            backstory=(
                "Frau Weber ist Prüferin für Sprachzertifikate in München. Sie ist ruhig und "
                "genau, wandert gern in den Alpen und kennt jede Prüfungsaufgabe."
            ),
            look={
                "skin": "honey",
                "hair": "bun",
                "hair_color": "silver",
                "top": "stone",
                "backdrop": "sand",
                "glasses": True,
                "beard": False,
            },
            voice="sage",
        ),
    ),
)

# German first; English, French and Italian are the next packs for the launch markets (§6.21.6).
CATALOG = Catalog(
    packs=(
        GERMAN,
        LanguagePack(code="en", available=False),
        LanguagePack(code="fr", available=False),
        LanguagePack(code="it", available=False),
    ),
    explanation_languages=tuple(
        NamedLanguage(code, name, english)
        for code, name, english in (
            ("en", "English", "English"),
            ("de", "Deutsch", "German"),
            ("fr", "Français", "French"),
            ("it", "Italiano", "Italian"),
            ("es", "Español", "Spanish"),
            ("pt", "Português", "Portuguese"),
            ("nl", "Nederlands", "Dutch"),
            ("pl", "Polski", "Polish"),
            ("tr", "Türkçe", "Turkish"),
            ("sq", "Shqip", "Albanian"),
            ("sr", "Srpski", "Serbian"),
            ("hr", "Hrvatski", "Croatian"),
            ("bs", "Bosanski", "Bosnian"),
            ("ro", "Română", "Romanian"),
            ("hu", "Magyar", "Hungarian"),
            ("cs", "Čeština", "Czech"),
            ("bg", "Български", "Bulgarian"),
            ("el", "Ελληνικά", "Greek"),
            ("uk", "Українська", "Ukrainian"),
            ("ru", "Русский", "Russian"),
            ("sv", "Svenska", "Swedish"),
            ("da", "Dansk", "Danish"),
            ("nb", "Norsk", "Norwegian"),
            ("fi", "Suomi", "Finnish"),
            ("ar", "العربية", "Arabic"),
            ("fa", "فارسی", "Persian"),
            ("he", "עברית", "Hebrew"),
            ("hi", "हिन्दी", "Hindi"),
            ("ur", "اردو", "Urdu"),
            ("bn", "বাংলা", "Bengali"),
            ("ta", "தமிழ்", "Tamil"),
            ("zh", "中文", "Chinese"),
            ("ja", "日本語", "Japanese"),
            ("ko", "한국어", "Korean"),
            ("vi", "Tiếng Việt", "Vietnamese"),
            ("th", "ไทย", "Thai"),
            ("id", "Bahasa Indonesia", "Indonesian"),
            ("sw", "Kiswahili", "Swahili"),
        )
    ),
)
