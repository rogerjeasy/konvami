# Flagging an AI turn or a correction, and the review queue (5.6, 5.10, 6.15; spec §6.21.3, §16.1)

Status: built (2026-11-05). Built without a round of questions; every choice below is mine.

## Why

Google Play's AI-generated content policy needs a way to report offensive or harmful AI output
from inside the app, on every AI turn (spec §6.21.3, §16.3). Spec §16.1 adds "That's wrong" on any
correction, feeding a review queue and the evaluation sets. Without it the app cannot go to a
store, and a learner has no way to say a correction is not what they said.

## What

- **A partner's line** (5.6 Transcript): a small flag button beside each line the partner said.
  A learner's own line has none.
- **A correction** (5.10 Session report): a "That's wrong" action on each correction.
- **The sheet** (`components/flag-sheet.tsx`): a reason, an optional note (500 characters) and
  "Send report". The sheet says what is sent: the text that was flagged and the note, nothing else
  of the conversation. Afterwards it thanks the learner. Failures (`flag_limit`, network) are told
  in the sheet, which stays open.
- **Reasons:** a line: wrong or untrue, offensive or unsafe, something else. A correction adds
  "I didn't say that" (the verbatim pass can drop a word; spec §9.4). The server enforces the same
  rule.
- **After a report:** an unconfirmed correction ("Not sure") the learner reports is not shown
  again, and the sheet says so. A confirmed one stays, marked "Reported", with nothing to
  practise ("Say it better") or save as a card: drilling something the learner calls wrong could
  teach a mistake. The correction keeps its place in the report, so the cards and "Say it better"
  numbers, which are positions in the report, do not shift. A flagged line shows as "Reported".
  Reporting a line again (it stays pressable) changes the reason and reopens it.
- **The owner's queue** (6.15 Reports, a row on the Profile under "Owner" next to Costs, for the
  owner's account only, like 6.12): open, resolved and dismissed reports, newest first, each with
  its kind (partner's line or correction), reason, the flagged text, the learner's note and when.
  "Resolve" (acted on) and "Dismiss" (nothing wrong) move it to that list; "Reopen" brings it back.

## How

- `PUT /v1/conversations/{id}/flags` with `{kind: "turn" | "correction", index, reason, note?}`.
  The server reads the text from the conversation (the partner's turn, or "original → corrected" of
  the report's mistake); the app sends none. `GET /v1/conversations/{id}/flags` lists the learner's
  own reports in a conversation.
- `GET /v1/owner/flags?status=open|resolved|dismissed` and `PUT /v1/owner/flags/{id}` with
  `{status}`; 403 `not_owner` for any other account (the owner accounts of 6.12).
- Errors: `not_found` 404 (a turn that is not a partner's, a correction the report does not have,
  a conversation that is not theirs), `invalid_value` 422 (a reason the kind cannot have, a note
  over 500 characters), `flag_limit` 429 (50 reports in 24 hours, so the queue cannot be flooded).
- Storage: migration 0026 `content_flag`, one row per learner, conversation, kind and index
  (reporting again updates it). No Terraform change: it is a table in the existing database. The
  text is copied into the flag when it is made, so the queue is readable after the conversation is
  deleted. The rows cascade with the learner's account and the conversation, so account deletion
  (6.9) removes them.
- Code: `domain/flags.py` (`FlagService`, rules and the owner check), `SqlFlagRepository`,
  `api/app.py`; in the app `practice/use-flags.ts`, `components/flag-sheet.tsx`,
  `components/flag-button.tsx`, `screens/flags`.

## Differences from the spec, and why

- **No in-call flag button.** The flag is on the transcript and the report, which a learner reaches
  one tap after a call. During a call the learner's hands and attention are on the conversation;
  a flag button on 5.3 would add a control to the busiest screen for a thing that can be done
  seconds later with the same effect.
- **No automatic action on a flag.** Flags are read by the owner; nothing is hidden for other
  learners or fed back to the models yet. The evaluation sets (spec §16.2) are a later step that
  reads the same table.
- **The owner sees the flagged text but not who flagged it.** The queue shows no name or account;
  a flag can be traced to a learner only through the database, which the owner already controls.
- **No notification to the owner for a new flag.** The page is read when the owner opens it; an
  offensive-content flag deserves an email once there is volume (the cost alerts' mail is the
  model to follow).
- **A flagged correction is hidden or marked in the app, not on the server.** The cards and
  "Say it better" endpoints do not know about flags; the app does not offer them. A second device
  that has not read the flags yet may still offer them until it opens the report.
