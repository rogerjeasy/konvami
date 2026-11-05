# Then vs Now (5.20, spec §7 feature 7, §6.15, §6.6)

Status: built (2026-11-06). Every choice marked **(my call)** was made on the owner's behalf.

## Why

Spec §7 lists "Then vs Now" among the features that make Konvami different: hearing yourself from
your first weeks next to today is the most motivating proof of progress, and the recordings of
5.6 already keep the learner's voice. Spec §6.15 asks for "audio comparisons" on Progress and §6.6
for the comparison of a recording from the first week with today's on a similar topic.

## Goals

- T1. A learner who keeps recordings can hear a conversation from their first weeks next to a
  recent one of the same kind, and read what they said in each.
- T2. Nothing is scored. No word counts, speed, "fluency" or "accuracy" are shown: two recordings
  are the evidence, and an invented number would mislead (spec §16.1).
- T3. A learner without a pair is told why (recordings off, nothing recorded, not enough time)
  and what to do.

## Non-goals

The "anchor topic" the spec describes (the app asks the learner to repeat the same task every few
weeks), pronunciation or pace comparison, a waveform, sharing a comparison, and a comparison
with the placement test (it is not recorded).

## How it works

### The pair (`domain/then_vs_now.py`) (my call)

`GET /v1/then-vs-now` answers `status`: `off`, `none`, `not_yet` or `ready`, and for `ready` the
two conversations (`then`, `now`) and the whole weeks between them. The app reads each
conversation through the existing `getConversation`, so a recording's short-lived address is made
in the one place that already does it.

- `off`: the learner does not keep recordings (6.7).
- Conversations that count, review conversations left out (built around words, not a topic),
  oldest first. A conversation is *recorded* when one of the learner's turns has audio.
- `then` is the earliest recorded conversation that has a later recorded one of the **same
  kind** at least `MIN_GAP` (14 days) after it; `now` is the latest such one. Same kind means
  both are free talk or both the same role-play (`scenario`): a bakery role-play beside a free
  chat compares nothing.
- At most `MAX_OPENED` (8) recorded conversations are opened at each end and `MAX_LOOKED_AT`
  (40) looked at in all, so a learner with hundreds of conversations costs a bounded number of
  reads. A learner whose first 40 conversations were all unrecorded is told `none` (a known
  edge; they switched recordings off for a long time).
- `none`: no recorded conversation. `not_yet`: some, but no same-kind pair far enough apart.

### The app

- 5.8 Progress gets a "Then vs Now" row (always offered) that opens 5.20.
- 5.20 shows, per side, the date, partner and length, and up to `EXCERPT_LINES` (4) of the
  learner's recorded lines as chat bubbles (the verbatim text, mistakes included, as on 5.6) with a
  play button each, and "Hear the whole conversation" (5.6). Playing goes on through that side's
  lines only, one clip at a time; it never runs into the other side.
- Side by side on wide windows (`useScreenLayout().split`), stacked on phones.
- The playback hook of 5.6 moved to `practice/use-playback.ts` and `lib/playlist.ts` learned
  groups, so both screens share it.

## Left to the builder

- A scheduled "anchor topic" capture (Director) and a "then" picked from it.
- The partner's side and a word-by-word highlight, once 5.6 has them.
