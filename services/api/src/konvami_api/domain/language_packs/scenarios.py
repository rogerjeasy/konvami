"""Reuse everyday scenarios while adapting local administrative assumptions (§13)."""

from dataclasses import replace

from konvami_api.domain.scenarios import GERMAN_SCENARIOS, Scenario

# The same task ids preserve existing translated screen and goal labels. The setting changes,
# not the learner's goals; the main practice prompt selects the pack's target language.
_REGISTRATION = {
    "en": (
        "a helpful clerk at a local council service desk",
        "The learner has moved to a new "
        "home and asks which local services need their address. Do not assume a mandatory "
        "German-style residence registration or invent legal obligations.",
    ),
    "fr": (
        "un agent aimable au guichet des services municipaux",
        "La personne vient de "
        "déménager et demande quelles démarches locales sont utiles. Demander le pays et "
        "la commune avant de parler d'obligations; ne pas inventer une procédure allemande.",
    ),
    "it": (
        "un impiegato cortese allo sportello dei servizi comunali",
        "La persona ha "
        "traslocato e chiede informazioni sulle pratiche locali. Chiedere il comune e il "
        "paese prima di descrivere obblighi; non presumere la procedura tedesca.",
    ),
}


def scenarios_for(language: str) -> tuple[Scenario, ...]:
    """Keep shared situations and replace the only country-specific administrative one."""
    character, situation = _REGISTRATION[language]
    return tuple(
        replace(scenario, character=character, situation=situation)
        if scenario.id == "registration"
        else scenario
        for scenario in GERMAN_SCENARIOS
    )
