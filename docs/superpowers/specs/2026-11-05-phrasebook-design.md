# Phrasebook (spec §6.7)

Status: built (2026-11-05). Every detail below is my call.

## Why

Spec §6.7 asks for "a personal list of phrases you need in your life" ("Ich hätte gern einen
Termin", "Könnten Sie das bitte wiederholen?"). Flashcards come from conversations; the
phrasebook comes from the learner's life: an appointment next week, a call to the landlord. They
say what they need, get a few phrases, and keep the ones they want.

## What it does (5.19, reached from the first row of Learn's list)

- **Suggest:** the learner types a situation (or a phrase in their own language) and gets up to
  six phrases in the language learned, at their level, each with its meaning in the language
  they read. Nothing is stored until they press "Keep".
- **Keep:** a kept phrase is listed newest first with the situation it was kept for. Keeping a
  phrase that is kept already (capitals and punctuation ignored, as for cards) answers with the
  existing one.
- **Learn as a card:** a kept phrase becomes a word card (phrase, meaning, no sentence) once;
  the worker then writes its forms like any word card (the part is `phrase`). The row shows
  "In your cards" afterwards.
- **Remove:** deletes the phrase; a flashcard made from it stays (it is a card now).

## Design decisions

- **Generated, not hand-written.** Meanings in four explanation languages for a hand-written
  list would be a content project; the text model writes them in the learner's explanation
  language (the same rule as the Tutor: `explanation_languages`). When the learner wants no
  explanations in their language, the meaning is a short plain explanation in the language
  learned.
- **Same model and the same daily limit as the Tutor.** A suggestion is one request to the
  strong text model, so it counts against the 40 Tutor questions a day (`TutorRepository.reserve`)
  instead of adding a table and a second limit. Cost is booked as `Feature.PHRASEBOOK` and shows
  on 6.12.
- **Consent.** The situation goes to the text model's provider, so a learner who withdrew their
  agreement gets `consent_required` and nothing is sent (Apple 5.1.2(i)).
- **Not report content.** Cards from reports are read by the server from the stored report, so
  the app cannot put text of its own on a card. A phrasebook is the learner's own list, so the
  server stores what they keep (length-bounded, whitespace collapsed). A suggestion is written
  by a model and not checked a second time, so the screen says so and points to the Tutor.
- **Storage:** table `phrase` (migration 0026), one row per learner, language and phrase key,
  at most 500 per language. Whether a phrase is a card is read from the cards (`known`), not
  stored twice.

## API

`GET /v1/phrasebook` · `POST /v1/phrasebook` (keep) · `POST /v1/phrasebook/suggestions` ·
`POST /v1/phrasebook/{id}/card` · `DELETE /v1/phrasebook/{id}`. Errors: `invalid_value` (422),
`consent_required` (403), `not_found` (404), `no_language` and `too_many` (409),
`suggestion_limit` (429), `unavailable` (503).

## Not built

- Typing a phrase of one's own in the app (the API takes it; the screen only keeps suggestions).
- Hearing a phrase read aloud, and grouping phrases by situation.
- Phrases from a role-play's goals or the Tutor's examples ("keep this" in those places).
- Anki export (spec §6.7, P2).
