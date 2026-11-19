# "Forget that" during a call (spec §6.11, §8.4)

Status: built on `feature/forget-live` (2026-11-20). Screens: 5.3 Conversation (the toast), 6.10 and
6.11 (what is forgotten no longer shows). No new screen number.

## What the learner can do

During a practice conversation the learner can say "forget what I told you about my divorce" or
"please don't remember that". The partner says back what it understood and asks. After a clear yes:

- the notes from before that it is about are gone at once: the partner is told not to bring it up
  again, 6.10 no longer lists them, and the next call's partner is not told them;
- what the learner said about it in this call is not written down when the call's memories are
  written afterwards;
- 5.3 shows "Forgotten" with **Undo** until the call ends. When the call ends the notes are deleted
  for good (spec §6.19: a real deletion).

## How it works

- **The tool.** `forget_memory` (`domain/memory_voice.py`) takes the refs of the notes it is about,
  a few words on what it is (`about`) and `confirmed`. Like `update_profile`, the server refuses a
  call that does not claim the learner's yes. It runs on the server (spec §8.4).
- **Refs.** Each note in "What you know from before" ends with `[ref]`, the last eight hex digits of
  its id (`memory_ref`): stable across Lambda invocations and continuation segments, since the tools
  are rebuilt from storage and not from the recall made at the start. The partner is told never to
  say a ref aloud. A ref only reaches the learner's own memories.
- **Hide, then delete.** Migration `0180_memory_forget` adds `memory_forget` (the learner's words,
  when, settled or not) and `memory.hidden_by`. A forget hides its memories; hidden memories are
  not listed, got, removed or changed. Undo deletes the unsettled row, and `ON DELETE SET NULL`
  brings the memories back. `MemoryService.after_call` settles the learner's forgets when the call
  ends: the hidden memories are deleted and the row can no longer be undone.
- **Keeping it out of this call's memories.** The memory writer gets `forget_now` (the `about`
  texts of the forgets made from the call's start to two hours after it) and is told to write
  nothing about them. Once the conversation was read, those rows are deleted with their words.
- **Tidying.** A call whose end was never recorded is settled two hours later (`FORGET_SETTLE`),
  and the words of a forget whose conversation was never read (memory off, too short) are deleted
  after two days (`FORGET_KEEP`). Both happen the next time the partner is briefed or the tool runs.
- **App.** The tool's output (`forgot`, `forget`, `notes`) is read from the call's data channel
  like a changed setting. `SettingsToast` and the new `ForgetToast` share `UndoToast`; the call shows
  one note with Undo at a time, the latest (`lastNotice`). Undo calls
  `POST /v1/memories/forgets/{id}/undo`, which answers 404 once the call has ended.

## My calls

- **Undo only during the call.** A forget is final when the call ends: keeping the words or the
  notes any longer would contradict "forget". The changes made by voice (6.14) are not where
  forgets are listed: a list of what you asked to forget would keep it.
- **Hide at once, delete at the end** rather than deleting at once: an Undo that cannot bring back
  what was deleted would be no Undo, and a misheard "forget that" must be cheap to take back.
- **Forgetting from this call relies on the memory writer.** Telling which sentences of the
  transcript a few words are about needs a model; the writer is that model and already follows
  `never_about`. The transcript itself (5.6) is the conversation and stays; the learner deletes a
  conversation there.
- **The `about` words are not screened by moderation.** They go into the writer's content, not into
  a partner's instructions, and are deleted within two days.
- **Memory off.** The tool still works: there are no notes to name, and nothing is read from the
  call anyway.
- **Export.** `memory_forget` is in the data export while it exists (it is the learner's data).
