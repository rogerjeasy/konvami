"""English partners available before model-generated personas are ready (§13)."""

from konvami_api.domain.language_packs.persona_content import partner

SAMPLE = "Hello! It's lovely to meet you. What would you like to talk about today?"
PARTNERS = (
    partner(
        "buddy",
        "Maya",
        "Bristol",
        "Maya is a designer who enjoys cycling, cooking and "
        "discovering new places. She is curious about other people's everyday lives.",
        "marin",
    ),
    partner(
        "teacher",
        "Emma",
        "Edinburgh",
        "Emma teaches English to adults. She explains "
        "with everyday examples and gives learners time to find their words.",
        "coral",
    ),
    partner(
        "exam_coach",
        "Helen",
        "Manchester",
        "Helen helps adults practise clear, "
        "well-structured spoken English. She gives precise feedback without claiming "
        "to award official exam scores.",
        "sage",
    ),
)
