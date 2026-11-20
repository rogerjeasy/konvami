"""What models do on Radio Konvami (8.x): the check every call passes before anyone else hears
it (the same check as a Two Halves move, `voice_messages.py`), the veiled voice, the private
corrections, and the show itself: screening the calls, the AI callers' words and the host's
script.

The host is warm and never corrects anyone on air: the corrections are the caller's alone (8.4).
Everything a model writes is clipped and checked here; when it cannot answer, the service uses
the host's own words and the prompt's own AI calls.
"""

import json
from collections.abc import Callable, Sequence
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, ValidationError

from konvami_api.domain.costs import Charge, Feature
from konvami_api.domain.halves import Band, Correction
from konvami_api.domain.moderation import local_problem
from konvami_api.domain.radio import (
    FOLDER,
    HOST_NAME,
    SOUND_TYPE,
    VEIL_VOICE,
    Call,
    Script,
)
from konvami_api.domain.reports import words_in
from konvami_api.domain.speech import SpeechError, SpeechModel, SpeechTask
from konvami_api.domain.storage import FileStore
from konvami_api.domain.text import (
    TextModel,
    TextModelError,
    TextTask,
    answer_list,
    answer_object,
)
from konvami_api.domain.voice_messages import MessageChecker, Setting, clip

# A host line or an AI call: one or two short sentences.
LINE_MAX = 240
# At most this many calls go to the screening, so its request stays small.
SCREEN_MOST = 20

SETTING = Setting(
    intro="""You check one voice message that a language learner phoned in to a radio show of a
language-learning app, before other learners hear it on the show. The show asks one everyday
question a day (given as `question`). The message is a transcript of speech by a learner, so
expect mistakes. Other learners all over Europe will hear it: hold anything that names a private
person, gives away where exactly someone lives or studies, or tries to reach a listener.""",
    on_task="""it answers the show's question or talks about it, in any way, even briefly or
  with a joke ("Hi Mia, my funniest train trip was…").""",
    answer_name="radio_call_check",
    corrections_name="radio_corrections",
    what="this short voice message to a radio show",
    feature=Feature.RADIO,
)


class _Answer(BaseModel):
    model_config = ConfigDict(extra="ignore")


class _Picked(_Answer):
    picked: list[int]


class _Said(_Answer):
    text: str


class _Script(_Answer):
    intro: str
    after: list[str]
    outro: str


_STRING = {"type": "string"}
_PICKED_SCHEMA = answer_object({"picked": answer_list({"type": "integer"}, SCREEN_MOST)})
_SAID_SCHEMA = answer_object({"text": _STRING})


def _script_schema(callers: int) -> dict[str, Any]:
    return answer_object(
        {"intro": _STRING, "after": answer_list(_STRING, callers), "outro": _STRING}
    )


def _line(text: str) -> str | None:
    """A model's line, clipped, or None when it is empty or breaks a local rule."""
    cleaned = clip(text, LINE_MAX)
    if not words_in(cleaned) or local_problem(cleaned) is not None:
        return None
    return cleaned


class ModelBrain:
    """The `Brain` of `RadioService` on the app's real providers."""

    def __init__(
        self,
        *,
        checker: MessageChecker,
        text_model: TextModel,
        write_model: str,
        speech: SpeechModel,
        speech_model: str,
        files: FileStore,
        language_name: Callable[[str], str],
    ) -> None:
        """Empty model names: nothing is written (the host's own words are used) and nothing
        is spoken (the show has captions only)."""
        self._checker = checker
        self._text_model = text_model
        self._write_model = write_model
        self._speech = speech
        self._speech_model = speech_model
        self._files = files
        self._language_name = language_name

    def check(self, call: Call, band: Band, language: str, question: str) -> tuple[str, ...] | None:
        return self._checker.check(
            call.user_id, call.transcript, band, language, SETTING, {"question": question}
        )

    def correct(self, call: Call, target: str, explanation: str) -> tuple[Correction, ...]:
        return self._checker.correct(call.user_id, call.transcript, target, explanation, SETTING)

    def speak(self, payer: UUID | None, voice: str, text: str, key: str) -> str | None:
        if not self._speech_model or not text.strip():
            return None
        try:
            sound = self._speech.speak(
                SpeechTask(
                    self._speech_model,
                    voice,
                    text,
                    Charge(payer, Feature.RADIO_AUDIO) if payer else None,
                )
            )
        except SpeechError:
            return None
        self._files.save(key, sound, SOUND_TYPE)
        return key

    def veil(self, call: Call) -> str | None:
        if call.user_id is None:
            return None
        return self.speak(
            call.user_id,
            VEIL_VOICE,
            call.transcript,
            f"{FOLDER}/{call.user_id}/{call.episode_id}/{call.id}-veil.mp3",
        )

    def _ask(
        self, payer: UUID, name: str, instructions: str, content: object, schema: dict[str, Any]
    ) -> dict[str, Any]:
        return self._text_model.answer(
            TextTask(
                model=self._write_model,
                instructions=instructions,
                content=json.dumps(content, ensure_ascii=False),
                answer_name=name,
                answer_schema=schema,
                charge=Charge(payer, Feature.RADIO),
            )
        )

    def screen(
        self, question: str, language: str, calls: Sequence[Call], most: int, payer: UUID | None
    ) -> list[UUID] | None:
        if not self._write_model or payer is None or not calls:
            return None
        listed = list(calls)[:SCREEN_MOST]
        try:
            answer = _Picked.model_validate(
                self._ask(
                    payer,
                    "radio_screening",
                    (
                        "You produce a friendly radio show for learners of "
                        f"{self._language_name(language)}. Today's question is given. Pick at "
                        f"most {most} of the calls to put on air, best first: ones that answer "
                        "the question, are easy to follow and fun to hear. A call full of "
                        "mistakes is fine; learners are brave to call. Answer with their numbers."
                    ),
                    {
                        "question": question,
                        "calls": [
                            {"number": n, "said": call.transcript} for n, call in enumerate(listed)
                        ],
                    },
                    _PICKED_SCHEMA,
                )
            )
        except (TextModelError, ValidationError):
            return None
        picked: list[UUID] = []
        for number in answer.picked:
            if 0 <= number < len(listed) and listed[number].id not in picked:
                picked.append(listed[number].id)
        return picked[:most] or None

    def ai_call(self, question: str, language: str, name: str, payer: UUID | None) -> str | None:
        if not self._write_model or payer is None:
            return None
        try:
            said = _Said.model_validate(
                self._ask(
                    payer,
                    "radio_ai_call",
                    (
                        f"You are {name}, a cheerful learner of {self._language_name(language)} "
                        "phoning in to a radio show. Answer the show's question in one or two "
                        "short, simple sentences at level A2-B1, as a learner would say them, "
                        "with a small everyday detail. Invent nothing about real people, places "
                        "you live, or contact details."
                    ),
                    {"question": question},
                    _SAID_SCHEMA,
                )
            ).text
        except (TextModelError, ValidationError):
            return None
        return _line(said)

    def script(
        self,
        question: str,
        language: str,
        callers: Sequence[tuple[str, bool, str]],
        payer: UUID | None,
    ) -> Script | None:
        if not self._write_model or payer is None:
            return None
        try:
            written = _Script.model_validate(
                self._ask(
                    payer,
                    "radio_script",
                    (
                        f"You are {HOST_NAME}, the warm, funny host of Radio Konvami, a short "
                        f"daily show for learners of {self._language_name(language)}. Write, in "
                        f"{self._language_name(language)} at level A2-B1: `intro` (welcome the "
                        "listeners and ask today's question), `after` (one line after each "
                        "caller, in their order: thank them by name and react to what they said "
                        "with warmth or a little joke), and `outro` (say goodbye and invite "
                        "listeners to call tomorrow). Each line one or two short sentences. "
                        "Never correct a caller or mention their mistakes, never repeat a "
                        "caller's words back with fixes, and never ask for personal details."
                    ),
                    {
                        "question": question,
                        "callers": [
                            {"name": name, "ai": ai, "said": said} for name, ai, said in callers
                        ],
                    },
                    _script_schema(len(callers)),
                )
            )
        except (TextModelError, ValidationError):
            return None
        intro, outro = _line(written.intro), _line(written.outro)
        after = [_line(line) for line in written.after]
        if intro is None or outro is None or len(after) != len(callers):
            return None
        if any(line is None for line in after):
            return None
        return Script(intro, tuple(line for line in after if line is not None), outro)


__all__ = ["SETTING", "ModelBrain"]
