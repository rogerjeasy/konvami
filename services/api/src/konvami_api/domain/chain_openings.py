"""The story chain's openings (section 9, design note 2026-11-20-chain-story-design.md).

Each opening is a genre, a title, the narrator's first two sentences and a last sentence the
narrator can always fall back on, written by hand at A2 in the four languages a learner can
learn. Hand-written so a story can start and end without a model, and so the opening can never
be wrong. The narrator (the small text model) writes everything in between.
"""

from collections.abc import Mapping
from dataclasses import dataclass

type Text = Mapping[str, str]

LANGUAGES: tuple[str, ...] = ("de", "en", "fr", "it")
GENRES: tuple[str, ...] = ("mystery", "comedy", "adventure", "fairytale", "future", "everyday")


@dataclass(frozen=True)
class Opening:
    id: str
    genre: str
    title: Text
    # The narrator's opening: the line the first seat hears.
    opening: Text
    # The narrator's last sentence when no model writes one.
    ending: Text


def text_in(text: Text, language: str) -> str:
    return text.get(language) or text["en"]


OPENINGS: tuple[Opening, ...] = (
    Opening(
        id="night-train",
        genre="mystery",
        title={
            "de": "Der Nachtzug",
            "en": "The Night Train",
            "fr": "Le train de nuit",
            "it": "Il treno di notte",
        },
        opening={
            "de": "Es ist Mitternacht im Zug nach Wien. Plötzlich geht das Licht aus, und als es "
            "wieder angeht, ist ein roter Koffer verschwunden.",
            "en": "It is midnight on the train to Vienna. Suddenly the lights go out, and when "
            "they come back on, a red suitcase has disappeared.",
            "fr": "Il est minuit dans le train pour Vienne. Soudain, la lumière s'éteint, et quand "
            "elle revient, une valise rouge a disparu.",
            "it": "È mezzanotte sul treno per Vienna. All'improvviso si spegne la luce, e quando "
            "torna, una valigia rossa è sparita.",
        },
        ending={
            "de": "Am Morgen kam der Zug in Wien an, und alle wussten: Diese Nacht vergessen sie "
            "nie.",
            "en": "In the morning the train reached Vienna, and everyone knew they would never "
            "forget that night.",
            "fr": "Le matin, le train est arrivé à Vienne, et tout le monde savait qu'il "
            "n'oublierait jamais cette nuit.",
            "it": "Al mattino il treno arrivò a Vienna, e tutti sapevano che non avrebbero mai "
            "dimenticato quella notte.",
        },
    ),
    Opening(
        id="wrong-cake",
        genre="comedy",
        title={
            "de": "Die falsche Torte",
            "en": "The Wrong Cake",
            "fr": "Le mauvais gâteau",
            "it": "La torta sbagliata",
        },
        opening={
            "de": "Heute ist Omas neunzigster Geburtstag. Die Bäckerei hat die Torte gebracht, "
            "aber darauf steht: Herzlichen Glückwunsch, Bruno!",
            "en": "Today is Grandma's ninetieth birthday. The bakery has delivered the cake, but "
            "it says: Happy birthday, Bruno!",
            "fr": "Aujourd'hui, c'est le quatre-vingt-dixième anniversaire de mamie. La "
            "boulangerie a livré le gâteau, mais il est écrit dessus : Joyeux anniversaire, "
            "Bruno !",
            "it": "Oggi è il novantesimo compleanno della nonna. La pasticceria ha portato la "
            "torta, ma sopra c'è scritto: Buon compleanno, Bruno!",
        },
        ending={
            "de": "Am Ende lachte Oma am lautesten, und Bruno bekam ein Stück Torte.",
            "en": "In the end Grandma laughed the loudest, and Bruno got a piece of cake.",
            "fr": "À la fin, mamie a ri plus fort que tout le monde, et Bruno a eu une part de "
            "gâteau.",
            "it": "Alla fine la nonna rise più forte di tutti, e Bruno ebbe una fetta di torta.",
        },
    ),
    Opening(
        id="island-map",
        genre="adventure",
        title={
            "de": "Die Karte im Buch",
            "en": "The Map in the Book",
            "fr": "La carte dans le livre",
            "it": "La mappa nel libro",
        },
        opening={
            "de": "In einem alten Buch vom Flohmarkt liegt eine Karte. Sie zeigt eine kleine "
            "Insel im See, und neben einem Baum ist ein Kreuz.",
            "en": "Inside an old book from the flea market there is a map. It shows a small "
            "island in the lake, and next to a tree there is a cross.",
            "fr": "Dans un vieux livre du marché aux puces, il y a une carte. Elle montre une "
            "petite île sur le lac, et à côté d'un arbre, il y a une croix.",
            "it": "Dentro un vecchio libro del mercatino c'è una mappa. Mostra una piccola isola "
            "nel lago, e vicino a un albero c'è una croce.",
        },
        ending={
            "de": "Unter dem Baum fanden sie keinen Schatz, aber einen Brief, der alles erklärte.",
            "en": "Under the tree they found no treasure, but a letter that explained everything.",
            "fr": "Sous l'arbre, ils n'ont pas trouvé de trésor, mais une lettre qui expliquait "
            "tout.",
            "it": "Sotto l'albero non trovarono un tesoro, ma una lettera che spiegava tutto.",
        },
    ),
    Opening(
        id="talking-cat",
        genre="fairytale",
        title={
            "de": "Die Katze, die sprechen konnte",
            "en": "The Cat Who Could Talk",
            "fr": "Le chat qui parlait",
            "it": "Il gatto che parlava",
        },
        opening={
            "de": "Es war einmal eine Katze, die nur am Montag sprechen konnte. An einem Montag "
            "sagte sie: Ich brauche eure Hilfe, bevor die Sonne untergeht.",
            "en": "Once upon a time there was a cat who could only talk on Mondays. One Monday "
            "it said: I need your help before the sun goes down.",
            "fr": "Il était une fois un chat qui ne parlait que le lundi. Un lundi, il a dit : "
            "J'ai besoin de votre aide avant le coucher du soleil.",
            "it": "C'era una volta un gatto che parlava solo il lunedì. Un lunedì disse: Ho "
            "bisogno del vostro aiuto prima del tramonto.",
        },
        ending={
            "de": "Als die Sonne unterging, schnurrte die Katze zufrieden und schwieg bis zum "
            "nächsten Montag.",
            "en": "When the sun went down, the cat purred happily and said nothing until the "
            "next Monday.",
            "fr": "Quand le soleil s'est couché, le chat a ronronné, content, et n'a plus rien "
            "dit jusqu'au lundi suivant.",
            "it": "Quando il sole tramontò, il gatto fece le fusa, contento, e tacque fino al "
            "lunedì dopo.",
        },
    ),
    Opening(
        id="robot-flat",
        genre="future",
        title={
            "de": "Der Roboter in der WG",
            "en": "The Robot Flatmate",
            "fr": "Le robot colocataire",
            "it": "Il robot coinquilino",
        },
        opening={
            "de": "Im Jahr 2080 bekommt unsere WG einen neuen Mitbewohner: einen Roboter, der "
            "perfekt kocht. Am ersten Abend kocht er aber nur Suppe aus Socken.",
            "en": "In the year 2080 our flat gets a new flatmate: a robot that cooks perfectly. "
            "But on the first evening it only makes soup out of socks.",
            "fr": "En 2080, notre colocation accueille un nouveau colocataire : un robot qui "
            "cuisine parfaitement. Mais le premier soir, il ne fait que de la soupe de "
            "chaussettes.",
            "it": "Nel 2080 il nostro appartamento ha un nuovo coinquilino: un robot che cucina "
            "benissimo. Ma la prima sera prepara solo una zuppa di calzini.",
        },
        ending={
            "de": "Seitdem kocht der Roboter jeden Freitag, und niemand vermisst seine Socken.",
            "en": "Since then the robot cooks every Friday, and nobody misses their socks.",
            "fr": "Depuis, le robot cuisine tous les vendredis, et personne ne regrette ses "
            "chaussettes.",
            "it": "Da allora il robot cucina ogni venerdì, e nessuno sente la mancanza dei suoi "
            "calzini.",
        },
    ),
    Opening(
        id="lost-keys",
        genre="everyday",
        title={
            "de": "Der Schlüssel im Schnee",
            "en": "The Key in the Snow",
            "fr": "La clé dans la neige",
            "it": "La chiave nella neve",
        },
        opening={
            "de": "Es schneit, und Mia steht vor ihrer Haustür. Ihr Schlüssel ist weg, ihr "
            "Handy hat nur noch zwei Prozent Akku, und in einer Stunde kommt ihr Besuch.",
            "en": "It is snowing, and Mia is standing at her front door. Her key is gone, her "
            "phone has only two percent battery, and her guests arrive in an hour.",
            "fr": "Il neige, et Mia est devant sa porte. Sa clé a disparu, son téléphone n'a plus "
            "que deux pour cent de batterie, et ses invités arrivent dans une heure.",
            "it": "Nevica, e Mia è davanti alla porta di casa. La chiave non c'è più, il "
            "telefono ha solo il due per cento di batteria, e gli ospiti arrivano tra un'ora.",
        },
        ending={
            "de": "Um acht Uhr saßen alle warm in der Küche, und der Schlüssel hing endlich am "
            "Haken.",
            "en": "At eight o'clock everyone sat warm in the kitchen, and the key was finally "
            "back on its hook.",
            "fr": "À huit heures, tout le monde était au chaud dans la cuisine, et la clé était "
            "enfin à son crochet.",
            "it": "Alle otto erano tutti al caldo in cucina, e la chiave era finalmente al suo "
            "gancio.",
        },
    ),
)

# What an AI character says when no model writes its line: sentences that go on with any story.
FALLBACK_LINES: Mapping[str, tuple[str, ...]] = {
    "de": (
        "Dann hörten wir plötzlich ein seltsames Geräusch hinter der Tür.",
        "Ich hatte eine Idee, aber sie war ein bisschen verrückt.",
        "Niemand sagte etwas, und alle schauten mich an.",
        "Genau in diesem Moment klingelte mein Telefon.",
        "Wir beschlossen, zusammen weiterzugehen.",
        "Auf dem Boden lag ein kleiner Zettel mit einer Nachricht.",
        "Da lachte jemand laut, und die Stimmung wurde besser.",
        "Zum Glück wussten wir jetzt, was wir tun mussten.",
    ),
    "en": (
        "Then suddenly we heard a strange noise behind the door.",
        "I had an idea, but it was a little bit crazy.",
        "Nobody said anything, and everyone looked at me.",
        "At exactly that moment my phone rang.",
        "We decided to go on together.",
        "On the floor there was a small note with a message.",
        "Then someone laughed out loud, and the mood got better.",
        "Luckily we now knew what we had to do.",
    ),
    "fr": (
        "Puis, soudain, nous avons entendu un bruit bizarre derrière la porte.",
        "J'avais une idée, mais elle était un peu folle.",
        "Personne n'a rien dit, et tout le monde m'a regardé.",
        "Juste à ce moment-là, mon téléphone a sonné.",
        "Nous avons décidé de continuer ensemble.",
        "Par terre, il y avait un petit papier avec un message.",
        "Alors quelqu'un a ri très fort, et l'ambiance est devenue meilleure.",
        "Heureusement, maintenant nous savions quoi faire.",
    ),
    "it": (
        "Poi all'improvviso abbiamo sentito un rumore strano dietro la porta.",
        "Avevo un'idea, ma era un po' pazza.",
        "Nessuno diceva niente, e tutti mi guardavano.",
        "Proprio in quel momento è squillato il mio telefono.",
        "Abbiamo deciso di andare avanti insieme.",
        "Per terra c'era un piccolo biglietto con un messaggio.",
        "Allora qualcuno ha riso forte, e l'atmosfera è migliorata.",
        "Per fortuna adesso sapevamo cosa fare.",
    ),
}

# The AI characters who fill empty seats, by the language they speak: always shown as AI.
AI_NAMES: Mapping[str, tuple[str, ...]] = {
    "de": ("Lena", "Max", "Pia"),
    "en": ("Ruby", "Finn", "Maya"),
    "fr": ("Léa", "Hugo", "Inès"),
    "it": ("Sofia", "Luca", "Marta"),
}


def opening(opening_id: str) -> Opening | None:
    return next((one for one in OPENINGS if one.id == opening_id), None)
