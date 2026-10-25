"""The sentences of the accuracy test (spec §16.2 "verbatim transcription fidelity", §18 phase 0
spike d): typical learner German, each with one known mistake, and correct sentences to compare.

`error` is the learner's words that a faithful transcript keeps; `fixed` is what a transcript
that tidied the mistake away writes instead. Both are in the sentence's own words, so a
transcript can be judged by looking for them.
"""

from dataclasses import dataclass


@dataclass(frozen=True)
class Sample:
    id: str
    # The sentence as the learner says it.
    said: str
    # A language pack's kind of mistake; None for a correct sentence.
    category: str | None = None
    error: str | None = None
    fixed: str | None = None


def _m(id: str, category: str, said: str, error: str, fixed: str) -> Sample:
    return Sample(id, said, category, error, fixed)


MISTAKES: tuple[Sample, ...] = (
    _m(
        "gender_1",
        "article_gender",
        "Der Zeitung liegt auf dem Tisch.",
        "Der Zeitung",
        "Die Zeitung",
    ),
    _m(
        "gender_2",
        "article_gender",
        "Das Auto ist neu, aber der Haus ist alt.",
        "der Haus",
        "das Haus",
    ),
    _m(
        "gender_3",
        "article_gender",
        "Die Problem ist, dass ich keine Zeit habe.",
        "Die Problem",
        "Das Problem",
    ),
    _m(
        "accusative_1",
        "case_accusative",
        "Ich habe ein Bruder und eine Schwester.",
        "ein Bruder",
        "einen Bruder",
    ),
    _m(
        "accusative_2",
        "case_accusative",
        "Ich sehe der Mann jeden Morgen im Bus.",
        "sehe der Mann",
        "sehe den Mann",
    ),
    _m(
        "accusative_3",
        "case_accusative",
        "Das Geschenk ist für mein Vater.",
        "für mein Vater",
        "für meinen Vater",
    ),
    _m(
        "dative_1",
        "case_dative",
        "Ich fahre jeden Tag mit der Bus zur Arbeit.",
        "mit der Bus",
        "mit dem Bus",
    ),
    _m(
        "dative_2",
        "case_dative",
        "Am Wochenende helfe ich meine Mutter im Garten.",
        "ich meine Mutter",
        "ich meiner Mutter",
    ),
    _m(
        "dative_3",
        "case_dative",
        "Ich wohne bei meine Freundin in Zürich.",
        "bei meine Freundin",
        "bei meiner Freundin",
    ),
    _m(
        "genitive_1",
        "case_genitive",
        "Das ist das Auto meines Vater.",
        "meines Vater",
        "meines Vaters",
    ),
    _m(
        "genitive_2",
        "case_genitive",
        "Wegen das Wetter bleiben wir zu Hause.",
        "Wegen das Wetter",
        "Wegen des Wetters",
    ),
    _m(
        "genitive_3",
        "case_genitive",
        "Die Tasche meines Schwester ist rot.",
        "meines Schwester",
        "meiner Schwester",
    ),
    _m(
        "adjective_1",
        "adjective_ending",
        "Ich habe einen neue Job in Basel.",
        "einen neue Job",
        "einen neuen Job",
    ),
    _m(
        "adjective_2",
        "adjective_ending",
        "Wir wohnen in einer kleine Wohnung.",
        "einer kleine Wohnung",
        "einer kleinen Wohnung",
    ),
    _m(
        "adjective_3",
        "adjective_ending",
        "Er trinkt jeden Morgen kalte Kaffee.",
        "kalte Kaffee",
        "kalten Kaffee",
    ),
    _m(
        "v2_1",
        "word_order_v2",
        "Gestern ich habe lange gearbeitet.",
        "Gestern ich habe",
        "Gestern habe ich",
    ),
    _m(
        "v2_2",
        "word_order_v2",
        "Am Wochenende ich fahre nach Berlin.",
        "Wochenende ich fahre",
        "Wochenende fahre ich",
    ),
    _m(
        "v2_3",
        "word_order_v2",
        "Morgen wir gehen ins Kino.",
        "Morgen wir gehen",
        "Morgen gehen wir",
    ),
    _m(
        "subordinate_1",
        "word_order_subordinate",
        "Ich glaube, dass er kommt morgen.",
        "er kommt morgen",
        "er morgen kommt",
    ),
    _m(
        "subordinate_2",
        "word_order_subordinate",
        "Ich weiß nicht, ob er hat Zeit.",
        "ob er hat Zeit",
        "ob er Zeit hat",
    ),
    _m(
        "subordinate_3",
        "word_order_subordinate",
        "Ich lerne Deutsch, damit ich kann in der Schweiz arbeiten.",
        "ich kann in der Schweiz",
        "ich in der Schweiz arbeiten kann",
    ),
    _m(
        "separable_1",
        "separable_verb",
        "Ich aufstehe jeden Tag um sieben Uhr.",
        "Ich aufstehe",
        "Ich stehe",
    ),
    _m(
        "separable_2",
        "separable_verb",
        "Ich habe dich gestern geanrufen.",
        "geanrufen",
        "angerufen",
    ),
    _m("separable_3", "separable_verb", "Der Zug abfährt um acht Uhr.", "Zug abfährt", "Zug fährt"),
    _m(
        "perfekt_1",
        "perfekt_auxiliary",
        "Ich habe gestern nach Berlin gefahren.",
        "habe gestern nach Berlin",
        "bin gestern nach Berlin",
    ),
    _m(
        "perfekt_2",
        "perfekt_auxiliary",
        "Wir haben am Sonntag zu Hause geblieben.",
        "haben am Sonntag zu Hause",
        "sind am Sonntag zu Hause",
    ),
    _m(
        "perfekt_3",
        "perfekt_auxiliary",
        "Er hat gestern spät nach Hause gekommen.",
        "Er hat gestern",
        "Er ist gestern",
    ),
    _m(
        "participle_1",
        "participle_form",
        "Ich habe ein spannendes Buch gelest.",
        "gelest",
        "gelesen",
    ),
    _m(
        "participle_2",
        "participle_form",
        "Ich habe drei Jahre Medizin gestudiert.",
        "gestudiert",
        "studiert",
    ),
    _m(
        "participle_3",
        "participle_form",
        "Wir haben am Samstag das Museum gebesucht.",
        "gebesucht",
        "besucht",
    ),
    _m("conjugation_1", "conjugation", "Er sprecht sehr gut Deutsch.", "Er sprecht", "Er spricht"),
    _m("conjugation_2", "conjugation", "Du fahrst immer zu schnell.", "Du fahrst", "Du fährst"),
    _m(
        "conjugation_3",
        "conjugation",
        "Meine Mutter kannt sehr gut kochen.",
        "Mutter kannt",
        "Mutter kann",
    ),
    _m(
        "preposition_1",
        "preposition_choice",
        "Im Sommer fahre ich zu Italien.",
        "zu Italien",
        "nach Italien",
    ),
    _m(
        "preposition_2",
        "preposition_choice",
        "Ich warte schon lange für den Bus.",
        "für den Bus",
        "auf den Bus",
    ),
    _m(
        "preposition_3",
        "preposition_choice",
        "Morgen gehe ich nach dem Arzt.",
        "nach dem Arzt",
        "zum Arzt",
    ),
    _m(
        "two_way_1",
        "two_way_preposition",
        "Ich lege das Buch auf dem Tisch.",
        "auf dem Tisch",
        "auf den Tisch",
    ),
    _m(
        "two_way_2",
        "two_way_preposition",
        "Das Bild hängt an die Wand.",
        "an die Wand",
        "an der Wand",
    ),
    _m(
        "two_way_3",
        "two_way_preposition",
        "Die Kinder spielen in den Garten.",
        "in den Garten",
        "im Garten",
    ),
    _m("plural_1", "plural_form", "Ich habe zwei Buchs gekauft.", "zwei Buchs", "zwei Bücher"),
    _m(
        "plural_2",
        "plural_form",
        "Ich gehe mit meinen Freunde ins Kino.",
        "meinen Freunde ins",
        "meinen Freunden ins",
    ),
    _m("plural_3", "plural_form", "Wir haben drei Kinds.", "drei Kinds", "drei Kinder"),
    _m("negation_1", "negation", "Ich habe heute nicht Zeit.", "nicht Zeit", "keine Zeit"),
    _m("negation_2", "negation", "Ich nicht komme heute.", "Ich nicht komme", "Ich komme"),
    _m("negation_3", "negation", "Das ist kein mein Auto.", "kein mein Auto", "nicht mein Auto"),
    _m(
        "register_1",
        "register_du_sie",
        "Guten Tag, Frau Weber, wie geht es dir?",
        "geht es dir",
        "geht es Ihnen",
    ),
    _m(
        "register_2",
        "register_du_sie",
        "Herr Doktor, hast du morgen einen Termin frei?",
        "hast du morgen",
        "haben Sie morgen",
    ),
    _m(
        "register_3",
        "register_du_sie",
        "Können Sie mir helfen? Ich danke dir sehr.",
        "danke dir",
        "danke Ihnen",
    ),
    _m(
        "false_friend_1",
        "vocabulary_false_friend",
        "Am Abend bekomme ich immer müde.",
        "bekomme ich immer müde",
        "werde ich immer müde",
    ),
    _m(
        "false_friend_2",
        "vocabulary_false_friend",
        "Ich habe ein Gift für deinen Geburtstag gekauft.",
        "ein Gift",
        "ein Geschenk",
    ),
    _m(
        "false_friend_3",
        "vocabulary_false_friend",
        "Danke, das Essen war super, ich bin voll.",
        "ich bin voll",
        "ich bin satt",
    ),
    _m(
        "lexical_1",
        "lexical_choice",
        "Ich weiß ihn seit zehn Jahren.",
        "Ich weiß ihn",
        "Ich kenne ihn",
    ),
    _m(
        "lexical_2",
        "lexical_choice",
        "Darf ich eine Frage machen?",
        "Frage machen",
        "Frage stellen",
    ),
    _m(
        "lexical_3",
        "lexical_choice",
        "Ich habe drei Tage in Berlin gemacht.",
        "Tage in Berlin gemacht",
        "Tage in Berlin verbracht",
    ),
)

# Correct sentences, some of them ordinary spoken German, which nothing should "correct".
CONTROLS: tuple[Sample, ...] = (
    Sample("control_1", "Ich bin gestern mit dem Zug nach Basel gefahren."),
    Sample("control_2", "Am Wochenende habe ich meine Eltern besucht."),
    Sample("control_3", "Ich glaube, dass es morgen regnet."),
    Sample("control_4", "Wir wohnen seit drei Jahren in einer kleinen Wohnung."),
    Sample("control_5", "Kannst du mir bitte das Salz geben?"),
    Sample("control_6", "Ich habe keine Zeit, weil ich arbeiten muss."),
    Sample("control_7", "Meine Schwester spricht sehr gut Französisch."),
    Sample("control_8", "Ich stehe jeden Morgen um sieben Uhr auf."),
    Sample("control_9", "Das Buch liegt auf dem Tisch."),
    Sample("control_10", "Ich warte schon seit zwanzig Minuten auf den Bus."),
    Sample("control_11", "Darf ich Ihnen eine Frage stellen?"),
    Sample("control_12", "Ich kenne ihn seit meiner Kindheit."),
    Sample("control_13", "Ja, genau, das finde ich auch."),
    Sample("control_14", "Hab ich schon gesehen, war echt gut."),
    Sample("control_15", "Ähm, ich weiß nicht so genau, vielleicht morgen."),
)
