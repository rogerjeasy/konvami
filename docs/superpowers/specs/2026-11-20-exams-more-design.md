# More exams and phrase banks (5.16–5.18, 5.25)

Spec §6.13. Written 2026-11-20. Decisions marked "my call" were made without a question round,
choosing what helps the learner most.

## Where things stood

TestDaF (seven stages, one task each, with charts and original prompts) and ÖSD B1 (the joint
Goethe/ÖSD/Fribourg B1 format) were already built on 2026-11-12/13, and every part already had
a "Useful phrases" block on the preparation screen. The README still said "no TestDaF or ÖSD"
and "No phrase banks yet". What was missing:

1. ÖSD at any level other than B1, although the profile and onboarding offer ÖSD at every level.
   A learner who chose ÖSD A2 had an exam goal the centre could not simulate.
2. The phrase banks were one or two phrases per part kind, the same for A1 and C1.
3. No place to see a test's phrases as a whole, and no way to keep one.

## ÖSD A1, A2, B2, C1

- Built from the existing part kinds, so the examiner's instructions, the scorer, the planner and
  the app's labels work unchanged. A1: contact, asking and answering, an everyday situation.
  A2: contact, talking about a topic, planning together. B2: a talk and a discussion towards a
  compromise. C1: a talk weighing both sides and a discussion with counter-examples.
- Each fits one call (at most nine minutes of parts), like the other formats.
- The cards are our own (Semmeln, a ladder from the neighbour, a four-day week…), never copied
  from the exam body's model papers; a test checks no ÖSD card id is another exam's. The ÖSD B1
  keeps sharing the Goethe B1 tasks, as the formats are jointly developed.
- ÖSD C2 is not simulated: its oral part is a discussion of a written text, which a voice call
  without a text on screen cannot rehearse well (my call). Goethe C1–C2 and telc beyond B1 stay
  out for the same scope reason.
- The planner schedules simulations for these formats on its own: it asks `format_for` for the
  learner's exam and level, which now finds them.

## Phrase banks

- **By function, not by part (my call).** A learner who knows how to disagree politely uses that
  in the B1 planning task, the B2 discussion and TestDaF task 4. Twelve functions: introducing
  yourself, asking, asking for something, telling about yourself, suggesting, agreeing,
  disagreeing politely, giving your opinion, structuring a talk, describing a picture or chart,
  reacting to questions, gaining time and checking.
- **Levelled.** Every phrase has the lowest level it suits (A1–C1). A test shows the phrases up to
  its highest level, so an A1 learner never sees "Dem kann ich nur beipflichten, zumal …".
  Every function has something an A2 learner can say.
- **The preparation (5.17)** shows four phrases per part, taking turns between the part's
  functions and putting the test's own level first: what the learner aims at.
- **The bank (5.25)** shows every function the test's parts need, in the order the parts need
  them, with all the phrases at its level. A staged test (TestDaF) gathers all its stages. A card
  with a picture or a chart adds "describing".
- **Meanings** are written by hand in English, French and Italian. With German as the
  explanation language the phrase is its own explanation, and the app does not repeat it.
- **Keeping** a phrase files it in the phrasebook (5.19) with the test's name as its group. Once
  kept, it plays in the partner's voice and can become a card, on 5.25 and in the phrasebook.
  Nothing plays before it is kept (my call): the phrasebook already records one sound per kept
  phrase, so the bank adds no new request, storage or table, and a phrase nobody keeps costs
  nothing.
- No model writes or checks these phrases: they are the same for every learner, so a second check
  (spec §16.1) is unnecessary.

## API

- `GET /v1/exams/{exam}/phrases` → `{ exam, name, groups: [{ function, phrases: [{ text,
  meanings, level }] }] }`; `not_found` for a test not in the learner's language pack.
- `ExamPhraseOut` gains `level`. No migration.

## Not done

- No audio before a phrase is kept; no phrase banks for the English, French and Italian packs
  (they have no exams).
- Phrases are not checked against the learner's mistakes or the grammar map.
