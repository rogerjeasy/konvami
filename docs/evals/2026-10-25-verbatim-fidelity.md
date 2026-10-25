# Verbatim fidelity and live checks: the candidates (2026-10-25)

The first run of the day: the setup the app had (gpt-transcribe), the candidate models, and
the Live Error Spotter on that setup. The setup it pointed to is measured in
`2026-10-25-verbatim-fidelity-chosen.md`.

Spec §16.2 and §18 phase 0, spike d. Made by `services/api/evals/verbatim/run.py`;
54 learner sentences with one known mistake each (every kind of mistake the
German pack knows, three times) and 15 correct ones, each spoken by
3 synthetic voices: clear, english_learner, french_learner.

## Does the transcript keep the mistake? (target: ≥ 90 % kept)

| Setup                                              | Voice           | Kept     | Tidied away | Misheard | Correct sentences word for word | Mean WER |
| -------------------------------------------------- | --------------- | -------- | ----------- | -------- | ------------------------------- | -------- |
| live gpt-transcribe                                | clear           | 63 %     | 33 %        | 4 %      | 93 %                            | 0.05     |
| live gpt-transcribe + language and instruction     | clear           | 69 %     | 26 %        | 6 %      | 100 %                           | 0.04     |
| verbatim gpt-transcribe                            | clear           | 63 %     | 31 %        | 6 %      | 100 %                           | 0.05     |
| verbatim gpt-4o-transcribe                         | clear           | 85 %     | 13 %        | 2 %      | 100 %                           | 0.03     |
| verbatim gpt-4o-mini-transcribe                    | clear           | 72 %     | 22 %        | 6 %      | 93 %                            | 0.04     |
| verbatim whisper-1                                 | clear           | 65 %     | 26 %        | 9 %      | 87 %                            | 0.06     |
| live gpt-transcribe                                | english_learner | 67 %     | 31 %        | 2 %      | 93 %                            | 0.05     |
| live gpt-transcribe + language and instruction     | english_learner | 69 %     | 30 %        | 2 %      | 93 %                            | 0.04     |
| verbatim gpt-transcribe                            | english_learner | 67 %     | 30 %        | 4 %      | 93 %                            | 0.05     |
| verbatim gpt-4o-transcribe                         | english_learner | 93 %     | 6 %         | 2 %      | 100 %                           | 0.01     |
| verbatim gpt-4o-mini-transcribe                    | english_learner | 78 %     | 19 %        | 4 %      | 93 %                            | 0.03     |
| verbatim whisper-1                                 | english_learner | 72 %     | 22 %        | 6 %      | 93 %                            | 0.04     |
| live gpt-transcribe                                | french_learner  | 67 %     | 31 %        | 2 %      | 93 %                            | 0.04     |
| live gpt-transcribe + language and instruction     | french_learner  | 74 %     | 24 %        | 2 %      | 93 %                            | 0.03     |
| verbatim gpt-transcribe                            | french_learner  | 72 %     | 28 %        | 0 %      | 100 %                           | 0.03     |
| verbatim gpt-4o-transcribe                         | french_learner  | 89 %     | 9 %         | 2 %      | 100 %                           | 0.01     |
| verbatim gpt-4o-mini-transcribe                    | french_learner  | 78 %     | 20 %        | 2 %      | 93 %                            | 0.03     |
| verbatim whisper-1                                 | french_learner  | 70 %     | 22 %        | 7 %      | 80 %                            | 0.07     |
| **live gpt-transcribe**                            | all             | **65 %** | 32 %        | 2 %      | 93 %                            |          |
| **live gpt-transcribe + language and instruction** | all             | **70 %** | 27 %        | 3 %      | 96 %                            |          |
| **verbatim gpt-transcribe**                        | all             | **67 %** | 30 %        | 3 %      | 98 %                            |          |
| **verbatim gpt-4o-transcribe**                     | all             | **89 %** | 9 %         | 2 %      | 100 %                           |          |
| **verbatim gpt-4o-mini-transcribe**                | all             | **76 %** | 20 %        | 4 %      | 93 %                            |          |
| **verbatim whisper-1**                             | all             | **69 %** | 23 %        | 7 %      | 87 %                            |          |

### Kept, per kind of mistake (all voices)

| Kind                    | live gpt-transcribe | live gpt-transcribe + language and instruction | verbatim gpt-transcribe | verbatim gpt-4o-transcribe | verbatim gpt-4o-mini-transcribe | verbatim whisper-1 |
| ----------------------- | ------------------- | ---------------------------------------------- | ----------------------- | -------------------------- | ------------------------------- | ------------------ |
| article_gender          | 89 %                | 100 %                                          | 89 %                    | 100 %                      | 100 %                           | 89 %               |
| case_accusative         | 0 %                 | 11 %                                           | 22 %                    | 100 %                      | 67 %                            | 67 %               |
| case_dative             | 22 %                | 22 %                                           | 22 %                    | 78 %                       | 67 %                            | 11 %               |
| case_genitive           | 44 %                | 56 %                                           | 44 %                    | 89 %                       | 44 %                            | 11 %               |
| adjective_ending        | 0 %                 | 33 %                                           | 22 %                    | 78 %                       | 67 %                            | 22 %               |
| word_order_v2           | 100 %               | 100 %                                          | 100 %                   | 100 %                      | 89 %                            | 78 %               |
| word_order_subordinate  | 100 %               | 100 %                                          | 100 %                   | 100 %                      | 100 %                           | 100 %              |
| separable_verb          | 89 %                | 89 %                                           | 89 %                    | 89 %                       | 78 %                            | 89 %               |
| perfekt_auxiliary       | 100 %               | 100 %                                          | 100 %                   | 100 %                      | 100 %                           | 100 %              |
| participle_form         | 33 %                | 33 %                                           | 22 %                    | 78 %                       | 44 %                            | 78 %               |
| conjugation             | 0 %                 | 11 %                                           | 0 %                     | 11 %                       | 11 %                            | 0 %                |
| preposition_choice      | 100 %               | 100 %                                          | 100 %                   | 100 %                      | 89 %                            | 89 %               |
| two_way_preposition     | 44 %                | 67 %                                           | 44 %                    | 100 %                      | 67 %                            | 67 %               |
| plural_form             | 56 %                | 44 %                                           | 56 %                    | 78 %                       | 44 %                            | 56 %               |
| negation                | 100 %               | 100 %                                          | 100 %                   | 100 %                      | 100 %                           | 100 %              |
| register_du_sie         | 100 %               | 100 %                                          | 100 %                   | 100 %                      | 100 %                           | 89 %               |
| vocabulary_false_friend | 100 %               | 100 %                                          | 100 %                   | 100 %                      | 100 %                           | 100 %              |
| lexical_choice          | 100 %               | 100 %                                          | 100 %                   | 100 %                      | 100 %                           | 100 %              |

## Live checks (targets: precision ≥ 98 %, recall ≥ 85 %)

Precision counts every correction shown; one about other words than the planted mistake counts against it, though some of those may be right (they are listed below).

| Spotter     | Input                    | Voice           | Mistakes caught | Corrections shown | Not about the mistake | On correct sentences | Precision |
| ----------- | ------------------------ | --------------- | --------------- | ----------------- | --------------------- | -------------------- | --------- |
| gpt-6-luna  | call (live text + audio) | clear           | 50 %            | 28                | 1                     | 0                    | 96 %      |
| gpt-6-luna  | exact sentence           | clear           | 93 %            | 50                | 0                     | 0                    | 100 %     |
| gpt-6.1-sol | call (live text + audio) | clear           | 57 %            | 32                | 1                     | 0                    | 97 %      |
| gpt-6.1-sol | exact sentence           | clear           | 94 %            | 51                | 0                     | 0                    | 100 %     |
| gpt-6-luna  | call (live text + audio) | english_learner | 56 %            | 31                | 1                     | 0                    | 97 %      |
| gpt-6.1-sol | call (live text + audio) | english_learner | 57 %            | 31                | 0                     | 0                    | 100 %     |
| gpt-6-luna  | call (live text + audio) | french_learner  | 67 %            | 36                | 0                     | 0                    | 100 %     |
| gpt-6.1-sol | call (live text + audio) | french_learner  | 61 %            | 33                | 0                     | 0                    | 100 %     |

## For review

### Mistakes tidied away by the production verbatim pass

- clear, gender_3: said “Die Problem ist, dass ich keine Zeit habe.”, written “Das Problem ist, dass ich keine Zeit habe.”
- clear, accusative_1: said “Ich habe ein Bruder und eine Schwester.”, written “Ich habe einen Bruder und eine Schwester.”
- clear, accusative_3: said “Das Geschenk ist für mein Vater.”, written “Das Geschenk ist für meinen Vater.”
- clear, dative_2: said “Am Wochenende helfe ich meine Mutter im Garten.”, written “Am Wochenende helfe ich meiner Mutter im Garten.”
- clear, dative_3: said “Ich wohne bei meine Freundin in Zürich.”, written “Ich wohne bei meiner Freundin in Zürich.”
- clear, genitive_1: said “Das ist das Auto meines Vater.”, written “Das ist das Auto meines Vaters.”
- clear, genitive_3: said “Die Tasche meines Schwester ist rot.”, written “Die Tasche meiner Schwester ist rot.”
- clear, adjective_1: said “Ich habe einen neue Job in Basel.”, written “Ich habe einen neuen Job in Basel.”
- clear, adjective_2: said “Wir wohnen in einer kleine Wohnung.”, written “Wir wohnen in einer kleinen Wohnung.”
- clear, adjective_3: said “Er trinkt jeden Morgen kalte Kaffee.”, written “Er trinkt jeden Morgen kalten Kaffee.”
- clear, participle_1: said “Ich habe ein spannendes Buch gelest.”, written “Ich habe ein spannendes Buch gelesen.”
- clear, participle_3: said “Wir haben am Samstag das Museum gebesucht.”, written “Wir haben am Samstag das Museum besucht.”
- clear, conjugation_1: said “Er sprecht sehr gut Deutsch.”, written “Er spricht sehr gut Deutsch.”
- clear, conjugation_2: said “Du fahrst immer zu schnell.”, written “Du fährst immer zu schnell.”
- clear, conjugation_3: said “Meine Mutter kannt sehr gut kochen.”, written “Meine Mutter kann sehr gut kochen.”
- clear, two_way_1: said “Ich lege das Buch auf dem Tisch.”, written “Ich lege das Buch auf den Tisch.”
- clear, plural_2: said “Ich gehe mit meinen Freunde ins Kino.”, written “Ich gehe mit meinen Freunden ins Kino.”
- english_learner, accusative_1: said “Ich habe ein Bruder und eine Schwester.”, written “Ich habe einen Bruder und eine Schwester.”
- english_learner, accusative_2: said “Ich sehe der Mann jeden Morgen im Bus.”, written “Ich sehe den Mann jeden Morgen im Bus.”
- english_learner, accusative_3: said “Das Geschenk ist für mein Vater.”, written “Das Geschenk ist für meinen Vater.”
- english_learner, dative_1: said “Ich fahre jeden Tag mit der Bus zur Arbeit.”, written “Ich fahre jeden Tag mit dem Bus zur Arbeit.”
- english_learner, dative_2: said “Am Wochenende helfe ich meine Mutter im Garten.”, written “Am Wochenende helfe ich meiner Mutter im Garten.”
- english_learner, dative_3: said “Ich wohne bei meine Freundin in Zürich.”, written “Ich wohne bei meiner Freundin in Zürich.”
- english_learner, genitive_1: said “Das ist das Auto meines Vater.”, written “Das ist das Auto meines Vaters.”
- english_learner, adjective_1: said “Ich habe einen neue Job in Basel.”, written “Ich habe einen neuen Job in Basel.”
- english_learner, adjective_2: said “Wir wohnen in einer kleine Wohnung.”, written “Wir wohnen in einer kleinen Wohnung.”
- english_learner, participle_1: said “Ich habe ein spannendes Buch gelest.”, written “Ich habe ein spannendes Buch gelesen.”
- english_learner, participle_3: said “Wir haben am Samstag das Museum gebesucht.”, written “Wir haben am Samstag das Museum besucht.”
- english_learner, conjugation_1: said “Er sprecht sehr gut Deutsch.”, written “Er spricht sehr gut Deutsch.”
- english_learner, conjugation_2: said “Du fahrst immer zu schnell.”, written “Du fährst immer zu schnell.”
- english_learner, conjugation_3: said “Meine Mutter kannt sehr gut kochen.”, written “Meine Mutter kann sehr gut kochen.”
- english_learner, two_way_1: said “Ich lege das Buch auf dem Tisch.”, written “Ich lege das Buch auf den Tisch.”
- english_learner, plural_2: said “Ich gehe mit meinen Freunde ins Kino.”, written “Ich gehe mit meinen Freunden ins Kino.”
- french_learner, accusative_1: said “Ich habe ein Bruder und eine Schwester.”, written “Ich habe einen Bruder und eine Schwester.”
- french_learner, accusative_2: said “Ich sehe der Mann jeden Morgen im Bus.”, written “Ich sehe den Mann jeden Morgen im Bus.”
- french_learner, dative_2: said “Am Wochenende helfe ich meine Mutter im Garten.”, written “Am Wochenende helfe ich meiner Mutter im Garten.”
- french_learner, dative_3: said “Ich wohne bei meine Freundin in Zürich.”, written “Ich wohne bei meiner Freundin in Zürich.”
- french_learner, genitive_1: said “Das ist das Auto meines Vater.”, written “Das ist das Auto meines Vaters.”
- french_learner, adjective_1: said “Ich habe einen neue Job in Basel.”, written “Ich habe einen neuen Job in Basel.”
- french_learner, adjective_2: said “Wir wohnen in einer kleine Wohnung.”, written “Wir wohnen in einer kleinen Wohnung.”
- french_learner, participle_1: said “Ich habe ein spannendes Buch gelest.”, written “Ich habe ein spannendes Buch gelesen.”
- french_learner, participle_2: said “Ich habe drei Jahre Medizin gestudiert.”, written “Ich habe drei Jahre Medizin studiert.”
- french_learner, participle_3: said “Wir haben am Samstag das Museum gebesucht.”, written “Wir haben am Samstag das Museum besucht.”
- french_learner, conjugation_1: said “Er sprecht sehr gut Deutsch.”, written “Er spricht sehr gut Deutsch.”
- french_learner, conjugation_2: said “Du fahrst immer zu schnell.”, written “Du fährst immer zu schnell.”
- french_learner, conjugation_3: said “Meine Mutter kannt sehr gut kochen.”, written “Meine Mutter kann sehr gut kochen.”
- french_learner, two_way_1: said “Ich lege das Buch auf dem Tisch.”, written “Ich lege das Buch auf den Tisch.”
- french_learner, plural_2: said “Ich gehe mit meinen Freunde ins Kino.”, written “Ich gehe mit meinen Freunden ins Kino.”

### Corrections not about the planted mistake

- gpt-6-luna, call (live text + audio), clear, separable_2 (“Ich habe dich gestern geanrufen.”): “geh anrufen” → “angerufen” (participle_form)
- gpt-6.1-sol, call (live text + audio), clear, separable_2 (“Ich habe dich gestern geanrufen.”): “geh anrufen” → “angerufen” (participle_form)
- gpt-6-luna, call (live text + audio), english_learner, register_3 (“Können Sie mir helfen? Ich danke dir sehr.”): “Kannen Sie” → “Können Sie” (other)

## Limits

- The voices are synthetic. They are told to sound like learners, but real learner
  speech hesitates, restarts and mispronounces more; the figures are an upper bound
  until real recordings are added (spec §9.4: the “I didn't say that” flag).
- A text-to-speech model may itself say a sentence more correctly than written; such a
  clip counts against the transcription.
- One mistake per sentence; real turns can hold several.
