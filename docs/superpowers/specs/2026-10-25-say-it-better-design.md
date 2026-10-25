# "Say it better" retries (5.10, spec §6.5)

Status: built (2026-10-25), stacked on the grammar map branch. Built without a round of questions
(Phase 2, "maximise the learning benefit"); every choice below is mine.

## Why

Reading a correction is recognition; saying it right is production, and producing the form
yourself (pushed output) is what moves it into speech. Spec §6.5: "on any corrected turn, tap 🎙️
to re-record the sentence correctly, then hear your before and after side by side".

## What

- **Where:** a "Say it better" action on each correction of the Session Report (5.10) that the
  second check confirmed. A correction marked "Not sure" has none: drilling a doubtful correction
  could teach a mistake.
- **What is said:** the learner's whole turn with the correction put in, and every other
  confirmed correction of the same turn as well, so they never practise one fix while repeating
  another mistake (`lib/practice-sentence.ts`). When the words cannot be found in the turn, the
  corrected words alone. The words that change stand out.
- **Recording:** tap Record, say it, tap Stop (it stops by itself after 20 s). On a phone an m4a,
  in a browser a webm, mono at 64 kbit/s: a sentence is a few dozen kilobytes.
- **The check** (`domain/retries.py`): the attempt is written down by the verbatim pass with the
  verbatim instruction (gpt-4o-transcribe, which keeps learner mistakes best), and it is right when
  the corrected words are in it and the wrong ones are gone. Plain words compared, no model's
  opinion: the same rule every time, and nothing to trust beyond the transcription.
- **The answer:** right: a check mark and "That's it!" with a small pop and a success haptic, and
  the card shows "Said better" from then on. Not yet: "Almost. This is what I heard:" with the
  words that are still off underlined in amber, and Try again. Both: hear the turn as it was said
  (when it was recorded) and the new try.

## How

- `POST /v1/conversations/{id}/report/mistakes/{index}/retries` with `{audio (base64), format,
  durationMs}` answers `{heard, right, said, better}`. `GET /v1/conversations/{id}/retries` lists
  the corrections practised and whether one attempt was right.
- Errors: `unsure` 409 (a doubted correction), `not_found` 404, `invalid_value` 422 (not base64,
  unknown type), `retry_limit` 429 (100 attempts a day), `consent_required` 403, `unavailable` 503.
- The recording itself is not kept. Each attempt is (migration 0019: `retry_attempt`, and
  `retry_day` for the daily limit). Metered as `retry`, by the length the recorder measured
  (a compressed file cannot be measured on the server).
- In the app a `SentenceRecorder` (`voice/sentence-recorder.tsx`) records through expo-audio
  (`voice/app-recorder.ts`); tests use a fake. The microphone permission is the one the calls use.

## Not built (later)

- The attempts do not count towards the grammar map (spec §6.8 wants evidence from conversations,
  not drills), nor towards the cards' schedule.
- No "Say it better" on the grammar map's topic page or in the Library's transcript yet.
- The new try is not kept, so Then vs Now cannot use it.
