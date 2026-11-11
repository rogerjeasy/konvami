"""Italian partners available before model-generated personas are ready (§13)."""

from konvami_api.domain.language_packs.persona_content import partner

SAMPLE = "Ciao! È un piacere conoscerti. Di che cosa ti piacerebbe parlare oggi?"
PARTNERS = (
    partner(
        "buddy",
        "Giulia",
        "Lugano",
        "Giulia lavora come grafica a Lugano. Le piacciono "
        "le passeggiate, la cucina e le storie della vita quotidiana.",
        "marin",
    ),
    partner(
        "teacher",
        "Elena",
        "Bologna",
        "Elena insegna italiano agli adulti. Usa esempi "
        "concreti e lascia il tempo di trovare le parole.",
        "coral",
    ),
    partner(
        "exam_coach",
        "Chiara",
        "Milano",
        "Chiara aiuta a organizzare risposte orali "
        "chiare e a sostenere un'opinione. Non assegna certificazioni ufficiali.",
        "sage",
    ),
)
