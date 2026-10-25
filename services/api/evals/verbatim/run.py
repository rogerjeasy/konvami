"""Runs the accuracy test of spec §16.2 against the real models (spec §18 phase 0, spike d).

Every sentence of `golden.py` is spoken by a text-to-speech voice told to sound like a learner,
then written down by each transcription setup: the live transcription of a call (as the app
configures it, and with the language and the verbatim instruction), and the verbatim pass after
it with each candidate model. The Live Error Spotter (`domain/spotter.py`, the production code)
then checks what the production setup wrote, so its recall and its false alarms are measured on
what it really gets.

    poetry run python -m evals.verbatim.run --key-file ../../infra/envs/dev/terraform.tfvars

It costs about a dollar. Speech is kept in `evals/verbatim/.audio/` (not committed), so a second
run pays only for the transcriptions and checks. The key is read from the file and never printed.
"""

import argparse
import asyncio
import base64
import datetime as dt
import json
import re
import statistics
from collections.abc import Callable, Sequence
from concurrent.futures import ThreadPoolExecutor
from dataclasses import asdict, dataclass
from functools import partial
from pathlib import Path
from typing import Any
from uuid import uuid4

import httpx
from websockets.asyncio.client import connect

from evals.verbatim.golden import CONTROLS, MISTAKES, Sample
from evals.verbatim.scoring import (
    Heard,
    SystemSummary,
    caught,
    false_alarms,
    heard,
    summarise,
    word_error_rate,
)
from konvami_api.domain.catalog import CATALOG
from konvami_api.domain.live_call import AUDIO_RATE, LiveCorrection, Spot
from konvami_api.domain.recordings import wav
from konvami_api.domain.speech import TranscriptionError, TranscriptionTask, verbatim_prompt
from konvami_api.domain.spotter import LiveCheck, SpotContext
from konvami_api.providers.openai_text import OpenAiText
from konvami_api.providers.openai_transcription import OpenAiTranscription

HERE = Path(__file__).parent
AUDIO = HERE / ".audio"
SPEECH_MODEL = "gpt-4o-mini-tts"
REALTIME_MODEL = "gpt-realtime-2.1-mini"
TARGET = "German"
# Requests at once: well within the provider's limits, and quick.
WORKERS = 6
# 200 ms of 16-bit audio per message to the live session.
CHUNK_BYTES = AUDIO_RATE * 2 // 5
LIVE_TIMEOUT_SECONDS = 30.0
SPEECH_ATTEMPTS = 3


@dataclass(frozen=True)
class Voice:
    """A way of speaking the sentences: a voice and how it is told to speak."""

    name: str
    voice: str
    instructions: str


VOICES = (
    Voice("clear", "alloy", "Speak German clearly at a normal pace, exactly the words given."),
    Voice(
        "english_learner",
        "ash",
        "You are an adult English speaker learning German, at about level A2. Speak slowly, with "
        "a noticeable English accent and a short pause or two. Say exactly the words given, "
        "mistakes included: never correct them.",
    ),
    Voice(
        "french_learner",
        "coral",
        "You are an adult French speaker learning German, at about level A2. Speak at a careful "
        "pace with a clear French accent. Say exactly the words given, mistakes included: never "
        "correct them.",
    ),
)
SAMPLES: tuple[Sample, ...] = (*MISTAKES, *CONTROLS)


def read_key(path: Path) -> str:
    """The OpenAI key from a Terraform variables file (`openai_api_key = "…"`) or an env file."""
    text = path.read_text()
    found = re.search(r'^\s*(?:openai_api_key|OPENAI_API_KEY)\s*=\s*"?([^"\n]+)"?', text, re.M)
    if not found:
        raise SystemExit(f"No OpenAI key in {path}")
    return found.group(1).strip()


# --- Speech ---------------------------------------------------------------------------------------


def speak(http: httpx.Client, key: str, voice: Voice, sample: Sample) -> bytes:
    """The sentence as 16-bit PCM at `AUDIO_RATE`, from the cache when it was spoken before."""
    cached = AUDIO / voice.name / f"{sample.id}.pcm"
    if cached.exists():
        return cached.read_bytes()
    # A speech request now and then takes minutes; another try is usually quick.
    for attempt in range(SPEECH_ATTEMPTS):
        try:
            response = http.post(
                "https://api.openai.com/v1/audio/speech",
                headers={"Authorization": f"Bearer {key}"},
                json={
                    "model": SPEECH_MODEL,
                    "voice": voice.voice,
                    "input": sample.said,
                    "instructions": voice.instructions,
                    "response_format": "pcm",
                },
                timeout=60,
            )
            break
        except httpx.TimeoutException:
            if attempt == SPEECH_ATTEMPTS - 1:
                raise
    response.raise_for_status()
    cached.parent.mkdir(parents=True, exist_ok=True)
    cached.write_bytes(response.content)
    return response.content


# --- The live transcription of a call ---------------------------------------------------------


async def live_transcripts(
    key: str, model: str, clips: Sequence[tuple[str, bytes]], *, verbatim: bool
) -> dict[str, str]:
    """What a call's live transcription writes for each clip, in one session as in a call (the
    model is never asked to reply). `verbatim` adds the language and the verbatim instruction."""
    transcription: dict[str, Any] = {"model": model}
    if verbatim:
        transcription |= {"language": "de", "prompt": verbatim_prompt(TARGET)}
    url = f"wss://api.openai.com/v1/realtime?model={REALTIME_MODEL}"
    found: dict[str, str] = {}
    async with connect(
        url, additional_headers={"Authorization": f"Bearer {key}"}, max_size=2**25
    ) as ws:
        await ws.send(
            json.dumps(
                {
                    "type": "session.update",
                    "session": {
                        "type": "realtime",
                        "output_modalities": ["text"],
                        "audio": {
                            "input": {
                                "format": {"type": "audio/pcm", "rate": AUDIO_RATE},
                                "transcription": transcription,
                                "turn_detection": None,
                            }
                        },
                    },
                }
            )
        )
        for sample_id, pcm in clips:
            for start in range(0, len(pcm), CHUNK_BYTES):
                chunk = base64.b64encode(pcm[start : start + CHUNK_BYTES]).decode()
                await ws.send(json.dumps({"type": "input_audio_buffer.append", "audio": chunk}))
            await ws.send(json.dumps({"type": "input_audio_buffer.commit"}))
            item_id = None
            while True:
                event = json.loads(await asyncio.wait_for(ws.recv(), LIVE_TIMEOUT_SECONDS))
                kind = event.get("type")
                if kind == "input_audio_buffer.committed":
                    item_id = event.get("item_id")
                elif kind == "conversation.item.input_audio_transcription.completed":
                    if event.get("item_id") == item_id:
                        found[sample_id] = event.get("transcript", "")
                        break
                elif kind == "conversation.item.input_audio_transcription.failed":
                    found[sample_id] = ""
                    break
                elif kind == "error":
                    raise RuntimeError(json.dumps(event.get("error"))[:300])
            # Each turn stands alone, as the transcription treats it.
            await ws.send(json.dumps({"type": "conversation.item.delete", "item_id": item_id}))
    return found


# --- The verbatim pass ------------------------------------------------------------------------


def verbatim_transcript(transcriber: OpenAiTranscription, model: str, pcm: bytes) -> str:
    task = TranscriptionTask(
        model=model, audio=wav(pcm), language="de", prompt=verbatim_prompt(TARGET)
    )
    try:
        return transcriber.transcribe(task)
    except TranscriptionError as error:
        return f"<failed: {error}>"


# --- The run ----------------------------------------------------------------------------------


def _parallel[T, R](work: Callable[[T], R], items: Sequence[T]) -> list[R]:
    with ThreadPoolExecutor(max_workers=WORKERS) as pool:
        return list(pool.map(work, items))


@dataclass(frozen=True)
class Checker:
    """One spotter model, checking the turns spoken by one voice."""

    check: LiveCheck
    context: SpotContext
    model: str
    voice: str

    def __call__(self, given: tuple[Sample, str, bytes]) -> dict[str, Any]:
        """Checks one sentence as a call would hand it over: what was heard, and its audio. No
        audio and the sentence itself is the spotter alone, with perfect hearing."""
        sample, said, pcm = given
        spotted = self.check.check(self.context, Spot(sample.id, said, pcm, None))
        return {
            "voice": self.voice,
            "spotter": self.model,
            "input": "call (live text + audio)" if pcm else "exact sentence",
            "sample": sample.id,
            "verbatim": spotted.verbatim,
            "caught": caught(sample, spotted.corrections),
            "false_alarms": false_alarms(sample, spotted.corrections),
            "corrections": [asdict(c) for c in spotted.corrections],
        }


def run(
    key: str,
    live_model: str,
    verbatim_models: Sequence[str],
    spotters: Sequence[str],
    samples: Sequence[Sample] = SAMPLES,
) -> dict[str, Any]:
    http = httpx.Client()
    transcriber = OpenAiTranscription(lambda: key, http=http)
    text = OpenAiText(lambda: key)
    pack = CATALOG.available_pack("de")
    if pack is None:
        raise SystemExit("The German pack is not available")
    rows: list[dict[str, Any]] = []
    checks: list[dict[str, Any]] = []
    for voice in VOICES:
        spoken = _parallel(partial(speak, http, key, voice), samples)
        audio = {sample.id: pcm for sample, pcm in zip(samples, spoken, strict=True)}
        clips = list(audio.items())
        transcripts: dict[str, dict[str, str]] = {
            f"live {live_model}": asyncio.run(
                live_transcripts(key, live_model, clips, verbatim=False)
            ),
            f"live {live_model} + language and instruction": asyncio.run(
                live_transcripts(key, live_model, clips, verbatim=True)
            ),
        }
        for model in verbatim_models:
            written = _parallel(
                partial(verbatim_transcript, transcriber, model), list(audio.values())
            )
            transcripts[f"verbatim {model}"] = dict(zip(audio, written, strict=True))
        for system, found in transcripts.items():
            for sample in samples:
                transcript = found.get(sample.id, "")
                rows.append(
                    {
                        "voice": voice.name,
                        "system": system,
                        "sample": sample.id,
                        "transcript": transcript,
                        "heard": heard(sample, transcript).value,
                        "wer": word_error_rate(sample.said, transcript),
                    }
                )
        # The Live Error Spotter as in a call: the live text, and the turn's audio for its own
        # verbatim pass (the first verbatim model, the production one).
        live = transcripts[f"live {live_model}"]
        context = SpotContext(
            user_id=uuid4(),
            language="de",
            target=TARGET,
            explanation="English",
            level="A2",
            categories=pack.error_categories,
            focus=(),
        )
        for spotter_model in spotters:
            check = LiveCheck(
                transcriber=transcriber,
                text_model=text,
                transcription_model=verbatim_models[0],
                model=spotter_model,
            )
            checker = Checker(check, context, spotter_model, voice.name)
            in_calls = [(s, live.get(s.id, ""), audio[s.id]) for s in samples]
            checks += _parallel(checker, in_calls)
            if voice is VOICES[0]:
                checks += _parallel(checker, [(s, s.said, b"") for s in samples])
    return {"rows": rows, "checks": checks}


# --- The report -------------------------------------------------------------------------------


def _percent(share: float) -> str:
    return f"{share * 100:.0f} %"


def _found(check: dict[str, Any]) -> tuple[LiveCorrection, ...]:
    """A check's corrections as found, so the report judges them with the scoring as it is now."""
    return tuple(LiveCorrection(**found) for found in check["corrections"])


def report(results: dict[str, Any], date: str) -> str:
    rows: list[dict[str, Any]] = results["rows"]
    checks: list[dict[str, Any]] = results["checks"]
    samples = {sample.id: sample for sample in SAMPLES}
    lines = [
        f"# Verbatim fidelity and live checks ({date})",
        "",
        "Spec §16.2 and §18 phase 0, spike d. Made by `services/api/evals/verbatim/run.py`;",
        f"{len(MISTAKES)} learner sentences with one known mistake each (every kind of mistake the",
        f"German pack knows, three times) and {len(CONTROLS)} correct ones, each spoken by",
        f"{len(VOICES)} synthetic voices: {', '.join(v.name for v in VOICES)}.",
        "",
        "## Does the transcript keep the mistake? (target: ≥ 90 % kept)",
        "",
        "| Setup | Voice | Kept | Tidied away | Misheard | Correct sentences word for word "
        "| Mean WER |",
        "| --- | --- | --- | --- | --- | --- | --- |",
    ]
    by_voice: dict[tuple[str, str], SystemSummary] = {}
    for voice in VOICES:
        mine = [row for row in rows if row["voice"] == voice.name]
        for summary in summarise(mine, samples):
            by_voice[(summary.system, voice.name)] = summary
    for (system, voice_name), s in by_voice.items():
        wer = statistics.mean(
            row["wer"] for row in rows if row["system"] == system and row["voice"] == voice_name
        )
        lines.append(
            f"| {system} | {voice_name} | {_percent(s.kept)} | {_percent(s.tidied)} | "
            f"{_percent(s.misheard)} | {_percent(s.controls_kept)} | {wer:.2f} |"
        )
    for system in dict.fromkeys(row["system"] for row in rows):
        (overall,) = summarise([row for row in rows if row["system"] == system], samples)
        lines.append(
            f"| **{system}** | all | **{_percent(overall.kept)}** | {_percent(overall.tidied)} | "
            f"{_percent(overall.misheard)} | {_percent(overall.controls_kept)} | |"
        )
    lines += ["", "### Kept, per kind of mistake (all voices)", ""]
    systems = list(dict.fromkeys(row["system"] for row in rows))
    lines.append("| Kind | " + " | ".join(systems) + " |")
    lines.append("| --- |" + " --- |" * len(systems))
    for category in dict.fromkeys(sample.category for sample in MISTAKES):
        cells = []
        for system in systems:
            mine = [
                row
                for row in rows
                if row["system"] == system and samples[row["sample"]].category == category
            ]
            kept = sum(row["heard"] == Heard.KEPT for row in mine)
            cells.append(_percent(kept / len(mine)) if mine else "n/a")
        lines.append(f"| {category} | " + " | ".join(cells) + " |")

    lines += [
        "",
        "## Live checks (targets: precision ≥ 98 %, recall ≥ 85 %)",
        "",
        "Precision counts every correction shown; one about other words than the planted mistake "
        "counts against it, though some of those may be right (they are listed below).",
        "",
        "| Spotter | Input | Voice | Mistakes caught | Corrections shown | Not about the mistake "
        "| On correct sentences | Precision |",
        "| --- | --- | --- | --- | --- | --- | --- | --- |",
    ]
    groups = dict.fromkeys((c["spotter"], c["input"], c["voice"]) for c in checks)
    for spotter, given, voice_name in groups:
        mine = [
            c
            for c in checks
            if (c["spotter"], c["input"], c["voice"]) == (spotter, given, voice_name)
        ]
        errors = [c for c in mine if samples[c["sample"]].error is not None]
        shown = sum(len(c["corrections"]) for c in mine)
        wrong = sum(false_alarms(samples[c["sample"]], _found(c)) for c in mine)
        on_controls = sum(len(c["corrections"]) for c in mine if samples[c["sample"]].error is None)
        recall = sum(caught(samples[c["sample"]], _found(c)) for c in errors) / len(errors)
        precision = (shown - wrong) / shown if shown else 1.0
        lines.append(
            f"| {spotter} | {given} | {voice_name} | {_percent(recall)} | {shown} | {wrong} | "
            f"{on_controls} | {_percent(precision)} |"
        )
    lines += [
        "",
        "## For review",
        "",
        "### Mistakes tidied away by the production verbatim pass",
        "",
    ]
    production = next(system for system in systems if system.startswith("verbatim "))
    for row in rows:
        if row["system"] == production and row["heard"] == Heard.TIDIED:
            said = samples[row["sample"]].said
            lines.append(
                f"- {row['voice']}, {row['sample']}: said “{said}”, written “{row['transcript']}”"
            )
    lines += ["", "### Corrections not about the planted mistake", ""]
    for c in checks:
        sample = samples[c["sample"]]
        for found in c["corrections"]:
            if not caught(sample, (LiveCorrection(**found),)):
                lines.append(
                    f"- {c['spotter']}, {c['input']}, {c['voice']}, {c['sample']} "
                    f"(“{sample.said}”): “{found['said']}” → “{found['better']}” ({found['topic']})"
                )
    lines += [
        "",
        "## Limits",
        "",
        "- The voices are synthetic. They are told to sound like learners, but real learner",
        "  speech hesitates, restarts and mispronounces more; the figures are an upper bound",
        "  until real recordings are added (spec §9.4: the “I didn't say that” flag).",
        "- A text-to-speech model may itself say a sentence more correctly than written; such a",
        "  clip counts against the transcription.",
        "- One mistake per sentence; real turns can hold several.",
    ]
    return "\n".join(lines) + "\n"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--key-file", type=Path, required=True)
    parser.add_argument("--live-model", default="gpt-transcribe")
    parser.add_argument(
        "--verbatim-models",
        nargs="+",
        default=["gpt-transcribe", "gpt-4o-transcribe", "gpt-4o-mini-transcribe", "whisper-1"],
        help="The first is the production one, which the live checks use.",
    )
    parser.add_argument("--spotters", nargs="+", default=["gpt-6-luna", "gpt-6.1-sol"])
    parser.add_argument("--out", type=Path, default=HERE.parents[3] / "docs" / "evals")
    parser.add_argument(
        "--limit", type=int, help="Only this many sentences of each kind: a quick try of the setup."
    )
    parser.add_argument(
        "--report-only",
        type=Path,
        help="Writes the report again from a run's JSON, with the scoring as it is now.",
    )
    arguments = parser.parse_args()
    if arguments.report_only:
        date = arguments.report_only.name[:10]
        results = json.loads(arguments.report_only.read_text())
        arguments.report_only.with_suffix(".md").write_text(report(results, date))
        return
    limit = arguments.limit
    samples = (*MISTAKES[:limit], *CONTROLS[:limit]) if limit else SAMPLES
    date = dt.datetime.now(dt.UTC).date().isoformat()
    results = run(
        read_key(arguments.key_file),
        arguments.live_model,
        arguments.verbatim_models,
        arguments.spotters,
        samples,
    )
    arguments.out.mkdir(parents=True, exist_ok=True)
    (arguments.out / f"{date}-verbatim-fidelity.json").write_text(
        json.dumps(results, ensure_ascii=False, indent=1)
    )
    (arguments.out / f"{date}-verbatim-fidelity.md").write_text(report(results, date))
    print(f"Wrote {arguments.out / f'{date}-verbatim-fidelity.md'}")  # noqa: T201 - a command-line tool


if __name__ == "__main__":
    main()
