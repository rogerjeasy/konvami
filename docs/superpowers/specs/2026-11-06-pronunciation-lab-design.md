# Pronunciation lab, basic (screen 5.22; spec §6.14, §9.5)

Status: built 2026-11-06. Spec §6.14 asks for German problem sounds, minimal-pair drills, shadowing
and "your problem words", with phoneme-level scoring left to P2 (§9.5). This note is what the basic
lab does and where it stops.

## What the learner sees

- **5.22 Pronunciation lab** (`screens/pronunciation`), a row on Learn and on Talk. A short note
  that what it tells is an approximation, the learner's **problem words** (if any), and the
  **sounds** of the language they learn, each with how many drills were right.
- **One sound** (`/pronunciation/[sound]`): what the sound is and how to make it, in the language
  the learner reads; **Listen and pick** (hear one word of a pair, pick which); the **pairs** to
  say; **words**; and **sentences** to shadow.
- **A drill** opens in a sheet: hear the text first (each word of a pair has its own play button; a
  sentence has Normal and Slow), record, and see the result. Words heard as asked stand as they
  are; the others are underlined in amber. A line says what was heard. Right: a small celebration
  and Done. Not yet: Try again. A result is never red and never called a failure.

## What it can and cannot tell

A recording goes through the same listener as "Say it better" and voice review
(`domain/spoken.py`, the verbatim pass of §9.4, told to keep mistakes). The words of what was heard
are lined up with the words that were to be said (`matched_words`, a longest-matching-blocks
alignment); a word not found is "not heard as asked". That is often a sound that was off, but it is
an approximation: there are **no phoneme scores, nothing about stress, rhythm or pace**, and a word
can be missed because of the microphone or the room. Every result screen says so. Spec §9.5 names a
pronunciation assessment service for scoring; this lab does not call one.

## Content: the sound catalogue is data in the language pack

`domain/pronunciation_sounds.py` holds German's nine problem sounds (`LanguagePack.pronunciation`):
ü, ö, ich and ach, r, final devoicing (b, d, g at the end), long and short vowels, -ig, sp- and st-,
word stress. Each has minimal pairs (or pairs that are only said), words, sentences and a short
explanation in en, de, fr and it. They are written once by hand, not generated: they are the same
for every learner, cost nothing and can be reviewed. An explanation falls back to English, and to
German for a learner who wants no explanations in their own language. `listening` is false for
sounds whose pairs sound alike (final devoicing, -ig, stress): a learner cannot be asked which one
they heard, so those pairs are only said.

Another language gets its sounds by filling `pronunciation` in its pack; the lab shows an empty
state for a pack without any.

## Hearing a word

`GET /v1/pronunciation/audio?text=` plays a text in the voice of the learner's first partner,
spoken the first time and kept (`Sounds`, key `pronunciation/<language>/<fingerprint>.mp3`, shared by
all learners because it holds no personal data). Only texts of the lab's own sounds and the
learner's problem words can be asked for, so the route is no way to have anything spoken. Slow
playback is the device's (`ClipPlayer.play(..., rate)`), not a second recording.

## Problem words

Every word of a drill is tallied per learner and language (`pronunciation_word`): a miss counts and
resets the run, a hit extends the run. A word is a **problem word** while it was missed and has not
been heard right **twice in a row** since (`CLEARED_AFTER`). A word never missed is never stored. A
problem word is drilled on its own (`soundId` null) and can be played. The words come from the lab's
own drills only; words missed in conversations or voice review are not collected (those answers are
not kept).

## Storage, limits and cost

- Migration `0065_pronunciation.sql`: `pronunciation_day` (drills per day, for the limit),
  `pronunciation_drill` (one row per drill: kind, sound, target, what was heard, right or not;
  what Progress can chart later) and `pronunciation_word`. Recordings are not kept.
- `domain/pronunciation.py` (`PronunciationService`), `persistence/pronunciation_repository.py`.
- A learner may make 200 drills a day (`MAX_ATTEMPTS_PER_DAY`). A drill is a short transcription;
  it is metered as `Feature.PRONUNCIATION` and the played words as `PRONUNCIATION_AUDIO`, both
  shown on 6.12 Costs. The learner must have agreed to share their voice (2.5), as for "Say it
  better".
- Picking which word was heard (`POST /v1/pronunciation/picks`) calls no model and is not limited.

## Left out

- Phoneme-level scoring, stress and rhythm marks, a waveform comparison (§9.5, P2).
- Waveform or word-by-word highlighting while shadowing; shadowing "along with" the voice.
- Charting the drills on Progress (the table holds what it needs).
- Problem words from conversations and from cards answered out loud.
- Sounds for languages other than German.
