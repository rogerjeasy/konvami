# Help during a conversation (5.3, spec §6.4)

Status: built (2026-10-22); not yet tried in a real call (no OpenAI credit). Built without a
round of questions at the owner's request; every choice here is mine.

## Why

A learner who gets lost in a conversation has only two ways out: say so in the language they
are learning, or end the call. Spec §6.4 asks for help buttons and captions they control.

## What

- **Help** beside "Mute microphone" opens a sheet: I'm stuck (the start of an answer), Slower,
  Repeat, Translate (the last reply in the explanation language) and Explain (what was not
  understood, through `ask_tutor` when it is grammar). One tap asks, the sheet closes and the
  partner answers at once; a reply still playing stops first.
- **Captions:** a switch in the same sheet hides the partner's words, for listening practice.
  It is a device preference (`partnerCaptions`), remembered across calls.

## How

- The app sends a system item `learner_help: <kind>` over the call's data channel, then asks
  for a reply (after `response.cancel` and `output_audio_buffer.clear`). It is not a learner
  line: the server's `LiveCall` keeps only the learner's own items, so the note never reaches
  the transcript or the report.
- What each kind means is in the partner's instructions on the server (`domain/practice.py`,
  `HELP_NOTE`), so the app sends a word, not instructions. The app's `voice/help.ts` holds the
  same prefix.
- The app could always send the partner anything over the data channel (the learner owns
  their call); it sends only these five notes.

## Not in this step

Blur-until-tapped captions, tapping a word, push-to-talk, correction chips (they need the Live
Error Spotter), calls longer than 10 minutes.
