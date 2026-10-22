# Ask-the-Tutor (5.12, 5.3, 5.10, spec §6.8, §8.4, §12.3)

Status: built (2026-10-22); not yet tried with the real text model (no OpenAI credit). Built
without a round of questions at the owner's request; choices marked **(my call)** were made on
their behalf.

## Why

The first brief asked for a partner one can "ask questions about rules, how to say words,
grammar". Nothing answers such questions yet: a partner can only chat, and a report's correction
explains itself in one sentence.

## Goals

- T1. **In a conversation:** when the learner asks how something works or how to say something,
  the partner calls `ask_tutor` (spec §8.4), gets an accurate answer from the Tutor, and says it
  in its own words, then returns to the conversation (spec §12.3).
- T2. **As text:** a screen where the learner types a question and gets a written answer with
  examples, and sees the questions asked before (spec §6.8 "as text chat").
- T3. **From a report:** "Explain this" on a correction asks the Tutor about that mistake (spec
  §6.5 "Explain my mistake").

## Non-goals (this step)

The grammar map and mastery, mini-lessons, generated exercises, `show_card` on the call screen,
spoken questions outside a call, mastery signals from questions (spec §12.3 step 6 is only
logged).

## How it works

### Grounding (my call)

There is no curated grammar reference yet. The language pack gets one short rule note per kind
of mistake it knows (18 for German): what the rule is, with correct and wrong examples. The Tutor
is given every note of the language (they are short) and told to rest its answer on them, to
name the one it used, and to say when it is not sure rather than invent a rule (spec §16.1). A
note is the topic a question is filed under.

### The Tutor (`domain/tutor.py`)

- One text model, `tutor` in `text_models` (default: the strong model that writes reports,
  because a wrong rule costs the learner's trust).
- The learner's level, the language they learn and their explanation language come from the
  profile. Answers are written in the explanation language unless the learner asked for
  explanations "never"; examples are in the language learned, each with a translation.
- Text: an answer has `explanation`, up to three `examples` (sentence + translation), `topic`
  (a note's id or none) and `unsure`. A learner may ask 40 questions a day (my call; like
  partner drafts, one atomic step). Every question and answer is kept, newest first, for the
  screen; account deletion removes them.
- From a report: the request names the conversation and the correction's number. The server
  reads the correction from the stored report (never from the app), and the question becomes
  "why is `original` wrong, and why `corrected`?" with the learner's sentence as context.
- In a call: `ask_tutor(question, about)` runs on the server (sideband). It answers in at most
  three short sentences and one example, meant to be spoken. It counts toward the same daily
  limit and is kept with the others. A failure tells the partner to answer from what it knows,
  carefully.

### The app

- **5.12 Ask the tutor**, opened from Learn: the questions asked so far, newest first (the
  layout pins the field and its button at the bottom and keeps no scroll position, so the
  newest answer is at the top, where it is seen), a field that grows with the question and a
  button pinned at the bottom. An answer shows its examples and its topic; an uncertain one
  says so.
- **5.10 Session report:** each correction gets "Explain this", which opens 5.12 and asks about
  it at once.

## Left to the builder

Wording of the instructions, the exact notes, names.
