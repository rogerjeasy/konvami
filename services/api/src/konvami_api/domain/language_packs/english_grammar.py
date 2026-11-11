"""English grounding notes and a compact A1-C2 learning map (§13)."""

from konvami_api.domain.language_packs.grammar_content import GrammarEntry

ENTRIES = (
    GrammarEntry(
        "en_present",
        "A1",
        "Present simple and agreement",
        "Use the present simple for habits and facts. Add -s or -es with he, she and it; "
        "after does or doesn't, use the base verb. Be has the forms am, is and are.",
        ("She works in a shop.", "Does he work on Sundays?"),
        ("She work in a shop.", "Does he works on Sundays?"),
        "Ask about daily routines: What do you do after work? What does your friend do?",
    ),
    GrammarEntry(
        "en_articles",
        "A1",
        "Articles and countability",
        "A singular countable noun normally needs a determiner. Use a or an for a non-specific "
        "example and the when the listener can identify it. Use an before a vowel sound. "
        "Uncountable nouns such as advice do not take a or a plural -s.",
        ("I need an umbrella.", "Could you give me some advice?"),
        ("I need a umbrella.", "Could you give me an advice?"),
        "Ask what they carry in their bag and what they need to buy.",
    ),
    GrammarEntry(
        "en_past",
        "A2",
        "Past simple and past continuous",
        "Use the past simple for completed events and the past continuous for an activity "
        "in progress at a past time. After did or didn't, use the base verb rather than "
        "the past form. Irregular past forms need to be learned individually.",
        ("I went home yesterday.", "I was cooking when she called."),
        ("I did went home yesterday.", "I was cook when she called."),
        "Ask about yesterday and about an interruption: What were you doing when it happened?",
    ),
    GrammarEntry(
        "en_perfect",
        "B1",
        "Present perfect and past time",
        "Use have or has plus the past participle for experience or a situation linked to "
        "the present. A finished past time such as yesterday normally takes the past simple. "
        "For marks a duration; since names its starting point.",
        ("I have lived here for three years.", "I saw her yesterday."),
        ("I have lived here since three years.", "I have seen her yesterday."),
        "Ask about experiences and duration: Have you ever moved abroad? How long have you "
        "lived here?",
    ),
    GrammarEntry(
        "en_conditionals",
        "B1",
        "Conditional sentences",
        "For a likely future condition use if with the present and will in the result. "
        "For a hypothetical present use a past form with would. Do not routinely put would "
        "in the if clause; willingness and polite requests are separate uses.",
        ("If it rains, I will stay home.", "If I had time, I would travel."),
        ("If it will rain, I will stay home.", "If I would have time, I would travel."),
        "Ask about weekend plans and an imagined free month.",
    ),
    GrammarEntry(
        "en_passive",
        "B2",
        "Passive and reported speech",
        "The passive uses a form of be with a past participle. In reported speech after a "
        "past reporting verb, tense often shifts back, but need not when the fact remains "
        "true. An indirect question uses statement word order.",
        ("The bridge was built in 1990.", "She asked where I lived."),
        ("The bridge was build in 1990.", "She asked where did I live."),
        "Ask them to describe how something is made and report a question they were asked.",
    ),
    GrammarEntry(
        "en_inversion",
        "C1",
        "Emphasis and inversion",
        "After an initial negative or limiting adverbial such as rarely or not until, "
        "invert subject and auxiliary in the main clause. Use do support when there is no "
        "auxiliary. This is an emphatic, often formal construction rather than everyday order.",
        ("Rarely have I seen such patience.", "Not until later did I understand."),
        ("Rarely I have seen such patience.", "Not until later I understood."),
        "Invite a formal account of a surprising experience using rarely or not until.",
    ),
    GrammarEntry(
        "en_register",
        "C2",
        "Register and nuanced stance",
        "Match vocabulary, idioms and directness to audience and purpose. Hedging with "
        "may, appears to or arguably marks uncertainty; it should not contradict an "
        "absolute claim. A regional or informal form is not an error just because it is informal.",
        ("The results appear to support this interpretation.", "Would you mind clarifying that?"),
        ("The results definitely might prove everything.", "Would you mind to clarify that?"),
        "Ask for the same disagreement as a message to a friend and as a professional response.",
    ),
)
NOTES = tuple(entry.note() for entry in ENTRIES)
TOPICS = tuple(entry.topic() for entry in ENTRIES)
