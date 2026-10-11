"""The Session Report (spec §6.5, §12.2): what a practice conversation showed, written after it.

Two text-model passes write it, as spec §8.2 and §16.1 ask: an analyst reads the transcript, and
a second, independent pass checks every correction before the learner sees it, because a wrong
correction is worse than none. What the second pass rejects is left out; what it cannot confirm
is kept, marked as uncertain, and never shown as a fact.

A report is read from the conversation's text. What needs the learner's voice (pace, pauses,
pronunciation) is not in it until recordings exist (spec §6.6).
"""

import datetime as dt
import json
import re
from collections.abc import Callable, Sequence
from dataclasses import dataclass, replace
from typing import Any, Literal, Protocol, get_args
from uuid import UUID

from pydantic import BaseModel, ConfigDict, ValidationError

from konvami_api.domain.accounts import AccountDirectory, AccountNotFound
from konvami_api.domain.catalog import LanguagePack
from konvami_api.domain.conversations import ConversationError, ConversationService
from konvami_api.domain.live_call import Turn
from konvami_api.domain.profile import ProfileService
from konvami_api.domain.text import TextModel, TextModelError, TextTask
from konvami_api.domain.voice import VoiceSessionRepository

# `none`: never asked for. `too_short`: the learner said too little to report on.
Status = Literal["none", "pending", "ready", "failed", "too_short"]
# How much a mistake matters (spec §13.3).
Severity = Literal["blocks_meaning", "noticeable", "minor"]

# A mistake the language pack's categories do not cover.
OTHER_CATEGORY = "other"
# Used when the profile has no level at all, which onboarding does not allow.
DEFAULT_LEVEL = "A1"

# The fewest words a learner must have said for a report to have something to say.
MIN_LEARNER_WORDS = 10
MAX_MISTAKES = 10
MAX_REWRITES = 4
MAX_WORDS = 8
MAX_WINS = 3
MAX_NEXT_STEPS = 3
# How long a report may be on its way. Writing takes a minute or two at most (two answers from
# the text model); one still pending after this was lost with its worker and counts as failed.
PENDING_FOR = dt.timedelta(minutes=5)
# The most characters kept of the summary, of a quoted sentence, and of any other text.
SUMMARY_MAX = 600
QUOTE_MAX = 300
TEXT_MAX = 400


@dataclass(frozen=True)
class Stats:
    """A conversation in numbers, counted from its text rather than asked of a model."""

    learner_words: int
    partner_words: int
    learner_turns: int
    # The most the learner said in one go.
    longest_turn_words: int


@dataclass(frozen=True)
class Mistake:
    # Which turn of the transcript it is in, counted from 0.
    turn: int
    # The learner's own words, and the same words put right.
    original: str
    corrected: str
    # Why, in the learner's explanation language.
    explanation: str
    # One of the language pack's error categories, or `other`.
    category: str
    severity: Severity
    # False when the second check could not confirm it: shown as a possible issue, not a fact.
    certain: bool


@dataclass(frozen=True)
class Rewrite:
    """A sentence that was correct, and how it is more usually said."""

    turn: int
    original: str
    natural: str
    note: str


@dataclass(frozen=True)
class Word:
    # As in a dictionary, in the language being learned.
    text: str
    # In the learner's explanation language.
    meaning: str
    # The sentence of the conversation it came from; None when it has none.
    example: str | None


@dataclass(frozen=True)
class Report:
    # The language that was practised, and the one the explanations are written in (codes, as
    # in the profile).
    target: str
    language: str
    summary: str
    mistakes: tuple[Mistake, ...]
    rewrites: tuple[Rewrite, ...]
    words: tuple[Word, ...]
    wins: tuple[str, ...]
    next_steps: tuple[str, ...]
    stats: Stats


@dataclass(frozen=True)
class StoredReport:
    status: Status
    requested_at: dt.datetime
    report: Report | None


@dataclass(frozen=True)
class ReportState:
    status: Status
    report: Report | None = None


@dataclass(frozen=True)
class Focus:
    """What to work on next, and where that advice comes from."""

    areas: tuple[str, ...]
    source: Literal["report", "placement"] | None


def what_to_practise(next_steps: Sequence[str], weak_areas: Sequence[str]) -> Focus:
    """The last report's next steps; until there is a report, what the placement test found.
    A report is newer than the test and knows what the learner did since."""
    if next_steps:
        return Focus(tuple(next_steps), "report")
    if weak_areas:
        return Focus(tuple(weak_areas), "placement")
    return Focus((), None)


class ReportError(Exception):
    """Why a report cannot be asked for, as a stable code."""

    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


class ReportRepository(Protocol):
    def requested(self, call_id: str, at: dt.datetime) -> None:
        """A report is being written for this call: pending since `at`. Whatever was stored for
        the call before is replaced. Nothing is stored for a call that does not exist."""

    def written(self, call_id: str, status: Status, report: Report | None) -> None:
        """How writing ended; `report` when it is ready."""

    def load(self, call_id: str) -> StoredReport | None: ...

    def latest(self, user_id: UUID) -> Report | None:
        """The ready report of the learner's most recent conversation that has one."""


class ReportStarter(Protocol):
    def start(self, call_id: str) -> None:
        """Has the report written, apart from the request or the call that asked for it."""


def _words(text: str) -> int:
    # A dash or an ellipsis standing alone is not a word.
    return sum(1 for piece in text.split() if any(character.isalnum() for character in piece))


def measure(turns: Sequence[Turn]) -> Stats:
    learner = [_words(turn.text) for turn in turns if turn.speaker == "learner"]
    return Stats(
        learner_words=sum(learner),
        partner_words=sum(_words(turn.text) for turn in turns if turn.speaker == "persona"),
        learner_turns=len(learner),
        longest_turn_words=max(learner, default=0),
    )


# --- What the models answer ----------------------------------------------------------------------


class _Answer(BaseModel):
    model_config = ConfigDict(extra="forbid")


class _FoundMistake(_Answer):
    turn: int
    original: str
    corrected: str
    explanation: str
    category: str
    severity: Severity


class _FoundRewrite(_Answer):
    turn: int
    original: str
    natural: str
    note: str


class _FoundWord(_Answer):
    word: str
    meaning: str
    example: str


class _Analysis(_Answer):
    summary: str
    mistakes: list[_FoundMistake]
    rewrites: list[_FoundRewrite]
    words: list[_FoundWord]
    wins: list[str]
    next_steps: list[str]


MistakeVerdict = Literal["correct", "uncertain", "wrong"]
RewriteVerdict = Literal["keep", "drop"]


class _MistakeVerdict(_Answer):
    id: int
    verdict: MistakeVerdict


class _RewriteVerdict(_Answer):
    id: int
    verdict: RewriteVerdict


class _Review(_Answer):
    mistakes: list[_MistakeVerdict]
    rewrites: list[_RewriteVerdict]


def _object(properties: dict[str, Any]) -> dict[str, Any]:
    """A JSON object in which every property is required, as the text model's strict answers
    need."""
    return {
        "type": "object",
        "additionalProperties": False,
        "required": list(properties),
        "properties": properties,
    }


def _list(items: dict[str, Any], most: int) -> dict[str, Any]:
    return {"type": "array", "items": items, "maxItems": most}


_STRING = {"type": "string"}
_INTEGER = {"type": "integer"}


def _analysis_schema(categories: Sequence[str]) -> dict[str, Any]:
    mistake = _object(
        {
            "turn": _INTEGER,
            "original": _STRING,
            "corrected": _STRING,
            "explanation": _STRING,
            "category": {"type": "string", "enum": [*categories, OTHER_CATEGORY]},
            "severity": {"type": "string", "enum": list(get_args(Severity))},
        }
    )
    rewrite = _object({"turn": _INTEGER, "original": _STRING, "natural": _STRING, "note": _STRING})
    word = _object({"word": _STRING, "meaning": _STRING, "example": _STRING})
    return _object(
        {
            "summary": _STRING,
            "mistakes": _list(mistake, MAX_MISTAKES),
            "rewrites": _list(rewrite, MAX_REWRITES),
            "words": _list(word, MAX_WORDS),
            "wins": _list(_STRING, MAX_WINS),
            "next_steps": _list(_STRING, MAX_NEXT_STEPS),
        }
    )


_REVIEW_SCHEMA = _object(
    {
        "mistakes": _list(
            _object(
                {
                    "id": _INTEGER,
                    "verdict": {"type": "string", "enum": list(get_args(MistakeVerdict))},
                }
            ),
            MAX_MISTAKES,
        ),
        "rewrites": _list(
            _object(
                {
                    "id": _INTEGER,
                    "verdict": {"type": "string", "enum": list(get_args(RewriteVerdict))},
                }
            ),
            MAX_REWRITES,
        ),
    }
)


def _analyst_instructions(target: str, explanation: str) -> str:
    return f"""You write the report on a practice conversation in {target} for a language-learning
app. A learner talked with an AI conversation partner. You get the learner's level, the
partner's name and the transcript, its turns numbered from 0.

The learner's lines were written down by speech recognition, which tends to tidy mistakes away
and sometimes mishears. Report only what the text shows. When a slip could as well be a
mishearing (a name, a word that sounds alike), leave it out.

Write to the learner ("you") in {explanation}, warmly and plainly, and quote {target} as it is.
Where {explanation} has a familiar form of address, use it, as the app does. Never grade them
and never mention a level.

`summary`: two or three sentences on what the two of them talked about.

`mistakes`: the learner's mistakes in {target} that are worth their attention, the most useful
first, at most {MAX_MISTAKES}. None is fine. For each:
- `turn`: the number of the learner's turn it is in.
- `original`: the learner's words, copied exactly from that turn, and only as many as the
  mistake needs.
- `corrected`: the same words put right, with nothing else changed.
- `explanation`: one or two short sentences saying why, with the rule in plain words.
- `category`: the kind of mistake; `other` when none fits.
- `severity`: `blocks_meaning` when one could misunderstand them, `noticeable` when it is
  clearly wrong but understood, `minor` otherwise.
These are not mistakes: regional standard forms, ordinary spoken {target}, words in another
language, missing punctuation or capital letters (this was speech), and breaking off or starting
a sentence again. A mistake made several times is reported once.

`rewrites`: up to {MAX_REWRITES} of the learner's sentences that are correct, but that a native
speaker would put differently. `original` is copied exactly; `natural` is how it is usually
said, within the learner's level; `note` says the difference in one short sentence. Nothing that
is already under `mistakes`.

`words`: up to {MAX_WORDS} words or phrases from this conversation worth keeping: ones the
partner used that are probably new at the learner's level, and ones the learner asked for or
searched for. `word` in {target} as a dictionary gives it (a noun with its article); `meaning`
in {explanation}; `example`: the sentence of the transcript it came from, copied exactly.

`wins`: one to {MAX_WINS} things the learner did well, each of them something the transcript
shows (a structure used correctly, a long answer, a question they asked). No general praise.

`next_steps`: one to {MAX_NEXT_STEPS} things to practise next time, the most useful first,
following from the mistakes. Each is one short phrase that names the thing, with a brief example
where that helps, in at most fifteen words. Not an exercise and not a full sentence of advice:
the learner's conversation partner is given these and brings them up."""


def _reviewer_instructions(target: str, explanation: str) -> str:
    return f"""You check corrections of a learner's spoken {target} before a language-learning
app shows them. A wrong correction is worse than no correction, so be strict. The explanations
are written in {explanation}.

For each item in `mistakes` you get what the learner said, the words marked as a mistake, the
correction and its explanation. Give a verdict:
- `correct`: the marked words really are wrong in standard {target}, the correction is right
  and changes nothing else, and the explanation states a true rule that applies here.
- `wrong`: the learner's words were acceptable (regional standard forms and ordinary spoken
  {target} are), or the correction is itself wrong or changes what they meant, or the
  explanation is false.
- `uncertain`: it depends on what the learner meant, or on something the text does not show.

For each item in `rewrites` you get the learner's sentence and a more natural way to say it.
Answer `keep` only when the learner's sentence is correct, the suggestion is correct and means
the same, and it is clearly what native speakers more usually say. Otherwise `drop`.

Judge every item on its own, and answer for every id."""


# --- Reading the analyst's answer ----------------------------------------------------------------


def _tokens(text: str) -> tuple[str, ...]:
    """The words of a text, without capitals and punctuation: how two quotes are compared."""
    return tuple(re.findall(r"\w+", text.casefold()))


def _within(part: tuple[str, ...], whole: tuple[str, ...]) -> bool:
    size = len(part)
    return any(whole[start : start + size] == part for start in range(len(whole) - size + 1))


def _clip(text: str, most: int = TEXT_MAX) -> str:
    return text.strip()[:most]


def _lines(lines: Sequence[str], most: int) -> tuple[str, ...]:
    return tuple(clipped for line in lines if (clipped := _clip(line)))[:most]


class _Said:
    """What was said, to hold the analyst's quotes against: a model can quote words nobody
    said, and a correction of those must never reach the learner."""

    def __init__(self, turns: Sequence[Turn]) -> None:
        self._turns = turns
        self._tokens = [_tokens(turn.text) for turn in turns]

    def _learner_said(self, quote: tuple[str, ...], turn: int) -> bool:
        return (
            0 <= turn < len(self._turns)
            and self._turns[turn].speaker == "learner"
            and _within(quote, self._tokens[turn])
        )

    def learner_turn(self, quote: str, named: int) -> int | None:
        """The learner's turn a quote is from: the one named if it is there, else the first one
        that has it, else None."""
        tokens = _tokens(quote)
        if not tokens:
            return None
        candidates = (named, *range(len(self._turns)))
        return next((turn for turn in candidates if self._learner_said(tokens, turn)), None)

    def anyone(self, sentence: str) -> bool:
        tokens = _tokens(sentence)
        return bool(tokens) and any(_within(tokens, said) for said in self._tokens)


def _mistakes(
    found: Sequence[_FoundMistake], said: _Said, categories: Sequence[str]
) -> list[Mistake]:
    mistakes: list[Mistake] = []
    seen: set[tuple[str, ...]] = set()
    for item in found:
        original, corrected = _clip(item.original, QUOTE_MAX), _clip(item.corrected, QUOTE_MAX)
        turn = said.learner_turn(original, item.turn)
        words = _tokens(original)
        # Speech has no punctuation or capitals to get wrong: a correction must change a word.
        if turn is None or words in seen or _tokens(corrected) in ((), words):
            continue
        seen.add(words)
        mistakes.append(
            Mistake(
                turn=turn,
                original=original,
                corrected=corrected,
                explanation=_clip(item.explanation),
                category=item.category if item.category in categories else OTHER_CATEGORY,
                severity=item.severity,
                certain=True,
            )
        )
    return mistakes[:MAX_MISTAKES]


def _rewrites(found: Sequence[_FoundRewrite], said: _Said) -> list[Rewrite]:
    rewrites: list[Rewrite] = []
    for item in found:
        original, natural = _clip(item.original, QUOTE_MAX), _clip(item.natural, QUOTE_MAX)
        turn = said.learner_turn(original, item.turn)
        if turn is not None and _tokens(natural) not in ((), _tokens(original)):
            rewrites.append(Rewrite(turn, original, natural, _clip(item.note)))
    return rewrites[:MAX_REWRITES]


def _vocabulary(found: Sequence[_FoundWord], said: _Said) -> tuple[Word, ...]:
    words = [
        Word(
            text=_clip(item.word, QUOTE_MAX),
            meaning=_clip(item.meaning),
            # Shown as a sentence from this conversation, so it has to be one.
            example=_clip(item.example, QUOTE_MAX) if said.anyone(item.example) else None,
        )
        for item in found
        if item.word.strip() and item.meaning.strip()
    ]
    return tuple(words[:MAX_WORDS])


# --- The service ---------------------------------------------------------------------------------


class ReportService:
    def __init__(
        self,
        *,
        profiles: ProfileService,
        conversations: ConversationService,
        sessions: VoiceSessionRepository,
        accounts: AccountDirectory,
        repository: ReportRepository,
        starter: ReportStarter,
        text_model: TextModel,
        model: str,
        clock: Callable[[], dt.datetime],
    ) -> None:
        self._profiles = profiles
        self._conversations = conversations
        self._sessions = sessions
        self._accounts = accounts
        self._repository = repository
        self._starter = starter
        self._text_model = text_model
        self._model = model
        self._clock = clock

    def after_call(self, user_id: UUID, call_id: str) -> None:
        """A practice conversation has ended: has its report written, if it counts as one."""
        if not self._model:
            return
        try:
            counts = self._conversations.get(user_id, call_id).counts
        except ConversationError:
            return
        if counts:
            try:
                self._start(call_id)
            except ReportError:
                # Stored as failed: the learner can ask for it again.
                return

    def request(self, user_id: UUID, call_id: str) -> ReportState:
        """The learner asks for a report: for a conversation from before reports existed, or
        again after one failed. One that is there or on its way is left as it is."""
        if not self._conversations.get(user_id, call_id).counts:
            raise ReportError("nothing_to_report")
        state = self._state(call_id)
        if state.status not in ("none", "failed"):
            return state
        if not self._model:
            raise ReportError("unavailable")
        # The transcript goes to the text model's provider, which the learner must have agreed
        # to (Apple guideline 5.1.2(i)). They agreed before the call; they may have withdrawn.
        try:
            consented = self._accounts.get(user_id).voice_consent
        except AccountNotFound:
            consented = False
        if not consented:
            raise ReportError("consent_required")
        self._start(call_id)
        return ReportState("pending")

    def _start(self, call_id: str) -> None:
        self._repository.requested(call_id, self._clock())
        try:
            self._starter.start(call_id)
        except Exception as error:
            self._repository.written(call_id, "failed", None)
            raise ReportError("unavailable") from error

    def view(self, user_id: UUID, call_id: str) -> ReportState:
        """The report of one of the learner's conversations, or how far it is."""
        self._conversations.get(user_id, call_id)
        return self._state(call_id)

    def _state(self, call_id: str) -> ReportState:
        stored = self._repository.load(call_id)
        if stored is None:
            return ReportState("none")
        if stored.status == "pending" and self._clock() - stored.requested_at > PENDING_FOR:
            return ReportState("failed")
        return ReportState(stored.status, stored.report)

    def next_steps(self, user_id: UUID) -> tuple[str, ...]:
        """What the learner's last report suggested practising, in the language they are
        learning now; nothing before the first report."""
        latest = self._repository.latest(user_id)
        if latest is None or latest.target != self._profiles.get(user_id).target_language:
            return ()
        return latest.next_steps

    def write(self, call_id: str) -> None:
        """Writes the report that was asked for. Runs apart from any request (`ReportStarter`),
        and does nothing for a call whose report is not waiting to be written."""
        session = self._sessions.get(call_id)
        if session is None:
            return
        stored = self._repository.load(call_id)
        if stored is None or stored.status != "pending":
            return
        transcript = self._conversations.transcript(session.user_id, call_id)
        turns = transcript.turns
        partner = transcript.conversation.partner
        stats = measure(turns)
        if stats.learner_words < MIN_LEARNER_WORDS:
            self._repository.written(call_id, "too_short", None)
            return

        profile = self._profiles.get(session.user_id)
        catalog = self._profiles.catalog
        language = profile.target_language or ""
        explained_in = profile.value(language, "explanation_language") or "en"
        target, explanation = catalog.english_name(language), catalog.english_name(explained_in)
        pack = catalog.available_pack(language)

        content = {
            "level": profile.level(language) or DEFAULT_LEVEL,
            "partner": partner.name if partner else None,
            "transcript": [
                {"turn": number, "speaker": turn.speaker, "text": turn.text}
                for number, turn in enumerate(turns)
            ],
        }
        try:
            analysis = self._analyse(pack, target, explanation, content)
        except (TextModelError, ValidationError):
            self._repository.written(call_id, "failed", None)
            return
        said = _Said(turns)
        mistakes, rewrites = self._review(
            target,
            explanation,
            turns,
            _mistakes(analysis.mistakes, said, pack.error_categories if pack else ()),
            _rewrites(analysis.rewrites, said),
        )
        report = Report(
            target=language,
            language=explained_in,
            summary=_clip(analysis.summary, SUMMARY_MAX),
            mistakes=tuple(mistakes),
            rewrites=tuple(rewrites),
            words=_vocabulary(analysis.words, said),
            wins=_lines(analysis.wins, MAX_WINS),
            next_steps=_lines(analysis.next_steps, MAX_NEXT_STEPS),
            stats=stats,
        )
        self._repository.written(call_id, "ready", report)

    def _analyse(
        self, pack: LanguagePack | None, target: str, explanation: str, content: dict[str, Any]
    ) -> _Analysis:
        task = TextTask(
            model=self._model,
            instructions=_analyst_instructions(target, explanation),
            content=json.dumps(content, ensure_ascii=False),
            answer_name="session_report",
            answer_schema=_analysis_schema(pack.error_categories if pack else ()),
        )
        return _Analysis.model_validate(self._text_model.answer(task))

    def _review(
        self,
        target: str,
        explanation: str,
        turns: Sequence[Turn],
        mistakes: list[Mistake],
        rewrites: list[Rewrite],
    ) -> tuple[list[Mistake], list[Rewrite]]:
        """The second, independent check (spec §16.1): what it calls wrong is left out, and only
        what it confirms is shown as a fact."""
        if not mistakes and not rewrites:
            return [], []
        content = {
            "mistakes": [
                {
                    "id": number,
                    "learner_said": turns[mistake.turn].text,
                    "original": mistake.original,
                    "corrected": mistake.corrected,
                    "explanation": mistake.explanation,
                }
                for number, mistake in enumerate(mistakes)
            ],
            "rewrites": [
                {
                    "id": number,
                    "learner_said": turns[rewrite.turn].text,
                    "original": rewrite.original,
                    "natural": rewrite.natural,
                }
                for number, rewrite in enumerate(rewrites)
            ],
        }
        task = TextTask(
            model=self._model,
            instructions=_reviewer_instructions(target, explanation),
            content=json.dumps(content, ensure_ascii=False),
            answer_name="correction_review",
            answer_schema=_REVIEW_SCHEMA,
        )
        try:
            review = _Review.model_validate(self._text_model.answer(task))
        except (TextModelError, ValidationError):
            # Unchecked, a correction is only a possibility, and a rewording is not worth showing.
            return [replace(mistake, certain=False) for mistake in mistakes], []
        # An id that was not answered for counts as uncertain (a mistake) or dropped (a rewording).
        verdicts = {answer.id: answer.verdict for answer in review.mistakes}
        kept = {answer.id for answer in review.rewrites if answer.verdict == "keep"}
        return (
            [
                replace(mistake, certain=verdicts.get(number) == "correct")
                for number, mistake in enumerate(mistakes)
                if verdicts.get(number) != "wrong"
            ],
            [rewrite for number, rewrite in enumerate(rewrites) if number in kept],
        )
