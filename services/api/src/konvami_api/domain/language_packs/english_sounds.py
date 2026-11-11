"""English sound contrasts with guidance in all interface languages (§13)."""

from konvami_api.domain.pronunciation_sounds import ProblemSound, SoundText

SOUNDS = (
    ProblemSound(
        "en_short_long_i",
        (("ship", "sheep"), ("sit", "seat")),
        ("live", "leave", "beach"),
        ("The sheep is near the ship.",),
        True,
        {
            "en": SoundText(
                "ship / sheep",
                "In ship, use a relaxed short vowel. In sheep, the tongue is higher and the "
                "vowel is tenser; length alone is not the difference.",
            ),
            "de": SoundText(
                "ship / sheep",
                "In ship ist der Vokal kurz und locker, in sheep ist die Zunge höher. Nicht "
                "nur die Länge unterscheidet die Laute.",
            ),
            "fr": SoundText(
                "ship / sheep",
                "Dans ship, la voyelle est brève et relâchée. Dans sheep, la langue est "
                "plus haute. La durée seule ne suffit pas.",
            ),
            "it": SoundText(
                "ship / sheep",
                "In ship la vocale è breve e rilassata. In sheep la lingua è più alta. Non "
                "cambia soltanto la durata.",
            ),
        },
    ),
    ProblemSound(
        "en_th",
        (("thin", "tin"), ("three", "tree")),
        ("think", "thank", "Thursday"),
        ("Three thin books are on the table.",),
        True,
        {
            "en": SoundText(
                "Unvoiced th",
                "Place the tongue lightly between the teeth and let air pass. Do not stop "
                "the air as for t, and do not add your voice.",
            ),
            "de": SoundText(
                "Stimmloses th",
                "Lege die Zunge leicht zwischen die Zähne und lass Luft strömen. Stoppe sie "
                "nicht wie bei t; die Stimme bleibt aus.",
            ),
            "fr": SoundText(
                "th non voisé",
                "Placez légèrement la langue entre les dents et laissez passer l'air sans "
                "faire vibrer la voix. Ne bloquez pas l'air comme pour t.",
            ),
            "it": SoundText(
                "th sordo",
                "Metti leggermente la lingua tra i denti e lascia passare l'aria senza "
                "voce. Non fermarla come per t.",
            ),
        },
    ),
    ProblemSound(
        "en_v_w",
        (("vest", "west"), ("vine", "wine")),
        ("very", "window", "visit"),
        ("We visited a village in the west.",),
        True,
        {
            "en": SoundText(
                "v / w",
                "For v, touch the lower lip with the upper teeth. For w, round both lips "
                "without touching them with your teeth.",
            ),
            "de": SoundText(
                "v / w",
                "Bei v berühren die oberen Zähne die Unterlippe. Bei englischem w rundest "
                "du beide Lippen ohne Zahnkontakt.",
            ),
            "fr": SoundText(
                "v / w",
                "Pour v, les dents du haut touchent la lèvre du bas. Pour w, arrondissez "
                "les lèvres sans contact avec les dents.",
            ),
            "it": SoundText(
                "v / w",
                "Per v i denti superiori toccano il labbro inferiore. Per w arrotonda "
                "entrambe le labbra senza toccarle con i denti.",
            ),
        },
    ),
)
