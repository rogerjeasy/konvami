# ruff: noqa: E501, RUF001, RUF002 - multilingual prose and answer options, kept one per line
"""The cases of Two Halves (7.x, design note 2026-11-20-two-halves-design.md), written by hand.

A case is a small everyday mystery split in two. Each seat holds three clues; in each round a
seat tells the other one of them, by voice, in the language it is learning. The listener proves
the clue got through by answering a question on the board about it. After three rounds each,
both answer the case's question, which needs the clues of both halves.

Every clue, question and title is written once in each of the four languages Konvami teaches
(German, English, French, Italian), so one case serves every pair of languages: a seat reads its
clue in the language it speaks, the other reads the question in its interface language. Answer
options are either neutral (a time, a number, a name) or written in the four languages too.

The wording is for A2–B1; the learner's own partner adapts it in the briefing (7.5).
"""

from collections.abc import Mapping
from dataclasses import dataclass
from typing import Literal

type Seat = Literal["A", "B"]
type Lang = Literal["de", "en", "fr", "it"]
# A text is written in the four languages, or neutral (the same in all of them).
type Text = str | Mapping[str, str]

LANGUAGES: tuple[str, ...] = ("de", "en", "fr", "it")
# Each seat sends this many moves in a case.
ROUNDS = 3


def text_in(text: Text, language: str) -> str:
    """`text` in `language`; English when it is not written in that one."""
    if isinstance(text, str):
        return text
    return text.get(language) or text["en"]


def _t(de: str, en: str, fr: str, it: str) -> Mapping[str, str]:
    return {"de": de, "en": en, "fr": fr, "it": it}


@dataclass(frozen=True)
class Clue:
    seat: Seat
    round: int
    # What the seat that holds it has to tell.
    says: Mapping[str, str]
    # The question on the other seat's board that only this clue answers.
    asks: Mapping[str, str]
    options: tuple[Text, ...]
    answer: int


@dataclass(frozen=True)
class CaseTemplate:
    id: str
    title: Mapping[str, str]
    # What happened and what the two have to find out, shown to both.
    setting: Mapping[str, str]
    clues: tuple[Clue, ...]
    question: Mapping[str, str]
    options: tuple[Text, ...]
    answer: int
    # How it ends, for the recap scene.
    ending: Mapping[str, str]

    def clue(self, seat: Seat, round_number: int) -> Clue:
        return next(c for c in self.clues if c.seat == seat and c.round == round_number)


def _other(seat: Seat) -> Seat:
    return "B" if seat == "A" else "A"


other_seat = _other


LOST_CELLO = CaseTemplate(
    id="lost_cello",
    title=_t(
        "Das verlorene Cello", "The Lost Cello", "Le violoncelle perdu", "Il violoncello perduto"
    ),
    setting=_t(
        "Die Cellistin Inès ist von Lyon nach Zürich gefahren. Ihr Cello ist weg. Wo ist es?",
        "The cellist Inès travelled from Lyon to Zurich. Her cello is gone. Where is it?",
        "La violoncelliste Inès a voyagé de Lyon à Zurich. Son violoncelle a disparu. Où est-il ?",
        "La violoncellista Inès è andata da Lione a Zurigo. Il suo violoncello è sparito. Dov'è?",
    ),
    clues=(
        Clue(
            "A",
            1,
            _t(
                "Ein Schaffner hat um 14:20 Uhr einen großen schwarzen Cellokasten auf Gleis 4 gesehen.",
                "A conductor saw a big black cello case on platform 4 at 14:20.",
                "Un contrôleur a vu une grande housse de violoncelle noire sur le quai 4 à 14 h 20.",
                "Un controllore ha visto una grande custodia nera di violoncello sul binario 4 alle 14:20.",
            ),
            _t(
                "Um wie viel Uhr wurde der Kasten gesehen?",
                "At what time was the case seen?",
                "À quelle heure a-t-on vu la housse ?",
                "A che ora è stata vista la custodia?",
            ),
            ("13:50", "14:20", "15:10"),
            1,
        ),
        Clue(
            "B",
            1,
            _t(
                "Inès ist in Genf umgestiegen. Im zweiten Zug hatte sie kein Cello mehr.",
                "Inès changed trains in Geneva. On the second train she had no cello any more.",
                "Inès a changé de train à Genève. Dans le deuxième train, elle n'avait plus son violoncelle.",
                "Inès ha cambiato treno a Ginevra. Sul secondo treno non aveva più il violoncello.",
            ),
            _t(
                "Wo ist Inès umgestiegen?",
                "Where did Inès change trains?",
                "Où Inès a-t-elle changé de train ?",
                "Dove ha cambiato treno Inès?",
            ),
            (
                _t("In Bern", "In Bern", "À Berne", "A Berna"),
                _t("In Genf", "In Geneva", "À Genève", "A Ginevra"),
                _t("In Basel", "In Basel", "À Bâle", "A Basilea"),
            ),
            1,
        ),
        Clue(
            "A",
            2,
            _t(
                "Das Fundbüro in Lyon hat einen Cellokasten mit einem roten Band.",
                "The lost property office in Lyon has a cello case with a red ribbon.",
                "Les objets trouvés de Lyon ont une housse de violoncelle avec un ruban rouge.",
                "L'ufficio oggetti smarriti di Lione ha una custodia con un nastro rosso.",
            ),
            _t(
                "Welche Farbe hat das Band?",
                "What colour is the ribbon?",
                "De quelle couleur est le ruban ?",
                "Di che colore è il nastro?",
            ),
            (
                _t("Rot", "Red", "Rouge", "Rosso"),
                _t("Blau", "Blue", "Bleu", "Blu"),
                _t("Grün", "Green", "Vert", "Verde"),
            ),
            0,
        ),
        Clue(
            "B",
            2,
            _t(
                "Inès sagt: Im Kasten steht ihr Name, und am Griff hängt ein rotes Band.",
                "Inès says: her name is inside the case, and a red ribbon hangs on the handle.",
                "Inès dit : son nom est à l'intérieur de la housse, et un ruban rouge pend à la poignée.",
                "Inès dice: dentro la custodia c'è il suo nome, e un nastro rosso pende dalla maniglia.",
            ),
            _t(
                "Was steht im Kasten?",
                "What is written inside the case?",
                "Qu'est-ce qui est écrit dans la housse ?",
                "Che cosa c'è scritto nella custodia?",
            ),
            (
                _t("Ihr Name", "Her name", "Son nom", "Il suo nome"),
                _t(
                    "Eine Telefonnummer",
                    "A phone number",
                    "Un numéro de téléphone",
                    "Un numero di telefono",
                ),
                _t("Eine Adresse", "An address", "Une adresse", "Un indirizzo"),
            ),
            0,
        ),
        Clue(
            "A",
            3,
            _t(
                "Das Fundbüro schließt am Freitag um 18:00 Uhr.",
                "The lost property office closes at 18:00 on Friday.",
                "Les objets trouvés ferment à 18 h le vendredi.",
                "L'ufficio oggetti smarriti chiude alle 18:00 il venerdì.",
            ),
            _t(
                "Wann schließt das Fundbüro am Freitag?",
                "When does the office close on Friday?",
                "À quelle heure ferment les objets trouvés le vendredi ?",
                "A che ora chiude l'ufficio il venerdì?",
            ),
            ("17:00", "18:00", "19:00"),
            1,
        ),
        Clue(
            "B",
            3,
            _t(
                "Inès kann am Freitag um 17:30 Uhr wieder in Lyon sein.",
                "Inès can be back in Lyon on Friday at 17:30.",
                "Inès peut être de retour à Lyon vendredi à 17 h 30.",
                "Inès può essere di nuovo a Lione venerdì alle 17:30.",
            ),
            _t(
                "Wann kann Inès in Lyon sein?",
                "When can Inès be in Lyon?",
                "Quand Inès peut-elle être à Lyon ?",
                "Quando può essere a Lione Inès?",
            ),
            ("16:00", "17:30", "19:15"),
            1,
        ),
    ),
    question=_t(
        "Wo ist das Cello, und schafft Inès es rechtzeitig?",
        "Where is the cello, and can Inès get it in time?",
        "Où est le violoncelle, et Inès peut-elle le récupérer à temps ?",
        "Dov'è il violoncello, e Inès riesce a prenderlo in tempo?",
    ),
    options=(
        _t(
            "Im Fundbüro Lyon – ja, am Freitag",
            "At Lyon lost property – yes, on Friday",
            "Aux objets trouvés de Lyon – oui, vendredi",
            "All'ufficio di Lione – sì, venerdì",
        ),
        _t(
            "Im Zug nach Zürich – nein",
            "On the train to Zurich – no",
            "Dans le train pour Zurich – non",
            "Sul treno per Zurigo – no",
        ),
        _t(
            "In Genf – ja, am Samstag",
            "In Geneva – yes, on Saturday",
            "À Genève – oui, samedi",
            "A Ginevra – sì, sabato",
        ),
    ),
    answer=0,
    ending=_t(
        "Inès holt ihr Cello am Freitag um 17:45 Uhr im Fundbüro in Lyon ab.",
        "Inès picks up her cello at Lyon lost property on Friday at 17:45.",
        "Inès récupère son violoncelle aux objets trouvés de Lyon vendredi à 17 h 45.",
        "Inès ritira il suo violoncello all'ufficio di Lione venerdì alle 17:45.",
    ),
)

GRANDMA_RECIPE = CaseTemplate(
    id="grandma_recipe",
    title=_t(
        "Omas Rezept", "Grandma's Recipe", "La recette de grand-mère", "La ricetta della nonna"
    ),
    setting=_t(
        "Oma Rosa hat ihr Kuchenrezept in zwei Hälften aufgeschrieben. Morgen ist das Familienfest.",
        "Grandma Rosa wrote her cake recipe in two halves. The family party is tomorrow.",
        "Grand-mère Rosa a écrit sa recette de gâteau en deux moitiés. La fête de famille est demain.",
        "Nonna Rosa ha scritto la ricetta della torta in due metà. La festa di famiglia è domani.",
    ),
    clues=(
        Clue(
            "A",
            1,
            _t(
                "Oma Rosa nimmt 250 Gramm Mehl.",
                "Grandma Rosa uses 250 grams of flour.",
                "Grand-mère Rosa met 250 grammes de farine.",
                "Nonna Rosa usa 250 grammi di farina.",
            ),
            _t("Wie viel Mehl?", "How much flour?", "Combien de farine ?", "Quanta farina?"),
            ("150 g", "250 g", "500 g"),
            1,
        ),
        Clue(
            "B",
            1,
            _t(
                "Der Kuchen bäckt 40 Minuten.",
                "The cake bakes for 40 minutes.",
                "Le gâteau cuit 40 minutes.",
                "La torta cuoce 40 minuti.",
            ),
            _t(
                "Wie lange bäckt der Kuchen?",
                "How long does the cake bake?",
                "Combien de temps cuit le gâteau ?",
                "Quanto tempo cuoce la torta?",
            ),
            ("20 min", "40 min", "60 min"),
            1,
        ),
        Clue(
            "A",
            2,
            _t(
                "Sie gibt drei Eier dazu, nie vier.",
                "She adds three eggs, never four.",
                "Elle ajoute trois œufs, jamais quatre.",
                "Aggiunge tre uova, mai quattro.",
            ),
            _t("Wie viele Eier?", "How many eggs?", "Combien d'œufs ?", "Quante uova?"),
            ("2", "3", "4"),
            1,
        ),
        Clue(
            "B",
            2,
            _t(
                "Der Ofen muss 180 Grad heiß sein.",
                "The oven has to be at 180 degrees.",
                "Le four doit être à 180 degrés.",
                "Il forno deve essere a 180 gradi.",
            ),
            _t(
                "Wie heiß ist der Ofen?",
                "How hot is the oven?",
                "À quelle température est le four ?",
                "A che temperatura è il forno?",
            ),
            ("160 °C", "180 °C", "220 °C"),
            1,
        ),
        Clue(
            "A",
            3,
            _t(
                "Das Geheimnis ist ein Löffel Honig.",
                "The secret is a spoonful of honey.",
                "Le secret, c'est une cuillère de miel.",
                "Il segreto è un cucchiaio di miele.",
            ),
            _t(
                "Was ist die geheime Zutat?",
                "What is the secret ingredient?",
                "Quel est l'ingrédient secret ?",
                "Qual è l'ingrediente segreto?",
            ),
            (
                _t("Honig", "Honey", "Du miel", "Miele"),
                _t("Salz", "Salt", "Du sel", "Sale"),
                _t("Kaffee", "Coffee", "Du café", "Caffè"),
            ),
            0,
        ),
        Clue(
            "B",
            3,
            _t(
                "Das Fest beginnt um 16:00 Uhr, also fangt um 14:30 Uhr an zu backen.",
                "The party starts at 16:00, so start baking at 14:30.",
                "La fête commence à 16 h, alors commencez à cuisiner à 14 h 30.",
                "La festa comincia alle 16:00, quindi iniziate a cucinare alle 14:30.",
            ),
            _t(
                "Wann fangt ihr an zu backen?",
                "When do you start baking?",
                "Quand commencez-vous à cuisiner ?",
                "Quando iniziate a cucinare?",
            ),
            ("13:00", "14:30", "15:30"),
            1,
        ),
    ),
    question=_t(
        "Welcher Kuchen ist Omas Kuchen?",
        "Which cake is Grandma's?",
        "Quel gâteau est celui de grand-mère ?",
        "Qual è la torta della nonna?",
    ),
    options=(
        _t(
            "Honigkuchen, 3 Eier, 40 Minuten bei 180 °C",
            "Honey cake, 3 eggs, 40 minutes at 180 °C",
            "Gâteau au miel, 3 œufs, 40 minutes à 180 °C",
            "Torta al miele, 3 uova, 40 minuti a 180 °C",
        ),
        _t(
            "Schokoladenkuchen, 4 Eier, 30 Minuten",
            "Chocolate cake, 4 eggs, 30 minutes",
            "Gâteau au chocolat, 4 œufs, 30 minutes",
            "Torta al cioccolato, 4 uova, 30 minuti",
        ),
        _t(
            "Honigkuchen, 2 Eier, 60 Minuten bei 160 °C",
            "Honey cake, 2 eggs, 60 minutes at 160 °C",
            "Gâteau au miel, 2 œufs, 60 minutes à 160 °C",
            "Torta al miele, 2 uova, 60 minuti a 160 °C",
        ),
    ),
    answer=0,
    ending=_t(
        "Um 16:00 Uhr steht Omas Honigkuchen auf dem Tisch, und alle wollen ein zweites Stück.",
        "At 16:00 Grandma's honey cake is on the table, and everyone wants a second piece.",
        "À 16 h, le gâteau au miel de grand-mère est sur la table, et tout le monde en reveut.",
        "Alle 16:00 la torta al miele della nonna è in tavola, e tutti ne vogliono un'altra fetta.",
    ),
)

MISSED_CONNECTION = CaseTemplate(
    id="missed_connection",
    title=_t(
        "Der verpasste Anschluss",
        "The Missed Connection",
        "La correspondance manquée",
        "La coincidenza persa",
    ),
    setting=_t(
        "Euer Freund Marco kommt heute zu Besuch, aber er hat seinen Zug verpasst. Wo und wann trefft ihr ihn?",
        "Your friend Marco is visiting today, but he missed his train. Where and when do you meet him?",
        "Votre ami Marco vient aujourd'hui, mais il a raté son train. Où et quand le retrouvez-vous ?",
        "Il vostro amico Marco arriva oggi, ma ha perso il treno. Dove e quando lo incontrate?",
    ),
    clues=(
        Clue(
            "A",
            1,
            _t(
                "Marco hat den Zug in Mailand verpasst. Er nimmt den nächsten um 10:05 Uhr.",
                "Marco missed his train in Milan. He takes the next one at 10:05.",
                "Marco a raté son train à Milan. Il prend le suivant à 10 h 05.",
                "Marco ha perso il treno a Milano. Prende il prossimo alle 10:05.",
            ),
            _t(
                "Wann fährt Marcos neuer Zug ab?",
                "When does Marco's new train leave?",
                "À quelle heure part le nouveau train de Marco ?",
                "A che ora parte il nuovo treno di Marco?",
            ),
            ("09:35", "10:05", "11:15"),
            1,
        ),
        Clue(
            "B",
            1,
            _t(
                "Der Zug von 10:05 Uhr kommt auf Gleis 7 an.",
                "The 10:05 train arrives on platform 7.",
                "Le train de 10 h 05 arrive sur le quai 7.",
                "Il treno delle 10:05 arriva al binario 7.",
            ),
            _t("Auf welchem Gleis?", "On which platform?", "Sur quel quai ?", "A quale binario?"),
            ("3", "7", "11"),
            1,
        ),
        Clue(
            "A",
            2,
            _t(
                "Marcos Handy-Akku ist leer, er kann nicht anrufen.",
                "Marco's phone battery is empty, he can't call.",
                "La batterie du téléphone de Marco est vide, il ne peut pas appeler.",
                "La batteria del telefono di Marco è scarica, non può chiamare.",
            ),
            _t(
                "Warum kann Marco nicht anrufen?",
                "Why can't Marco call?",
                "Pourquoi Marco ne peut-il pas appeler ?",
                "Perché Marco non può chiamare?",
            ),
            (
                _t(
                    "Der Akku ist leer",
                    "His battery is empty",
                    "Sa batterie est vide",
                    "La batteria è scarica",
                ),
                _t("Kein Netz", "No signal", "Pas de réseau", "Niente campo"),
                _t(
                    "Handy verloren",
                    "He lost his phone",
                    "Il a perdu son téléphone",
                    "Ha perso il telefono",
                ),
            ),
            0,
        ),
        Clue(
            "B",
            2,
            _t(
                "Der Zug hat heute 25 Minuten Verspätung.",
                "The train is 25 minutes late today.",
                "Le train a 25 minutes de retard aujourd'hui.",
                "Oggi il treno ha 25 minuti di ritardo.",
            ),
            _t(
                "Wie viel Verspätung hat der Zug?",
                "How late is the train?",
                "Combien de retard a le train ?",
                "Quanto ritardo ha il treno?",
            ),
            ("5 min", "25 min", "50 min"),
            1,
        ),
        Clue(
            "A",
            3,
            _t(
                "Marco trägt eine grüne Jacke und einen großen Hut.",
                "Marco is wearing a green jacket and a big hat.",
                "Marco porte une veste verte et un grand chapeau.",
                "Marco porta una giacca verde e un grande cappello.",
            ),
            _t(
                "Welche Farbe hat Marcos Jacke?",
                "What colour is Marco's jacket?",
                "De quelle couleur est la veste de Marco ?",
                "Di che colore è la giacca di Marco?",
            ),
            (
                _t("Grün", "Green", "Verte", "Verde"),
                _t("Gelb", "Yellow", "Jaune", "Gialla"),
                _t("Grau", "Grey", "Grise", "Grigia"),
            ),
            0,
        ),
        Clue(
            "B",
            3,
            _t(
                "Trefft ihn im Café neben der großen Uhr.",
                "Meet him in the café next to the big clock.",
                "Retrouvez-le au café à côté de la grande horloge.",
                "Incontratelo al bar accanto al grande orologio.",
            ),
            _t(
                "Wo trefft ihr Marco?",
                "Where do you meet Marco?",
                "Où retrouvez-vous Marco ?",
                "Dove incontrate Marco?",
            ),
            (
                _t(
                    "Im Café bei der Uhr",
                    "In the café by the clock",
                    "Au café près de l'horloge",
                    "Al bar vicino all'orologio",
                ),
                _t("Am Schalter", "At the ticket office", "Au guichet", "Alla biglietteria"),
                _t(
                    "An der Bushaltestelle",
                    "At the bus stop",
                    "À l'arrêt de bus",
                    "Alla fermata del bus",
                ),
            ),
            0,
        ),
    ),
    question=_t(
        "Wo und wann trefft ihr Marco?",
        "Where and when do you meet Marco?",
        "Où et quand retrouvez-vous Marco ?",
        "Dove e quando incontrate Marco?",
    ),
    options=(
        _t(
            "Im Café bei der Uhr, nach dem verspäteten Zug auf Gleis 7",
            "In the café by the clock, after the late train on platform 7",
            "Au café près de l'horloge, après le train en retard sur le quai 7",
            "Al bar vicino all'orologio, dopo il treno in ritardo al binario 7",
        ),
        _t(
            "An der Bushaltestelle, um 10:05 Uhr",
            "At the bus stop, at 10:05",
            "À l'arrêt de bus, à 10 h 05",
            "Alla fermata del bus, alle 10:05",
        ),
        _t(
            "Am Schalter, auf Gleis 3",
            "At the ticket office, on platform 3",
            "Au guichet, sur le quai 3",
            "Alla biglietteria, al binario 3",
        ),
    ),
    answer=0,
    ending=_t(
        "Marco kommt mit seinem großen Hut ins Café und bestellt sofort einen Kaffee für alle.",
        "Marco walks into the café in his big hat and orders coffee for everyone at once.",
        "Marco entre au café avec son grand chapeau et commande tout de suite un café pour tout le monde.",
        "Marco entra nel bar con il suo grande cappello e ordina subito un caffè per tutti.",
    ),
)

FLATSHARE_KEY = CaseTemplate(
    id="flatshare_key",
    title=_t(
        "Der WG-Schlüssel",
        "The Flatshare Key",
        "La clé de la colocation",
        "La chiave dell'appartamento",
    ),
    setting=_t(
        "Der Schlüssel eurer WG ist verschwunden. Wo ist er jetzt, und wann bekommt ihr ihn?",
        "The key to your shared flat has vanished. Where is it now, and when can you get it?",
        "La clé de votre colocation a disparu. Où est-elle maintenant, et quand pouvez-vous la récupérer ?",
        "La chiave del vostro appartamento è sparita. Dov'è adesso, e quando potete riaverla?",
    ),
    clues=(
        Clue(
            "A",
            1,
            _t(
                "Lea ist um 8:00 Uhr aus der Wohnung gegangen und hat abgeschlossen.",
                "Lea left the flat at 8:00 and locked the door.",
                "Lea a quitté l'appartement à 8 h et a fermé à clé.",
                "Lea è uscita di casa alle 8:00 e ha chiuso a chiave.",
            ),
            _t(
                "Wann ist Lea gegangen?",
                "When did Lea leave?",
                "Quand Lea est-elle partie ?",
                "Quando è uscita Lea?",
            ),
            ("7:00", "8:00", "9:00"),
            1,
        ),
        Clue(
            "B",
            1,
            _t(
                "Tom ist um 12:00 Uhr gekommen und hat den Schlüssel unter der Fußmatte gefunden.",
                "Tom came home at 12:00 and found the key under the doormat.",
                "Tom est rentré à 12 h et a trouvé la clé sous le paillasson.",
                "Tom è tornato alle 12:00 e ha trovato la chiave sotto lo zerbino.",
            ),
            _t(
                "Wo war der Schlüssel?",
                "Where was the key?",
                "Où était la clé ?",
                "Dov'era la chiave?",
            ),
            (
                _t(
                    "Unter der Fußmatte",
                    "Under the doormat",
                    "Sous le paillasson",
                    "Sotto lo zerbino",
                ),
                _t(
                    "Im Briefkasten",
                    "In the letterbox",
                    "Dans la boîte aux lettres",
                    "Nella cassetta delle lettere",
                ),
                _t("Beim Nachbarn", "With the neighbour", "Chez le voisin", "Dal vicino"),
            ),
            0,
        ),
        Clue(
            "A",
            2,
            _t(
                "Die Nachbarin, Frau Keller, gießt dienstags die Pflanzen.",
                "The neighbour, Mrs Keller, waters the plants on Tuesdays.",
                "La voisine, Mme Keller, arrose les plantes le mardi.",
                "La vicina, la signora Keller, annaffia le piante il martedì.",
            ),
            _t(
                "Wie heißt die Nachbarin?",
                "What is the neighbour's name?",
                "Comment s'appelle la voisine ?",
                "Come si chiama la vicina?",
            ),
            ("Keller", "Brun", "Rossi"),
            0,
        ),
        Clue(
            "B",
            2,
            _t(
                "Tom hat den Schlüssel um 13:30 Uhr der Nachbarin gegeben.",
                "Tom gave the key to the neighbour at 13:30.",
                "Tom a donné la clé à la voisine à 13 h 30.",
                "Tom ha dato la chiave alla vicina alle 13:30.",
            ),
            _t(
                "Wann hat Tom den Schlüssel abgegeben?",
                "When did Tom hand over the key?",
                "Quand Tom a-t-il donné la clé ?",
                "Quando ha dato via la chiave Tom?",
            ),
            ("12:30", "13:30", "15:00"),
            1,
        ),
        Clue(
            "A",
            3,
            _t(
                "Frau Keller ist bis 17:00 Uhr auf dem Markt.",
                "Mrs Keller is at the market until 17:00.",
                "Mme Keller est au marché jusqu'à 17 h.",
                "La signora Keller è al mercato fino alle 17:00.",
            ),
            _t(
                "Bis wann ist Frau Keller auf dem Markt?",
                "Until when is Mrs Keller at the market?",
                "Jusqu'à quelle heure Mme Keller est-elle au marché ?",
                "Fino a che ora è al mercato la signora Keller?",
            ),
            ("15:00", "17:00", "19:00"),
            1,
        ),
        Clue(
            "B",
            3,
            _t(
                "Die Nachbarin wohnt im dritten Stock, Tür 12.",
                "The neighbour lives on the third floor, door 12.",
                "La voisine habite au troisième étage, porte 12.",
                "La vicina abita al terzo piano, porta 12.",
            ),
            _t("Welche Tür?", "Which door?", "Quelle porte ?", "Quale porta?"),
            ("2", "12", "21"),
            1,
        ),
    ),
    question=_t(
        "Wo ist der Schlüssel jetzt, und wann bekommt ihr ihn?",
        "Where is the key now, and when can you get it?",
        "Où est la clé maintenant, et quand pouvez-vous la récupérer ?",
        "Dov'è la chiave adesso, e quando potete riaverla?",
    ),
    options=(
        _t(
            "Bei Frau Keller, Tür 12, nach 17:00 Uhr",
            "With Mrs Keller, door 12, after 17:00",
            "Chez Mme Keller, porte 12, après 17 h",
            "Dalla signora Keller, porta 12, dopo le 17:00",
        ),
        _t(
            "Unter der Fußmatte, sofort",
            "Under the doormat, right now",
            "Sous le paillasson, tout de suite",
            "Sotto lo zerbino, subito",
        ),
        _t(
            "Bei Tom, um 13:30 Uhr",
            "With Tom, at 13:30",
            "Chez Tom, à 13 h 30",
            "Da Tom, alle 13:30",
        ),
    ),
    answer=0,
    ending=_t(
        "Um 17:10 Uhr klingelt ihr bei Tür 12, und Frau Keller gibt euch den Schlüssel und einen Apfel.",
        "At 17:10 you ring at door 12, and Mrs Keller gives you the key and an apple.",
        "À 17 h 10, vous sonnez à la porte 12, et Mme Keller vous rend la clé avec une pomme.",
        "Alle 17:10 suonate alla porta 12, e la signora Keller vi dà la chiave e una mela.",
    ),
)

MUSEUM_POSTCARD = CaseTemplate(
    id="museum_postcard",
    title=_t(
        "Die Museumspostkarte",
        "The Museum Postcard",
        "La carte postale du musée",
        "La cartolina del museo",
    ),
    setting=_t(
        "Ihr habt eine alte Postkarte mit einem Rätsel gefunden. Welches Bild im Museum ist gemeint?",
        "You found an old postcard with a riddle. Which painting in the museum does it mean?",
        "Vous avez trouvé une vieille carte postale avec une énigme. De quel tableau du musée parle-t-elle ?",
        "Avete trovato una vecchia cartolina con un indovinello. Di quale quadro del museo parla?",
    ),
    clues=(
        Clue(
            "A",
            1,
            _t(
                "Die Karte wurde 1952 in Basel abgeschickt.",
                "The postcard was sent from Basel in 1952.",
                "La carte a été envoyée de Bâle en 1952.",
                "La cartolina è stata spedita da Basilea nel 1952.",
            ),
            _t("In welchem Jahr?", "In which year?", "En quelle année ?", "In che anno?"),
            ("1925", "1952", "1972"),
            1,
        ),
        Clue(
            "B",
            1,
            _t(
                "Das Bild zeigt ein Boot auf einem See.",
                "The painting shows a boat on a lake.",
                "Le tableau montre un bateau sur un lac.",
                "Il quadro mostra una barca su un lago.",
            ),
            _t(
                "Was zeigt das Bild?",
                "What does the painting show?",
                "Que montre le tableau ?",
                "Che cosa mostra il quadro?",
            ),
            (
                _t(
                    "Ein Boot auf einem See",
                    "A boat on a lake",
                    "Un bateau sur un lac",
                    "Una barca su un lago",
                ),
                _t("Einen Berg", "A mountain", "Une montagne", "Una montagna"),
                _t("Einen Marktplatz", "A market square", "Une place de marché", "Una piazza"),
            ),
            0,
        ),
        Clue(
            "A",
            2,
            _t(
                "Es hängt in Saal 9 des Museums.",
                "It hangs in room 9 of the museum.",
                "Il est accroché dans la salle 9 du musée.",
                "È appeso nella sala 9 del museo.",
            ),
            _t("In welchem Saal?", "In which room?", "Dans quelle salle ?", "In quale sala?"),
            ("6", "9", "19"),
            1,
        ),
        Clue(
            "B",
            2,
            _t(
                "Der Maler hat mit zwei Buchstaben unterschrieben: M. H.",
                "The painter signed with two letters: M. H.",
                "Le peintre a signé avec deux lettres : M. H.",
                "Il pittore ha firmato con due lettere: M. H.",
            ),
            _t(
                "Mit welchen Buchstaben?",
                "With which letters?",
                "Avec quelles lettres ?",
                "Con quali lettere?",
            ),
            ("M. H.", "H. M.", "A. K."),
            0,
        ),
        Clue(
            "A",
            3,
            _t(
                "Am ersten Sonntag im Monat ist der Eintritt frei.",
                "Entry is free on the first Sunday of the month.",
                "L'entrée est gratuite le premier dimanche du mois.",
                "L'ingresso è gratuito la prima domenica del mese.",
            ),
            _t(
                "Wann ist der Eintritt frei?",
                "When is entry free?",
                "Quand l'entrée est-elle gratuite ?",
                "Quando è gratuito l'ingresso?",
            ),
            (
                _t(
                    "Am ersten Sonntag",
                    "On the first Sunday",
                    "Le premier dimanche",
                    "La prima domenica",
                ),
                _t("Jeden Montag", "Every Monday", "Chaque lundi", "Ogni lunedì"),
                _t(
                    "Am letzten Freitag",
                    "On the last Friday",
                    "Le dernier vendredi",
                    "L'ultimo venerdì",
                ),
            ),
            0,
        ),
        Clue(
            "B",
            3,
            _t(
                "Das Boot auf dem Bild ist rot.",
                "The boat in the painting is red.",
                "Le bateau sur le tableau est rouge.",
                "La barca nel quadro è rossa.",
            ),
            _t(
                "Welche Farbe hat das Boot?",
                "What colour is the boat?",
                "De quelle couleur est le bateau ?",
                "Di che colore è la barca?",
            ),
            (
                _t("Rot", "Red", "Rouge", "Rossa"),
                _t("Weiß", "White", "Blanc", "Bianca"),
                _t("Blau", "Blue", "Bleu", "Blu"),
            ),
            0,
        ),
    ),
    question=_t(
        "Welches Bild ist auf der Postkarte?",
        "Which painting is on the postcard?",
        "Quel tableau est sur la carte postale ?",
        "Quale quadro è sulla cartolina?",
    ),
    options=(
        _t(
            "Rotes Boot auf einem See, M. H., Saal 9",
            "Red boat on a lake, M. H., room 9",
            "Bateau rouge sur un lac, M. H., salle 9",
            "Barca rossa su un lago, M. H., sala 9",
        ),
        _t(
            "Weißes Boot, H. M., Saal 6",
            "White boat, H. M., room 6",
            "Bateau blanc, H. M., salle 6",
            "Barca bianca, H. M., sala 6",
        ),
        _t(
            "Ein Berg, A. K., Saal 19",
            "A mountain, A. K., room 19",
            "Une montagne, A. K., salle 19",
            "Una montagna, A. K., sala 19",
        ),
    ),
    answer=0,
    ending=_t(
        "Am ersten Sonntag steht ihr in Saal 9 vor dem roten Boot – genau wie auf der Karte von 1952.",
        "On the first Sunday you stand in room 9 before the red boat – just like on the card from 1952.",
        "Le premier dimanche, vous êtes dans la salle 9 devant le bateau rouge – comme sur la carte de 1952.",
        "La prima domenica siete nella sala 9 davanti alla barca rossa – proprio come sulla cartolina del 1952.",
    ),
)

WRONG_PARCEL = CaseTemplate(
    id="wrong_parcel",
    title=_t("Das falsche Paket", "The Wrong Parcel", "Le mauvais colis", "Il pacco sbagliato"),
    setting=_t(
        "Der Kurier hat ein falsches Paket gebracht. Wo ist euer richtiges Paket?",
        "The courier brought the wrong parcel. Where is your real one?",
        "Le livreur a apporté le mauvais colis. Où est votre vrai colis ?",
        "Il corriere ha portato il pacco sbagliato. Dov'è il vostro vero pacco?",
    ),
    clues=(
        Clue(
            "A",
            1,
            _t(
                "Euer Paket ist eine blaue Kiste, zwei Kilo schwer.",
                "Your parcel is a blue box that weighs two kilos.",
                "Votre colis est une boîte bleue de deux kilos.",
                "Il vostro pacco è una scatola blu di due chili.",
            ),
            _t("Wie schwer ist es?", "How heavy is it?", "Combien pèse-t-il ?", "Quanto pesa?"),
            ("2 kg", "5 kg", "12 kg"),
            0,
        ),
        Clue(
            "B",
            1,
            _t(
                "Der Kurier ist um 11:40 Uhr gekommen.",
                "The courier came at 11:40.",
                "Le livreur est passé à 11 h 40.",
                "Il corriere è passato alle 11:40.",
            ),
            _t(
                "Wann ist der Kurier gekommen?",
                "When did the courier come?",
                "Quand le livreur est-il passé ?",
                "Quando è passato il corriere?",
            ),
            ("09:10", "11:40", "14:20"),
            1,
        ),
        Clue(
            "A",
            2,
            _t(
                "Die Paketnummer endet mit 47.",
                "The parcel number ends in 47.",
                "Le numéro du colis finit par 47.",
                "Il numero del pacco finisce con 47.",
            ),
            _t(
                "Womit endet die Nummer?",
                "What does the number end in?",
                "Par quoi finit le numéro ?",
                "Con che cosa finisce il numero?",
            ),
            ("17", "47", "74"),
            1,
        ),
        Clue(
            "B",
            2,
            _t(
                "Der Kurier hat eine blaue Kiste bei Hausnummer 5 abgegeben.",
                "The courier left a blue box at house number 5.",
                "Le livreur a laissé une boîte bleue au numéro 5.",
                "Il corriere ha lasciato una scatola blu al numero 5.",
            ),
            _t(
                "Bei welcher Hausnummer?",
                "At which house number?",
                "À quel numéro ?",
                "A quale numero civico?",
            ),
            ("3", "5", "8"),
            1,
        ),
        Clue(
            "A",
            3,
            _t(
                "Im Paket sind ein Buch und ein Schal.",
                "Inside the parcel there is a book and a scarf.",
                "Dans le colis, il y a un livre et une écharpe.",
                "Nel pacco ci sono un libro e una sciarpa.",
            ),
            _t(
                "Was ist im Paket?",
                "What is in the parcel?",
                "Qu'y a-t-il dans le colis ?",
                "Che cosa c'è nel pacco?",
            ),
            (
                _t(
                    "Ein Buch und ein Schal",
                    "A book and a scarf",
                    "Un livre et une écharpe",
                    "Un libro e una sciarpa",
                ),
                _t("Schuhe", "Shoes", "Des chaussures", "Delle scarpe"),
                _t("Eine Lampe", "A lamp", "Une lampe", "Una lampada"),
            ),
            0,
        ),
        Clue(
            "B",
            3,
            _t(
                "Die Nachbarn von Nummer 5 sind ab 18:00 Uhr zu Hause.",
                "The neighbours at number 5 are home from 18:00.",
                "Les voisins du numéro 5 sont chez eux à partir de 18 h.",
                "I vicini del numero 5 sono a casa dalle 18:00.",
            ),
            _t(
                "Ab wann sind die Nachbarn zu Hause?",
                "From when are the neighbours home?",
                "À partir de quand les voisins sont-ils chez eux ?",
                "Da che ora sono a casa i vicini?",
            ),
            ("16:00", "18:00", "20:00"),
            1,
        ),
    ),
    question=_t(
        "Wo ist euer Paket, und wann könnt ihr es holen?",
        "Where is your parcel, and when can you get it?",
        "Où est votre colis, et quand pouvez-vous le récupérer ?",
        "Dov'è il vostro pacco, e quando potete prenderlo?",
    ),
    options=(
        _t(
            "Bei Nummer 5, ab 18:00 Uhr",
            "At number 5, from 18:00",
            "Au numéro 5, à partir de 18 h",
            "Al numero 5, dalle 18:00",
        ),
        _t(
            "Zurück bei der Post",
            "Back at the post office",
            "Retour à la poste",
            "Di nuovo all'ufficio postale",
        ),
        _t(
            "Bei Nummer 3, sofort",
            "At number 3, right now",
            "Au numéro 3, tout de suite",
            "Al numero 3, subito",
        ),
    ),
    answer=0,
    ending=_t(
        "Um 18:05 Uhr gibt euch die Familie von Nummer 5 die blaue Kiste – mit Buch und Schal.",
        "At 18:05 the family at number 5 hands you the blue box – book and scarf inside.",
        "À 18 h 05, la famille du numéro 5 vous donne la boîte bleue – avec le livre et l'écharpe.",
        "Alle 18:05 la famiglia del numero 5 vi dà la scatola blu – con il libro e la sciarpa.",
    ),
)

CASES: tuple[CaseTemplate, ...] = (
    LOST_CELLO,
    GRANDMA_RECIPE,
    MISSED_CONNECTION,
    FLATSHARE_KEY,
    MUSEUM_POSTCARD,
    WRONG_PARCEL,
)
_BY_ID = {case.id: case for case in CASES}


def template(template_id: str) -> CaseTemplate | None:
    return _BY_ID.get(template_id)


def season_case(iso_year: int, iso_week: int) -> CaseTemplate:
    """The case of the week (the same for every pair, like a daily puzzle): it turns through the
    library one week at a time."""
    return CASES[(iso_year * 53 + iso_week) % len(CASES)]


# --- Cases written for one learner (phase 2, design note 2026-11-20-two-halves-phase2-design.md)
#
# A case the Case Writer made from a learner's course import (5.23) is kept on the case itself,
# not in this library: it belongs to that case alone. These turn it into JSON and back.


def _text_document(text: Text) -> str | dict[str, str]:
    return text if isinstance(text, str) else dict(text)


def _text_from(value: object) -> Text:
    if isinstance(value, str) and value.strip():
        return value
    if isinstance(value, dict) and value and all(isinstance(v, str) for v in value.values()):
        if not str(value.get("en", "")).strip():
            raise ValueError("a text needs English")
        return {str(k): str(v) for k, v in value.items()}
    raise ValueError("not a text")


def _written(value: object) -> Mapping[str, str]:
    text = _text_from(value)
    return {"en": text} if isinstance(text, str) else text


def _options(value: object) -> tuple[Text, ...]:
    if not isinstance(value, list):
        raise ValueError("no options")
    return tuple(_text_from(option) for option in value)


def _index(value: object) -> int:
    if isinstance(value, bool) or not isinstance(value, int):
        raise ValueError("not an index")
    return value


def template_document(case: CaseTemplate) -> dict[str, object]:
    return {
        "id": case.id,
        "title": dict(case.title),
        "setting": dict(case.setting),
        "question": dict(case.question),
        "options": [_text_document(o) for o in case.options],
        "answer": case.answer,
        "ending": dict(case.ending),
        "clues": [
            {
                "seat": c.seat,
                "round": c.round,
                "says": dict(c.says),
                "asks": dict(c.asks),
                "options": [_text_document(o) for o in c.options],
                "answer": c.answer,
            }
            for c in case.clues
        ],
    }


def template_from(document: Mapping[str, object]) -> CaseTemplate:
    """A case kept as JSON. Raises `ValueError` for one that is not complete: one clue for each
    seat in each round, at least two options everywhere, and every answer one of its options."""
    raw_clues = document.get("clues")
    if not isinstance(raw_clues, list):
        raise ValueError("no clues")
    clues: list[Clue] = []
    for raw in raw_clues:
        if not isinstance(raw, dict):
            raise ValueError("not a clue")
        options = _options(raw.get("options"))
        answer = _index(raw.get("answer"))
        seat = raw.get("seat")
        if seat not in ("A", "B") or not 0 <= answer < len(options) or len(options) < 2:
            raise ValueError("not a clue")
        clues.append(
            Clue(
                "A" if seat == "A" else "B",
                _index(raw.get("round")),
                _written(raw.get("says")),
                _written(raw.get("asks")),
                options,
                answer,
            )
        )
    for seat in ("A", "B"):
        if sorted(c.round for c in clues if c.seat == seat) != list(range(1, ROUNDS + 1)):
            raise ValueError("a seat needs one clue a round")
    options = _options(document.get("options"))
    answer = _index(document.get("answer"))
    if not 0 <= answer < len(options) or len(options) < 2:
        raise ValueError("no answer")
    return CaseTemplate(
        id=str(document.get("id", "")),
        title=_written(document.get("title")),
        setting=_written(document.get("setting")),
        clues=tuple(clues),
        question=_written(document.get("question")),
        options=options,
        answer=answer,
        ending=_written(document.get("ending")),
    )
