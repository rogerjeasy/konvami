"""What models do in the story chain (section 9): the check every line passes before anyone hears
it, the veiled voice, the private corrections, and the narrator, an AI always labelled as one,
who sums up the story for the next seat, plays the AI characters and writes the radio play's
links.

The check and the corrections are the shared ones of a learner's voice message
(`voice_messages.MessageChecker`), with the story as the task: it fails closed, and a line that
fails it is held, never delivered, and goes to the owner's queue. Everything the narrator writes
passes `MessageChecker.clean` before other learners hear it. Without a model the narrator still
works: the AI characters say a line that goes with any story, and the radio play has the
hand-written opening and ending.
"""

import datetime as dt
import json
import logging
from collections.abc import Callable, Sequence
from uuid import UUID

from pydantic import BaseModel, ConfigDict, ValidationError

from konvami_api.domain.chain import (
    FOLDER,
    LINES,
    NARRATOR_VOICE,
    ChainSeat,
    Line,
    Segment,
    Story,
)
from konvami_api.domain.chain_openings import FALLBACK_LINES, opening, text_in
from konvami_api.domain.costs import Charge, Feature
from konvami_api.domain.halves import VEIL_VOICE, Band, Correction
from konvami_api.domain.reports import words_in
from konvami_api.domain.speech import SpeechModel
from konvami_api.domain.storage import FileStore
from konvami_api.domain.text import TextModel, TextModelError, TextTask, answer_list, answer_object
from konvami_api.domain.voice_messages import MessageChecker, Setting, speak_to_file
from konvami_api.domain.voice_messages import clip as _clip

logger = logging.getLogger(__name__)

LINE_MAX = 240
RECAP_MAX = 200

# Where a line is heard, for the shared check (`voice_messages.py`).
SETTING = Setting(
    intro="""You check one voice message in a language game before other players hear it. Four
players, friends or AI characters, build a short story together, one line each; each player only
hears the line before theirs. The message is a transcript of speech by a language learner, so
expect mistakes.""",
    on_task="""it goes on with the story, even if strange, silly or badly said, or is polite talk
  about the game ("Hello everyone, here is my line"). Story events may be dramatic (a theft, a
  storm, a ghost) as long as they are not graphic.""",
    answer_name="chain_line_check",
    corrections_name="chain_corrections",
    what="this line of a story told together with other players",
    feature=Feature.CHAIN,
)


class _Answer(BaseModel):
    model_config = ConfigDict(extra="ignore")


class _Said(_Answer):
    text: str


class _Narration(_Answer):
    links: list[str]
    ending: str


_STRING = {"type": "string"}
_SAID_SCHEMA = answer_object({"text": _STRING})
_NARRATION_SCHEMA = answer_object({"links": answer_list(_STRING, LINES), "ending": _STRING})


class ModelNarrator:
    """The `Narrator` of `ChainService` on the app's real providers."""

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
        clock: Callable[[], dt.datetime],
    ) -> None:
        """Empty model names: no check can be made (every line waits, then fails), the AI
        characters say a line that fits any story, and nothing is spoken."""
        self._checker = checker
        self._text_model = text_model
        self._write_model = write_model
        self._speech = speech
        self._speech_model = speech_model
        self._files = files
        self._language_name = language_name
        self._clock = clock

    @staticmethod
    def _folder(story: Story) -> str:
        """The narrator's and AI characters' sounds hold nobody's voice: they are the story's,
        kept with it under chain/ for 30 days at most."""
        return f"{FOLDER}/stories/{story.id}"

    def _speak(self, user: UUID | None, voice: str, text: str, key: str) -> str | None:
        return speak_to_file(
            self._speech,
            self._speech_model,
            self._files,
            user,
            voice,
            text,
            key,
            Feature.CHAIN_AUDIO,
        )

    def _write(
        self, story: Story, instructions: str, content: object, name: str, schema: dict[str, object]
    ) -> dict[str, object] | None:
        """The narrator's requests are the host's, or a player's still there; with nobody to
        meter them, none is made."""
        payer = story.payer
        if not self._write_model or payer is None:
            return None
        task = TextTask(
            model=self._write_model,
            instructions=instructions,
            content=json.dumps(content, ensure_ascii=False),
            answer_name=name,
            answer_schema=schema,
            charge=Charge(payer, Feature.CHAIN),
        )
        try:
            return self._text_model.answer(task)
        except TextModelError:
            return None

    def _clean(self, story: Story, texts: Sequence[str]) -> bool:
        """Whether what the model wrote may reach the players (`MessageChecker.clean`): fails
        closed, and the hand-written text is used instead."""
        written = [text for text in texts if text.strip()]
        return not written or self._checker.clean(story.payer, written)

    # --- The check and the private corrections

    def check(self, line: Line, band: Band, language: str) -> tuple[str, ...] | None:
        return self._checker.check(line.user_id, line.transcript, band, language, SETTING)

    def veil(self, line: Line) -> str | None:
        if line.user_id is None:
            return None
        return self._speak(
            line.user_id,
            VEIL_VOICE,
            line.transcript,
            f"{FOLDER}/{line.user_id}/{line.story_id}/{line.id}-veil.mp3",
        )

    def correct(self, line: Line, target: str, explanation: str) -> tuple[Correction, ...]:
        return self._checker.correct(line.user_id, line.transcript, target, explanation, SETTING)

    # --- The narrator

    def _story_text(self, story: Story, lines: Sequence[Line]) -> dict[str, object]:
        found = opening(story.opening_id)
        return {
            "title": text_in(found.title, story.language) if found else "",
            "opening": text_in(found.opening, story.language) if found else "",
            "lines": [line.transcript for line in lines],
        }

    def recap(self, story: Story, lines: Sequence[Line]) -> str:
        found = opening(story.opening_id)
        fallback = text_in(found.opening, story.language).split(". ")[0] if found else ""
        answer = self._write(
            story,
            (
                f"You are the narrator of a story four players tell in "
                f"{self._language_name(story.language)}, one line each. Sum up the story so far "
                f"in ONE short, simple sentence at level {story.level}, in "
                f"{self._language_name(story.language)}, so the next player knows what is going "
                "on. Retell what the lines mean, smoothly, even where they were said with "
                "mistakes. Invent nothing new and say nothing about the players."
            ),
            self._story_text(story, lines),
            "chain_recap",
            _SAID_SCHEMA,
        )
        try:
            written = _clip(_Said.model_validate(answer).text, RECAP_MAX) if answer else ""
        except ValidationError:
            written = ""
        return written if words_in(written) and self._clean(story, [written]) else fallback

    def speak_opening(self, story: Story) -> str | None:
        found = opening(story.opening_id)
        if found is None:
            return None
        return self._speak(
            story.payer,
            NARRATOR_VOICE,
            text_in(found.opening, story.language),
            f"{self._folder(story)}/opening.mp3",
        )

    def go_on(self, story: Story, lines: Sequence[Line], seat: ChainSeat, voice: str) -> Line:
        position = len(lines) + 1
        fallback_lines = FALLBACK_LINES.get(story.language, FALLBACK_LINES["en"])
        said = fallback_lines[(position - 1) % len(fallback_lines)]
        before = lines[-1].transcript if lines else ""
        answer = self._write(
            story,
            (
                f"You play {seat.ai_name or 'a player'}, a friendly AI character in a story four "
                f"players tell in {self._language_name(story.language)}, one line each. Say the "
                f"next line: one or two short sentences at level {story.level}, that go on from "
                "the line before and keep the story going (something happens, someone decides, "
                "a surprise). Simple words; no questions to the players, no contact details, "
                "nothing about real people. Leave the ending to the last line."
                + (" It is the last line: bring the story to an end." if position == LINES else "")
            ),
            {**self._story_text(story, lines), "line_before": before},
            "chain_ai_line",
            _SAID_SCHEMA,
        )
        try:
            written = _clip(_Said.model_validate(answer).text, LINE_MAX) if answer else ""
        except ValidationError:
            written = ""
        if words_in(written) and self._clean(story, [written]):
            said = written
        now = self._clock()
        line_id = UUID(int=0)
        key = self._speak(
            story.payer,
            voice,
            said,
            f"{self._folder(story)}/ai-{position}.mp3",
        )
        return Line(
            id=line_id,
            story_id=story.id,
            position=position,
            seat=seat.seat,
            user_id=None,
            status="delivered",
            transcript=said,
            created_at=now,
            ai_name=seat.ai_name,
            audio_key=key,
            delivered_at=now,
        )

    def narrate(self, story: Story, lines: Sequence[Line]) -> tuple[Segment, ...]:
        found = opening(story.opening_id)
        if found is None:
            return ()
        opening_text = text_in(found.opening, story.language)
        ending = text_in(found.ending, story.language)
        links: list[str] = []
        answer = self._write(
            story,
            (
                f"You are the narrator of a radio play in {self._language_name(story.language)} "
                f"that four players told, one line each (level {story.level}). Write a short "
                "link after each line (one sentence, at most twelve words) that retells what "
                "the line meant in correct, simple language, so the story flows even where a "
                "line was said with mistakes or did not fit; never point out a mistake. An empty "
                "link is fine when the line was clear. Then write the ending: one or two "
                "sentences that close the story warmly, with a little humour. Invent nothing "
                f"about the players. Exactly {len(lines)} links, in order."
            ),
            self._story_text(story, lines),
            "chain_radio_play",
            _NARRATION_SCHEMA,
        )
        if answer:
            try:
                narration = _Narration.model_validate(answer)
                written_links = [_clip(link, LINE_MAX) for link in narration.links[: len(lines)]]
                written_ending = _clip(narration.ending, LINE_MAX * 2)
                # All or nothing: a flagged link means the hand-written opening and ending.
                if self._clean(story, [*written_links, written_ending]):
                    links = written_links
                    if words_in(written_ending):
                        ending = written_ending
            except ValidationError:
                logger.warning("chain radio play not written; the opening and ending are used")
        folder = self._folder(story)
        segments = [
            Segment(
                "narrator",
                opening_text,
                story.opening_key
                or self._speak(story.payer, NARRATOR_VOICE, opening_text, f"{folder}/opening.mp3"),
                0,
            )
        ]
        for line, link in zip(lines, links, strict=False):
            if words_in(link):
                segments.append(
                    Segment(
                        "narrator",
                        link,
                        self._speak(
                            story.payer, NARRATOR_VOICE, link, f"{folder}/link-{line.position}.mp3"
                        ),
                        line.position,
                    )
                )
        last = lines[-1].position if lines else 0
        segments.append(
            Segment(
                "narrator",
                ending,
                self._speak(story.payer, NARRATOR_VOICE, ending, f"{folder}/ending.mp3"),
                last,
            )
        )
        return tuple(segments)


__all__ = ["ModelNarrator"]
