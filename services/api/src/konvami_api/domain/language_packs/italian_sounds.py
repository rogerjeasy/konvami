"""Italian sound contrasts with guidance in all interface languages (§13)."""

from konvami_api.domain.pronunciation_sounds import ProblemSound, SoundText

SOUNDS = (
    ProblemSound(
        "it_geminates",
        (("pala", "palla"), ("fato", "fatto")),
        ("nonno", "notte", "cappello"),
        ("La palla è vicino alla pala.",),
        True,
        {
            "en": SoundText(
                "Double consonants",
                "Hold the consonant longer, not the preceding vowel. Pala and palla mean "
                "different things; the longer closure is part of the word.",
            ),
            "de": SoundText(
                "Doppelte Konsonanten",
                "Halte den Konsonanten länger, nicht den Vokal davor. Pala und palla "
                "bedeuten Verschiedenes; die längere Schließung gehört zum Wort.",
            ),
            "fr": SoundText(
                "Consonnes doubles",
                "Prolongez la consonne, pas la voyelle précédente. Pala et palla ont des "
                "sens différents : la fermeture plus longue fait partie du mot.",
            ),
            "it": SoundText(
                "Consonanti doppie",
                "Trattieni più a lungo la consonante, non la vocale precedente. Pala e "
                "palla hanno significati diversi: la durata fa parte della parola.",
            ),
        },
    ),
    ProblemSound(
        "it_r_l",
        (("rana", "lana"), ("rima", "lima")),
        ("Roma", "luna", "caro"),
        ("La rana riposa vicino alla lana.",),
        True,
        {
            "en": SoundText(
                "r / l",
                "For r, let the tongue tip tap or vibrate near the ridge behind the upper "
                "teeth. For l, keep the tip in contact and let air pass around it.",
            ),
            "de": SoundText(
                "r / l",
                "Bei r tippt oder vibriert die Zungenspitze hinter den oberen Zähnen. Bei l "
                "bleibt sie dort und Luft strömt seitlich vorbei.",
            ),
            "fr": SoundText(
                "r / l",
                "Pour r, la pointe de la langue bat derrière les dents du haut. Pour l, "
                "elle reste en contact et l'air passe sur les côtés.",
            ),
            "it": SoundText(
                "r / l",
                "Per r la punta della lingua tocca o vibra dietro i denti superiori. Per l "
                "resta a contatto e l'aria passa ai lati.",
            ),
        },
    ),
    ProblemSound(
        "it_gn",
        (("sogno", "sono"),),
        ("bagno", "montagna", "gnocchi"),
        ("Sogno una casa in montagna.",),
        True,
        {
            "en": SoundText(
                "gn / n",
                "For gn, press the middle of the tongue towards the hard palate, as in "
                "bagno. Do not pronounce a separate g followed by n.",
            ),
            "de": SoundText(
                "gn / n",
                "Hebe bei gn die Zungenmitte zum harten Gaumen, wie in bagno. Sprich kein "
                "separates g vor dem n.",
            ),
            "fr": SoundText(
                "gn / n",
                "Pour gn, rapprochez le milieu de la langue du palais, comme dans bagno. Ne "
                "prononcez pas un g séparé avant le n.",
            ),
            "it": SoundText(
                "gn / n",
                "Per gn avvicina il centro della lingua al palato duro, come in bagno. Non "
                "pronunciare una g separata seguita da n.",
            ),
        },
    ),
)
