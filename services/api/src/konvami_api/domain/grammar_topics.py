"""The grammar topics of each language pack (spec §6.8, §13.2), from A1 up: configuration, like
the rest of a pack. How well a learner has each is `grammar_map.py`.
"""

from dataclasses import dataclass


@dataclass(frozen=True)
class GrammarTopic:
    # Stable, used in reports, plans and the app (which names it in the interface language).
    id: str
    # The CEFR level it belongs to.
    level: str
    # Its name in English, for the models' instructions.
    title: str
    # The language pack's kinds of mistake that are mistakes in this topic (spec §13.3); a
    # topic whose mistakes have no kind of their own has none.
    categories: tuple[str, ...]
    # How a conversation partner gets the learner to use it without naming it, with questions
    # in the language learned (spec §7 "targeted elicitation").
    elicit: str
    # Sentences that use it well.
    examples: tuple[str, ...]


def _t(
    id: str, level: str, title: str, categories: tuple[str, ...], elicit: str, *examples: str
) -> GrammarTopic:
    return GrammarTopic(id, level, title, categories, elicit, examples)


GERMAN_MAP: tuple[GrammarTopic, ...] = (
    _t(
        "present_tense",
        "A1",
        "Present tense",
        ("conjugation",),
        (
            "Ask about their everyday life and about other people's (Was machst du am Abend? Was "
            "macht deine Schwester beruflich?)."
        ),
        "Ich wohne in Zürich.",
        "Sie arbeitet bei einer Bank.",
        "Fährst du oft Rad?",
    ),
    _t(
        "verb_second",
        "A1",
        "Verb second in main clauses",
        ("word_order_v2",),
        (
            "Ask about routines and plans, so answers start with a time or a place (Was machst "
            "du am Wochenende? Was hast du gestern Abend gemacht?)."
        ),
        "Am Wochenende fahre ich nach Bern.",
        "Gestern habe ich lange gearbeitet.",
    ),
    _t(
        "questions",
        "A1",
        "Questions",
        (),
        (
            "Let them ask you things: invite them to find out about your life (Was möchtest du "
            "über mich wissen? Frag mich etwas über meine Stadt!)."
        ),
        "Wo wohnst du?",
        "Hast du heute Zeit?",
        "Warum lernst du Deutsch?",
    ),
    _t(
        "articles_gender",
        "A1",
        "Articles and gender",
        ("article_gender",),
        (
            "Get them to name and describe everyday things (Was ist in deiner Tasche? Wie sieht "
            "deine Küche aus?)."
        ),
        "Die Zeitung liegt auf dem Tisch.",
        "Das Mädchen spielt im Garten.",
    ),
    _t(
        "accusative",
        "A1",
        "Accusative",
        ("case_accusative",),
        (
            "Ask what they have, need or bought, and whom they visit (Was hast du heute gekauft? "
            "Brauchst du einen neuen Laptop?)."
        ),
        "Ich habe einen Bruder.",
        "Das Geschenk ist für meinen Vater.",
    ),
    _t(
        "negation",
        "A1",
        "nicht and kein",
        ("negation",),
        (
            "Ask things they are likely to answer with no (Isst du Fleisch? Hast du ein Auto? "
            "Warst du schon mal in Wien?)."
        ),
        "Ich habe keine Zeit.",
        "Ich komme heute nicht.",
    ),
    _t(
        "modal_verbs",
        "A1",
        "Modal verbs",
        (),
        (
            "Ask what they can, must, want to or may do (Was musst du diese Woche noch "
            "erledigen? Was kannst du gut kochen?)."
        ),
        "Ich muss heute arbeiten.",
        "Kannst du mir helfen?",
        "Wir wollen nach Italien fahren.",
    ),
    _t(
        "separable_verbs",
        "A1",
        "Separable verbs",
        ("separable_verb",),
        (
            "Ask about their day from getting up to going to bed (Wann stehst du auf? Wann "
            "kommst du heute nach Hause?)."
        ),
        "Ich stehe um sieben Uhr auf.",
        "Ich rufe dich morgen an.",
    ),
    _t(
        "plural",
        "A1",
        "Plural forms",
        ("plural_form",),
        (
            "Ask how many and which things and people (Hast du Geschwister? Wie viele Bücher "
            "liest du im Jahr?)."
        ),
        "Ich habe zwei Brüder.",
        "Die Kinder spielen draußen.",
    ),
    _t(
        "imperative",
        "A1",
        "The imperative",
        (),
        (
            "Ask them for tips and instructions: a recipe, the way to their place (Wie kocht man "
            "das? Erklär mir den Weg zu dir!)."
        ),
        "Komm doch mit!",
        "Nehmen Sie den Bus Nummer drei.",
    ),
    _t(
        "du_sie",
        "A1",
        "du or Sie",
        ("register_du_sie",),
        (
            "Now and then ask how they would ask a stranger for something (Wie fragst du "
            "jemanden auf der Straße nach dem Weg?)."
        ),
        "Können Sie mir bitte helfen?",
        "Kannst du mir das Salz geben?",
    ),
    _t(
        "perfekt",
        "A2",
        "Perfekt",
        ("perfekt_auxiliary", "participle_form"),
        (
            "Ask what they did and where they went: yesterday, at the weekend, on holiday (Wohin "
            "bist du gefahren? Was hast du gegessen?)."
        ),
        "Ich bin nach Berlin gefahren.",
        "Wir haben einen Film gesehen.",
    ),
    _t(
        "dative",
        "A2",
        "Dative",
        ("case_dative",),
        (
            "Ask how they get places, whom they do things with and whom they give things to (Mit "
            "wem warst du da? Was schenkst du deiner Mutter?)."
        ),
        "Ich fahre mit dem Bus.",
        "Ich helfe meiner Nachbarin.",
    ),
    _t(
        "two_way_prepositions",
        "A2",
        "Prepositions with accusative or dative",
        ("two_way_preposition",),
        (
            "Ask where things are and where they put them (Wo liegt dein Handy gerade? Wohin "
            "stellst du deine Pflanzen?)."
        ),
        "Das Buch liegt auf dem Tisch.",
        "Ich lege das Buch auf den Tisch.",
    ),
    _t(
        "prepositions",
        "A2",
        "Prepositions of place and time",
        ("preposition_choice",),
        (
            "Ask where they go, where they are and since when (Wohin gehst du heute noch? Seit "
            "wann wohnst du hier?)."
        ),
        "Ich fahre nach Italien.",
        "Ich gehe zum Arzt.",
        "Ich warte auf den Bus.",
    ),
    _t(
        "subordinate_clauses",
        "A2",
        "weil, dass, wenn, ob",
        ("word_order_subordinate",),
        (
            "Ask why, what they think and what they do if (Warum lernst du Deutsch? Was machst "
            "du, wenn es regnet?)."
        ),
        "Ich bleibe zu Hause, weil ich krank bin.",
        "Ich glaube, dass er morgen kommt.",
    ),
    _t(
        "possessives",
        "A2",
        "Possessive articles",
        (),
        (
            "Ask about their family, friends and things (Wie heißt deine Schwester? Was macht "
            "dein bester Freund?)."
        ),
        "Das ist mein Bruder.",
        "Ich fahre mit meinem Auto.",
    ),
    _t(
        "comparison",
        "A2",
        "Comparative and superlative",
        (),
        (
            "Ask them to compare places, food and seasons (Was ist schöner, Zürich oder Genf? "
            "Was isst du am liebsten?)."
        ),
        "Zürich ist größer als Bern.",
        "Im Sommer ist es am schönsten.",
    ),
    _t(
        "reflexive_verbs",
        "A2",
        "Reflexive verbs",
        (),
        (
            "Ask what they look forward to, are interested in and how they relax (Worauf freust "
            "du dich? Wofür interessierst du dich?)."
        ),
        "Ich freue mich auf das Wochenende.",
        "Er interessiert sich für Musik.",
    ),
    _t(
        "prateritum_basic",
        "A2",
        "war, hatte and the modal verbs in the past",
        (),
        (
            "Ask what things were like and what they had to do in the past (Wie war dein Urlaub? "
            "Was musstest du als Kind machen?)."
        ),
        "Gestern war ich müde.",
        "Als Kind hatte ich einen Hund.",
        "Ich musste früh aufstehen.",
    ),
    _t(
        "adjective_endings",
        "B1",
        "Adjective endings",
        ("adjective_ending",),
        (
            "Ask them to describe people, places and things in detail (Was für eine Wohnung "
            "suchst du? Beschreib mal deinen besten Freund.)."
        ),
        "Ich habe einen neuen Job.",
        "Wir wohnen in einer kleinen Wohnung.",
    ),
    _t(
        "relative_clauses",
        "B1",
        "Relative clauses",
        (),
        (
            "Ask them to describe what kind of person, place or thing they mean (Was ist ein "
            "Freund, der dir viel bedeutet? Kennst du ein Café, das du empfehlen kannst?)."
        ),
        "Das ist der Mann, der neben mir wohnt.",
        "Die Stadt, in der ich lebe, ist klein.",
    ),
    _t(
        "passive",
        "B1",
        "The passive",
        (),
        (
            "Ask how things are made or done, or what happened to something (Wie wird bei euch "
            "Fondue gemacht? Wann wurde dein Haus gebaut?)."
        ),
        "Das Brot wird jeden Morgen gebacken.",
        "Die Brücke wurde 1900 gebaut.",
    ),
    _t(
        "konjunktiv_2",
        "B1",
        "Konjunktiv II: würde, hätte, wäre",
        (),
        (
            "Ask about wishes, dreams and what they would do if (Was würdest du mit einer "
            "Million machen? Wo wärst du jetzt gern?)."
        ),
        "Ich würde gern nach Japan reisen.",
        "Wenn ich Zeit hätte, käme ich mit.",
    ),
    _t(
        "infinitive_zu",
        "B1",
        "Infinitive with zu",
        (),
        (
            "Ask what they plan, try or forget to do and what is hard for them (Was hast du vor, "
            "dieses Jahr zu lernen? Was ist schwer für dich zu verstehen?)."
        ),
        "Ich habe vor, mehr Sport zu machen.",
        "Es ist schwer, früh aufzustehen.",
    ),
    _t(
        "temporal_clauses",
        "B1",
        "als, wenn, nachdem, bevor",
        (),
        (
            "Ask them to tell a story from their past in order (Was hast du gemacht, als du in "
            "die Schweiz gekommen bist? Was machst du, bevor du schläfst?)."
        ),
        "Als ich klein war, wohnte ich in Lyon.",
        "Nachdem ich gegessen hatte, ging ich spazieren.",
    ),
    _t(
        "genitive",
        "B1",
        "Genitive",
        ("case_genitive",),
        (
            "Ask whose things or ideas something was, and for reasons with wegen or trotz "
            "(Wessen Idee war das? Warum war der Zug wohl so spät?)."
        ),
        "Das ist das Auto meines Vaters.",
        "Wegen des Wetters bleiben wir zu Hause.",
    ),
    _t(
        "plusquamperfekt",
        "B1",
        "Plusquamperfekt",
        (),
        (
            "Ask what had already happened before something else in their stories (Was hattest "
            "du schon gemacht, bevor du umgezogen bist?)."
        ),
        "Als ich ankam, war der Zug schon abgefahren.",
        "Ich hatte das Buch schon gelesen.",
    ),
    _t(
        "passive_modal",
        "B2",
        "The passive with modal verbs",
        (),
        (
            "Ask what must, can or should be done about things (Was müsste in deiner Stadt "
            "geändert werden? Was kann man besser machen?)."
        ),
        "Das muss heute noch erledigt werden.",
        "Der Vertrag kann online unterschrieben werden.",
    ),
    _t(
        "konjunktiv_1",
        "B2",
        "Konjunktiv I: reported speech",
        (),
        (
            "Ask them to report what someone said, in the news or at work (Was hat dein Chef "
            "gesagt? Was stand in der Zeitung?)."
        ),
        "Er sagte, er habe keine Zeit.",
        "Sie meinte, das sei kein Problem.",
    ),
    _t(
        "n_declension",
        "B2",
        "The n-declension",
        (),
        (
            "Ask about people by their roles: a colleague, a neighbour, a student, a customer "
            "(Hast du deinem Kollegen geholfen? Was hast du dem Kunden gesagt?)."
        ),
        "Ich habe mit dem Kollegen gesprochen.",
        "Kennst du den Studenten?",
    ),
    _t(
        "two_part_connectors",
        "B2",
        "Two-part connectors",
        (),
        (
            "Ask them to weigh up two sides of a choice (Was spricht für und gegen das Leben in "
            "der Stadt? Je mehr …?)."
        ),
        "Je mehr ich übe, desto besser spreche ich.",
        "Ich spreche sowohl Französisch als auch Englisch.",
    ),
    _t(
        "nominalisation",
        "B2",
        "Nominal style",
        (),
        (
            "Ask about processes and decisions at work or in the news (Wie läuft die Planung bei "
            "euch? Was hältst du von der Entscheidung?)."
        ),
        "Nach der Ankunft gingen wir essen.",
        "Die Planung des Projekts dauert lange.",
    ),
    _t(
        "modal_particles",
        "C1",
        "Modal particles",
        (),
        (
            "Speak naturally with doch, mal, ja and eben yourself, and invite reactions and "
            "suggestions (Komm doch mal vorbei! Das ist ja interessant, oder?)."
        ),
        "Komm doch mal vorbei!",
        "Das ist ja interessant.",
        "Das ist eben so.",
    ),
)
