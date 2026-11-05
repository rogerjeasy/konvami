# Voice-note pen-pal mode (5.21; spec §6.16, §12.5, §6.18, §14.1)

A partner writes to the learner like a friend on a messaging app: a voice note now and then, of its
own accord. The learner answers when it suits them with a voice note, and the partner answers that
with a reply and a gentle correction. Nothing is live: no time limit, nobody waits.

## What it does

- **A thread per partner** (screen 5.21, reached from Talk and from a card on Today). Notes show as
  voice bubbles: play, the text underneath, a time. The partner's answer to a voice note carries
  correction cards under the bubble.
- **The partner writes first**, once the learner turned it on (it is off until they do: a partner
  writing first is something to agree to). The hourly schedule that already nudges quiet learners
  (`kv-dev-nudges` → call worker) also sends the notes that are due. No new AWS resource.
- **Frequency and quiet hours** are the learner's: one to seven notes a week, spread over the week
  (a note comes after at least three quarters of a week-share), none between the quiet hours
  (default 21:00–08:00) on the learner's own clock, never more than two notes waiting for an
  answer, never to someone who withdrew consent. "Ask for a note" in the thread asks for one now
  (two a day at most).
- **What a note is about** is the text model's choice among three hooks (§12.5): a follow-up on
  something a memory says (the day after an event, what is coming up), one small ordinary thing from
  the partner's own day (true to its backstory; it never claims to be human), or a small challenge.
  It is told the learner's level, the memories a partner may use (`MemoryService.recall`), what to
  leave alone and its last notes (so it does not repeat itself). 40–80 words.
- **The sound** is the text spoken in the partner's voice (the speech model of Persona Studio),
  kept in the media bucket under `users/<id>/penpal/` (deleted with the account) and played through
  a 15-minute signed address.
- **The learner's voice note** is recorded in the app (the recorder of "Say it better"), sent as
  base64, written down word for word by the verbatim pass (§9.4, mistakes kept) at once, and kept as
  a recording only if the learner keeps recordings (6.7): it goes under
  `users/<id>/recordings/penpal/`, so turning recordings off deletes it with the others.
- **The partner's answer** is written in the background (a pending note the app polls): one text
  call reads the thread and the note and writes the reply, the corrections and up to three
  memories; a second, independent call checks the corrections (the report's reviewer, §16.1).
  - A correction whose quoted words the learner did not say, or that changes no word, is dropped.
  - What the check calls wrong is dropped. What it confirms is shown on a card, and the partner says
    it ("Kleine Korrektur: …", at most two). What it cannot confirm is shown marked "Not sure" and
    never spoken. Without the check, everything is "Not sure".
  - The memories go through `MemoryService.remember`: memory must be on, the same rules as for a
    call (a fact must come from the learner's own words).
  - Failing, the answer shows "Couldn't answer" with "Try again" (three attempts in all).
- **Push** (the existing service): "Lena: Sent you a voice note." / "Answered your voice note.",
  opening the thread.
- **Cost and limits.** Every request is metered under `pen_pal` (texts), `pen_pal_audio` and
  `pen_pal_listen`; 30 voice notes a learner a day; a note only on a day the spend limits allow
  (the meter's guard applies as to every paid request).

## Where it lives

`services/api`: `domain/penpal.py`, `persistence` (migration `0060_pen_pal`: `penpal_settings`,
`penpal_note`), routes under `/v1/pen-pal`, the worker events `nudges` (also sends due notes) and
`pen_pal` (writes a pending note). App: `screens/pen-pal` (5.21), `src/pen-pal` (the recorder glue
and the polling), a card on Today, a row on Talk, strings in four languages.

## Not built

- No flag on a pen-pal note (the flagging of §16.1 covers conversation turns and report
  corrections); the owner cannot read a learner's notes. A thread is private to the learner.
- No "voice-note only" pace controls (read-aloud speed), no replying with text, no deleting a single
  note (an account's deletion removes them all), no notes with images.
- One partner writes per run: the one the learner talked to last.
- The notes are not scheduled around the learner's habits (a typical hour); they go out at the
  first allowed hour of the hourly run.
