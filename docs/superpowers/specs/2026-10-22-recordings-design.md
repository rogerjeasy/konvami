# Recordings and the verbatim pass (5.6, 5.10, spec §6.6, §9.4)

Status: built (2026-10-22); capture not yet tried with a real call. The owner asked for the feature to be built without a round
of questions; every choice below marked **(my call)** was made on their behalf and can be
changed.

## Why

Two promises of the spec are not kept yet:

1. "Everything saved" (§6.6): a practice conversation is kept as text only, so the learner cannot
   hear themselves or their partner again.
2. Mistakes reach the report (§9.4): the live transcript comes from speech recognition, which
   tidies a learner's mistakes away ("Ich habe nach Berlin gefahren" comes out as "Ich bin…").
   A report can only correct what the text still shows.

Both need the learner's audio.

## Goals

- R1. The audio of every turn of a practice conversation is kept, learner and partner, unless
  the learner chose not to keep recordings.
- R2. After the conversation, every learner turn is transcribed a second time, from its audio,
  by a pass told to keep mistakes as they were said ("verbatim").
- R3. The report is read from the verbatim text where there is one, and told where it differs
  from the live text: such a difference is often a mistake the live pass tidied away.
- R4. The transcript (5.6) shows the learner's verbatim text and plays any turn; playing goes on
  through the turns that follow, so the whole conversation can be heard from its start.
- R5. The learner decides whether recordings are kept (6.7 Privacy and AI). Turning it off
  deletes the recordings kept so far. Deleting the account deletes them too.

## Non-goals (this step)

Word-by-word highlighting, playback speed, search, bookmarks, export, offline copies, Then vs Now,
"I didn't say that", pronunciation notes, pace and pauses (they build on this, later). Onboarding
and placement calls are not recorded (they are not in the library).

## How it works

### Capture: the server asks the voice provider for each turn's audio (my call)

The audio of a call flows directly between the phone and OpenAI; it never passes our servers.
The WebRTC library on the phones (react-native-webrtc 124) offers no way to record a call
without new native code (on iOS, replacing its whole audio device).

The call worker is already connected to every call (the sideband). The Realtime API answers
`conversation.item.retrieve` with the item as the model has it, including its audio (base64
PCM16, 24 kHz mono). So the worker asks for each learner turn once its live transcript is
complete, and for each partner reply once it is done, and stores what comes back. It works the
same on iPhone, Android and the web preview, with no change to the app's call code.

**Unverified:** on 2026-10-22 a probe could not run (the OpenAI account had no credit). Whether a
WebRTC call's sideband answers `retrieve` with audio, and whether a partner reply includes its
audio, must be checked with a real call before this is relied on. If audio does not come back,
nothing breaks: turns without audio show no play button, and the report uses the live text as
before. The probe is the first thing to run once there is credit.

Details:

- `LiveCall` (pure) decides what to ask for and hands each answer back as `KeepAudio`; the worker
  stores it (`RecordingStore`) and reports the stored audio back to the call, so the turn knows
  it has audio when the call is saved.
- When the call is to end (time limit, goodbye) while answers are still awaited, it waits for
  them at most `AUDIO_DRAIN_SECONDS` (3 s) before hanging up. When the learner leaves, the
  connection closes and what is still awaited is lost (usually nothing: a turn's audio is asked
  for seconds after it is spoken).
- The worker's WebSocket accepts messages up to 32 MiB (the default 1 MiB is about 15 seconds of
  audio in base64).

### Storage (my call)

- Files: `users/<user id>/recordings/<call id>/<item id>.wav`, in the existing private media
  bucket. Under the user's folder, so deleting the account deletes them with the photo.
- WAV, as the provider gives it (24 kHz, 16-bit, mono, about 2.9 MB per minute of speech). The
  spec asks for Opus or AAC (10–15 MB per hour); the Lambda runtime has no encoder, and at the
  scale of a tester group the difference is cents. Moving old audio to cheaper storage is not
  done either.
- `voice_turn` gains `item_id`, `audio_key`, `audio_ms` and `verbatim`.
- The app gets a short-lived signed address per turn with the transcript (15 minutes, like the
  photo).

### Keeping recordings (my call)

- A profile field `recordings_kept`, on unless the learner turns it off, like memory (6.10).
  The switch is on 6.7 Privacy and AI.
- Off: the audio is still taken for the verbatim pass (the learner agreed to share their voice
  with the provider, 2.5), and deleted right after it. Turning the switch off deletes every
  recording kept so far.
- A conversation that does not count (the learner said nothing) has its audio deleted when it
  ends.

### The verbatim pass

- Runs in the call worker's report job, before the report (spec §12.2 steps 2–3), and is
  idempotent: a turn that has its verbatim text is not sent again.
- OpenAI's transcription endpoint, model `verbatim` in `text_models` (default `gpt-transcribe`),
  with the target language and an instruction to transcribe exactly, keeping grammatical
  mistakes, wrong forms, hesitations and false starts. Which model is most faithful on learner
  speech is to be measured (spec Phase 0 spike d); the model is a Terraform variable.
- A turn whose pass fails keeps its live text only; the report goes ahead.

### The report

For a learner turn with a verbatim text, the analyst gets `text` = the verbatim text and
`live` = the live text when the two differ in words. Its instructions say what both are. Quotes
are accepted from either text; the second check gets the verbatim text as what the learner said.

### The app

- 5.6 Transcript: the learner's lines show the verbatim text when there is one. Every turn with
  audio has a play button (44 pt); playing goes on through the following turns with audio; one
  plays at a time; tapping again stops. Playback uses `expo-audio` (already installed).
- 6.7 Privacy and AI: a switch "Keep recordings of my conversations", with a confirmation when it
  is turned off (it deletes the recordings).

## Left to the builder

Names, the exact verbatim prompt, the API shape (`TurnOut` gains `verbatim` and `audio`).
