"""What models do in Two Halves (7.x): the check every move passes before anyone hears it, the
veiled voice, the private corrections, the AI stand-in and the recap scene.

The check (design note, "Safety by design") runs in this order and fails closed:

1. local rules (`moderation.local_problem`): instructions aimed at the model, links, email
   addresses, phone numbers and handles;
2. the moderation provider, on the words of the move;
3. an on-task check by the small text model: is this about the case, or is it flirting, a
   meet-up, a question about the other person, harassment or self-harm? For the minor band,
   anything off the case is held as well.

A move that fails any step is held, never delivered, and goes to the owner's queue. When a
provider cannot answer, the move is not delivered: it waits and is checked again.
"""

import datetime as dt
import json
import logging
from collections.abc import Callable, Mapping, Sequence
from typing import Literal, get_args
from uuid import UUID

from pydantic import BaseModel, ConfigDict, ValidationError

from konvami_api.domain.costs import Charge, Feature
from konvami_api.domain.halves import (
    FOLDER,
    SOUND_TYPE,
    VEIL_VOICE,
    Band,
    Case,
    Correction,
    Move,
    RecapLine,
    SeatState,
)
from konvami_api.domain.halves_cases import other_seat, template, text_in
from konvami_api.domain.moderation import (
    CONTACT,
    INSTRUCTIONS,
    LINK,
    Moderator,
    ModeratorError,
    local_problem,
)
from konvami_api.domain.reports import (
    REVIEW_SCHEMA,
    Review,
    reviewer_instructions,
    within,
    words_in,
)
from konvami_api.domain.speech import SpeechError, SpeechModel, SpeechTask
from konvami_api.domain.storage import FileStore
from konvami_api.domain.text import (
    TextModel,
    TextModelError,
    TextTask,
    answer_list,
    answer_object,
)

logger = logging.getLogger(__name__)

type Label = Literal[
    "on_task",
    "off_task",
    "romance",
    "contact_or_meetup",
    "personal_probe",
    "harassment",
    "self_harm",
]
# What holds a move, for every band; the minor band also holds `off_task`.
HOLD: frozenset[str] = frozenset(
    {"romance", "contact_or_meetup", "personal_probe", "harassment", "self_harm"}
)
# Local rules, as labels of the owner's queue.
_LOCAL_LABELS = {INSTRUCTIONS: "instructions", CONTACT: "contact_or_meetup", LINK: "link"}
MAX_CORRECTIONS = 3
QUOTE_MAX = 300
EXPLANATION_MAX = 400
LINE_MAX = 240
MAX_RECAP_LINES = 6
REACTION_VALUES = ("got_it", "again_slower", "helped", "bravo")


class _Answer(BaseModel):
    model_config = ConfigDict(extra="ignore")


class _Checked(_Answer):
    label: Label


class _Found(_Answer):
    original: str
    corrected: str
    explanation: str


class _Corrections(_Answer):
    corrections: list[_Found]


class _Understood(_Answer):
    option: int
    reaction: Literal["got_it", "again_slower", "helped", "bravo"]


class _Said(_Answer):
    text: str


class _Line(_Answer):
    speaker: Literal["A", "B"]
    text: str


class _Scene(_Answer):
    lines: list[_Line]


_STRING = {"type": "string"}
_CHECK_SCHEMA = answer_object(
    {"label": {"type": "string", "enum": list(get_args(Label.__value__))}}
)
_CORRECTIONS_SCHEMA = answer_object(
    {
        "corrections": answer_list(
            answer_object({"original": _STRING, "corrected": _STRING, "explanation": _STRING}),
            MAX_CORRECTIONS,
        )
    }
)
_UNDERSTOOD_SCHEMA = answer_object(
    {
        "option": {"type": "integer"},
        "reaction": {"type": "string", "enum": list(REACTION_VALUES)},
    }
)
_SAID_SCHEMA = answer_object({"text": _STRING})
_SCENE_SCHEMA = answer_object(
    {
        "lines": answer_list(
            answer_object({"speaker": {"type": "string", "enum": ["A", "B"]}, "text": _STRING}),
            MAX_RECAP_LINES,
        )
    }
)

_CHECK_INSTRUCTIONS = """You check one voice message in a two-player language game before the other
player hears it. The two players are strangers or friends playing a small mystery case; each
tells the other clues about the case. The message is a transcript of speech by a language
learner, so expect mistakes.

Label the message with exactly one of:
- on_task: it is about the case, the clues or the game, or polite small talk about the game
  ("Hello, here is my clue", "Good luck!"). Mistakes in the language never matter.
- off_task: it is about something else, but harmless.
- romance: flirting, compliments on looks, dating or love.
- contact_or_meetup: asks for or gives a way to contact each other outside the game (a phone
  number, a social media handle, an email, an app) or proposes to meet in person.
- personal_probe: asks the other player for personal details (age, school, where exactly they
  live, photos, their real name).
- harassment: insults, threats, hate or sexual content.
- self_harm: says or hints the speaker may hurt themselves.
Answer as JSON with the label only."""


def _clip(text: str, most: int) -> str:
    return " ".join(text.split())[:most].strip()


class ModelBrain:
    """The `Brain` of `HalvesService` on the app's real providers."""

    def __init__(
        self,
        *,
        moderator: Moderator,
        text_model: TextModel,
        check_model: str,
        write_model: str,
        review_model: str,
        speech: SpeechModel,
        speech_model: str,
        files: FileStore,
        language_name: Callable[[str], str],
        clock: Callable[[], dt.datetime],
    ) -> None:
        """Empty model names: no check can be made (every move waits, then fails), the stand-in
        says its clue as written, and nothing is spoken."""
        self._moderator = moderator
        self._text_model = text_model
        self._check_model = check_model
        self._write_model = write_model
        self._review_model = review_model
        self._speech = speech
        self._speech_model = speech_model
        self._files = files
        self._language_name = language_name
        self._clock = clock

    # --- The check

    def check(self, move: Move, band: Band, language: str) -> tuple[str, ...] | None:
        return check_spoken(
            moderator=self._moderator,
            text_model=self._text_model,
            model=self._check_model,
            words=move.transcript,
            user=move.user_id,
            band=band,
            language=self._language_name(language),
            instructions=_CHECK_INSTRUCTIONS,
            answer_name="halves_move_check",
            feature=Feature.HALVES,
        )

    # --- Sounds

    def _speak(self, user: UUID | None, voice: str, text: str, key: str) -> str | None:
        return speak_to_file(
            self._speech,
            self._speech_model,
            self._files,
            user,
            voice,
            text,
            key,
            Feature.HALVES_AUDIO,
        )

    def veil(self, move: Move) -> str | None:
        if move.user_id is None:
            return None
        return self._speak(
            move.user_id,
            VEIL_VOICE,
            move.transcript,
            f"{FOLDER}/{move.user_id}/{move.case_id}/{move.id}-veil.mp3",
        )

    # --- Private corrections (7.9)

    def correct(self, move: Move, target: str, explanation: str) -> tuple[Correction, ...]:
        if move.user_id is None:
            return ()
        return private_corrections(
            text_model=self._text_model,
            model=self._review_model,
            words=move.transcript,
            user=move.user_id,
            target=self._language_name(target),
            explained_in=self._language_name(explanation),
            what="short voice message in a game",
            answer_name="halves_corrections",
            feature=Feature.HALVES,
        )

    # --- The stand-in

    def understand(
        self, move: Move, question: str, options: Sequence[str], case: Case
    ) -> tuple[int, str]:
        """The stand-in answers the board's question from what it heard. A real model is asked
        to act on the words alone; without one, an option whose words or numbers were said is
        picked."""
        human = case.seat(move.seat)
        charge = Charge(human.user_id, Feature.HALVES) if human.user_id else None
        if self._write_model:
            task = TextTask(
                model=self._write_model,
                instructions=(
                    "You play a friendly learner in a two-player language game. You heard the "
                    "other player's voice message (a transcript, mistakes kept). Answer the "
                    "question using only what the message says: pick the option it supports. If "
                    "it does not say, pick the one you think they meant. Then react: got_it, "
                    "again_slower (you could hardly follow), helped, or bravo (a good sentence)."
                ),
                content=json.dumps(
                    {"message": move.transcript, "question": question, "options": list(options)},
                    ensure_ascii=False,
                ),
                answer_name="halves_understood",
                answer_schema=_UNDERSTOOD_SCHEMA,
                charge=charge,
            )
            try:
                understood = _Understood.model_validate(self._text_model.answer(task))
                return understood.option, understood.reaction
            except (TextModelError, ValidationError):
                pass
        return heard_option(move.transcript, options), "got_it"

    def say(self, case: Case, seat: SeatState, text: str, voice: str, move_id: UUID) -> Move:
        human = case.seat(other_seat(seat.seat))
        user = human.user_id
        said = text
        if self._write_model and user is not None:
            task = TextTask(
                model=self._write_model,
                instructions=(
                    f"You play {seat.stand_in or 'a player'}, a friendly learner of "
                    f"{self._language_name(seat.speaks)} in a two-player mystery game. Record a "
                    "short voice message to the other player that tells them this clue, in "
                    f"{self._language_name(seat.speaks)}, in one or two simple sentences, as a "
                    "learner would say it. Keep every fact, number and name of the clue exactly. "
                    "Nothing else: no questions about them, no contact details."
                ),
                content=json.dumps({"clue": text}, ensure_ascii=False),
                answer_name="halves_stand_in_move",
                answer_schema=_SAID_SCHEMA,
                charge=Charge(user, Feature.HALVES),
            )
            try:
                written = _clip(
                    _Said.model_validate(self._text_model.answer(task)).text, LINE_MAX * 2
                )
                said = written if words_in(written) and _keeps_numbers(text, written) else text
            except (TextModelError, ValidationError):
                said = text
        folder = f"{FOLDER}/{user}/{case.id}" if user else f"{FOLDER}/cases/{case.id}"
        key = self._speak(user, voice, said, f"{folder}/{move_id}.mp3")
        found = template(case.template_id)
        number = next(
            (
                clue.round
                for clue in (found.clues if found else ())
                if clue.seat == seat.seat and text_in(clue.says, seat.speaks) == text
            ),
            1,
        )
        now = self._clock()
        return Move(
            id=move_id,
            case_id=case.id,
            seat=seat.seat,
            round=number,
            user_id=None,
            status="delivered",
            transcript=said,
            created_at=now,
            audio_key=key,
            delivered_at=now,
        )

    # --- The recap (7.8)

    def recap(
        self, case: Case, seat: SeatState, voices: Mapping[str, tuple[str, str]]
    ) -> tuple[RecapLine, ...]:
        found = template(case.template_id)
        user = seat.user_id
        if found is None or user is None:
            return ()
        ending = text_in(found.ending, seat.speaks)
        lines: Sequence[tuple[str, str]] = [("A", ending)]
        if self._write_model:
            task = TextTask(
                model=self._write_model,
                instructions=(
                    "Write the last scene of a two-player mystery as a short radio drama of "
                    f"{MAX_RECAP_LINES} lines at most, in {self._language_name(seat.speaks)}, at "
                    "level A2-B1: two characters, A and B, talk about how the case ended, warmly "
                    "and with a little humour. Use the ending given; invent nothing about the "
                    "players. Each line one or two short sentences."
                ),
                content=json.dumps(
                    {
                        "title": text_in(found.title, seat.speaks),
                        "ending": ending,
                        "solved": case.status == "solved",
                        "A": voices.get("A", ("A", ""))[0],
                        "B": voices.get("B", ("B", ""))[0],
                    },
                    ensure_ascii=False,
                ),
                answer_name="halves_recap",
                answer_schema=_SCENE_SCHEMA,
                charge=Charge(user, Feature.HALVES),
            )
            try:
                scene = _Scene.model_validate(self._text_model.answer(task)).lines
                written = [
                    (line.speaker, _clip(line.text, LINE_MAX))
                    for line in scene[:MAX_RECAP_LINES]
                    if words_in(line.text)
                ]
                if written:
                    lines = written
            except (TextModelError, ValidationError):
                logger.warning("halves recap not written; the ending is used")
        recap: list[RecapLine] = []
        for number, (speaker, text) in enumerate(lines):
            voice = voices.get(speaker, ("", "alloy"))[1]
            key = self._speak(
                user, voice, text, f"{FOLDER}/{user}/{case.id}/recap-{seat.seat}-{number}.mp3"
            )
            recap.append(RecapLine("A" if speaker == "A" else "B", text, key))
        return tuple(recap)


# --- Shared with the story chain (section 9, `chain_brain.py`) ----------------------------------


def check_spoken(
    *,
    moderator: Moderator,
    text_model: TextModel,
    model: str,
    words: str,
    user: UUID | None,
    band: Band,
    language: str,
    instructions: str,
    answer_name: str,
    feature: Feature,
) -> tuple[str, ...] | None:
    """The check a learner's spoken words pass before another learner hears them, in order:
    local rules, the moderation provider, then the on-task check by the small text model
    (`instructions` say what "on task" is in the game). Labels that hold the words, empty to
    deliver them, None when they could not be checked: never delivered unchecked."""
    problem = local_problem(words)
    if problem is not None:
        return (_LOCAL_LABELS.get(problem, problem),)
    if user is None or not model:
        return None
    try:
        verdict = moderator.check([words], Charge(user, Feature.MODERATION))
    except ModeratorError:
        return None
    if verdict.flagged:
        return ("unsafe",)
    task = TextTask(
        model=model,
        instructions=instructions,
        content=json.dumps({"language": language, "message": words}, ensure_ascii=False),
        answer_name=answer_name,
        answer_schema=_CHECK_SCHEMA,
        charge=Charge(user, feature),
    )
    try:
        label = _Checked.model_validate(text_model.answer(task)).label
    except (TextModelError, ValidationError):
        return None
    if label in HOLD or (band == "minor" and label == "off_task"):
        return (label,)
    return ()


def speak_to_file(
    speech: SpeechModel,
    model: str,
    files: FileStore,
    user: UUID | None,
    voice: str,
    text: str,
    key: str,
    feature: Feature,
) -> str | None:
    """Speaks `text` in `voice` and stores it under `key`; None when nothing could be spoken."""
    if not model or not text.strip():
        return None
    try:
        sound = speech.speak(
            SpeechTask(model, voice, text, Charge(user, feature) if user else None)
        )
    except SpeechError:
        return None
    files.save(key, sound, SOUND_TYPE)
    return key


def private_corrections(
    *,
    text_model: TextModel,
    model: str,
    words: str,
    user: UUID,
    target: str,
    explained_in: str,
    what: str,
    answer_name: str,
    feature: Feature,
) -> tuple[Correction, ...]:
    """At most three corrections of what a learner said, only for them, each checked a second
    time (spec §16.1): what the check calls wrong is dropped, what it cannot confirm is a
    possibility. `target` and `explained_in` are language names; `what` names the recording."""
    if not model:
        return ()
    task = TextTask(
        model=model,
        instructions=(
            f"A learner of {target} recorded this {what}. Find at most {MAX_CORRECTIONS} clear "
            "mistakes that matter for being understood or that a native speaker would notice. "
            "Quote the learner's words exactly as `original`, give `corrected`, and explain each "
            f"in one sentence in {explained_in}. No style preferences, no punctuation or capitals "
            "(it is speech). None is a fine answer."
        ),
        content=json.dumps({"message": words}, ensure_ascii=False),
        answer_name=answer_name,
        answer_schema=_CORRECTIONS_SCHEMA,
        charge=Charge(user, feature),
    )
    try:
        found = _Corrections.model_validate(text_model.answer(task)).corrections
    except (TextModelError, ValidationError):
        return ()
    heard = words_in(words)
    kept: list[Correction] = []
    seen: set[tuple[str, ...]] = set()
    for item in found:
        original, corrected = _clip(item.original, QUOTE_MAX), _clip(item.corrected, QUOTE_MAX)
        quoted = words_in(original)
        if not quoted or quoted in seen or not within(quoted, heard):
            continue
        if words_in(corrected) in ((), quoted):
            continue
        seen.add(quoted)
        kept.append(Correction(original, corrected, _clip(item.explanation, EXPLANATION_MAX), True))
    kept = kept[:MAX_CORRECTIONS]
    if not kept:
        return ()
    review = TextTask(
        model=model,
        instructions=reviewer_instructions(target, explained_in),
        content=json.dumps(
            {
                "mistakes": [
                    {
                        "id": number,
                        "learner_said": words,
                        "original": c.original,
                        "corrected": c.corrected,
                        "explanation": c.explanation,
                    }
                    for number, c in enumerate(kept)
                ],
                "rewrites": [],
            },
            ensure_ascii=False,
        ),
        answer_name="correction_review",
        answer_schema=REVIEW_SCHEMA,
        charge=Charge(user, feature),
    )
    try:
        verdicts = {
            answer.id: answer.verdict
            for answer in Review.model_validate(text_model.answer(review)).mistakes
        }
    except (TextModelError, ValidationError):
        return tuple(Correction(c.original, c.corrected, c.explanation, False) for c in kept)
    return tuple(
        Correction(c.original, c.corrected, c.explanation, verdicts.get(n) == "correct")
        for n, c in enumerate(kept)
        if verdicts.get(n) != "wrong"
    )


def heard_option(transcript: str, options: Sequence[str]) -> int:
    """The option whose words or numbers the message says most of, or the first."""
    heard = set(words_in(transcript))
    best, best_score = 0, 0
    for number, option in enumerate(options):
        words = [w for w in words_in(option) if len(w) > 1 or w.isdigit()]
        score = sum(1 for w in words if w in heard)
        if score > best_score:
            best, best_score = number, score
    return best


def _keeps_numbers(clue: str, written: str) -> bool:
    """A rewording must keep every number of the clue: a time or a door number is the clue."""
    numbers = {w for w in words_in(clue) if any(ch.isdigit() for ch in w)}
    return numbers <= set(words_in(written))


__all__ = [
    "HOLD",
    "ModelBrain",
    "check_spoken",
    "heard_option",
    "private_corrections",
    "speak_to_file",
]
