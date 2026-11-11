"""Italian grounding notes and a compact A1-C2 learning map (§13)."""

from konvami_api.domain.language_packs.grammar_content import GrammarEntry

ENTRIES = (
    GrammarEntry(
        "it_present",
        "A1",
        "Present-tense agreement",
        "The verb agrees with its subject. Regular verbs belong to -are, -ere and -ire "
        "conjugations. Subject pronouns may be omitted when the verb and context identify "
        "the person. Essere, avere, andare and fare have irregular forms.",
        ("Parliamo italiano.", "Lei va al lavoro."),
        ("Noi parla italiano.", "Lei vanno al lavoro."),
        "Ask about routines: Che cosa fai la mattina? E i tuoi amici?",
    ),
    GrammarEntry(
        "it_articles",
        "A1",
        "Articles and agreement",
        "Articles and adjectives agree with the noun's gender and number. Masculine lo "
        "and uno occur before forms including s plus consonant and z; il and un occur "
        "before most other consonants. Use l' before a vowel in the definite singular.",
        ("Lo studente legge.", "Le case sono grandi."),
        ("Il studente legge.", "Le case sono grande."),
        "Ask them to describe their room, including more than one object.",
    ),
    GrammarEntry(
        "it_past",
        "A2",
        "Passato prossimo and imperfetto",
        "Passato prossimo presents completed events; imperfetto gives background and "
        "past habits. The auxiliary is avere or essere according to the verb and its use. "
        "With essere, the participle agrees with the subject in gender and number.",
        ("Maria è arrivata ieri.", "Leggevo quando mi hai chiamato."),
        ("Maria è arrivato ieri.", "Maria ha andato a casa."),
        "Ask about a journey: Che tempo faceva? Che cosa è successo?",
    ),
    GrammarEntry(
        "it_pronouns",
        "A2",
        "Direct and indirect pronouns",
        "Direct object pronouns include lo, la, li and le; gli and le can mark singular "
        "indirect objects. Unstressed pronouns normally precede a finite verb, but attach "
        "to an infinitive with its final -e removed. Polite forms need their own context.",
        ("Le telefono domani.", "Voglio vederlo."),
        ("La telefono domani.", "Voglio vederelo."),
        "Ask about a person they plan to telephone and an object they want to buy.",
    ),
    GrammarEntry(
        "it_relative",
        "B1",
        "Relative clauses and prepositions",
        "Che is used as the subject or direct object of a relative clause. After a "
        "preposition, use cui or an appropriate form of il quale. Choose the preposition "
        "required by the verb: parlare di, andare con and abitare in differ.",
        ("Il libro di cui parlo è interessante.", "La persona che arriva è mia sorella."),
        ("Il libro che parlo è interessante.", "La persona di cui arriva è mia sorella."),
        "Ask them to describe a book they talk about and someone they often travel with.",
    ),
    GrammarEntry(
        "it_subjunctive",
        "B2",
        "Subjunctive and hypothetical conditions",
        "The subjunctive follows many expressions of doubt, opinion or desire in careful "
        "Italian. A hypothetical present condition commonly uses se with the imperfect "
        "subjunctive and a conditional result, rather than a conditional after se.",
        ("Penso che sia importante.", "Se avessi tempo, viaggerei."),
        ("Se avrei tempo, viaggerei.", "Vorrei che tu vieni."),
        "Ask what they would change in their town if they could decide.",
    ),
    GrammarEntry(
        "it_concession",
        "C1",
        "Concession and impersonal constructions",
        "Benché and sebbene normally take the subjunctive. Anche se normally uses the "
        "indicative. In si passivante constructions the verb agrees with the plural noun; "
        "distinguish these from genuinely impersonal constructions.",
        ("Benché sia stanco, continua.", "Si vendono libri usati."),
        ("Benché è stanco, continua.", "Si vende libri usati."),
        "Ask them to defend a position while acknowledging a drawback and giving general examples.",
    ),
    GrammarEntry(
        "it_register",
        "C2",
        "Register and nuanced expression",
        "Choose tu or Lei to fit the relationship and situation; Lei takes third-person "
        "singular verb forms. Distinguish informal regional usage from errors, and adjust "
        "idioms, politeness and hedging to the listener rather than making every reply formal.",
        ("Le sarei grato se potesse rispondermi.", "Mi permetta di precisare un punto."),
        ("Le sarei grato se potrebbe rispondermi.", "Mi permetta di preciso un punto."),
        "Ask for a formal request and then the same request to a friend.",
    ),
)
NOTES = tuple(entry.note() for entry in ENTRIES)
TOPICS = tuple(entry.topic() for entry in ENTRIES)
