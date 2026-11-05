# Moderation of what a learner writes for a partner (6.5, 6.6, 6.3, 6.10; spec §6.21.4, §16.3)

Persona Studio lets a learner write a partner: a name, where they are from, what they do, a line
about them, a backstory, what to focus on when teaching. Those words become lines of the
partner's instructions (spec §6.2: the partner's own instructions stay server-owned, but they are
built from the learner's words). A few other things the learner types reach a prompt the same
way: the note on a goal, the topics to leave alone, the name of a course, and the words of a
memory they correct. Spec §6.21.4 lists "moderation of user-written persona backstories and
descriptions" and "monitoring for jailbreak attempts" under abuse prevention.

## What is read, and when

`domain/moderation.py` (`TextGuard`) reads the free text before anything is stored:

| Where | Text | Service |
| --- | --- | --- |
| 6.5 New partner | the description given to the writer, before the writer is asked or the day's draft counted | `PersonaService.draft` |
| 6.5, 6.6, 4.7 | name, origin, occupation, tagline, backstory and teaching focus when a partner is added; on a change, only the fields whose words are new | `PersonaService.create`, `change` |
| 6.3 | a goal's note, the topics to leave alone, a course's name and chapter | `ProfileService.apply` (any origin but the system's own) |
| 6.11 | the words of a memory the learner puts right | `MemoryService.change` |

Choices from a list, numbers and dates are not read. A value that does not fit its shape is
refused first, without a request. A setting that did not change is not read again.

## How it is read

1. **Local rules** (free, instant, no provider): an order to the model ("ignore your previous
   instructions", "print your system prompt", a chat-template tag, "developer mode"), written for
   English, German, French and Italian; a link; an email address, an @handle or a phone number.
   Text is first folded to NFKC and stripped of zero-width characters, so a look-alike letter or
   an invisible space does not hide a phrase. A partner described as someone who "ignores rules"
   stays possible: only the order to forget one's own is refused.
2. **The provider** (`Moderator`, spec §15): OpenAI's moderation endpoint
   (`omni-moderation-latest`), one request for all of a save's words. It sits behind a protocol in
   the domain and an adapter in `providers/openai_moderation.py`.

Length limits already exist on every field (`invalid_value`) and are not repeated.

## Fail closed

When the provider cannot answer (timeout, error, a result that cannot be read) the save is
refused with `moderation_unavailable` (503) and a message to try again. Words are never let
through unchecked. Nothing else in the app stops: the learner can still talk, review and read.

## Counting attempts

Every refusal is counted per learner, day (UTC) and reason in `moderation_refusal` (migration
0050): only the count, never the text. Orders to the model (`text_instructions`) and unsafe words
(`text_unsafe`) are attempts; a link or a phone number (`text_link`, `text_contact`) is a slip and
is counted but does not count towards the limit. After 10 attempts in a day, free text is refused
with `moderation_limit` (429) until the next day. This is a soft limit: it closes only the saving
of free text.

## Cost

The endpoint is free. Each request is still metered (`Feature.MODERATION`, model
`omni-moderation-latest`, unit `requests`) with a price of 0 in `var.prices`, so the costs screen
(6.12) shows how many checks were made, as "Checking what you write", and does not count them as
unpriced.

## What the learner sees

The server returns a stable code (422 for a refusal) and no text. The app has one sentence for each
of the six codes in four languages (`errors.moderation.*`) and shows them in a calm note, not the
red one: words that were turned down are something to reword, not a fault. The sentences say what
to change ("leave out email addresses, phone numbers and usernames") without repeating the text.

## Left out

- A section for the owner listing refusals: the counts are stored per learner and day, but no
  screen reads them yet.
- Other free text that reaches a model but not a partner's instructions: Ask-the-Tutor questions
  and the phrasebook's situation are questions to a model for one answer, not stored words.
- A second reading by a text model for subtle abuse, and appeals: the provider's flag and the
  local rules are the whole check.
