"""The web page for deleting an account without the app (spec §6.21.3).

One self-contained HTML page: no file, font or script from anywhere else, so a strict content
security policy can forbid everything but its own inline script and style. Its text is in the
app's four languages (deletion_page.json), its look is deletion_page.css and its behaviour
deletion_page.js, all read once when the module loads.
"""

import html
import json
from importlib import resources
from typing import Final

LANGUAGES: Final = ("en", "de", "fr", "it")
DEFAULT_LANGUAGE: Final = "en"

# Where the page's two requests go (api/public.py).
ASK_PATH: Final = "/public/delete-account/request"
CONFIRM_PATH: Final = "/public/delete-account/confirm"

# The messages the script shows: for an answer's error code, a lost connection, and the two steps.
MESSAGE_KEYS: Final = (
    "invalid_email",
    "invalid_code",
    "too_many_attempts",
    "unavailable",
    "network",
    "sent",
    "done",
)


def _read(name: str) -> str:
    return resources.files(__package__).joinpath(name).read_text(encoding="utf-8")


# One object per language with the same keys (a test keeps them equal).
TEXT: Final[dict[str, dict[str, str]]] = json.loads(_read("deletion_page.json"))
_STYLE: Final = _read("deletion_page.css")
_SCRIPT: Final = _read("deletion_page.js")


def pick_language(query: str | None, accept_language: str | None) -> str:
    """The page language: `?lang=` when it is one of ours, else the browser's first choice that
    is, else English."""
    if query in LANGUAGES:
        return str(query)
    for part in (accept_language or "").split(","):
        tag = part.split(";")[0].strip().lower().split("-")[0]
        if tag in LANGUAGES:
            return tag
    return DEFAULT_LANGUAGE


def _script_value(value: object) -> str:
    """A value as JavaScript that is safe inside a <script>: nothing in it can close the element."""
    return json.dumps(value, ensure_ascii=False).replace("<", "\\u003c").replace("&", "\\u0026")


def render(language: str, nonce: str) -> str:
    """The page in `language`; `nonce` lets the content security policy allow this one script and
    style and nothing else."""
    text = TEXT[language]
    escaped = {key: html.escape(value) for key, value in text.items()}
    script = (
        _SCRIPT.replace("__MESSAGES__", _script_value({key: text[key] for key in MESSAGE_KEYS}))
        .replace("__ASK_PATH__", _script_value(ASK_PATH))
        .replace("__CONFIRM_PATH__", _script_value(CONFIRM_PATH))
    )
    return f"""<!doctype html>
<html lang="{language}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>{escaped["title"]} · Konvami</title>
<style nonce="{nonce}">{_STYLE}</style>
</head>
<body>
<main>
<h1>{escaped["title"]}</h1>
<p>{escaped["intro"]}</p>
<p class="warning">{escaped["warning"]}</p>
<noscript><p>{escaped["noscript"]}</p></noscript>
<section id="ask-section">
<form id="ask" novalidate>
<label for="email">{escaped["email"]}</label>
<input id="email" name="email" type="email" autocomplete="email" inputmode="email"
 maxlength="254" required>
<button type="submit">{escaped["send"]}</button>
</form>
</section>
<section id="verify" hidden>
<form id="verify-form" novalidate>
<label for="code">{escaped["code"]}</label>
<input id="code" name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6"
 pattern="[0-9]{{6}}" required>
<button type="submit">{escaped["confirm"]}</button>
</form>
</section>
<section id="done" hidden></section>
<p id="status" role="status" aria-live="polite"></p>
</main>
<script nonce="{nonce}">{script}</script>
</body>
</html>
"""
