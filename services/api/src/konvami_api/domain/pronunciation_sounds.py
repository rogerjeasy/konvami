"""The problem sounds of a language, for the pronunciation lab (spec §6.14, §13.1).

Each sound has the words that practise it (pairs that differ only in that sound, words and
sentences to say) and a short explanation in each interface language. The words are the
language's own; the explanations are written once here instead of by a model, so they are the
same for every learner and cost nothing.
"""

from dataclasses import dataclass

# The language an explanation falls back to when the learner's is not written.
FALLBACK_LANGUAGE = "en"


@dataclass(frozen=True)
class SoundText:
    """What a learner reads about a sound, in one language."""

    title: str
    tip: str


@dataclass(frozen=True)
class ProblemSound:
    id: str
    # Two words that differ in this sound ("vier" / "für"): heard, picked apart and said.
    pairs: tuple[tuple[str, str], ...]
    # Single words to say.
    words: tuple[str, ...]
    # Sentences to shadow: hear, then say right after.
    sentences: tuple[str, ...]
    # Whether the two words of a pair sound different. When they do not (final devoicing, stress),
    # a learner cannot be asked which one they heard; the pairs are only said.
    listening: bool
    # Language code -> text. `FALLBACK_LANGUAGE` must be there.
    texts: dict[str, SoundText]

    def text(self, language: str) -> SoundText:
        return self.texts.get(language) or self.texts[FALLBACK_LANGUAGE]

    def targets(self) -> frozenset[str]:
        """Every text a drill of this sound can ask for (a word, two words of a pair, a
        sentence), as the learner would be shown it."""
        pair_texts = {f"{first} {second}" for first, second in self.pairs}
        return self.spoken() | pair_texts

    def spoken(self) -> frozenset[str]:
        """Every text of this sound that can be played: single words and sentences."""
        singles = {word for pair in self.pairs for word in pair}
        return frozenset({*singles, *self.words, *self.sentences})


def _texts(**by_language: tuple[str, str]) -> dict[str, SoundText]:
    return {code: SoundText(*text) for code, text in by_language.items()}


GERMAN_SOUNDS: tuple[ProblemSound, ...] = (
    ProblemSound(
        id="ue",
        pairs=(
            ("vier", "für"),
            ("Tier", "Tür"),
            ("Kiste", "Küste"),
            ("Biene", "Bühne"),
            ("Kissen", "küssen"),
        ),
        words=("fühlen", "müde", "übermorgen", "Brücke"),
        sentences=(
            "Die Tür ist für dich.",
            "Ich fühle mich müde.",
            "Über die Brücke fahren wir zur Bühne.",
        ),
        listening=True,
        texts=_texts(
            en=(
                "ü",
                "Say i, keep your tongue where it is and round your lips as if for u. "
                "Tür is not Tier, and für is not vier.",
            ),
            de=(
                "ü",
                "Sprich ein i, lass die Zunge, wo sie ist, und runde die Lippen wie bei u. "
                "Tür ist nicht Tier, und für ist nicht vier.",
            ),
            fr=(
                "ü",
                "Comme le u français de « tu ». Dites i, gardez la langue en place et arrondissez "
                "les lèvres. Tür n'est pas Tier, et für n'est pas vier.",
            ),
            it=(
                "ü",
                "Di' i, tieni la lingua dov'è e arrotonda le labbra come per la u. "
                "Tür non è Tier, e für non è vier.",
            ),
        ),
    ),
    ProblemSound(
        id="oe",
        pairs=(
            ("schon", "schön"),
            ("Sohn", "Söhne"),
            ("lesen", "lösen"),
            ("Hölle", "Helle"),
            ("Höhle", "Hölle"),
        ),
        words=("hören", "Möbel", "können", "Brötchen"),
        sentences=(
            "Das Wetter ist schön.",
            "Ich möchte zwei Brötchen, bitte.",
            "Können Sie mir helfen?",
        ),
        listening=True,
        texts=_texts(
            en=(
                "ö",
                "Say e, keep your tongue where it is and round your lips as if for o. "
                "schön is not schon, and lösen is not lesen.",
            ),
            de=(
                "ö",
                "Sprich ein e, lass die Zunge, wo sie ist, und runde die Lippen wie bei o. "
                "schön ist nicht schon, und lösen ist nicht lesen.",
            ),
            fr=(
                "ö",
                "Comme « peu » ou « cœur ». Dites e, gardez la langue en place et arrondissez "
                "les lèvres. schön n'est pas schon, et lösen n'est pas lesen.",
            ),
            it=(
                "ö",
                "Di' e, tieni la lingua dov'è e arrotonda le labbra come per la o. "
                "schön non è schon, e lösen non è lesen.",
            ),
        ),
    ),
    ProblemSound(
        id="ich_ach",
        pairs=(
            ("Buch", "Bücher"),
            ("Bach", "Bäche"),
            ("Tuch", "Tücher"),
            ("Nacht", "Nächte"),
            ("ach", "ich"),
        ),
        words=("nicht", "Licht", "machen", "Kuchen", "Mädchen"),
        sentences=(
            "Ich möchte nicht noch einen Kuchen.",
            "Ich suche ein Buch für mich.",
            "Nach dem Mittagessen mache ich eine Pause.",
        ),
        listening=True,
        texts=_texts(
            en=(
                "ich and ach",
                "After a, o, u and au, ch is a rough sound at the back of the throat (ach, Buch). "
                "After every other vowel and after l, n and r it is a soft hiss, like a cat "
                "(ich, Bücher).",
            ),
            de=(
                "ich- und ach-Laut",
                "Nach a, o, u und au ist ch ein raues Geräusch hinten im Hals (ach, Buch). "
                "Nach allen anderen Vokalen und nach l, n, r ist es ein weiches Zischen "
                "(ich, Bücher).",
            ),
            fr=(
                "ich et ach",
                "Après a, o, u et au, ch est un son rauque au fond de la gorge (ach, Buch). "
                "Après les autres voyelles et après l, n, r, c'est un souffle doux, comme "
                "un chuintement (ich, Bücher).",
            ),
            it=(
                "ich e ach",
                "Dopo a, o, u e au, ch è un suono rauco in fondo alla gola (ach, Buch). "
                "Dopo le altre vocali e dopo l, n, r è un soffio dolce, come un sibilo "
                "(ich, Bücher).",
            ),
        ),
    ),
    ProblemSound(
        id="r",
        pairs=(
            ("Reise", "leise"),
            ("Rand", "Land"),
            ("Rippe", "Lippe"),
            ("Rock", "Lock"),
            ("Rose", "lose"),
        ),
        words=("rot", "Rad", "fahren", "Bahnhof", "Uhr"),
        sentences=(
            "Das Rad ist rot und rund.",
            "Wir reisen morgen mit dem Zug nach Bremen.",
            "Ich warte vor dem Bahnhof auf dich.",
        ),
        listening=True,
        texts=_texts(
            en=(
                "r",
                "At the start of a word or syllable, r is made at the back of the throat, close "
                "to a gargle. After a vowel at the end of a syllable (Bahnhof, Uhr) it is a soft "
                "a-like sound, and you do not roll it.",
            ),
            de=(
                "r",
                "Am Anfang eines Wortes oder einer Silbe entsteht das r hinten im Hals, fast wie "
                "ein Gurgeln. Nach einem Vokal am Silbenende (Bahnhof, Uhr) klingt es weich wie "
                "ein a, und man rollt es nicht.",
            ),
            fr=(
                "r",
                "Au début d'un mot ou d'une syllabe, le r se fait au fond de la gorge, comme "
                "le r français. Après une voyelle en fin de syllabe (Bahnhof, Uhr) il devient "
                "un son doux proche de a, et on ne le roule pas.",
            ),
            it=(
                "r",
                "All'inizio di una parola o sillaba la r nasce in fondo alla gola, quasi un "
                "gargarismo. Dopo una vocale a fine sillaba (Bahnhof, Uhr) è un suono dolce "
                "simile a una a, e non si fa vibrare.",
            ),
        ),
    ),
    ProblemSound(
        id="final_devoicing",
        pairs=(
            ("Hund", "Hunde"),
            ("Tag", "Tage"),
            ("Kind", "Kinder"),
            ("Berg", "Berge"),
            ("Korb", "Körbe"),
        ),
        words=("Rad", "Hand", "Dieb", "Zug", "ab"),
        sentences=(
            "Der Hund liegt im Korb.",
            "Das Kind hat Hunger und Durst.",
            "Ich fahre mit dem Zug in den Urlaub.",
        ),
        listening=False,
        texts=_texts(
            en=(
                "b, d, g at the end",
                "At the end of a syllable b, d and g sound like p, t and k: Hund ends in t, Tag in "
                "k, Korb in p. In the plural (Hunde, Tage, Körbe) they are soft again.",
            ),
            de=(
                "b, d, g am Ende",
                "Am Ende einer Silbe klingen b, d und g wie p, t und k: Hund endet auf t, Tag auf "
                "k, Korb auf p. Im Plural (Hunde, Tage, Körbe) sind sie wieder weich.",
            ),
            fr=(
                "b, d, g en fin de mot",
                "En fin de syllabe, b, d et g sonnent comme p, t et k : Hund finit par t, Tag par "
                "k, Korb par p. Au pluriel (Hunde, Tage, Körbe) ils redeviennent doux.",
            ),
            it=(
                "b, d, g alla fine",
                "Alla fine di una sillaba b, d e g suonano come p, t e k: Hund finisce in t, Tag "
                "in k, Korb in p. Al plurale (Hunde, Tage, Körbe) tornano dolci.",
            ),
        ),
    ),
    ProblemSound(
        id="vowel_length",
        pairs=(
            ("Staat", "Stadt"),
            ("bieten", "bitten"),
            ("Miete", "Mitte"),
            ("Beet", "Bett"),
            ("Wahl", "Wall"),
        ),
        words=("Ofen", "offen", "Schal", "Schall"),
        sentences=(
            "Die Stadt gehört zum Staat.",
            "Das Beet ist neben dem Bett.",
            "Die Miete für die Mitte der Stadt ist hoch.",
        ),
        listening=True,
        texts=_texts(
            en=(
                "Long and short vowels",
                "A vowel before one consonant is usually long (Staat, Beet), and before two or "
                "more it is short (Stadt, Bett). Hold the long ones; do not drag the short ones.",
            ),
            de=(
                "Lange und kurze Vokale",
                "Ein Vokal vor einem Konsonanten ist meist lang (Staat, Beet), vor zwei oder mehr "
                "ist er kurz (Stadt, Bett). Halte die langen; zieh die kurzen nicht.",
            ),
            fr=(
                "Voyelles longues et brèves",
                "Une voyelle devant une consonne est le plus souvent longue (Staat, Beet), devant "
                "deux ou plus elle est brève (Stadt, Bett). Tenez les longues, ne traînez pas "
                "les brèves.",
            ),
            it=(
                "Vocali lunghe e brevi",
                "Una vocale prima di una consonante è di solito lunga (Staat, Beet), prima di due "
                "o più è breve (Stadt, Bett). Prolunga le lunghe, non trascinare le brevi.",
            ),
        ),
    ),
    ProblemSound(
        id="ig",
        pairs=(
            ("wichtig", "wichtige"),
            ("ruhig", "ruhige"),
            ("billig", "billige"),
            ("fertig", "fertige"),
            ("König", "Könige"),
        ),
        words=("wichtig", "richtig", "fleißig", "zwanzig", "dreißig"),
        sentences=(
            "Es ist wichtig, ruhig zu bleiben.",
            "Der König ist fertig und fleißig.",
            "Zwanzig Euro ist nicht billig.",
        ),
        listening=False,
        texts=_texts(
            en=(
                "-ig at the end",
                "At the end of a word -ig is said like -ich, with the soft sound of ich: wichtig, "
                "König. With an ending added (wichtige) the g is a g again.",
            ),
            de=(
                "-ig am Ende",
                "Am Wortende spricht man -ig wie -ich, mit dem weichen ich-Laut: wichtig, König. "
                "Mit einer Endung (wichtige) ist das g wieder ein g.",
            ),
            fr=(
                "-ig en fin de mot",
                "En fin de mot, -ig se prononce comme -ich, avec le souffle doux de ich : "
                "wichtig, König. Avec une terminaison (wichtige), le g redevient un g.",
            ),
            it=(
                "-ig alla fine",
                "A fine parola -ig si pronuncia come -ich, con il soffio dolce di ich: wichtig, "
                "König. Con una desinenza (wichtige) la g torna una g.",
            ),
        ),
    ),
    ProblemSound(
        id="sp_st",
        pairs=(
            ("Stein", "sein"),
            ("Staat", "Saat"),
            ("Stand", "Sand"),
            ("Spinne", "Sinne"),
        ),
        words=("sprechen", "Straße", "Student", "Spiel", "stehen"),
        sentences=(
            "Ich spreche gern mit dem Studenten.",
            "Der Stein steht auf der Straße.",
            "Das Spiel beginnt spät.",
        ),
        listening=True,
        texts=_texts(
            en=(
                "sp- and st-",
                "At the start of a word or a stem, sp and st are said sch-p and sch-t: sprechen "
                "sounds like “shprechen”, Straße like “Shtrasse”. Inside a word (Fenster, Wespe) "
                "they stay as written.",
            ),
            de=(
                "sp- und st-",
                "Am Anfang eines Wortes oder Wortstamms spricht man sp und st als schp und scht: "
                "sprechen klingt wie „schprechen“, Straße wie „Schtraße“. Im Wortinneren "
                "(Fenster, Wespe) bleiben sie, wie sie geschrieben sind.",
            ),
            fr=(
                "sp- et st-",
                "Au début d'un mot ou d'un radical, sp et st se prononcent chp et cht : sprechen "
                "sonne « chprechen », Straße « chtrasse ». À l'intérieur d'un mot (Fenster, "
                "Wespe) ils restent comme écrits.",
            ),
            it=(
                "sp- e st-",
                "All'inizio di una parola o di una radice sp e st si dicono scp e sct: sprechen "
                "suona “sciprechen”, Straße “Sctrasse”. Dentro la parola (Fenster, Wespe) "
                "restano come scritti.",
            ),
        ),
    ),
    ProblemSound(
        id="stress",
        pairs=(),
        words=("Student", "Familie", "Information", "Universität", "Restaurant", "Kaffee"),
        sentences=(
            "Die Universität hat ein Restaurant.",
            "Meine Familie trinkt gern Kaffee.",
            "Ich brauche eine Information.",
        ),
        listening=False,
        texts=_texts(
            en=(
                "Word stress",
                "German stresses the first syllable of most words (Arbeit, Zimmer), but words from "
                "other languages often the last (Student, Kaffee, Universität). Say the stressed "
                "syllable louder and longer, and the rest short.",
            ),
            de=(
                "Wortakzent",
                "Deutsch betont meist die erste Silbe (Arbeit, Zimmer), Fremdwörter oft die "
                "letzte (Student, Kaffee, Universität). Sprich die betonte Silbe lauter und "
                "länger, den Rest kurz.",
            ),
            fr=(
                "Accent de mot",
                "L'allemand accentue le plus souvent la première syllabe (Arbeit, Zimmer), mais "
                "les mots d'origine étrangère souvent la dernière (Student, Kaffee, Universität). "
                "Dites la syllabe accentuée plus fort et plus longtemps, le reste court.",
            ),
            it=(
                "Accento di parola",
                "Il tedesco accentua di solito la prima sillaba (Arbeit, Zimmer), ma le parole di "
                "origine straniera spesso l'ultima (Student, Kaffee, Universität). Pronuncia la "
                "sillaba accentata più forte e più a lungo, il resto breve.",
            ),
        ),
    ),
)
