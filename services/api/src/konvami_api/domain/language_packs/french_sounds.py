"""French sound contrasts with guidance in all interface languages (§13)."""

from konvami_api.domain.pronunciation_sounds import ProblemSound, SoundText

SOUNDS = (
    ProblemSound(
        "fr_u_ou",
        (("tu", "tout"), ("rue", "roue")),
        ("lune", "loup", "dessus"),
        ("Tu as tout vu dans la rue.",),
        True,
        {
            "en": SoundText(
                "u / ou",
                "For u, keep the tongue forward as for i and round the lips. For ou, move "
                "the tongue back. Keep the two vowels distinct.",
            ),
            "de": SoundText(
                "u / ou",
                "Das französische u klingt ähnlich wie ü: Zunge vorn, Lippen rund. Bei ou "
                "liegt die Zunge weiter hinten, wie beim deutschen u.",
            ),
            "fr": SoundText(
                "u / ou",
                "Pour u, gardez la langue en avant comme pour i et arrondissez les lèvres. "
                "Pour ou, reculez la langue.",
            ),
            "it": SoundText(
                "u / ou",
                "Per u tieni la lingua avanti come per i e arrotonda le labbra. Per ou "
                "sposta la lingua indietro, come nella u italiana.",
            ),
        },
    ),
    ProblemSound(
        "fr_nasal",
        (("beau", "bon"), ("bas", "banc")),
        ("pain", "vin", "enfant"),
        ("Un bon pain attend sur le banc.",),
        True,
        {
            "en": SoundText(
                "Nasal vowels",
                "Let some air resonate through the nose without adding a final n. Bon and "
                "beau differ in vowel quality as well as nasal resonance.",
            ),
            "de": SoundText(
                "Nasalvokale",
                "Lass etwas Luft durch die Nase klingen, ohne ein n anzuhängen. Bon und "
                "beau unterscheiden sich auch in der Vokalqualität.",
            ),
            "fr": SoundText(
                "Voyelles nasales",
                "Laissez résonner l'air par le nez sans ajouter de n final. Bon et beau se "
                "distinguent aussi par la qualité de la voyelle.",
            ),
            "it": SoundText(
                "Vocali nasali",
                "Lascia risuonare parte dell'aria nel naso senza aggiungere una n finale. "
                "Bon e beau differiscono anche nella qualità della vocale.",
            ),
        },
    ),
    ProblemSound(
        "fr_e_open",
        (("pré", "prêt"), ("été", "était")),
        ("café", "mère", "fenêtre"),
        ("Ma mère était prête pour le café.",),
        True,
        {
            "en": SoundText(
                "Closed é / open è",
                "For è, lower the jaw a little more than for é. Listen to pré and prêt. "
                "Regional accents may merge some contrasts; those accents are valid.",
            ),
            "de": SoundText(
                "Geschlossenes é / offenes è",
                "Öffne den Kiefer bei è etwas weiter als bei é. Höre pré und prêt. "
                "Regionale Varianten können den Unterschied aufheben und sind korrekt.",
            ),
            "fr": SoundText(
                "é fermé / è ouvert",
                "Ouvrez un peu plus la mâchoire pour è que pour é. Écoutez pré et prêt. "
                "Certains accents régionaux fusionnent ces sons : ils sont valables.",
            ),
            "it": SoundText(
                "é chiusa / è aperta",
                "Abbassa un po' di più la mandibola per è rispetto a é. Ascolta pré e prêt. "
                "Alcuni accenti regionali uniscono questi suoni e sono validi.",
            ),
        },
    ),
)
