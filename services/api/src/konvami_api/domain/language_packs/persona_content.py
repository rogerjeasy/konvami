"""Shared portrait defaults keep built-in partners valid for the existing renderer (§13)."""

from konvami_api.domain.persona_parts import PersonaTemplate, Role, Voice


def partner(role: Role, name: str, origin: str, backstory: str, voice: Voice) -> PersonaTemplate:
    return PersonaTemplate(
        role=role,
        name=name,
        gender="female",
        age=32,
        origin=origin,
        backstory=backstory,
        voice=voice,
        look={
            "skin": "sand",
            "hair": "bob",
            "hair_color": "chestnut",
            "top": "teal",
            "backdrop": "mist",
            "glasses": role == "teacher",
            "beard": False,
        },
    )
