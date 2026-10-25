"""Grammar notes: the curated reference the Tutor rests its answers on (spec §6.8, §16.1).

One note per kind of mistake a language pack knows (spec §13.3), so that an answer and a
report's correction speak of the same topics. A note states the rule in plain English (the
Tutor writes to the learner in their own explanation language) with sentences in the language
learned. Notes are configuration, like the rest of a language pack.
"""

from dataclasses import dataclass


@dataclass(frozen=True)
class GrammarNote:
    # The kind of mistake it is about (a language pack's error category).
    topic: str
    title: str
    rule: str
    # Sentences that follow the rule, and typical learner sentences that break it.
    right: tuple[str, ...]
    wrong: tuple[str, ...]


GERMAN_NOTES: tuple[GrammarNote, ...] = (
    GrammarNote(
        topic="article_gender",
        title="Article and gender",
        rule=(
            "Every noun is masculine (der), feminine (die) or neuter (das), and its articles and "
            "pronouns follow that gender. The gender is learnt with each noun. Some endings tell "
            "it: -ung, -heit, -keit, -schaft and -ion are feminine; -chen and -lein are neuter. "
            "In a compound noun the last part decides (das Haus + die Tür = die Haustür)."
        ),
        right=("die Zeitung", "das Mädchen", "die Haustür"),
        wrong=("der Zeitung liegt dort", "der Mädchen", "das Haustür"),
    ),
    GrammarNote(
        topic="case_accusative",
        title="Accusative",
        rule=(
            "The direct object of most verbs is in the accusative, and so is everything after "
            "durch, für, gegen, ohne and um. Only the masculine singular changes its article: "
            "der becomes den, ein becomes einen (also keinen, meinen, deinen)."
        ),
        right=("Ich habe einen Bruder.", "Das Geschenk ist für meinen Vater."),
        wrong=("Ich habe ein Bruder.", "Das Geschenk ist für mein Vater."),
    ),
    GrammarNote(
        topic="case_dative",
        title="Dative",
        rule=(
            "The person something is given, shown or told to is in the dative, and so is "
            "everything after aus, bei, mit, nach, seit, von and zu, and the object of verbs such "
            "as helfen, danken, gefallen, gehören and antworten. Articles: der and das become "
            "dem, die becomes der, plural die becomes den and the noun adds -n; ein becomes "
            "einem (masculine, neuter) or einer (feminine)."
        ),
        right=("Ich fahre mit dem Bus.", "Ich helfe meiner Mutter.", "mit den Kindern"),
        wrong=("Ich fahre mit der Bus.", "Ich helfe meine Mutter.", "mit den Kinder"),
    ),
    GrammarNote(
        topic="case_genitive",
        title="Genitive",
        rule=(
            "The genitive shows whose something is: des for masculine and neuter nouns, which "
            "add -s or -es, and der for feminine and plural ones. It follows wegen, während, "
            "trotz and statt in written and careful German. In everyday speech von with the "
            "dative (das Auto von meinem Vater) and wegen with the dative are normal, not "
            "mistakes."
        ),
        right=("das Auto meines Vaters", "wegen des Wetters", "die Tasche meiner Schwester"),
        wrong=("das Auto meines Vater", "die Tasche meines Schwester"),
    ),
    GrammarNote(
        topic="adjective_ending",
        title="Adjective endings",
        rule=(
            "An adjective before a noun takes an ending. After der, die, das (and dieser, "
            "jeder): -e in the nominative singular and in the feminine and neuter accusative, "
            "-en everywhere else. After ein, kein, mein: the adjective shows the gender where "
            "the article does not (ein großer Hund, ein großes Haus), otherwise -e or -en as "
            "after der. With no article it takes the ending der would have had (kalter Kaffee). "
            "After sein or werden an adjective has no ending."
        ),
        right=("der neue Job", "ein neuer Job", "mit dem neuen Job", "Der Job ist neu."),
        wrong=("ein neue Job", "mit dem neue Job", "Der Job ist neue."),
    ),
    GrammarNote(
        topic="word_order_v2",
        title="Verb second in main clauses",
        rule=(
            "In a main clause the conjugated verb is the second element. When something other "
            "than the subject comes first (a time, a place, an object, a whole subordinate "
            "clause), the subject goes right after the verb. Other parts of the verb (a "
            "participle, an infinitive, a separable prefix) go to the end."
        ),
        right=("Gestern habe ich lange gearbeitet.", "Am Wochenende fahre ich nach Berlin."),
        wrong=("Gestern ich habe lange gearbeitet.", "Am Wochenende ich fahre nach Berlin."),
    ),
    GrammarNote(
        topic="word_order_subordinate",
        title="Verb last in subordinate clauses",
        rule=(
            "After weil, dass, wenn, ob, als, obwohl, damit and relative pronouns, the "
            "conjugated verb goes to the very end of the clause. A subordinate clause at the "
            "start counts as the first element, so the main clause goes on with its verb. "
            "After und, aber, oder, denn and sondern the order stays that of a main clause. "
            "Weil with main-clause order is heard in casual speech but is informal."
        ),
        right=("Ich bleibe zu Hause, weil ich keine Zeit habe.", "Wenn ich Zeit habe, komme ich."),
        wrong=("Ich bleibe zu Hause, weil ich habe keine Zeit.", "Wenn ich Zeit habe, ich komme."),
    ),
    GrammarNote(
        topic="separable_verb",
        title="Separable verbs",
        rule=(
            "Many verbs have a prefix that separates in a main clause: in the present and the "
            "simple past the prefix goes to the end (anrufen: Ich rufe dich an). The participle "
            "puts ge- between prefix and verb (angerufen), and zu goes there too (anzurufen). In "
            "a subordinate clause the verb stays whole at the end (weil ich dich anrufe). "
            "Separable prefixes include an, auf, aus, ein, mit, vor, zu, zurück and fern; be-, "
            "emp-, ent-, er-, ge-, miss-, ver- and zer- never separate."
        ),
        right=("Ich stehe um sieben Uhr auf.", "Ich habe ihn gestern angerufen."),
        wrong=("Ich aufstehe um sieben Uhr.", "Ich habe ihn gestern geanrufen."),
    ),
    GrammarNote(
        topic="perfekt_auxiliary",
        title="Perfekt with haben or sein",
        rule=(
            "The Perfekt is haben or sein with the participle. Most verbs take haben. Sein goes "
            "with verbs of moving from one place to another (gehen, fahren, fliegen, kommen), "
            "verbs of a change of state (aufstehen, einschlafen, werden, sterben), and with sein "
            "and bleiben. A movement verb with a direct object takes haben (Ich habe das Auto "
            "gefahren)."
        ),
        right=(
            "Ich bin nach Berlin gefahren.",
            "Ich bin zu Hause geblieben.",
            "Ich habe Deutsch gelernt.",
        ),
        wrong=("Ich habe nach Berlin gefahren.", "Ich habe zu Hause geblieben."),
    ),
    GrammarNote(
        topic="participle_form",
        title="Participle forms",
        rule=(
            "Regular verbs form the participle with ge-, the stem and -t (machen: gemacht). "
            "Irregular verbs end in -en and often change their vowel (schreiben: geschrieben, "
            "gehen: gegangen); those forms are learnt. Verbs ending in -ieren and verbs with an "
            "inseparable prefix (be-, er-, ver-, ent-) take no ge- (studiert, besucht, "
            "verstanden)."
        ),
        right=(
            "Ich habe ein Buch gelesen.",
            "Ich habe Medizin studiert.",
            "Wir haben das Museum besucht.",
        ),
        wrong=(
            "Ich habe ein Buch gelest.",
            "Ich habe Medizin gestudiert.",
            "Wir haben das Museum gebesucht.",
        ),
    ),
    GrammarNote(
        topic="conjugation",
        title="Verb endings",
        rule=(
            "The verb's ending matches its subject: ich -e, du -st, er/sie/es -t, wir -en, "
            "ihr -t, sie and Sie -en. Some irregular verbs change their vowel with du and "
            "er/sie/es (fahren: du fährst, er fährt; sprechen: du sprichst; lesen: er liest). "
            "Sein, haben and the modal verbs have their own forms; a modal verb has no ending "
            "with ich and er (ich kann, er will)."
        ),
        right=("Er spricht Deutsch.", "Du fährst zu schnell.", "Sie kann gut kochen."),
        wrong=("Er sprecht Deutsch.", "Du fahrst zu schnell.", "Sie kannt gut kochen."),
    ),
    GrammarNote(
        topic="preposition_choice",
        title="Which preposition",
        rule=(
            "Going to a city or a country without an article: nach (nach Berlin). To a person, "
            "an event or a place one visits: zu (zum Arzt, zur Arbeit), or in for a building one "
            "goes into (ins Kino). Being there: in (in Berlin), bei with a person (beim Arzt). "
            "Home: nach Hause going, zu Hause being. Many verbs and phrases have a fixed "
            "preposition that is learnt with them: warten auf, denken an, sich interessieren "
            "für, Angst haben vor."
        ),
        right=("Ich fahre nach Italien.", "Ich gehe zum Arzt.", "Ich warte auf den Bus."),
        wrong=("Ich fahre zu Italien.", "Ich gehe nach dem Arzt.", "Ich warte für den Bus."),
    ),
    GrammarNote(
        topic="two_way_preposition",
        title="Prepositions with accusative or dative",
        rule=(
            "An, auf, hinter, in, neben, über, unter, vor and zwischen take the accusative for a "
            "movement to a place (wohin?) and the dative for where something is (wo?). Legen, "
            "stellen, setzen and hängen (putting something somewhere) go with the accusative; "
            "liegen, stehen, sitzen and hängen (being somewhere) with the dative."
        ),
        right=(
            "Ich lege das Buch auf den Tisch.",
            "Das Buch liegt auf dem Tisch.",
            "Ich gehe in die Stadt.",
        ),
        wrong=(
            "Ich lege das Buch auf dem Tisch.",
            "Das Buch liegt auf den Tisch.",
            "Ich bin in die Stadt.",
        ),
    ),
    GrammarNote(
        topic="plural_form",
        title="Plural forms",
        rule=(
            "Nouns form the plural in several ways, learnt with the noun: -e (Tag: Tage), -er "
            "with an umlaut where possible (Kind: Kinder, Buch: Bücher), -n or -en (Frau: "
            "Frauen), -s mostly in borrowed words (Auto: Autos), or no ending, sometimes with an "
            "umlaut (Lehrer: Lehrer, Apfel: Äpfel). The plural article is always die. In the "
            "dative plural the noun adds -n unless it ends in -n or -s already."
        ),
        right=("zwei Bücher", "mit meinen Freunden", "die Autos"),
        wrong=("zwei Buchs", "mit meinen Freunde", "die Autoen"),
    ),
    GrammarNote(
        topic="negation",
        title="nicht or kein",
        rule=(
            "Kein negates a noun that would have ein or no article (Ich habe keine Zeit) and "
            "takes the endings of ein. Nicht negates everything else: a verb, an adjective, an "
            "adverb, a noun with der or a possessive. Nicht stands at the end of the clause, or "
            "before what it negates: before an adjective, a prepositional phrase or the second "
            "part of the verb."
        ),
        right=("Ich habe keine Zeit.", "Ich komme heute nicht.", "Das ist nicht mein Auto."),
        wrong=("Ich habe nicht Zeit.", "Ich nicht komme heute.", "Das ist kein mein Auto."),
    ),
    GrammarNote(
        topic="register_du_sie",
        title="du or Sie",
        rule=(
            "Du (ihr for several people) is for friends, family, children and, in many "
            "workplaces and online, colleagues. Sie, written with a capital S and with the "
            "verb's plural form, is for adults one does not know and formal situations. The "
            "other forms follow: du, dich, dir, dein; Sie, Sie, Ihnen, Ihr. With one person, "
            "keep to one of the two."
        ),
        right=("Kannst du mir helfen?", "Können Sie mir helfen?", "Wie geht es Ihnen?"),
        wrong=("Kann Sie mir helfen?", "Können Sie mir helfen? Wie geht es dir?"),
    ),
    GrammarNote(
        topic="vocabulary_false_friend",
        title="False friends",
        rule=(
            "Some German words look like words of another language but mean something else. "
            "Bekommen means to get or receive (to become is werden); Gift means poison (a "
            "present is ein Geschenk); also means so or therefore; aktuell means current "
            "(actual is tatsächlich); sensibel means sensitive (sensible is vernünftig); "
            "eventuell means possibly (eventually is schließlich); Chef means boss (a cook is "
            "ein Koch)."
        ),
        right=("Ich bekomme ein Geschenk.", "Ich werde müde.", "Mein Chef ist nett."),
        wrong=("Ich bekomme müde.", "Ich habe ein Gift für dich."),
    ),
    GrammarNote(
        topic="lexical_choice",
        title="The usual word",
        rule=(
            "Often two German words share one translation and are not interchangeable. Kennen "
            "is to know a person, a place or a thing; wissen is to know a fact (often with dass, "
            "wo, wie). Lernen is to learn or study; lehren or beibringen is to teach. Fragen is "
            "to ask a question; bitten um is to ask for something. Many nouns go with one verb: "
            "eine Frage stellen, eine Entscheidung treffen, Zeit verbringen."
        ),
        right=("Ich kenne ihn.", "Ich weiß, wo er wohnt.", "Darf ich eine Frage stellen?"),
        wrong=("Ich weiß ihn.", "Ich kenne, wo er wohnt.", "Darf ich eine Frage machen?"),
    ),
)
