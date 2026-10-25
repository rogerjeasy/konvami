# Verbatim fidelity and live checks: the chosen setup (2026-10-25)

The second run of the day, with the setup the first run (`2026-10-25-verbatim-fidelity.md`)
pointed to: gpt-4o-transcribe for the live transcription and the verbatim pass, the live
transcription told the language and to keep mistakes as the app now does, and the Live Error
Spotter checking what that setup writes.

Spec §16.2 and §18 phase 0, spike d. Made by `services/api/evals/verbatim/run.py`;
54 learner sentences with one known mistake each (every kind of mistake the
German pack knows, three times) and 15 correct ones, each spoken by
3 synthetic voices: clear, english_learner, french_learner.

## Does the transcript keep the mistake? (target: ≥ 90 % kept)

| Setup                                                 | Voice           | Kept     | Tidied away | Misheard | Correct sentences word for word | Mean WER |
| ----------------------------------------------------- | --------------- | -------- | ----------- | -------- | ------------------------------- | -------- |
| live gpt-4o-transcribe                                | clear           | 67 %     | 26 %        | 7 %      | 100 %                           | 0.06     |
| live gpt-4o-transcribe + language and instruction     | clear           | 83 %     | 11 %        | 6 %      | 100 %                           | 0.03     |
| verbatim gpt-4o-transcribe                            | clear           | 81 %     | 15 %        | 4 %      | 100 %                           | 0.03     |
| live gpt-4o-transcribe                                | english_learner | 74 %     | 26 %        | 0 %      | 100 %                           | 0.03     |
| live gpt-4o-transcribe + language and instruction     | english_learner | 93 %     | 6 %         | 2 %      | 100 %                           | 0.01     |
| verbatim gpt-4o-transcribe                            | english_learner | 89 %     | 7 %         | 4 %      | 100 %                           | 0.02     |
| live gpt-4o-transcribe                                | french_learner  | 74 %     | 22 %        | 4 %      | 93 %                            | 0.04     |
| live gpt-4o-transcribe + language and instruction     | french_learner  | 91 %     | 7 %         | 2 %      | 100 %                           | 0.02     |
| verbatim gpt-4o-transcribe                            | french_learner  | 89 %     | 11 %        | 0 %      | 100 %                           | 0.01     |
| **live gpt-4o-transcribe**                            | all             | **72 %** | 25 %        | 4 %      | 98 %                            |          |
| **live gpt-4o-transcribe + language and instruction** | all             | **89 %** | 8 %         | 3 %      | 100 %                           |          |
| **verbatim gpt-4o-transcribe**                        | all             | **86 %** | 11 %        | 2 %      | 100 %                           |          |

### Kept, per kind of mistake (all voices)

| Kind                    | live gpt-4o-transcribe | live gpt-4o-transcribe + language and instruction | verbatim gpt-4o-transcribe |
| ----------------------- | ---------------------- | ------------------------------------------------- | -------------------------- |
| article_gender          | 100 %                  | 100 %                                             | 100 %                      |
| case_accusative         | 56 %                   | 100 %                                             | 100 %                      |
| case_dative             | 33 %                   | 89 %                                              | 67 %                       |
| case_genitive           | 67 %                   | 89 %                                              | 89 %                       |
| adjective_ending        | 22 %                   | 89 %                                              | 67 %                       |
| word_order_v2           | 89 %                   | 89 %                                              | 100 %                      |
| word_order_subordinate  | 100 %                  | 100 %                                             | 100 %                      |
| separable_verb          | 67 %                   | 89 %                                              | 89 %                       |
| perfekt_auxiliary       | 100 %                  | 100 %                                             | 100 %                      |
| participle_form         | 22 %                   | 67 %                                              | 67 %                       |
| conjugation             | 0 %                    | 33 %                                              | 11 %                       |
| preposition_choice      | 100 %                  | 100 %                                             | 100 %                      |
| two_way_preposition     | 67 %                   | 89 %                                              | 89 %                       |
| plural_form             | 67 %                   | 67 %                                              | 78 %                       |
| negation                | 100 %                  | 100 %                                             | 100 %                      |
| register_du_sie         | 100 %                  | 100 %                                             | 100 %                      |
| vocabulary_false_friend | 100 %                  | 100 %                                             | 100 %                      |
| lexical_choice          | 100 %                  | 100 %                                             | 100 %                      |

## Live checks (targets: precision ≥ 98 %, recall ≥ 85 %)

Precision counts every correction shown; one about other words than the planted mistake counts against it, though some of those may be right (they are listed below).

| Spotter     | Input                    | Voice           | Mistakes caught | Corrections shown | Not about the mistake | On correct sentences | Precision |
| ----------- | ------------------------ | --------------- | --------------- | ----------------- | --------------------- | -------------------- | --------- |
| gpt-6-luna  | call (live text + audio) | clear           | 83 %            | 46                | 1                     | 0                    | 98 %      |
| gpt-6-luna  | exact sentence           | clear           | 94 %            | 51                | 0                     | 0                    | 100 %     |
| gpt-6.1-sol | call (live text + audio) | clear           | 76 %            | 41                | 0                     | 0                    | 100 %     |
| gpt-6.1-sol | exact sentence           | clear           | 94 %            | 51                | 0                     | 0                    | 100 %     |
| gpt-6-luna  | call (live text + audio) | english_learner | 74 %            | 41                | 1                     | 0                    | 98 %      |
| gpt-6.1-sol | call (live text + audio) | english_learner | 85 %            | 48                | 2                     | 0                    | 96 %      |
| gpt-6-luna  | call (live text + audio) | french_learner  | 81 %            | 44                | 0                     | 0                    | 100 %     |
| gpt-6.1-sol | call (live text + audio) | french_learner  | 81 %            | 44                | 0                     | 0                    | 100 %     |

## For review

### Mistakes tidied away by the production verbatim pass

- clear, dative_2: said “Am Wochenende helfe ich meine Mutter im Garten.”, written “Am Wochenende helfe ich meiner Mutter im Garten.”
- clear, genitive_3: said “Die Tasche meines Schwester ist rot.”, written “Die Tasche meiner Schwester ist rot.”
- clear, adjective_3: said “Er trinkt jeden Morgen kalte Kaffee.”, written “Er trinkt jeden Morgen kalten Kaffee.”
- clear, participle_1: said “Ich habe ein spannendes Buch gelest.”, written “Ich habe ein spannendes Buch gelesen.”
- clear, conjugation_1: said “Er sprecht sehr gut Deutsch.”, written “Er spricht sehr gut Deutsch.”
- clear, conjugation_2: said “Du fahrst immer zu schnell.”, written “Du fährst immer zu schnell.”
- clear, conjugation_3: said “Meine Mutter kannt sehr gut kochen.”, written “Meine Mutter kann sehr gut kochen.”
- clear, plural_2: said “Ich gehe mit meinen Freunde ins Kino.”, written “Ich gehe mit meinen Freunden ins Kino.”
- english_learner, dative_2: said “Am Wochenende helfe ich meine Mutter im Garten.”, written “Am Wochenende helfe ich meiner Mutter dem Garten.”
- english_learner, adjective_1: said “Ich habe einen neue Job in Basel.”, written “Ich habe einen neuen Job in Basel.”
- english_learner, conjugation_2: said “Du fahrst immer zu schnell.”, written “Du fährst immer zu schnell.”
- english_learner, conjugation_3: said “Meine Mutter kannt sehr gut kochen.”, written “Meine Mutter kann sehr gut kochen.”
- french_learner, dative_3: said “Ich wohne bei meine Freundin in Zürich.”, written “Ich wohne bei meiner Freundin in Zürich.”
- french_learner, adjective_1: said “Ich habe einen neue Job in Basel.”, written “Ich habe einen neuen Job in Basel.”
- french_learner, participle_1: said “Ich habe ein spannendes Buch gelest.”, written “Ich habe ein spannendes Buch gelesen.”
- french_learner, conjugation_1: said “Er sprecht sehr gut Deutsch.”, written “Er spricht sehr gut Deutsch.”
- french_learner, conjugation_2: said “Du fahrst immer zu schnell.”, written “Du fährst immer zu schnell.”
- french_learner, conjugation_3: said “Meine Mutter kannt sehr gut kochen.”, written “Meine Mutter kann sehr gut kochen.”

### Corrections not about the planted mistake

- gpt-6-luna, call (live text + audio), clear, separable_2 (“Ich habe dich gestern geanrufen.”): “dich gestern dir anrufen” → “dich gestern angerufen” (participle_form)
- gpt-6-luna, call (live text + audio), english_learner, plural_3 (“Wir haben drei Kinds.”): “drei Kind” → “drei Kinder” (plural_form)
- gpt-6.1-sol, call (live text + audio), english_learner, dative_2 (“Am Wochenende helfe ich meine Mutter im Garten.”): “dem Garten” → “im Garten” (preposition_choice)
- gpt-6.1-sol, call (live text + audio), english_learner, plural_3 (“Wir haben drei Kinds.”): “drei Kind” → “drei Kinder” (plural_form)

## Limits

- The voices are synthetic. They are told to sound like learners, but real learner
  speech hesitates, restarts and mispronounces more; the figures are an upper bound
  until real recordings are added (spec §9.4: the “I didn't say that” flag).
- A text-to-speech model may itself say a sentence more correctly than written; such a
  clip counts against the transcription.
- One mistake per sentence; real turns can hold several.
