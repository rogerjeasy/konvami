"""What can be learned and chosen: language packs and their option lists (spec §13).

A language pack is configuration, not code. Only languages with a pack can be learned; the
others are listed so the app can say they are coming.
"""

from dataclasses import dataclass
from typing import Literal, get_args

from konvami_api.domain.exams import GERMAN_EXAMS, SpeakingExam
from konvami_api.domain.grammar import GERMAN_NOTES, GrammarNote
from konvami_api.domain.grammar_topics import GERMAN_MAP, GrammarTopic
from konvami_api.domain.persona_parts import PersonaTemplate
from konvami_api.domain.scenarios import GERMAN_SCENARIOS, Scenario
from konvami_api.domain.word_use import GERMAN_WORD_RULES, WordRules

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
    # More ready-made partners for Persona Studio, after the starter ones (spec §6.2 Templates).
    persona_templates: tuple[PersonaTemplate, ...] = ()
    # What a voice says as its sample in Persona Studio: a partner's first words.
    voice_sample: str = ""
    # The kinds of mistake a learner's text can show (spec §13.3). A Session Report files every
    # mistake under one of them; what only a recording shows (pronunciation, pace) is not here.
    error_categories: tuple[str, ...] = ()
    # The rule behind each kind of mistake, in the same order: what the Tutor rests on.
    grammar: tuple[GrammarNote, ...] = ()
    # The role-plays it offers (spec §6.3), easiest first.
    scenarios: tuple[Scenario, ...] = ()
    # Its grammar topics from A1 up, easiest first (spec §6.8, §13.2).
    grammar_map: tuple[GrammarTopic, ...] = ()
    # How its words change form, to tell whether a learner used one (`word_use.py`).
    word_rules: WordRules | None = None
    # The speaking tests of its exams, for simulations (spec §6.13, `exams.py`).
    speaking_exams: tuple[SpeakingExam, ...] = ()

    def exam(self, exam_id: str) -> ExamFormat | None:
        return next((exam for exam in self.exams if exam.id == exam_id), None)

    def note(self, topic: str) -> GrammarNote | None:
        return next((note for note in self.grammar if note.topic == topic), None)

    def topic(self, topic_id: str) -> GrammarTopic | None:
        return next((topic for topic in self.grammar_map if topic.id == topic_id), None)

    def speaking_exam(self, exam_id: str) -> SpeakingExam | None:
        return next((exam for exam in self.speaking_exams if exam.id == exam_id), None)

    def scenario(self, scenario_id: str) -> Scenario | None:
        return next((s for s in self.scenarios if s.id == scenario_id), None)


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
    voice_sample="Hallo! Schön, dich kennenzulernen. Worüber möchtest du heute sprechen?",
    error_categories=(
        "article_gender",
        "case_accusative",
        "case_dative",
        "case_genitive",
        "adjective_ending",
        "word_order_v2",
        "word_order_subordinate",
        "separable_verb",
        "perfekt_auxiliary",
        "participle_form",
        "conjugation",
        "preposition_choice",
        "two_way_preposition",
        "plural_form",
        "negation",
        "register_du_sie",
        "vocabulary_false_friend",
        "lexical_choice",
    ),
    grammar=GERMAN_NOTES,
    grammar_map=GERMAN_MAP,
    word_rules=GERMAN_WORD_RULES,
    speaking_exams=GERMAN_EXAMS,
    scenarios=GERMAN_SCENARIOS,
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
    persona_templates=(
        PersonaTemplate(
            role="buddy",
            name="Mara",
            gender="female",
            age=34,
            origin="Berlin",
            occupation="Journalistin",
            backstory=(
                "Mara ist Journalistin in Berlin und schreibt über Stadtleben und Kultur. "
                "Sie fährt überall mit dem Fahrrad hin, diskutiert leidenschaftlich gern und "
                "hat zu fast allem eine Meinung."
            ),
            look={
                "skin": "chestnut",
                "hair": "curls",
                "hair_color": "black",
                "top": "amber",
                "backdrop": "stone",
                "glasses": False,
                "beard": False,
            },
            voice="coral",
            personality={
                "warmth": 3,
                "playfulness": 4,
                "talkativeness": 4,
                "curiosity": 5,
                "humour": 4,
                "form_of_address": "informal",
                "style": "debate",
            },
        ),
        PersonaTemplate(
            role="buddy",
            name="Herr Bauer",
            gender="male",
            age=68,
            origin="Wien",
            occupation="Pensionierter Lehrer",
            backstory=(
                "Herr Bauer war vierzig Jahre lang Geschichtslehrer in Wien und ist jetzt in "
                "Pension. Er sitzt gern im Kaffeehaus, liest jeden Tag drei Zeitungen und "
                "erzählt gern von früher."
            ),
            look={
                "skin": "porcelain",
                "hair": "short",
                "hair_color": "silver",
                "top": "stone",
                "backdrop": "sand",
                "glasses": True,
                "beard": False,
            },
            voice="ash",
            personality={
                "warmth": 4,
                "playfulness": 2,
                "talkativeness": 4,
                "curiosity": 3,
                "humour": 2,
                "form_of_address": "formal",
                "style": "stories",
            },
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
