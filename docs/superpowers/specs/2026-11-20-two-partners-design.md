# Two partners in one conversation (5.24, 5.3, 5.6, 5.10, 5.17)

Spec §6.3 and §18 phase 4 ("persona ensembles"); the design README said "two personas in one call
is P2". Written 2026-11-20. Decisions marked **my call** were made without a question round, for
the learner's benefit (see the build-without-questions rule).

## What the learner gets

- On Talk (5.2) a row **Talk with two partners** opens **5.24 Choose two partners**. The learner
  picks two of their partners (the first one picked leads), sees the situation ("You meet two
  friends at a café") and starts.
- The conversation (5.3) shows both portraits side by side, each with its name. Each line is
  labelled with who said it; the one speaking is lit up.
- The transcript (5.6) names the speaker of every partner line, the library row and the report
  (5.10) say "with Lena and Jonas".
- The exam simulation's two-candidate parts (5.17) already let the second candidate speak in a
  voice of its own (`speak_candidate`). Its lines are now marked as the second voice too, so the
  caption and the transcript tell the examiner and the other candidate apart.

## What existed, and what this adds

Main already had the exam's second-candidate voice: `speak_candidate` (`exam_centre.py`), a
silent tool result with `candidate` text, `Speak`/`Spoken` in `live_call.py`, `CandidateSpeech`
(the speech model, consent checked per line), the turn's audio kept through the recordings store,
and the app playing it from the `premium_audio` receipt (`premium-playback.ts`). Practice calls
also already reconnect after a dropped transport (`continuation.py`).

This feature reuses all of it. `SecondVoice` (`candidate_speech.py`) is now the one speaker of a
call's second voice; `CandidateSpeech` and the new `GuestSpeech` only choose the voice, the cost
feature and the line length. New: the `speak_partner` tool, the guest marking of turns, the
`speaker: "guest"` field of the receipt, storage, the API fields, 5.24 and the screens' labels.
The exam's candidate lines are now marked as the second voice too (no other change to exams).

## How a call carries two voices

One OpenAI Realtime session has one output voice, fixed once audio has been produced.

**Chosen (my call): one realtime session, a second voice through a tool.** The realtime session
plays the lead partner and knows both characters. When the second partner speaks, the model calls
`speak_partner` with the line; the server speaks it with the speech model in the second partner's
own voice, stores it as that turn's recording, and the app plays it as a clip (the
`premium_audio` receipt the premium voices and the exam's second candidate already use). The tool
is silent: no reply follows it, so the learner answers next, or the model calls it again later.

**Rejected: two realtime sessions** (one per partner, the server choosing who takes the floor and
relaying each one's lines to the other as items):

- Each session hears all of the learner's audio: input audio and the per-minute cost double, and
  each turn must wait for a floor decision before either may answer (`create_response: false`
  plus a `response.create` from the sideband), which adds a round trip to every turn.
- The phone would hold two peer connections on one microphone, and the worker would follow two
  sockets in one Lambda, each with its own reconnect (`continue_call`) and time limit.
- Recordings, reports and memories would have to merge two transcripts in turn order.

The chosen design keeps one call, one worker, one transcript and one continuation ledger, and it
works wherever the exam's second candidate already works (phone and web preview).

Trade-offs, accepted:

- The second partner's line arrives a moment later (one speech request, about a second) and
  cannot be interrupted mid-word the way a realtime voice can (the clip stops when the learner
  starts speaking, as premium playback does).
- The model writes both characters. Its instructions describe the second partner in full and keep
  the two apart; nothing guarantees that the lead never answers in the guest's place.
- Not with premium (ElevenLabs) calls: the lead's voice would be a clip too and the two clips
  could overlap. A two-partner call with `premium` is refused (`voice_unavailable`). **My call.**

## Cost and limits

- **Voice minutes count once** (my call): it is one realtime session, and the learner's time is
  what the weekly allowance measures. The second partner's lines are speech requests, metered as
  `voice_practice` speech under the speech model, so 6.12 Costs shows them; a line is at most 600
  characters.
- The kill switches apply unchanged: past the target the realtime model is the economy one; at the
  ceiling no call starts. Without a speech model configured, a two-partner call is refused
  (`voice_unavailable`) rather than started with a silent partner.
- Consent is checked again before every line is spoken (as for the exam's candidate).

## Rules (my calls)

- Free conversation only: no role-play, guided lesson, review, import or settings check-in. The
  Session Planner's plan (structures and saved words) still applies, so the call practises what the
  learner needs.
- The two must be different partners of the learner; the lead's corrections style is the
  call's; the second partner never corrects.
- If the two partners have the same voice, the second one speaks with a distinct standard voice.
- Memories: the conversation belongs to the lead (`persona_id`). Facts about the learner are shared
  with every partner anyway; "between the two" memories go to the lead. Both partners count the
  conversation in their history, so the second does not greet the learner as a stranger next time.
- The report reads the second partner's lines as `second_partner`; only the learner's lines are
  analysed, as before.

## Data

Migration `0190_two_partners.sql`:

- `voice_session.guest_persona_id` (uuid, `ON DELETE SET NULL`), the second partner.
- `voice_turn.guest` (boolean, default false): the turn was spoken by the second partner (or an
  exam's second candidate).

The export carries both (they are columns of exported tables).

## Not verified without a real call

- That the realtime model reliably uses `speak_partner` for the second partner and stays silent in
  that reply (the instructions ask for it; the exam's candidate relies on the same rule).
- How the clip and the WebRTC voice sound one after the other on a phone speaker, and whether the
  microphone picks up the clip (the exam's candidate has the same exposure).
