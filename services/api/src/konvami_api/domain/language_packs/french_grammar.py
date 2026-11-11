"""French grounding notes and a compact A1-C2 learning map (§13)."""

from konvami_api.domain.language_packs.grammar_content import GrammarEntry

ENTRIES = (
    GrammarEntry(
        "fr_present",
        "A1",
        "Present-tense agreement",
        "The verb agrees with its subject. Regular -er verbs use -e, -es, -e, -ons, -ez, -ent. "
        "Many endings are silent, so judge spoken agreement only when the sound reveals it. "
        "Être, avoir, aller and faire have irregular forms.",
        ("Nous parlons français.", "Ils sont à la maison."),
        ("Nous parle français.", "Ils est à la maison."),
        "Ask about routines: Que faites-vous le matin ? Et votre famille ?",
    ),
    GrammarEntry(
        "fr_articles",
        "A1",
        "Gender and articles",
        "French nouns have masculine or feminine gender. Use le, la or l' in the singular "
        "and les in the plural; un and une introduce a non-specific noun. Adjectives generally "
        "agree in gender and number, though many distinctions cannot be heard.",
        ("Une petite maison.", "Un grand jardin."),
        ("Un petit maison.", "Une grande jardin."),
        "Ask them to describe their home and the objects in a room.",
    ),
    GrammarEntry(
        "fr_past",
        "A2",
        "Passé composé and imparfait",
        "Passé composé presents completed events; imparfait describes background or habits. "
        "Most verbs form passé composé with avoir; a group including aller and venir uses "
        "être, with subject agreement. Movement alone does not determine the auxiliary.",
        ("Je suis allé au marché.", "Il pleuvait quand elle est arrivée."),
        ("J'ai allé au marché.", "Il pleuvait quand elle a arrivée."),
        "Ask about a trip: Quel temps faisait-il ? Qu'est-ce qui s'est passé ?",
    ),
    GrammarEntry(
        "fr_pronouns",
        "A2",
        "Object pronouns",
        "Unstressed object pronouns normally precede the conjugated verb, or the infinitive "
        "they belong to. Le, la and les replace direct objects; lui and leur usually replace "
        "à plus a person. Affirmative imperatives have a different order.",
        ("Je lui téléphone.", "Je vais le voir."),
        ("Je le téléphone.", "Je le vais voir."),
        "Ask about calling a friend and lending them an object; encourage pronouns instead "
        "of repetition.",
    ),
    GrammarEntry(
        "fr_relative",
        "B1",
        "Relative pronouns",
        "Qui is the subject of its relative clause, que is its direct object, and dont "
        "replaces a complement introduced by de. Où can refer to a place or time. The choice "
        "depends on the pronoun's role inside the relative clause.",
        ("C'est le livre dont je parle.", "La personne qui arrive est ma sœur."),
        ("C'est le livre que je parle.", "La personne que arrive est ma sœur."),
        "Ask them to describe a person they admire and a place they remember.",
    ),
    GrammarEntry(
        "fr_subjunctive",
        "B2",
        "Subjunctive and hypothetical conditions",
        "Use the subjunctive after expressions such as il faut que and bien que. A "
        "hypothetical si clause normally uses the imparfait, with the conditional in the "
        "result; it does not normally take the conditional itself.",
        ("Il faut que tu viennes.", "Si j'avais le temps, je voyagerais."),
        ("Il faut que tu viens.", "Si j'aurais le temps, je voyagerais."),
        "Ask what must change in their city and what they would do with more time.",
    ),
    GrammarEntry(
        "fr_concession",
        "C1",
        "Concession and argument",
        "Bien que and quoique introduce a concession with the subjunctive. Même si usually "
        "takes the indicative. Distinguish cause from concession and choose connectors that "
        "express the intended relation, rather than treating them as interchangeable.",
        ("Bien qu'il soit fatigué, il continue.", "Même s'il est fatigué, il continue."),
        ("Bien qu'il est fatigué, il continue.", "Même s'il soit fatigué, il continue."),
        "Invite a balanced argument about a public decision, conceding one point to the "
        "other side.",
    ),
    GrammarEntry(
        "fr_register",
        "C2",
        "Register and idiomatic nuance",
        "Choose tu or vous and the degree of directness for the relationship. Omission of "
        "ne is normal in informal speech and should not be corrected as a grammatical error "
        "there. Formal correspondence uses a more explicit, less familiar style.",
        ("Je vous saurais gré de me répondre.", "Pourriez-vous préciser votre demande ?"),
        ("Je vous serais gré de me répondre.", "Pourriez-vous précisez votre demande ?"),
        "Ask for a polite formal complaint, then a conversational version for a close friend.",
    ),
)
NOTES = tuple(entry.note() for entry in ENTRIES)
TOPICS = tuple(entry.topic() for entry in ENTRIES)
