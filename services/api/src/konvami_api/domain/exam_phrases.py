"""Exam phrase banks (5.25, spec §6.13): phrases that help in each kind of speaking task, grouped
by what they do (suggesting, disagreeing, structuring a talk…), each with the lowest level it
suits and its meaning in every explanation language.

Written by hand: original phrases, not copied exam answers, and the same for every learner, so
no model request and no second check. Every phrase is written in all four languages Konvami
teaches, so one table serves each language's exams: an English test shows the English line, with
the German, French and Italian ones as meanings. A few lines read better in a language as a
phrase to learn than as a meaning (`_AS_PHRASE`), and two name the language itself
(`_LANGUAGE_NAMED`). An explanation in the test's own language shows the phrase itself.
"""

from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass
from functools import cache
from typing import Literal

from konvami_api.domain.exams import SpeakingExam

LEVELS = ("A1", "A2", "B1", "B2", "C1", "C2")
Level = Literal["A1", "A2", "B1", "B2", "C1", "C2"]

Function = Literal[
    "introduce",
    "ask",
    "request",
    "tell",
    "suggest",
    "agree",
    "disagree",
    "opinion",
    "structure",
    "describe",
    "react",
    "time",
    "compare",
    "speculate",
    "phone",
]

# How many phrases the preparation screen shows under one part; the bank (5.25) shows all.
PER_PART = 4


@dataclass(frozen=True)
class ExamPhrase:
    text: str
    meanings: Mapping[str, str]
    # The lowest level the phrase suits.
    level: Level


@dataclass(frozen=True)
class PhraseGroup:
    function: Function
    phrases: tuple[ExamPhrase, ...]


def _p(level: Level, text: str, en: str, fr: str, it: str) -> ExamPhrase:
    return ExamPhrase(text, {"de": text, "en": en, "fr": fr, "it": it}, level)


FUNCTIONS: Mapping[Function, tuple[ExamPhrase, ...]] = {
    "introduce": (
        _p("A1", "Ich heiße …", "My name is …", "Je m'appelle …", "Mi chiamo …"),
        _p("A1", "Ich komme aus …", "I come from …", "Je viens de …", "Vengo da …"),
        _p("A1", "Ich wohne in …", "I live in …", "J'habite à …", "Abito a …"),
        _p(
            "A1",
            "Ich spreche … und ein bisschen Deutsch.",
            "I speak … and a little German.",
            "Je parle … et un peu allemand.",
            "Parlo … e un po' di tedesco.",
        ),
        _p(
            "A2",
            "Ich arbeite als … / Ich mache eine Ausbildung als …",
            "I work as a … / I'm training to be a …",
            "Je travaille comme … / Je fais une formation de …",
            "Lavoro come … / Sto facendo una formazione da …",
        ),
        _p(
            "B1",
            "Ich möchte mich kurz vorstellen.",
            "I'd like to introduce myself briefly.",
            "Je voudrais me présenter brièvement.",
            "Vorrei presentarmi brevemente.",
        ),
    ),
    "ask": (
        _p(
            "A1",
            "Wie heißen Sie?",
            "What is your name?",
            "Comment vous appelez-vous ?",
            "Come si chiama?",
        ),
        _p(
            "A1",
            "Was machen Sie gern?",
            "What do you like doing?",
            "Qu'aimez-vous faire ?",
            "Che cosa le piace fare?",
        ),
        _p("A1", "Und Sie?", "And you?", "Et vous ?", "E Lei?"),
        _p(
            "A2",
            "Wie oft machen Sie das?",
            "How often do you do that?",
            "À quelle fréquence faites-vous cela ?",
            "Quante volte lo fa?",
        ),
        _p(
            "B1",
            "Könnten Sie mir bitte sagen, wann das beginnt?",
            "Could you please tell me when it starts?",
            "Pourriez-vous me dire quand cela commence ?",
            "Potrebbe dirmi quando inizia?",
        ),
        _p(
            "B2",
            "Darf ich noch einmal nachfragen: Wie haben Sie das gemeint?",
            "May I ask again: what did you mean by that?",
            "Puis-je vous redemander : qu'entendiez-vous par là ?",
            "Posso chiedere di nuovo: che cosa intendeva?",
        ),
    ),
    "request": (
        _p(
            "A1",
            "Können Sie mir bitte helfen?",
            "Can you help me, please?",
            "Pouvez-vous m'aider, s'il vous plaît ?",
            "Può aiutarmi, per favore?",
        ),
        _p(
            "A1",
            "Ich möchte bitte …",
            "I would like … please.",
            "Je voudrais … s'il vous plaît.",
            "Vorrei … per favore.",
        ),
        _p(
            "A1",
            "Können Sie bitte langsamer sprechen?",
            "Can you speak more slowly, please?",
            "Pouvez-vous parler plus lentement, s'il vous plaît ?",
            "Può parlare più lentamente, per favore?",
        ),
        _p("A1", "Haben Sie …?", "Do you have …?", "Avez-vous … ?", "Ha …?"),
        _p(
            "A2",
            "Würden Sie bitte das Fenster aufmachen?",
            "Would you open the window, please?",
            "Pourriez-vous ouvrir la fenêtre, s'il vous plaît ?",
            "Potrebbe aprire la finestra, per favore?",
        ),
        _p(
            "B1",
            "Wäre es möglich, dass …?",
            "Would it be possible that …?",
            "Serait-il possible que … ?",
            "Sarebbe possibile che …?",
        ),
    ),
    "tell": (
        _p("A1", "Am Wochenende …", "At the weekend …", "Le week-end …", "Nel fine settimana …"),
        _p(
            "A2",
            "In meiner Freizeit gehe ich gern spazieren.",
            "In my free time I enjoy going for walks.",
            "Pendant mon temps libre, j'aime me promener.",
            "Nel tempo libero mi piace passeggiare.",
        ),
        _p(
            "A2",
            "Letztes Jahr habe ich …",
            "Last year I …",
            "L'année dernière, j'ai …",
            "L'anno scorso ho …",
        ),
        _p(
            "B1",
            "Ich habe damit gute Erfahrungen gemacht.",
            "I've had good experiences with that.",
            "J'en ai fait de bonnes expériences.",
            "Ne ho avuto buone esperienze.",
        ),
        _p(
            "B1",
            "In meinem Heimatland ist das ganz anders: …",
            "In my home country it is quite different: …",
            "Dans mon pays d'origine, c'est très différent : …",
            "Nel mio paese d'origine è molto diverso: …",
        ),
        _p(
            "B2",
            "Ich erinnere mich noch gut daran, wie …",
            "I still remember well how …",
            "Je me souviens encore bien de la façon dont …",
            "Ricordo ancora bene come …",
        ),
    ),
    "suggest": (
        _p("A2", "Wie wäre es mit …?", "How about …?", "Que dirais-tu de … ?", "Che ne dici di …?"),
        _p(
            "A2",
            "Wollen wir am Samstag …?",
            "Shall we … on Saturday?",
            "On … samedi ?",
            "Vogliamo … sabato?",
        ),
        _p(
            "A2",
            "Hast du am Freitag Zeit?",
            "Are you free on Friday?",
            "Tu es libre vendredi ?",
            "Hai tempo venerdì?",
        ),
        _p(
            "B1",
            "Ich schlage vor, dass wir uns am Samstag treffen.",
            "I suggest we meet on Saturday.",
            "Je propose de nous retrouver samedi.",
            "Propongo di incontrarci sabato.",
        ),
        _p(
            "B1",
            "Was hältst du davon, wenn wir …?",
            "What do you think if we …?",
            "Que penses-tu si nous … ?",
            "Che ne pensi se noi …?",
        ),
        _p(
            "B1",
            "Dann machen wir es so: Du kümmerst dich um …, und ich …",
            "Then let's do it like this: you take care of …, and I …",
            "Alors faisons comme ça : tu t'occupes de …, et moi …",
            "Allora facciamo così: tu ti occupi di …, e io …",
        ),
        _p(
            "B2",
            "Könnten wir uns vielleicht in der Mitte treffen?",
            "Could we perhaps meet halfway?",
            "Pourrions-nous peut-être trouver un compromis ?",
            "Potremmo forse trovare una via di mezzo?",
        ),
    ),
    "agree": (
        _p("A2", "Gute Idee!", "Good idea!", "Bonne idée !", "Buona idea!"),
        _p(
            "A2", "Das passt mir gut.", "That suits me well.", "Ça me convient bien.", "Mi va bene."
        ),
        _p(
            "B1",
            "Da hast du recht.",
            "You're right about that.",
            "Tu as raison.",
            "Hai ragione.",
        ),
        _p(
            "B1",
            "Das sehe ich genauso.",
            "I see it the same way.",
            "Je vois les choses de la même façon.",
            "La penso allo stesso modo.",
        ),
        _p(
            "B2",
            "Da stimme ich dir voll und ganz zu.",
            "I agree with you completely.",
            "Je suis entièrement d'accord avec toi.",
            "Sono completamente d'accordo con te.",
        ),
        _p(
            "C1",
            "Dem kann ich nur beipflichten, zumal …",
            "I can only agree with that, especially since …",
            "Je ne peux qu'approuver, d'autant plus que …",
            "Non posso che essere d'accordo, tanto più che …",
        ),
    ),
    "disagree": (
        _p(
            "A2",
            "Am Samstag kann ich leider nicht.",
            "Unfortunately I can't on Saturday.",
            "Samedi, je ne peux malheureusement pas.",
            "Sabato purtroppo non posso.",
        ),
        _p("A2", "Ich weiß nicht …", "I'm not sure …", "Je ne sais pas …", "Non so …"),
        _p(
            "B1",
            "Das finde ich nicht so gut, weil …",
            "I don't think that's so good, because …",
            "Je ne trouve pas ça très bien, parce que …",
            "Non mi sembra una buona idea, perché …",
        ),
        _p(
            "B1",
            "Ich verstehe deinen Standpunkt, aber ich sehe das anders.",
            "I understand your point of view, but I see it differently.",
            "Je comprends ton point de vue, mais je vois les choses autrement.",
            "Capisco il tuo punto di vista, ma la penso diversamente.",
        ),
        _p(
            "B2",
            "Da bin ich anderer Meinung, denn …",
            "I disagree there, because …",
            "Là, je ne suis pas d'accord, car …",
            "Su questo non sono d'accordo, perché …",
        ),
        _p(
            "C1",
            "Das mag zwar stimmen, allerdings übersiehst du dabei, dass …",
            "That may be true, but you are overlooking the fact that …",
            "C'est peut-être vrai, mais tu oublies que …",
            "Sarà anche vero, però trascuri il fatto che …",
        ),
    ),
    "opinion": (
        _p("A2", "Ich finde …", "I think …", "Je trouve …", "Trovo che …"),
        _p(
            "B1",
            "Meiner Meinung nach ist das wichtig.",
            "In my opinion that is important.",
            "À mon avis, c'est important.",
            "Secondo me è importante.",
        ),
        _p(
            "B1",
            "Ich bin der Meinung, dass …",
            "I am of the opinion that …",
            "Je suis d'avis que …",
            "Sono dell'opinione che …",
        ),
        _p(
            "B2",
            "Einerseits …, andererseits …",
            "On the one hand …, on the other hand …",
            "D'un côté …, de l'autre …",
            "Da un lato …, dall'altro …",
        ),
        _p(
            "B2",
            "Ein wichtiges Argument dafür ist, dass …",
            "An important argument for it is that …",
            "Un argument important en faveur de cela est que …",
            "Un argomento importante a favore è che …",
        ),
        _p(
            "C1",
            "Wenn man alle Argumente gegeneinander abwägt, komme ich zu dem Schluss, dass …",
            "Weighing all the arguments against each other, I come to the conclusion that …",
            "En pesant tous les arguments, j'en arrive à la conclusion que …",
            "Valutando tutti gli argomenti, arrivo alla conclusione che …",
        ),
        _p(
            "C1",
            "Ausschlaggebend ist für mich letztlich …",
            "What is decisive for me in the end is …",
            "Ce qui est déterminant pour moi, en fin de compte, c'est …",
            "Ciò che per me alla fine è decisivo è …",
        ),
    ),
    "structure": (
        _p(
            "A2",
            "Zuerst …, dann …, zum Schluss …",
            "First …, then …, finally …",
            "D'abord …, ensuite …, pour finir …",
            "Prima …, poi …, alla fine …",
        ),
        _p(
            "B1",
            "Ich möchte heute über das Thema … sprechen.",
            "Today I'd like to talk about …",
            "Aujourd'hui, je voudrais parler de …",
            "Oggi vorrei parlare di …",
        ),
        _p(
            "B1",
            "Zuerst möchte ich über meine Erfahrungen sprechen.",
            "First I'd like to talk about my experiences.",
            "Je voudrais d'abord parler de mes expériences.",
            "Per prima cosa vorrei parlare delle mie esperienze.",
        ),
        _p(
            "B1",
            "Damit komme ich zum Schluss. Vielen Dank fürs Zuhören.",
            "That brings me to the end. Thank you for listening.",
            "J'en arrive à la conclusion. Merci de votre attention.",
            "Con questo arrivo alla conclusione. Grazie per l'attenzione.",
        ),
        _p(
            "B2",
            "Mein Vortrag besteht aus drei Teilen: …",
            "My talk has three parts: …",
            "Mon exposé comporte trois parties : …",
            "La mia presentazione ha tre parti: …",
        ),
        _p(
            "B2",
            "Ich komme nun zum nächsten Punkt.",
            "I now come to the next point.",
            "J'en viens maintenant au point suivant.",
            "Passo ora al punto successivo.",
        ),
        _p(
            "C1",
            "Zusammenfassend lässt sich festhalten, dass …",
            "In summary, it can be said that …",
            "En résumé, on peut retenir que …",
            "Riassumendo, si può affermare che …",
        ),
    ),
    "describe": (
        _p(
            "A2",
            "Auf dem Bild sehe ich mehrere Menschen.",
            "In the picture I can see several people.",
            "Sur l'image, je vois plusieurs personnes.",
            "Nell'immagine vedo diverse persone.",
        ),
        _p(
            "A2",
            "Links / rechts / in der Mitte ist …",
            "On the left / on the right / in the middle there is …",
            "À gauche / à droite / au milieu, il y a …",
            "A sinistra / a destra / al centro c'è …",
        ),
        _p(
            "B1",
            "Es sieht so aus, als ob die Leute warten.",
            "It looks as if the people are waiting.",
            "On dirait que les gens attendent.",
            "Sembra che le persone stiano aspettando.",
        ),
        _p(
            "B2",
            "Die Grafik zeigt, wie sich … entwickelt hat.",
            "The chart shows how … has developed.",
            "Le graphique montre comment … a évolué.",
            "Il grafico mostra come si è sviluppato …",
        ),
        _p(
            "B2",
            "Der Anteil ist von … auf … Prozent gestiegen.",
            "The share rose from … to … percent.",
            "La part est passée de … à … pour cent.",
            "La quota è salita dal … al … per cento.",
        ),
        _p(
            "C1",
            "Auffällig ist vor allem, dass …",
            "What is particularly striking is that …",
            "Ce qui frappe surtout, c'est que …",
            "Colpisce soprattutto il fatto che …",
        ),
    ),
    "react": (
        _p("A1", "Ja, gern.", "Yes, gladly.", "Oui, volontiers.", "Sì, volentieri."),
        _p(
            "A1",
            "Nein, leider nicht.",
            "No, unfortunately not.",
            "Non, malheureusement pas.",
            "No, purtroppo no.",
        ),
        _p(
            "A2",
            "Danke für die Frage.",
            "Thank you for the question.",
            "Merci pour la question.",
            "Grazie per la domanda.",
        ),
        _p(
            "B1",
            "Vielen Dank für die Rückmeldung.",
            "Thank you very much for the feedback.",
            "Merci beaucoup pour le retour.",
            "Grazie mille per il riscontro.",
        ),
        _p(
            "B1",
            "Das ist eine gute Frage. Ich denke, …",
            "That's a good question. I think …",
            "C'est une bonne question. Je pense que …",
            "È una bella domanda. Penso che …",
        ),
        _p(
            "B2",
            "Darauf bin ich in meinem Vortrag nicht eingegangen, aber …",
            "I didn't go into that in my talk, but …",
            "Je n'ai pas abordé ce point dans mon exposé, mais …",
            "Non ne ho parlato nella mia presentazione, ma …",
        ),
    ),
    "time": (
        _p("A1", "Wie bitte?", "Sorry? / Pardon?", "Pardon ?", "Come, scusi?"),
        _p(
            "A1",
            "Noch einmal, bitte.",
            "Once more, please.",
            "Encore une fois, s'il vous plaît.",
            "Ancora una volta, per favore.",
        ),
        _p(
            "A2",
            "Moment, ich überlege kurz.",
            "Just a moment, let me think.",
            "Un instant, je réfléchis.",
            "Un momento, ci penso un attimo.",
        ),
        _p(
            "A2",
            "Wie sagt man … auf Deutsch?",
            "How do you say … in German?",
            "Comment dit-on … en allemand ?",
            "Come si dice … in tedesco?",
        ),
        _p(
            "B1",
            "Ich meine damit, dass …",
            "What I mean by that is …",
            "Je veux dire par là que …",
            "Intendo dire che …",
        ),
        _p(
            "B2",
            "Lassen Sie es mich anders ausdrücken: …",
            "Let me put it another way: …",
            "Laissez-moi le formuler autrement : …",
            "Mi lasci dire in un altro modo: …",
        ),
    ),
    "compare": (
        _p(
            "A2",
            "Auf Bild A …, auf Bild B …",
            "In photo A …, in photo B …",
            "Sur la photo A …, sur la photo B …",
            "Nella foto A …, nella foto B …",
        ),
        _p(
            "A2",
            "Beide Bilder zeigen …",
            "Both pictures show …",
            "Les deux photos montrent …",
            "Tutte e due le foto mostrano …",
        ),
        _p(
            "B1",
            "Im Gegensatz zu Bild A …",
            "Unlike photo A, …",
            "Contrairement à la photo A, …",
            "A differenza della foto A, …",
        ),
        _p(
            "B1",
            "Der größte Unterschied ist, dass …",
            "The biggest difference is that …",
            "La plus grande différence, c'est que …",
            "La differenza più grande è che …",
        ),
        _p(
            "B2",
            "Während das erste Bild … zeigt, sieht man auf dem zweiten …",
            "Whereas the first picture shows …, the second one …",
            "Alors que la première photo montre …, la seconde …",
            "Mentre la prima foto mostra …, la seconda …",
        ),
        _p(
            "C1",
            "Was beide Situationen verbindet, ist …",
            "What both situations have in common is …",
            "Ce que les deux situations ont en commun, c'est …",
            "Ciò che accomuna le due situazioni è …",
        ),
    ),
    "speculate": (
        _p("A2", "Vielleicht …", "Maybe …", "Peut-être que …", "Forse …"),
        _p(
            "B1",
            "Wahrscheinlich warten sie auf …",
            "They're probably waiting for …",
            "Ils attendent probablement …",
            "Probabilmente aspettano …",
        ),
        _p(
            "B1",
            "Ich glaube, sie sind ein bisschen müde.",
            "I think they might be a bit tired.",
            "Je crois qu'ils sont un peu fatigués.",
            "Credo che siano un po' stanchi.",
        ),
        _p(
            "B2",
            "Es könnte sein, dass …",
            "It could be that …",
            "Il se pourrait que …",
            "Potrebbe darsi che …",
        ),
        _p(
            "B2",
            "Sie sehen aus, als ob sie es eilig hätten.",
            "They look as if they're in a hurry.",
            "On dirait qu'ils sont pressés.",
            "Sembra che abbiano fretta.",
        ),
        _p(
            "C1",
            "Ich würde vermuten, dass …",
            "I'd imagine that …",
            "J'imagine que …",
            "Immagino che …",
        ),
    ),
    "phone": (
        _p(
            "A1",
            "Guten Tag, hier spricht …",
            "Hello, this is …",
            "Bonjour, c'est …",
            "Buongiorno, sono …",
        ),
        _p(
            "A1",
            "Auf Wiederhören!",
            "Goodbye, thanks for your help.",
            "Au revoir, merci !",
            "Arrivederci, grazie!",
        ),
        _p(
            "A2",
            "Ich möchte gern einen Termin vereinbaren.",
            "I'd like to make an appointment.",
            "Je voudrais prendre rendez-vous.",
            "Vorrei fissare un appuntamento.",
        ),
        _p(
            "A2",
            "Ich muss meinen Termin leider absagen.",
            "Unfortunately I have to cancel my appointment.",
            "Je dois malheureusement annuler mon rendez-vous.",
            "Purtroppo devo disdire il mio appuntamento.",
        ),
        _p(
            "A2",
            "Können wir den Termin verschieben?",
            "Could we move the appointment?",
            "Est-ce qu'on peut déplacer le rendez-vous ?",
            "Possiamo spostare l'appuntamento?",
        ),
        _p(
            "A2",
            "Passt Ihnen Dienstag um zehn Uhr?",
            "Would Tuesday at ten suit you?",
            "Mardi à dix heures, ça vous convient ?",
            "Le va bene martedì alle dieci?",
        ),
        _p(
            "B1",
            "Ich rufe an, weil …",
            "I'm calling because …",
            "Je vous appelle parce que …",
            "La chiamo perché …",
        ),
    ),
}

# What each kind of part asks for, most useful first.
_KIND_FUNCTIONS: Mapping[str, tuple[Function, ...]] = {
    "introduce": ("introduce", "ask", "time"),
    "ask_answer": ("ask", "react", "time"),
    "requests": ("request", "react", "time"),
    "questions_about_you": ("ask", "introduce", "react"),
    "talk_about_life": ("tell", "structure", "time"),
    "plan_together": ("suggest", "agree", "disagree"),
    "present_topic": ("structure", "opinion", "tell"),
    "feedback_questions": ("react", "opinion", "time"),
    "talk": ("structure", "opinion", "describe"),
    "discussion": ("opinion", "agree", "disagree"),
    "topic_conversation": ("opinion", "tell", "agree", "disagree"),
    "picture_experience": ("describe", "tell", "time"),
    "interview": ("introduce", "tell", "react"),
    "describe_picture": ("describe", "speculate", "time"),
    "phone_call": ("phone", "request", "time"),
    "role_play": ("request", "ask", "react"),
    "obtain_information": ("ask", "request", "react"),
    "point_of_view": ("opinion", "structure", "react"),
    "persuade": ("suggest", "opinion", "disagree"),
    "long_turn": ("structure", "tell", "time"),
    "compare_pictures": ("compare", "speculate", "describe"),
    "collaborate": ("suggest", "agree", "disagree"),
    "listen_repeat": ("time",),
}

# Lines that read better as a phrase to learn than the meaning written for German learners, by
# language and the German line.
_AS_PHRASE: Mapping[tuple[str, str], str] = {
    ("en", "Wäre es möglich, dass …?"): "Would it be possible to …?",
    ("en", "Darf ich noch einmal nachfragen: Wie haben Sie das gemeint?"): (
        "Sorry, what exactly did you mean by that?"
    ),
    ("en", "Was hältst du davon, wenn wir …?"): "What do you think about …?",
    ("en", "Das passt mir gut."): "That suits me.",
    ("en", "Ein wichtiges Argument dafür ist, dass …"): (
        "One important argument in favour is that …"
    ),
    ("en", "Wenn man alle Argumente gegeneinander abwägt, komme ich zu dem Schluss, dass …"): (
        "Weighing up all the arguments, I conclude that …"
    ),
    ("en", "Ausschlaggebend ist für mich letztlich …"): "In the end, what matters most to me is …",
    ("en", "Ich komme nun zum nächsten Punkt."): "Moving on to my next point, …",
    ("en", "Zusammenfassend lässt sich festhalten, dass …"): "To sum up, …",
    ("en", "Wie bitte?"): "Sorry, could you repeat that?",
    ("en", "Noch einmal, bitte."): "Could you say that again, please?",
    ("fr", "Was hältst du davon, wenn wir …?"): "Et si nous … ?",
    ("fr", "Wollen wir am Samstag …?"): "Si on … samedi ?",
    ("fr", "Ich weiß nicht …"): "Je ne suis pas sûr(e) que …",
    ("fr", "Ein wichtiges Argument dafür ist, dass …"): (
        "Un argument important en faveur de cette idée, c'est que …"
    ),
    ("fr", "Ich habe damit gute Erfahrungen gemacht."): "J'en ai une bonne expérience.",
    ("it", "Was hältst du davon, wenn wir …?"): "E se noi …?",
    ("it", "Ich weiß nicht …"): "Non sono sicuro/a che …",
    ("it", "Noch einmal, bitte."): "Può ripetere, per favore?",
}

# How each language learned is named in German, English, French and Italian.
_LANGUAGE_NAMES = {
    "de": ("Deutsch", "German", "allemand", "tedesco"),
    "en": ("Englisch", "English", "anglais", "inglese"),
    "fr": ("Französisch", "French", "français", "francese"),
    "it": ("Italienisch", "Italian", "italien", "italiano"),
}


def _speak_a_little(language: str, level: Level) -> ExamPhrase:
    de, en, fr, it = _LANGUAGE_NAMES[language]
    article = "d'" if fr[0] in "aeiou" else "de "
    return _p(
        level,
        f"Ich spreche … und ein bisschen {de}.",
        f"I speak … and a little {en}.",
        f"Je parle … et un peu {article}{fr}.",
        f"Parlo … e un po' di {it}.",
    )


def _how_do_you_say(language: str, level: Level) -> ExamPhrase:
    de, en, fr, it = _LANGUAGE_NAMES[language]
    return _p(
        level,
        f"Wie sagt man … auf {de}?",
        f"How do you say … in {en}?",
        f"Comment dit-on … en {fr} ?",
        f"Come si dice … in {it}?",
    )


# The two lines that name the language learned, by their German line.
_LANGUAGE_NAMED: Mapping[str, Callable[[str, Level], ExamPhrase]] = {
    "Ich spreche … und ein bisschen Deutsch.": _speak_a_little,
    "Wie sagt man … auf Deutsch?": _how_do_you_say,
}


def _in(language: str, phrase: ExamPhrase) -> ExamPhrase:
    """A phrase as a learner of `language` sees it: its line in that language, with the other
    languages' lines as its meanings."""
    named = _LANGUAGE_NAMED.get(phrase.meanings["de"])
    if named is not None:
        phrase = named(language, phrase.level)
    text = _AS_PHRASE.get((language, phrase.meanings["de"]), phrase.meanings[language])
    return ExamPhrase(text, {**phrase.meanings, language: text}, phrase.level)


@cache
def functions_in(language: str) -> Mapping[Function, tuple[ExamPhrase, ...]]:
    """The whole table for the exams of one language learned."""
    return {
        function: tuple(_in(language, phrase) for phrase in phrases)
        for function, phrases in FUNCTIONS.items()
    }


def _fits(phrase: ExamPhrase, levels: Sequence[str]) -> bool:
    top = max((LEVELS.index(level) for level in levels if level in LEVELS), default=0)
    return LEVELS.index(phrase.level) <= top


def _at(function: Function, levels: Sequence[str], language: str) -> tuple[ExamPhrase, ...]:
    return tuple(phrase for phrase in functions_in(language)[function] if _fits(phrase, levels))


def phrases_for(kind: str, levels: Sequence[str], language: str = "de") -> tuple[ExamPhrase, ...]:
    """A few phrases for one part, taking turns between its functions: those of the exam's own
    level first (what the learner aims at), each level in the bank's order."""
    columns = [
        sorted(_at(function, levels, language), key=lambda phrase: -LEVELS.index(phrase.level))
        for function in _KIND_FUNCTIONS.get(kind, ())
    ]
    found: list[ExamPhrase] = []
    while len(found) < PER_PART and any(columns):
        for column in columns:
            if column and len(found) < PER_PART:
                found.append(column.pop(0))
    return tuple(found)


def bank_for(*exams: SpeakingExam) -> tuple[PhraseGroup, ...]:
    """Every phrase that helps in the parts of an exam (or of all the stages of one), by
    function, in the order the parts need them."""
    seen: list[Function] = []
    for exam in exams:
        for part in exam.parts:
            # A card with a picture or a chart asks for describing it, whatever the part.
            drawn: tuple[Function, ...] = (
                ("describe",) if any(c.picture or c.figure for c in part.cards) else ()
            )
            for function in (*_KIND_FUNCTIONS.get(part.kind, ()), *drawn):
                if function not in seen:
                    seen.append(function)
    levels = tuple({level for exam in exams for level in exam.levels})
    language = exams[0].language if exams else "de"
    groups = (PhraseGroup(function, _at(function, levels, language)) for function in seen)
    return tuple(group for group in groups if group.phrases)
