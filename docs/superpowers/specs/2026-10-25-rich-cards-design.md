# Rich cards (5.7, 5.11, spec §6.7)

Status: built (2026-10-25), stacked on the "Say it better" branch. Built without a round of
questions (Phase 2, "maximise the learning benefit"); every choice below is mine. Voice review and
review conversations follow on their own branch.

## Why

A card held a word, its meaning and its sentence. To use a German noun the learner needs its
gender and plural; to use a verb, its forms and the case it takes. Hearing a word said, in a voice
they know, fixes its sound. Spec §6.7 "Rich German cards".

## What

- **Forms:** a noun's article and plural ("die Gehaltserhöhung · die Gehaltserhöhungen"); a verb's
  er/sie/es form, Präteritum and Perfekt with its auxiliary ("steigt um · stieg um · ist
  umgestiegen"), whether its prefix separates and the case it takes ("dative (Es schmeckt mir.)");
  an adjective's comparative and superlative.
- **Article colours** (spec §6.7's convention): der blue, die red, das green, on the article only
  (`genderMasc`, `genderFem`, `genderNeut` tokens, 4.5:1 on cards in both themes). A screen reader
  hears the gender in words ("das Wochenende, neuter"): the colour is a help, never the only sign.
  Red here is a gender, not an error; learner mistakes stay amber.
- **Sound:** "Listen" on a card plays the word with its sentence (a correction: the sentence as it
  is right) in the voice of the learner's first partner.
- Shown in the card list (the coloured article), the card's sheet (word as heading, meaning,
  sentence, forms, Listen) and Review (5.11: the coloured word asks; the answer adds the forms and
  Listen).

## How

- **Forms are written in the worker (my call)**, not while the learner waits: saving a word card
  starts the worker (`card_details` event), which claims the learner's word cards without forms
  (`details_claimed_at`, five minutes; `FOR UPDATE SKIP LOCKED`, so two workers never pay for the
  same card) and fills them in with **one request to the stronger text model** (gpt-6.1-sol,
  `text_models.cards`): a wrong plural on a card is learnt by heart. A card the model leaves out
  gets `part: other` instead of being asked about again; a failed request leaves the claims to run
  out and the next worker tries again. Migration 0020.
- The model is told to give only forms it is certain of and null otherwise; an article that is not
  der, die or das is dropped; forms only for their part of speech.
- **Sound is made on first play (my call)**: `GET /v1/cards/{id}/audio` speaks it
  (gpt-4o-mini-tts), stores it under the learner's folder named by what was said and in which
  voice, and answers a 15-minute address; later plays reuse the file. Removing the card removes its
  sound; deleting the account removes the folder.
- Metered as `card_details` and `card_audio`.

## Not built (later)

- Audio of the learner's own turn on a correction card.
- Active vs passive vocabulary (spec §6.7) and the phrasebook.
- The forms of cards saved before this branch: they are filled in when the learner next saves a
  word card.
