# Session plan, live corrections and verbatim fidelity (5.3, spec §6.4, §6.5, §8.2, §9.4, §16.2)

Status: built (2026-10-25). The owner asked for the three to be built without a round of
questions, "maximising the learning benefit"; every choice below is mine unless marked. The
measurements are in `docs/evals/2026-10-25-verbatim-fidelity.md`.

## Why

A practice conversation knew what the last report suggested, but nothing planned the call
itself: the partner was told "steer towards these" and left to it. During the call the learner
got no sign of a mistake until the report, minutes later, and the partner corrected (or
recast) from its own ear, which hears the tidied live transcript. And nobody had measured
whether speech recognition keeps a learner's mistakes at all, though the reports, the cards and
the level engine all rest on it (spec §9.4, §18 phase 0 spike d).

## 1. The Session Planner (spec §8.2, §8.6)

**What it picks, before every practice call** (`domain/planner.py`):

- **Two kinds of mistake to work on**, from the *confirmed* mistakes of the last five reports
  in the language learned. Each mistake weighs by recency (1.0 for the newest report down to
  0.2) and by how much it matters (blocks meaning 1.5, noticeable 1.0, minor 0.5); a kind seen
  once last time outweighs one seen twice five conversations ago. Kinds that are about single
  words (word choice, false friends, "other") are not steered towards: no question calls for
  them.
- For each: **how to bring it up without naming it** (spec §7 "targeted elicitation"), a
  sentence per grammar note in the language pack (`GrammarNote.elicit`, with example questions
  in German), and **the learner's own sentences** (at most two), so the partner sees the
  pattern.
- **Up to four saved words** to work in (spec §7 "review inside conversation"): the due word
  cards first, the longest waiting first, then those coming up soonest. Correction cards are
  not words.
- **What the last three conversations were about** (their report summaries), so the partner
  finds something new.

**Since the grammar map** (`2026-10-25-grammar-map-design.md`) every focus is a topic of the map: a mistake counts for the topic it belongs to, and the elicitation hints live on the topics, not on the grammar notes.

**Plain code, not a model (my call).** It runs while the learner waits for the call to connect,
it costs nothing, and it is tested. The partner is a model and makes the conversation out of the
plan; a planning model would add seconds and a request per call for little more. The last
report's next steps and the placement test's weak areas stay as they were ("Worth practising").

**Where it goes.** The plan is a section of the partner's instructions ("# Today's plan"), is
stored with the call (`voice_session.plan`, migration 0018) so the server's side of the call
knows the focus, and the kinds and the words go to the app with the call's answer
(`plan: {language, focus, words}`). How the partner is told to bring them up stays on the
server.

**On screen (5.3).** Under the lines: "Practising today: Dative and Perfekt: haben or sein" and
"Words to use: 1 of 4", with a chip per word that ticks once the learner has said it (spec §6.4
"3 of 5 target words used"). Whether a word was used is a guess made on the device
(`lib/word-use.ts`: the word without its article, with a usual ending, separable verbs with the
prefix at the end); a near miss costs nothing. Nothing to plan, nothing shown. A role-play shows
its goals and the plan.

## 2. The Live Error Spotter (spec §6.4 correction chips, §6.5, §8.2)

**How a turn is checked** (`domain/spotter.py`, `LiveCall`, the worker):

1. Once a learner's turn is written down live and its audio has come back (the recording's
   `conversation.item.retrieve`), the call hands it to the spotter (`Spot`).
2. The turn is written down a second time from its audio with the verbatim pass (spec §9.4),
   which keeps mistakes. That text is kept with the turn, and the pass after the call skips it.
3. A small text model reads the verbatim text, what the live transcription heard when it
   differs, the partner's line before it and the plan's focus, and names at most three
   mistakes, each with `sure`.
4. Shown are only those it is **sure** of, that are **not minor**, that **quote the learner's own
   words** and **change a word**: at most two, those of the plan's focus first. The report after
   the call checks every mistake again, with its stronger model and second check; a live chip
   is a hint at the moment it is useful, not the record.
5. Turns of fewer than three words are not checked.

The check runs beside the call (a thread per turn): the conversation and the partner's tools
never wait for it, and a check that fails changes nothing. When the call ends, checks still
running get five seconds to finish, for their verbatim text.

**One note for the partner and the app (my call).** What was found goes into the conversation
as a system note, `live_correction: {"turn": …, "corrections": [{said, better, why, topic,
focus}]}`, like the help notes. The partner reads it; the app, which sees every item of the
conversation on its data channel, shows it as chips (as it already shows the results of tools
the server runs). There is no other channel from the server to the app during a call.

**What the partner does with a note**, by its correction setting (`practice.py`):

- *Recast* (the friend's default): use the right form in passing in the next reply; for a focus
  structure, a little later ask something that gives a reason to use it again (pushed output).
  Never quote it or mention it.
- *Immediately*: correct as before, but only what a note names: the checker is more reliable
  than the voice model's ear.
- *At the end*: keep them for the goodbye, those of the focus first; an exam coach uses them
  after each task.
- *Off*: no checks at all, so no notes and no chips; the learner asked for a conversation
  without corrections.

**On screen (5.3).** The chips of the turn corrected last sit under the learner's line, amber
and calm ("habe → bin": only the words that changed, the label says the whole), until the next
turn with a mistake: a chip arrives a few seconds after the turn, often while the partner is
answering. Tapping one opens a sheet with the correction card of the report (what was said, how
it is right, why, its kind) and "Your report checks this again after the conversation." The
help sheet has a switch "Show corrections as I speak" (a device preference, on by default).

**Cost.** One small-model request per learner turn of three words or more (a fraction of a cent
per call) and no extra transcription: the verbatim pass moved from after the call to during it.
It is metered as `live_corrections` and shown on 6.12.

## 3. Verbatim fidelity (spec §9.4, §16.2, §18 phase 0 spike d)

**The test** (`services/api/evals/verbatim/`): 54 learner sentences with one known mistake
each, three for each of the 18 kinds the German pack knows, and 15 correct ones (some ordinary
spoken German: "Hab ich schon gesehen", "Ähm, …"). Each is spoken by three synthetic voices
(clear; an English speaker at A2, slow with an accent; a French speaker), then written down by:
the live transcription of a call as configured, the same with the language and the verbatim
instruction, and the verbatim pass with four models. A transcript **keeps** a mistake when the
learner's words are in it, **tidied it away** when the right words are there instead. The Live
Error Spotter (the production code) then checks what a call would hand it, with two models, and
the exact sentences without audio (the spotter alone). Precision counts every correction shown;
one about other words than the planted mistake counts against it and is listed for review.

Run it again after any change of model, prompt or provider (spec §16.2):
`poetry run python -m evals.verbatim.run --key-file ../../infra/envs/dev/terraform.tfvars`
(about a dollar; the speech is cached in `evals/verbatim/.audio/`, not committed).

**Results** (two runs: `docs/evals/2026-10-25-verbatim-fidelity.md` measured the candidates,
`…-chosen.md` the setup they pointed to):

| Setup | Mistakes kept | Correct sentences word for word |
| --- | --- | --- |
| Live, gpt-transcribe, as configured until now | 65 % | 93 % |
| Live, gpt-transcribe, with the language and the instruction | 70 % | 96 % |
| Live, gpt-4o-transcribe, with the language and the instruction | **89 %** | **100 %** |
| Verbatim pass, gpt-transcribe (configured until now) | 67 % | 98 % |
| Verbatim pass, gpt-4o-transcribe | **86–89 %** | 100 % |
| Verbatim pass, gpt-4o-mini-transcribe / whisper-1 | 76 % / 69 % | 93 % / 87 % |

The models tidy away mostly endings: a case after an article (*mit meine Mutter*), adjective
endings, regular-looking participles (*gelest*) and above all verb forms (*er sprecht*: kept 0–33 %
by every model). Word order, the auxiliary of the Perfekt, prepositions, negation and word choice
are kept by all.

The Live Error Spotter, reading the exact sentences, caught 93–94 % of the mistakes with 100 %
precision and never corrected a correct sentence. In a call it catches what the transcription
kept: 50–67 % with gpt-transcribe, 74–85 % with gpt-4o-transcribe, at 96–100 % precision; its one
real false alarm came from a mishearing ("dem Garten"). The small model did as well as the
strong one.

**Limits.** The voices are synthetic: real learner speech hesitates and mispronounces more, so
the figures are an upper bound until real recordings are added (the "I didn't say that" flag of
spec §9.4 will supply them). One mistake per sentence.

## Not built (later)

- The plan does not yet pick topics with a model (the Topic Curator), nor follow up on how the
  focus went: the report could say "you used the dative 4 times, 3 right" (needs the focus in
  the analyst's instructions).
- Live corrections are not kept after the call; the report is the record.
- "That's wrong" on a live chip (spec §16.1 point 4) waits for the review queue.
- No `show_card` for a correction during the call (spec §8.4).

## Choices made from the measurements

- The live transcription and the verbatim pass use **gpt-4o-transcribe** (Terraform
  `voice.transcription_model`, `text_models.verbatim`), at $0.006 instead of $0.0045 a minute.
- The live transcription of the placement test and of practice is **told the language and to
  keep mistakes** (`Briefing.hearing`): the transcript the learner reads on 5.6, the placement
  assessment and the spotter's fallback all keep more of what was said. The setup call, in the
  learner's own language, is not.
- The spotter uses the **small model** (gpt-6-luna).
- The targets of spec §16.2 are met for precision and, on synthetic speech, nearly for
  fidelity (89 % for ≥ 90 %); not yet for recall in a call (74–85 % for ≥ 85 %), which is
  bounded by what the transcription keeps. Verb forms are the weak spot: a check of the audio
  itself (spec §9.4 point 4, an audio model judging the turn) is the next step if real
  recordings confirm it.
