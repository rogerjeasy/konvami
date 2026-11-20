"""Radio Konvami's prompts (section 8): one a day, the same in every language learned, written
by hand at A2-B1. Each prompt has two calls of its own that the AI callers say when no model can
write them, so a show always has voices in it.

A prompt is about everyday life and never asks for anything private: no addresses, no schools,
no names of other people, nothing a caller should not say on air.
"""

import datetime as dt
from collections.abc import Mapping
from dataclasses import dataclass

from konvami_api.domain.halves_cases import LANGUAGES, text_in

type Text = Mapping[str, str]


@dataclass(frozen=True)
class Prompt:
    id: str
    # The show's question, in each language learned.
    question: Text
    # What AI callers say when no model writes their call: two short calls, in each language.
    calls: tuple[Text, Text]


def _p(id_: str, question: Text, one: Text, two: Text) -> Prompt:
    return Prompt(id_, question, (one, two))


PROMPTS: tuple[Prompt, ...] = (
    _p(
        "train_story",
        {
            "de": "Was war deine lustigste Zugfahrt?",
            "en": "What was your funniest train journey?",
            "fr": "Quel a été ton voyage en train le plus drôle ?",
            "it": "Qual è stato il tuo viaggio in treno più divertente?",
        },
        {
            "de": "Einmal bin ich im Zug eingeschlafen und in Basel statt in Bern aufgewacht.",
            "en": "Once I fell asleep on the train and woke up in Basel instead of Bern.",
            "fr": "Une fois, je me suis endormi dans le train et je me suis réveillé à Lyon.",
            "it": "Una volta mi sono addormentata in treno e mi sono svegliata a Bologna.",
        },
        {
            "de": "Ein Hund hat neben mir gesessen und die ganze Fahrt mein Brot angeschaut.",
            "en": "A dog sat next to me and looked at my sandwich for the whole journey.",
            "fr": "Un chien était assis à côté de moi et a regardé mon sandwich tout le trajet.",
            "it": "Un cane era seduto vicino a me e ha guardato il mio panino tutto il viaggio.",
        },
    ),
    _p(
        "breakfast",
        {
            "de": "Was isst du am liebsten zum Frühstück?",
            "en": "What do you like best for breakfast?",
            "fr": "Qu'est-ce que tu préfères manger au petit-déjeuner ?",
            "it": "Cosa ti piace di più mangiare a colazione?",
        },
        {
            "de": "Ich esse jeden Morgen Müsli mit Apfel. Am Sonntag gibt es Brötchen.",
            "en": "I have muesli with an apple every morning. On Sunday there are bread rolls.",
            "fr": "Je mange des céréales avec une pomme. Le dimanche, je mange des croissants.",
            "it": "Di solito prendo un caffè e una brioche. La domenica faccio i pancake.",
        },
        {
            "de": "Ehrlich gesagt trinke ich nur Kaffee. Mein Magen wacht erst um zehn auf.",
            "en": "Honestly, I only drink coffee. My stomach only wakes up at ten.",
            "fr": "Honnêtement, je bois seulement un café. Mon ventre se réveille à dix heures.",
            "it": "Sinceramente bevo solo un caffè. Il mio stomaco si sveglia alle dieci.",
        },
    ),
    _p(
        "small_joy",
        {
            "de": "Was hat dich diese Woche glücklich gemacht?",
            "en": "What made you happy this week?",
            "fr": "Qu'est-ce qui t'a rendu heureux cette semaine ?",
            "it": "Che cosa ti ha reso felice questa settimana?",
        },
        {
            "de": "Die Sonne war am Dienstag da und ich habe draußen gegessen.",
            "en": "The sun came out on Tuesday and I had lunch outside.",
            "fr": "Mardi, il y avait du soleil et j'ai mangé dehors.",
            "it": "Martedì c'era il sole e ho mangiato fuori.",
        },
        {
            "de": "Ich habe endlich mein Fahrrad repariert. Es fährt wieder!",
            "en": "I finally fixed my bike. It rides again!",
            "fr": "J'ai enfin réparé mon vélo. Il roule de nouveau !",
            "it": "Finalmente ho riparato la mia bici. Funziona di nuovo!",
        },
    ),
    _p(
        "wrong_word",
        {
            "de": "Hast du schon einmal das falsche Wort gesagt? Was ist passiert?",
            "en": "Have you ever said the wrong word? What happened?",
            "fr": "Tu as déjà dit le mauvais mot ? Qu'est-ce qui s'est passé ?",
            "it": "Ti è mai capitato di dire la parola sbagliata? Che cosa è successo?",
        },
        {
            "de": "Beim Bäcker wollte ich zwei Brote und sagte „zwei Brüder“. Er hat gelacht.",
            "en": "I wanted to say 'I'm full' and said 'I'm fool'. Everybody laughed.",
            "fr": "J'ai dit « je suis plein » au lieu de « j'ai assez mangé ». Tout le monde a ri.",
            "it": "Ho detto « sono caldo » invece di « ho caldo ». Il cameriere ha sorriso.",
        },
        {
            "de": "Im Büro habe ich 'Tschüss' zu meiner Chefin gesagt. Sie war sehr nett.",
            "en": "I called my teacher 'mum' in front of the whole class. Never again!",
            "fr": "J'ai dit « tu » à mon nouveau chef. Il a souri et il a dit « vous ».",
            "it": "Ho dato del tu alla mia professoressa. Lei ha riso, per fortuna.",
        },
    ),
    _p(
        "weekend_plan",
        {
            "de": "Was machst du am Wochenende?",
            "en": "What are you doing at the weekend?",
            "fr": "Qu'est-ce que tu fais ce week-end ?",
            "it": "Che cosa fai questo fine settimana?",
        },
        {
            "de": "Ich gehe am Samstag wandern, wenn es nicht regnet.",
            "en": "I'm going hiking on Saturday, if it doesn't rain.",
            "fr": "Samedi, je vais faire une randonnée, s'il ne pleut pas.",
            "it": "Sabato vado a fare una passeggiata in montagna, se non piove.",
        },
        {
            "de": "Nichts! Ich bleibe zu Hause und koche eine große Suppe.",
            "en": "Nothing! I'm staying at home and making a big soup.",
            "fr": "Rien ! Je reste à la maison et je fais une grande soupe.",
            "it": "Niente! Resto a casa e preparo una grande zuppa.",
        },
    ),
    _p(
        "favourite_place",
        {
            "de": "Wo bist du in deiner Stadt am liebsten?",
            "en": "Where do you like to be most in your town?",
            "fr": "Où est-ce que tu aimes être dans ta ville ?",
            "it": "Qual è il tuo posto preferito nella tua città?",
        },
        {
            "de": "Am See. Da sitze ich am Abend und schaue die Boote an.",
            "en": "By the lake. I sit there in the evening and watch the boats.",
            "fr": "Au bord du fleuve. Le soir, je regarde les bateaux.",
            "it": "Al parco. La sera mi siedo su una panchina e leggo.",
        },
        {
            "de": "In der Bibliothek. Es ist ruhig und warm.",
            "en": "The library. It's quiet and warm.",
            "fr": "À la bibliothèque. C'est calme et il fait chaud.",
            "it": "In biblioteca. È tranquilla e calda.",
        },
    ),
    _p(
        "cooking_disaster",
        {
            "de": "Erzähl von einem Essen, das schiefgegangen ist.",
            "en": "Tell us about a meal that went wrong.",
            "fr": "Raconte un repas qui a mal tourné.",
            "it": "Racconta un pranzo o una cena andati male.",
        },
        {
            "de": "Mein Kuchen war außen schwarz und innen noch flüssig.",
            "en": "My cake was black on the outside and still runny inside.",
            "fr": "Mon gâteau était noir dehors et encore liquide dedans.",
            "it": "La mia torta era nera fuori e ancora liquida dentro.",
        },
        {
            "de": "Ich habe Salz statt Zucker in den Tee getan. Nie wieder!",
            "en": "I put salt in the tea instead of sugar. Never again!",
            "fr": "J'ai mis du sel dans le thé au lieu du sucre. Plus jamais !",
            "it": "Ho messo il sale nel tè invece dello zucchero. Mai più!",
        },
    ),
    _p(
        "childhood_game",
        {
            "de": "Was hast du als Kind gern gespielt?",
            "en": "What did you like to play as a child?",
            "fr": "À quoi est-ce que tu aimais jouer quand tu étais petit ?",
            "it": "A cosa ti piaceva giocare da bambino?",
        },
        {
            "de": "Verstecken im Garten. Ich habe mich immer hinter demselben Baum versteckt.",
            "en": "Hide and seek in the garden. I always hid behind the same tree.",
            "fr": "À cache-cache dans le jardin. Je me cachais toujours derrière le même arbre.",
            "it": "A nascondino in giardino. Mi nascondevo sempre dietro lo stesso albero.",
        },
        {
            "de": "Ich habe mit meinem Bruder Häuser aus Karton gebaut.",
            "en": "I built houses out of cardboard with my brother.",
            "fr": "Avec mon frère, je construisais des maisons en carton.",
            "it": "Con mio fratello costruivo case di cartone.",
        },
    ),
    _p(
        "useful_object",
        {
            "de": "Welcher Gegenstand ist für dich jeden Tag wichtig?",
            "en": "Which object do you need every day?",
            "fr": "Quel objet est important pour toi tous les jours ?",
            "it": "Quale oggetto ti serve ogni giorno?",
        },
        {
            "de": "Meine alte Tasse. Ohne sie schmeckt der Kaffee nicht.",
            "en": "My old mug. Without it the coffee doesn't taste right.",
            "fr": "Ma vieille tasse. Sans elle, le café n'a pas de goût.",
            "it": "La mia vecchia tazza. Senza di lei il caffè non ha sapore.",
        },
        {
            "de": "Mein Regenschirm. Hier regnet es fast jeden Tag.",
            "en": "My umbrella. It rains here almost every day.",
            "fr": "Mon parapluie. Ici, il pleut presque tous les jours.",
            "it": "Il mio ombrello. Qui piove quasi ogni giorno.",
        },
    ),
    _p(
        "new_habit",
        {
            "de": "Welche neue Gewohnheit möchtest du anfangen?",
            "en": "Which new habit would you like to start?",
            "fr": "Quelle nouvelle habitude est-ce que tu voudrais prendre ?",
            "it": "Quale nuova abitudine vorresti iniziare?",
        },
        {
            "de": "Ich möchte jeden Abend zehn Minuten lesen, ohne Handy.",
            "en": "I'd like to read for ten minutes every evening, without my phone.",
            "fr": "Je voudrais lire dix minutes chaque soir, sans téléphone.",
            "it": "Vorrei leggere dieci minuti ogni sera, senza telefono.",
        },
        {
            "de": "Früher aufstehen! Aber mein Bett ist dagegen.",
            "en": "Getting up earlier! But my bed disagrees.",
            "fr": "Me lever plus tôt ! Mais mon lit n'est pas d'accord.",
            "it": "Alzarmi prima! Ma il mio letto non è d'accordo.",
        },
    ),
    _p(
        "best_advice",
        {
            "de": "Was ist der beste Tipp, den du je bekommen hast?",
            "en": "What is the best tip anyone ever gave you?",
            "fr": "Quel est le meilleur conseil qu'on t'a donné ?",
            "it": "Qual è il miglior consiglio che hai mai ricevuto?",
        },
        {
            "de": "Meine Oma sagt: Erst essen, dann streiten.",
            "en": "My grandma says: eat first, argue later.",
            "fr": "Ma grand-mère dit : d'abord on mange, après on se dispute.",
            "it": "Mia nonna dice: prima si mangia, poi si discute.",
        },
        {
            "de": "Sprich langsam. Dann verstehen dich alle besser.",
            "en": "Speak slowly. Then everyone understands you better.",
            "fr": "Parle lentement. Comme ça, tout le monde te comprend mieux.",
            "it": "Parla piano. Così tutti ti capiscono meglio.",
        },
    ),
    _p(
        "weather_mood",
        {
            "de": "Welches Wetter magst du am liebsten, und warum?",
            "en": "What weather do you like best, and why?",
            "fr": "Quel temps est-ce que tu préfères, et pourquoi ?",
            "it": "Che tempo preferisci, e perché?",
        },
        {
            "de": "Schnee! Dann ist die Stadt ganz still.",
            "en": "Snow! Then the whole town is quiet.",
            "fr": "La neige ! Toute la ville devient silencieuse.",
            "it": "La neve! Tutta la città diventa silenziosa.",
        },
        {
            "de": "Ein warmer Regen im Sommer. Er riecht so gut.",
            "en": "Warm summer rain. It smells so good.",
            "fr": "Une pluie chaude en été. Ça sent tellement bon.",
            "it": "Una pioggia calda d'estate. Ha un profumo bellissimo.",
        },
    ),
)

# The day the rotation starts from: any fixed Monday, so a prompt falls on the same weekday in
# every year it comes round.
_EPOCH = dt.date(2026, 1, 5)


def prompt_for(day: dt.date) -> Prompt:
    """The prompt of a day: the same for everyone, in a fixed rotation."""
    return PROMPTS[(day - _EPOCH).days % len(PROMPTS)]


def prompt(prompt_id: str) -> Prompt | None:
    return next((p for p in PROMPTS if p.id == prompt_id), None)


def question_in(found: Prompt, language: str) -> str:
    return text_in(found.question, language)


__all__ = ["LANGUAGES", "PROMPTS", "Prompt", "prompt", "prompt_for", "question_in"]
