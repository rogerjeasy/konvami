"""Speaking simulations for French exams (spec §6.13): the TCF and DELF/DALF of France Éducation
international, and the TEF of CCI Paris Île-de-France.

After their public descriptions: the TCF speaking test is about 12 minutes (a guided interview,
an interaction prepared for two minutes, a point of view); DELF A1 to B2 has a guided interview,
an exchange or monologue and a role-play, B1 adds a point of view from a short document, B2 is a
point of view defended in a debate after 30 minutes of preparation; DALF C1 is a presentation
from a dossier followed by a discussion; the TEF has a role-play to obtain information
(section A) and an argument to convince (section B). DALF C1 and TEF are compressed to one call
of about nine minutes. The cards are our own; scores are estimates, never official.
"""

from konvami_api.domain.exams import ExamPart, ExamScale, SpeakingExam, exam_card

_DELF_RUBRIC = (
    "The speaking part of the DELF or DALF is marked out of 25 and a pass needs 50 of 100 "
    "overall with at least 5 of 25 in speaking. Weigh how each part's task is done (the "
    "interview, the exchange, the role-play, the point of view) and the language: range and "
    "accuracy of vocabulary and grammar, coherence, and social appropriateness (vous, polite "
    "forms). Estimate the mark out of 25 for this speaking part."
)
_TCF_RUBRIC = (
    "The TCF speaking test is marked out of 20 and placed on a CEFR level; it is not passed or "
    "failed. Weigh task completion, coherence, range and accuracy of vocabulary and grammar, "
    "and appropriateness. Estimate the mark out of 20."
)
_TEF_RUBRIC = (
    "The TEF speaking test is scored on a scale up to 450 and placed on a CEFR level. Section A "
    "counts how well the learner obtains the information (enough relevant, well-formed "
    "questions, polite register); section B how convincingly they argue and react to "
    "objections. Estimate the score up to 450."
)
_DELF_SCALE = ExamScale("points", 0, 25, 0.5)
_DELF_PASS = 0.5


def _interview(seconds: int, card_id: str, *prompts: str) -> ExamPart:
    return ExamPart(
        "entretien",
        "interview",
        "Guided interview",
        "Ask the learner simple questions about themselves along the card: who they are, "
        "family, work or studies, interests. Follow up on what they say.",
        seconds,
        (exam_card(card_id, "Entretien dirigé", *prompts),),
    )


FRENCH_EXAMS: tuple[SpeakingExam, ...] = (
    SpeakingExam(
        id="tcf",
        exam="tcf",
        levels=("A1", "A2", "B1", "B2", "C1", "C2"),
        name="TCF · Expression orale",
        prep_seconds=2 * 60,
        language="fr",
        scale=ExamScale("points", 0, 20, 1),
        rubric=_TCF_RUBRIC,
        parts=(
            _interview(
                120, "tcf_1", "Présentez-vous", "Votre famille", "Votre travail", "Vos loisirs"
            ),
            ExamPart(
                "tache_2",
                "obtain_information",
                "Interaction: obtain information",
                "You play the person in the card's situation. The learner asks you questions to "
                "get the information they need and reacts to your answers; answer briefly and "
                "let them lead.",
                240,
                (
                    exam_card(
                        "tcf_2a",
                        "Vous voulez inscrire votre enfant à un club de football. "
                        "L'examinateur est le responsable du club.",
                        "Horaires",
                        "Prix",
                        "Équipement",
                        "Matchs",
                    ),
                    exam_card(
                        "tcf_2b",
                        "Vous cherchez une colocation. L'examinateur a une chambre à louer.",
                        "Le loyer",
                        "Le quartier",
                        "Les règles de la maison",
                        "La date d'entrée",
                    ),
                ),
            ),
            ExamPart(
                "tache_3",
                "point_of_view",
                "Express a point of view",
                "The learner gives and defends their opinion on the card's statement with "
                "arguments and examples; ask one or two questions that make them develop it.",
                180,
                (
                    exam_card(
                        "tcf_3a",
                        "« Le télétravail devrait être un droit pour tous. » Qu'en pensez-vous ?",
                        "Votre opinion",
                        "Des arguments",
                        "Des exemples",
                    ),
                    exam_card(
                        "tcf_3b",
                        "« Les écrans font plus de mal que de bien aux enfants. » Êtes-vous "
                        "d'accord ?",
                        "Votre opinion",
                        "Des arguments",
                        "Des exemples",
                    ),
                ),
            ),
        ),
    ),
    SpeakingExam(
        id="delf_a1",
        exam="delf_dalf",
        levels=("A1",),
        name="DELF A1 · Production orale",
        prep_seconds=10 * 60,
        language="fr",
        scale=_DELF_SCALE,
        pass_share=_DELF_PASS,
        rubric=_DELF_RUBRIC,
        parts=(
            _interview(60, "delf_a1_1", "Nom", "Âge", "Nationalité", "Domicile", "Loisirs"),
            ExamPart(
                "echange",
                "ask_answer",
                "Exchange information",
                "The learner asks you a question with each word of the card; answer briefly. "
                "Then ask them one question back.",
                120,
                (
                    exam_card(
                        "delf_a1_2a",
                        "Échange d'informations",
                        "Famille ?",
                        "Sport ?",
                        "Week-end ?",
                        "Petit-déjeuner ?",
                    ),
                    exam_card(
                        "delf_a1_2b",
                        "Échange d'informations",
                        "Travail ?",
                        "Vacances ?",
                        "Animaux ?",
                        "Musique ?",
                    ),
                ),
            ),
            ExamPart(
                "dialogue",
                "role_play",
                "Simulated dialogue",
                "Act out the card's shop situation as the shopkeeper: the learner asks for "
                "things, asks the price and pays.",
                150,
                (
                    exam_card(
                        "delf_a1_3a",
                        "Au marché",
                        "Des pommes : 3 € le kilo",
                        "Du fromage : 4,50 €",
                        "Du pain : 2 €",
                    ),
                    exam_card(
                        "delf_a1_3b",
                        "À la papeterie",
                        "Un cahier : 2,40 €",
                        "Des stylos : 1,20 €",
                        "Un agenda : 9 €",
                    ),
                ),
            ),
        ),
    ),
    SpeakingExam(
        id="delf_a2",
        exam="delf_dalf",
        levels=("A2",),
        name="DELF A2 · Production orale",
        prep_seconds=10 * 60,
        language="fr",
        scale=_DELF_SCALE,
        pass_share=_DELF_PASS,
        rubric=_DELF_RUBRIC,
        parts=(
            _interview(90, "delf_a2_1", "Présentez-vous", "Votre famille", "Votre quotidien"),
            ExamPart(
                "monologue",
                "talk_about_life",
                "Short monologue",
                "The learner talks for about a minute and a half about the card's subject; then "
                "ask one or two simple questions.",
                120,
                (
                    exam_card(
                        "delf_a2_2a",
                        "Parlez de votre dernier week-end.",
                        "Où ?",
                        "Avec qui ?",
                        "Qu'avez-vous fait ?",
                    ),
                    exam_card(
                        "delf_a2_2b",
                        "Décrivez votre quartier.",
                        "Les magasins",
                        "Les transports",
                        "Ce que vous aimez",
                    ),
                ),
            ),
            ExamPart(
                "interaction",
                "role_play",
                "Interaction",
                "Act out the card's situation with the learner, playing the other person: let "
                "them ask, propose and decide.",
                180,
                (
                    exam_card(
                        "delf_a2_3a",
                        "Vous organisez l'anniversaire d'un ami avec moi.",
                        "Date",
                        "Lieu",
                        "Cadeau",
                        "Invités",
                    ),
                    exam_card(
                        "delf_a2_3b",
                        "Vous louez un vélo pour la journée. Je suis l'employé.",
                        "Prix",
                        "Horaires",
                        "Caution",
                        "Casque",
                    ),
                ),
            ),
        ),
    ),
    SpeakingExam(
        id="delf_b1",
        exam="delf_dalf",
        levels=("B1",),
        name="DELF B1 · Production orale",
        prep_seconds=10 * 60,
        language="fr",
        scale=_DELF_SCALE,
        pass_share=_DELF_PASS,
        rubric=_DELF_RUBRIC,
        parts=(
            _interview(120, "delf_b1_1", "Votre parcours", "Vos projets", "Vos centres d'intérêt"),
            ExamPart(
                "interaction",
                "role_play",
                "Interaction",
                "Act out the card's situation as the other person, with a small problem to "
                "solve; the learner explains, argues and reaches an agreement.",
                180,
                (
                    exam_card(
                        "delf_b1_2a",
                        "Votre voisin fait du bruit tous les soirs. Vous "
                        "allez le voir (je suis le voisin).",
                        "Expliquer le problème",
                        "Proposer une solution",
                        "Trouver un accord",
                    ),
                    exam_card(
                        "delf_b1_2b",
                        "Vous rapportez un appareil défectueux au magasin (je suis le vendeur).",
                        "Expliquer",
                        "Demander un remboursement",
                        "Négocier",
                    ),
                ),
            ),
            ExamPart(
                "point_de_vue",
                "point_of_view",
                "Express a point of view from a document",
                "The learner presents the problem raised by the card's short document and gives "
                "their reasoned opinion for about three minutes; then ask two questions.",
                240,
                (
                    exam_card(
                        "delf_b1_3a",
                        "Document : « De plus en plus de villes "
                        "interdisent les voitures dans le centre. »",
                        "Le problème",
                        "Votre opinion",
                        "Des exemples",
                    ),
                    exam_card(
                        "delf_b1_3b",
                        "Document : « Un quart des jeunes disent lire moins de livres qu'avant. »",
                        "Le problème",
                        "Votre opinion",
                        "Des exemples",
                    ),
                ),
            ),
        ),
    ),
    SpeakingExam(
        id="delf_b2",
        exam="delf_dalf",
        levels=("B2",),
        name="DELF B2 · Production orale",
        prep_seconds=30 * 60,
        language="fr",
        scale=_DELF_SCALE,
        pass_share=_DELF_PASS,
        rubric=_DELF_RUBRIC,
        parts=(
            ExamPart(
                "expose",
                "point_of_view",
                "Present and defend a point of view",
                "The learner presents the issue in the card's short document and defends a "
                "clear, structured point of view for about four minutes, without your help.",
                300,
                (
                    exam_card(
                        "delf_b2_1a",
                        "Document : « Faut-il rendre les transports publics gratuits ? »",
                        "Dégager le problème",
                        "Une opinion argumentée",
                        "Des exemples",
                    ),
                    exam_card(
                        "delf_b2_1b",
                        "Document : « La semaine de quatre jours "
                        "améliore-t-elle la vie des salariés ? »",
                        "Dégager le problème",
                        "Une opinion argumentée",
                        "Des exemples",
                    ),
                ),
            ),
            ExamPart(
                "debat",
                "discussion",
                "Debate with the examiner",
                "Debate the learner's position as the examiner: challenge it with "
                "counter-arguments, ask them to clarify and defend it.",
                240,
                (
                    exam_card(
                        "delf_b2_2",
                        "Débat",
                        "Défendre sa position",
                        "Réagir aux objections",
                        "Nuancer",
                    ),
                ),
            ),
        ),
    ),
    SpeakingExam(
        id="dalf_c1",
        exam="delf_dalf",
        levels=("C1",),
        name="DALF C1 · Production orale",
        prep_seconds=60 * 60,
        language="fr",
        scale=_DELF_SCALE,
        pass_share=_DELF_PASS,
        rubric=_DELF_RUBRIC,
        parts=(
            ExamPart(
                "expose",
                "talk",
                "Presentation from a dossier",
                "The learner gives a structured presentation of about five minutes on the "
                "card's question, drawing on the points of the dossier, with an introduction, "
                "a plan and a conclusion.",
                300,
                (
                    exam_card(
                        "dalf_c1_1a",
                        "Dossier : l'intelligence artificielle au travail",
                        "Document 1 : des tâches automatisées",
                        "Document 2 : de nouveaux métiers",
                        "Document 3 : la formation continue",
                        "Question : faut-il en avoir peur ?",
                    ),
                    exam_card(
                        "dalf_c1_1b",
                        "Dossier : le tourisme de masse",
                        "Document 1 : des villes saturées",
                        "Document 2 : l'économie locale",
                        "Document 3 : des quotas de visiteurs",
                        "Question : faut-il limiter le tourisme ?",
                    ),
                ),
            ),
            ExamPart(
                "entretien",
                "discussion",
                "Discussion",
                "Discuss the presentation as the examiner at C1: ask for precision, raise "
                "counter-examples and let the learner defend and nuance their view.",
                240,
                (exam_card("dalf_c1_2", "Entretien", "Préciser", "Défendre", "Nuancer"),),
            ),
        ),
    ),
    SpeakingExam(
        id="tef",
        exam="tef",
        levels=("A1", "A2", "B1", "B2", "C1", "C2"),
        name="TEF · Expression orale",
        prep_seconds=60,
        language="fr",
        scale=ExamScale("points", 0, 450, 1),
        rubric=_TEF_RUBRIC,
        parts=(
            ExamPart(
                "section_a",
                "obtain_information",
                "Section A: obtain information",
                "You answer the phone for the card's advertisement. The learner asks about ten "
                "questions to get the details; answer briefly and plausibly, never volunteer "
                "what they did not ask.",
                240,
                (
                    exam_card(
                        "tef_a1",
                        "Annonce : « Cours de cuisine du monde, le samedi. "
                        "Renseignements au téléphone. »",
                        "Posez des questions",
                        "Prix, horaires, lieu, niveau…",
                    ),
                    exam_card(
                        "tef_a2",
                        "Annonce : « Appartement 3 pièces à louer, centre-ville. »",
                        "Posez des questions",
                        "Loyer, charges, étage, disponibilité…",
                    ),
                ),
            ),
            ExamPart(
                "section_b",
                "persuade",
                "Section B: convince a friend",
                "You play a friend who is not convinced. The learner presents the card's "
                "advertisement and tries to convince you to join; raise objections and "
                "let them answer each one.",
                300,
                (
                    exam_card(
                        "tef_b1",
                        "Annonce : « Week-end de randonnée dans le Jura, tout compris. »",
                        "Présentez l'offre",
                        "Convainquez votre ami",
                        "Répondez à ses objections",
                    ),
                    exam_card(
                        "tef_b2",
                        "Annonce : « Atelier de théâtre pour adultes, débutants bienvenus. »",
                        "Présentez l'offre",
                        "Convainquez votre ami",
                        "Répondez à ses objections",
                    ),
                ),
            ),
        ),
    ),
)
