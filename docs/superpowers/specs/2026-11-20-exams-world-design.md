# Exam speaking simulations beyond German (spec §6.13)

Date: 2026-11-20. Screens 5.16 Exam centre, 5.17 Preparation and simulation, 5.18 Score, 5.25
Phrase bank, 4.2 Goals, 5.1 Today's exam card. No new screen numbers; no migration.

## What changed

- **fide (Switzerland)** in German, French and Italian: two simulations that follow the test's two
  level combinations (A1–A2 and A2–B1), after the public «fide-Test Testhandbuch» (May 2026, read on
  fide-info.ch). The handbook describes a speaking part of about 15 minutes with two examiners (one
  leads, one takes notes and marks). It opens with a short warm-up and the A2 tasks: describe a
  picture, a simulated phone call to make, move or cancel an appointment with a reason, and a
  conversation about habits, an experience or a process. It goes on with either the A1 tasks
  (describe a sequence of pictures, react in contact situations) or the B1 conversation (two topics
  to choose from: an experience, a process, good and bad sides, a hypothetical situation). Speaking
  counts two thirds of the oral result and listening one third. Our simulation keeps the speaking
  tasks in that order, compressed to about nine minutes, with one examiner who plays the other
  side of the call. **Not simulated:** the listening part («Verstehen») and the written part.
  **Unverified:** how strictly a real test follows the order after the A2 tasks; the handbook says
  the candidate chooses between A1 and B1 after the examiners' recommendation.
- **French:** TCF (guided interview, interaction after two minutes' preparation, point of view);
  DELF A1–B2 (guided interview, exchange or monologue, role-play; B1 adds a point of view from a
  short document; B2 is a point of view from a document, defended in a debate, after 30 minutes'
  preparation); DALF C1 (a presentation from a dossier, then a discussion, compressed from 8–10
  plus 15–20 minutes to about 5 plus 4); TEF (section A obtains information by phone from an
  advertisement, section B convinces a friend, compressed from 15 minutes).
- **English:** IELTS (interview, long turn from a cue card after a minute's preparation in the
  call, discussion); Cambridge B2 First and C1 Advanced (interview, photographs, collaborative task,
  discussion, with the other candidate in their own voice through `speak_candidate`); TOEFL iBT in
  its January 2026 form (listen and repeat, then an interview; the number of sentences and
  questions is **unverified**, taken from preparation sites).
- **Italian:** CELI 1–4 (A2–C1: interview, picture or text, role-play or discussion) and CILS A2,
  UNO B1, DUE B2, TRE C1 (conversation, then a monologue on one of two situations).
- **German additions:** Goethe C1, telc B2 and telc C1.
- **Estimates on each test's own scale:** a test may declare `ExamScale` (band, points or level).
  The scorer then also returns an estimate on it, which the server keeps on the scale and rounds to
  its steps (`ExamScale.estimate`); 5.18 shows it under the share of the points. The scales: IELTS
  0–9 in half bands, TOEFL 1–6 in half steps, Cambridge English Scale 140–190 (B2 First) and
  160–210 (C1 Advanced), DELF and DALF out of 25, TCF out of 20, TEF out of 450, fide a level.
- **Each test in its own language:** `SpeakingExam.language`. The examiner's name and form of
  address come from that language (Frau Becker, "Sie"; Ms Carter; Madame Laurent, "vous"; la
  dottoressa Bianchi, "Lei"). The examiner also says, if asked, that this is Konvami's practice,
  not the real test. The profile accepts only the exams of the learner's language (the existing
  per-pack check, now with lists for English, French and Italian), and fide only at A1–B1.
- **Phrase banks in four languages:** every phrase row already carried German, English, French and
  Italian, so a test shows the row in its own language with the others as meanings. A few lines are
  reworded where the meaning would be awkward to learn as a phrase (`_AS_PHRASE`), and the two lines
  that name the language learned are written per language (`_LANGUAGE_NAMED`). Three functions are
  new, for the new tasks: comparing, speculating, on the phone.
- **Pictures:** a new `waiting_pair` shows the two drawn scenes as photos A and B for comparison
  tasks; fide and CELI reuse the single scenes.
- **"Not affiliated" notice:** `components/exam-notice.tsx` under the exam centre, preparation,
  score, phrase bank, Today's exam card and the onboarding exam choice.

## My calls

1. **fide first, then France, then English, then Italian.** fide is legally required for Swiss
   residence and naturalisation (oral B1 for citizenship) and no AI competitor simulates it (research
   note `docs/research/2026-11-20-competitor-gap-analysis.md`). France raised its requirements on
   2026-01-01 (A2, B1, B2), which makes TCF and DELF the next most useful. IELTS and Cambridge are
   the English tests Swiss and German learners ask for most. CELI and CILS matter for Ticino and
   Italian citizenship.
2. **One call, compressed, rather than raising the call limit.** The call worker's 10-minute limit
   stays; DALF C1 and TEF are shorter than the real tests, and the design README says so.
3. **The scale estimate is the scorer's judgement, not arithmetic.** A linear mapping from the
   rubric's share to a band would be confidently wrong. The scorer, briefed with the test's public
   description, gives a holistic estimate, and the server only keeps it on the scale. CELI and CILS
   get no scale, because their marking scales could not be confirmed.
4. **IELTS, TOEFL and TCF have no pass mark.** Their readiness uses a target share (0.65 for IELTS
   and TOEFL, 0.6 otherwise) so the existing "how ready you are" card keeps working. DELF and DALF
   use their real 50 % pass.
5. **Names are descriptive.** Simulations are named "IELTS · Speaking", "DELF B1 · Production
   orale", "fide · Sprechen A2–B1"; `docs/store/claims.md` lists the trademark rules.

## Not built

Listening and written parts; PLIDA; Trinity; PTE; Cambridge A2 Key, B1 Preliminary and C2
Proficiency; Goethe C2; telc A1–A2 and C2; CELI and CILS A1 and C2; stages for DALF C1 or TEF (they
are one compressed call each); drawn pictures beyond the two existing scenes.
