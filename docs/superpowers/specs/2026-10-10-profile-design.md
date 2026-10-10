# Konvami — Section 6 · Profile (design)

> **Status:** Approved in conversation on 2026-10-10; this file is the written version.
> **Scope:** Everything behind the header avatar: who the learner is (name, photo, email,
> password), what they are learning, their conversation partners (Persona Studio), their AI
> consent, and deleting the account.
> **Parent spec:** `2026-10-06-language-companion-app-design.md` (§6.1.2, §6.1.3, §6.2, §6.19,
> §6.21.1, §8.5, §12.4, §14.1, §14.2).
> **Design source:** none. Like sections 4 and 5, these screens are built directly in the visual
> language of the app and reviewed in the running app.

---

## 1. Goal and success criteria

The Account screen (5.9: name, email, Sign out) becomes the learner's Profile. From it they can
change everything the app knows about them and design the partners they talk to, and every change
is stored by a real backend.

Done means:

1. Every value on screen comes from the account or the database, and every control changes it
   there. Nothing is a placeholder.
2. A partner designed in Persona Studio behaves as designed in a practice call: personality,
   form of address, how mistakes are handled, level and voice reach the partner's instructions.
3. A photo never leaves the device at full size or with its location: the app shrinks and
   re-encodes it before upload, and only its owner can read it.
4. Deleting the account removes the account, every database row and every stored file.
5. Typecheck, lint, tests and `terraform validate` pass; screens pass the visual check of
   AGENTS.md rule 2.6 in light and dark.

## 2. Decisions

| # | Decision | Reason |
| --- | --- | --- |
| P1 | **Name, email, password and AI consent are changed at Cognito by the app**, with the learner's own token, as the consent screen already does | The account lives with the identity provider; a copy in the database would have to be kept in step |
| P2 | **The photo goes straight from the app to a private S3 bucket** through a short-lived signed upload form, and is read through a short-lived signed address | Lambda and API Gateway never carry image bytes; the form limits the size; nothing in the bucket is public |
| P3 | **The app shrinks the photo to 512 px JPEG before upload**; the server accepts JPEG only and checks the file's first bytes | Small uploads, no camera metadata (location), and nothing but a picture ends up stored as one |
| P4 | **An upload lands under `uploads/` and is moved under `users/<id>/` when confirmed**; `uploads/` empties itself after a day | An abandoned upload never becomes someone's photo and never stays |
| P5 | **Account deletion runs on the server in one request**: files, then database, then the Cognito user. It needs a sign-in made moments ago, and it is remembered for a day (§4c) | If a step fails the account still exists and the request can be repeated; the reverse order could leave data nobody can reach |
| P6 | **A partner's personality and teaching settings are two JSON columns**, validated by the domain; a partner without them behaves as their role always did | Starter partners need no data migration, and the settings can grow without schema changes |
| P7 | **Roles stay buddy, teacher and exam coach.** Role-play, course companion and custom roles are not built | Each needs its own instructions and, for role-play, scenarios (spec §6.3) |
| P8 | **"Create from a description" returns a draft; nothing is saved until the learner reviews it** (spec §12.4) | The learner sees and corrects what the model wrote. 20 drafts per learner and day (UTC) |
| P9 | **A voice sample is spoken once per voice and language by OpenAI's speech model and kept in the bucket** | A preview costs a fraction of a cent once, then nothing |
| P10 | **At most 12 partners per language** | A bound on storage and on the Talk screen; far above what the spec's examples need |

## 3. Screens

| # | Screen | Route | Content |
| --- | --- | --- | --- |
| 6.1 | Profile | `/account` | Photo, name, email; language and level; streak, conversations and minutes; groups: Personal, Learning, My partners, Privacy & AI, Security; Sign out |
| 6.2 | Personal | `/account/personal` | Name, photo (choose from the library, remove), app language, the way to change the email |
| 6.3 | Learning | `/account/learning` | Language, explanations, goals, exam, level, course: value, where it came from, when it changed. Each opens its editor |
| 6.4 | My partners | `/account/partners` | The partners, with edit, duplicate, remove, and "New partner" |
| 6.5 | New partner | `/account/partners/new` | Describe them in a sentence, pick a template, or start from scratch |
| 6.6 | Persona Studio | `/account/partners/studio` and `/account/partners/[id]` | Identity → Look → Voice (with preview) → Personality → Role and teaching → Review |
| 6.7 | Privacy & AI | `/account/privacy` | AI consent per provider; delete account |
| 6.8 | Security | `/account/security` | Change password, change email (code sent to the new address), sign out everywhere |
| 6.9 | Delete account | `/account/delete` | What is deleted, the password, and a final confirmation |

Talk (5.2) gains a "New partner" button and a way to edit each partner.

## 4. Backend

| Change | What |
| --- | --- |
| `domain/accounts.py` | The photo (upload form, confirm, remove, signed address) and account deletion |
| `domain/storage.py`, `providers/s3_store.py` | Files behind an interface (spec §15): upload form, read the start, move, sign, delete |
| `domain/speech.py`, `providers/openai_speech.py` | A text spoken in a voice, behind an interface |
| `domain/voices.py` | A voice's sample: from the bucket, or spoken and stored on first request |
| `domain/personas.py` | Create, draft from a description, templates, change every field, duplicate; personality and teaching settings |
| `domain/practice.py` | A partner's instructions use occupation, personality, form of address, conversation style, correction settings, level, focus and explanation settings |
| Migrations `0006`–`0008` | `app_user.picture_key`; `persona.occupation`, `personality`, `teaching`; `persona_draft_day` (the daily limit); `deleted_user`; the lock that keeps a deletion and a write apart |
| `GET /v1/account` · `POST /v1/account/picture/upload` · `POST /v1/account/picture` · `DELETE /v1/account/picture` · `DELETE /v1/account` | The photo and account deletion |
| `POST /v1/personas` · `POST /v1/personas/draft` · `GET /v1/personas/templates` · `PATCH /v1/personas/{id}` · `POST /v1/personas/{id}/duplicate` | Persona Studio |
| `GET /v1/voices/{voice}/sample` | A signed address of the sample |
| Terraform `modules/media` | The private bucket (encrypted, no public access, CORS for the web preview, `uploads/` expires after a day) |
| Terraform `modules/api` | The functions may use that bucket and delete a user from the pool; `KONVAMI_MEDIA_BUCKET` |

## 4a. What changed while building

- **No camera.** `app.config.ts` blocks the camera on purpose ("Konvami sends voice only"), so
  the photo comes from the system's photo picker, which also needs no permission to the library.
- **Learning reuses the setup's questions.** Each row of 6.3 opens the onboarding step that asks
  it (`?from=profile`), which then saves and returns. The Level row changes the level practice
  runs at (`starting_level`), not only the learner's own estimate.
- **Corrections "at the end"** are one sentence in the partner's goodbye: the goodbye is spoken
  after `end_conversation`, and the call closes eight seconds later.
- **A persona's speaking speed** is the voice provider's `audio.output.speed` (0.7 to 1.2), set
  when the call is created.
- **Not yet tried on a real call:** the personality and correction texts are covered by tests of
  the instructions, not by a conversation with the voice model (as section 5's were).

## 4b. What the check in the browser showed (2026-10-10)

`all6.js` captured 33 states at the five sizes in light and dark, and the eight with the longest
texts in German and French: no horizontal overflow, no clipped text, no control under 44 pt, and
every pinned action on screen. Looking at the captures found two things the measurements did
not: the personality scales drew no marks (class names do not reach an animated view on the web;
their colors are now styles), and a long "In one line" was cut off (the field now takes two
rows). `e2e6.js` then walked through the real screens against a stand-in server: a picture
chosen with the browser's file picker arrived as a 10 kB JPEG through the upload form; the name
and the level were saved; a partner written from a description was added after a voice sample
had played to its end, copied and removed; a wrong password deleted nothing, and the right one
deleted the account and returned to Welcome.

**Not checked:** the photo picker on a phone (it needs a rebuilt development build), a real
upload to S3 and a real voice sample (nothing is deployed yet), and a real call with a
partner's new personality and correction settings.

## 4c. What a security review of the commit found (2026-10-10)

| Finding | Fix |
| --- | --- |
| A deleted account's last access token works for up to an hour, and a write made with it stored data again for an account that no longer exists | The deletion is remembered for a day (`deleted_user`). The API refuses every change for such an account, and the database itself no longer creates its row again, so nothing can be stored whatever the layers above let through. The id is deleted after that day, because it identified a person |
| The password was checked only in the app before deleting: a stolen token alone could delete an account | `DELETE /v1/account` needs a token from a sign-in made at most five minutes ago (`auth_time`); a refreshed token keeps the old time. The app signs in again with the password and continues on that session |
| The limit of 20 drafts a day was counted, then checked: requests arriving together could pass it | One row per learner and UTC day (`persona_draft_day`), raised and checked in one statement; a test sends twelve requests at once and five get through. The day is now the calendar day in UTC, not the last 24 hours |

Migration `0007_account_safety`.

## 4d. What the review of those fixes found (2026-10-10)

| Finding | Fix |
| --- | --- |
| The guard against storing for a deleted account could be raced: a write already on its way while the account was being deleted could put its row back | A deletion and a write for the same account take the same lock in the database (migration `0008_deletion_lock`: a trigger on `app_user`, which every write passes through, and a function that deletes). A write that waited then finds the account deleted and fails as a whole; a deletion that waited removes what the write stored. Tested with two connections held open against each other |
| A deletion cut off after the data was gone, but before the sign-in was removed, could not be repeated: the account was remembered as deleted, so the deletion itself was refused | Deleting is the one change that is never refused for a remembered deletion. When removing the sign-in fails, the account is looked up: if it is gone (only the answer was lost), the deletion succeeded; if it still exists, the deletion is no longer remembered and the emptied account works; if nobody can say, the deletion stays remembered and can be asked for again |
| A sign-in time that is not a number that fits | Refused like a missing one, instead of an error |

Migration files may now hold a function body between `$$` and `$$`
(`persistence/migrations/__init__.py`).

## 5. Not in this feature

Memories ("What my buddy knows"), subscription and usage, data export, reminders and rhythm,
accents, audio settings, role-play and custom roles, per-persona memory, undo of a profile change,
"Ask me again" by voice. Each needs a feature that does not exist yet.

## 6. Testing

- **Backend:** domain rules and API handlers against in-memory repositories and an in-memory file
  store; the new queries against PostgreSQL through the contract tests; the S3 and speech
  adapters against recorded requests.
- **App:** unit tests for stores and pure helpers; behavior tests per screen with the fake API
  and the fake auth provider.
- **Visual:** a `.playwright-mcp/check` script per screen at the five sizes in light and dark.
