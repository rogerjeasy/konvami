# Privacy labels and Data safety answers

Written 2026-11-05, updated 2026-11-20, from the database (`services/api/src/konvami_api/persistence/migrations`), the
code, and the privacy policy (`apps/site/content/privacy/en.md`). **The policy, these answers and the
iOS privacy manifest (`apps/mobile/src/lib/privacy-manifest.ts`, used by `app.config.ts`) must say the same thing.**
Change all three together, and again whenever a service below is added.

## What the app collects, and why

| Data                                                                                    | Source                          | Kept where                                                     | Why                             |
| --------------------------------------------------------------------------------------- | ------------------------------- | -------------------------------------------------------------- | ------------------------------- |
| Email address                                                                           | Sign-up (2.3)                   | Amazon Cognito                                                 | Account, sign-in, reset codes   |
| First name                                                                              | Sign-up                         | Database                                                       | Partners call the learner by it |
| Account id                                                                              | Cognito subject                 | Database (`app_user`)                                          | Links all the learner's data    |
| Age group (never the birthday)                                                          | 2.1 age check, on the device    | Database                                                       | 16+ check                       |
| Consent choices and dates                                                               | 2.5, 6.7                        | Database                                                       | Proof of AI consent             |
| Learning profile: languages, level, goals, exam, interests, correction style            | Onboarding, 6.3, voice changes  | Database (`profile_field`)                                     | Personalise partners            |
| Voice during a conversation                                                             | Microphone, 5.3                 | Sent live to OpenAI; not stored by us unless recordings are on | The conversation                |
| Recordings of the learner's turns                                                       | 5.3                             | S3 bucket, if "Keep recordings" is on                          | Replay on 5.6                   |
| Transcripts, word-for-word transcripts, reports, memories, cards, Tutor Q&A, phrasebook | Conversations and learner input | Database                                                       | The product                     |
| Profile photo (optional)                                                                | Photo library, 6.2              | S3 bucket, private                                             | Shown to the learner only       |
| Push token, time zone, language, reminder time                                          | 6.13, when reminders are on     | Database (`push_device`), Expo push service                    | Reminders and one nudge         |
| Voice minutes and request cost estimates                                                | Server                          | Database (`usage_charge`, `voice_week`)                        | Allowance and budget            |
| Flags the learner sends (reason, note)                                                  | 5.6, 5.10                       | Database (`content_flag`)                                      | Review of AI output             |
| Request logs (time, route, result, duration; no IP)                                     | Server                          | AWS CloudWatch                                                 | Security and operation          |

Not collected: location, contacts, calendar, health, financial data, browsing history, device
advertising id, precise device fingerprint. Nothing is used for tracking or advertising.

## Who processes it

| Processor                                     | Receives                                                                                                           | Basis in the policy                                          |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------ |
| Amazon Web Services (Frankfurt, eu-central-1) | Everything above (hosting, sign-in, database, files, email of codes)                                               | Data processing agreement                                    |
| OpenAI                                        | Voice and transcripts, profile and memories for context, report and memory writing, Tutor and Phrasebook questions | Learner consent on 2.5; DPA and standard contractual clauses |
| Expo (push service)                           | Push token and the notification text                                                                               | Named in the policy                                          |
| Apple and Google push gateways                | Pass the notification on                                                                                           | Independent controllers                                      |

Integrated, but **off unless the build or the server has its key**, and named in the policy:

| Processor                   | Receives                                                                                                                             | On when                                         | Changes the labels                                                                                                        |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Sentry                      | Crash reports with every piece of free text removed; no account                                                                      | `EXPO_PUBLIC_SENTRY_DSN` is set                 | Apple: Crash Data (not linked). Google: App info and performance › Crash logs                                             |
| PostHog (EU)                | Anonymous usage counts with a random install id, only after the learner opts in                                                      | `EXPO_PUBLIC_POSTHOG_KEY` is set                | Apple: Product Interaction adds Analytics. Google: App interactions adds Analytics                                        |
| RevenueCat                  | The account number and the purchases                                                                                                 | `EXPO_PUBLIC_REVENUECAT_*_KEY` are set          | Apple: Purchase History. Google: Financial info › Purchase history                                                        |
| ElevenLabs                  | Only the text it reads aloud, after the learner turns it on (consent `v3`)                                                           | The server has an ElevenLabs key and voices     | None (text the learner already gave; covered by Other User Content)                                                       |
| Microsoft (Azure AI Speech) | One recording and its target words, only when the learner asks for a pronunciation score (a drill, an exam simulation, a saved turn) | The server has `azure_speech_*` set (Terraform) | None (Audio Data is already declared). Choose an EU region (`westeurope`) and sign Microsoft's DPA (release checklist B7) |

The iOS manifest adds its rows by itself from the build's keys; App Store Connect and Play Console
must be answered by hand for the keys the store build has. AWS Bedrock is not used.

## App Store: App Privacy ("nutrition label")

All types below: **linked to the user's identity: yes. Used for tracking: no.** Purpose for every
type: **App Functionality**.

| Apple category  | Data type           | Collected | Covers                                                                                                      |
| --------------- | ------------------- | --------- | ----------------------------------------------------------------------------------------------------------- |
| Contact Info    | Email Address       | Yes       | Account                                                                                                     |
| Contact Info    | Name                | Yes       | First name                                                                                                  |
| Identifiers     | User ID             | Yes       | Account id                                                                                                  |
| Identifiers     | Device ID           | Yes       | Push token (only with reminders on)                                                                         |
| User Content    | Audio Data          | Yes       | Voice in conversations, recordings                                                                          |
| User Content    | Photos or Videos    | Yes       | Optional profile photo                                                                                      |
| User Content    | Other User Content  | Yes       | Transcripts, reports, memories, cards, Tutor, phrases                                                       |
| Usage Data      | Product Interaction | Yes       | Reviews, conversations, voice minutes                                                                       |
| Other Data      | Other Data Types    | Yes       | Age group, consent record, learning profile                                                                 |
| Everything else | (all other types)   | No        | Location, Health and Fitness, Financial, Contacts, Browsing, Search, Purchases, Diagnostics, Sensitive Info |

"Data not collected" is **not** an option for the app. "Purchases" and "Diagnostics" flip to Yes when
RevenueCat and Sentry arrive.

These nine types are what `collectedDataTypes` in `src/lib/privacy-manifest.ts` declares for a
build without optional keys; a build with Sentry, PostHog or RevenueCat keys adds the rows in the
table above.

## Google Play: Data safety form

| Section                     | Answer                                                                                                                                                                                 |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Collects or shares data     | Collects: yes. Shares: no (OpenAI and AWS act on Konvami's behalf under a processing agreement, which Google does not count as sharing; re-read the form's wording when filling it in) |
| Encrypted in transit        | Yes (HTTPS; WebRTC for voice)                                                                                                                                                          |
| Users can request deletion  | Yes: in the app (Profile › Privacy and AI › Delete account) and on the web (`/public/delete-account` on the API's address): enter that link in the form                                |
| Independent security review | No                                                                                                                                                                                     |
| Follows Families policy     | No (app is for 16+)                                                                                                                                                                    |

| Google category                                                                                                                    | Data type                    | Collected | Shared | Required?                                            | Purposes                                                            |
| ---------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- | --------- | ------ | ---------------------------------------------------- | ------------------------------------------------------------------- |
| Personal info                                                                                                                      | Name                         | Yes       | No     | Required                                             | App functionality, Account management                               |
| Personal info                                                                                                                      | Email address                | Yes       | No     | Required                                             | App functionality, Account management                               |
| Personal info                                                                                                                      | User IDs                     | Yes       | No     | Required                                             | App functionality, Account management                               |
| Photos and videos                                                                                                                  | Photos                       | Yes       | No     | Optional                                             | App functionality                                                   |
| Audio                                                                                                                              | Voice or sound recordings    | Yes       | No     | Required for conversations; storing them is optional | App functionality                                                   |
| App activity                                                                                                                       | App interactions             | Yes       | No     | Required                                             | App functionality                                                   |
| App activity                                                                                                                       | Other user-generated content | Yes       | No     | Required                                             | App functionality (transcripts, memories, cards, Tutor, phrasebook) |
| Device or other IDs                                                                                                                | Device or other IDs          | Yes       | No     | Optional                                             | App functionality (push token, with reminders on)                   |
| Location, Financial info, Health and fitness, Messages, Contacts, Calendar, Files and docs, Web browsing, App info and performance | all                          | No        |        |                                                      |                                                                     |

## Two Halves (section 7)

When Two Halves is switched on, a learner's moves (their voice, or their exact words in a neutral
voice with "Veil my voice") are heard by **one other learner** of the case, at the learner's own
request and with a separate consent given when joining. Nothing new is collected that the labels
above do not list: Audio Data and Other User Content already cover the moves, and the codename,
first language and chosen place are Other Data Types.

- **App Store:** no new data type. Say in the review notes that user content is checked before
  delivery, can be reported and blocked, and that there are no direct messages.
- **Google Play:** re-read whether a recording heard by another user at the learner's direction
  counts as "shared" in the Data safety form; the owner decides (release checklist H5).
- **Retention:** moves are deleted 30 days after their case ends and at most 30 days after they
  were recorded (the bucket rule `delete-halves-audio`); leaving Two Halves or deleting the account
  deletes them at once.

## Retention, as the policy states it

Kept until the learner deletes the account or the item. Account deletion removes the sign-in and
everything stored at once, recordings and photo included; database backups are overwritten within
7 days. OpenAI keeps what it receives for up to 30 days. A photo uploaded but never confirmed is
deleted after one day.

## Differences to fix before submitting

1. ~~The policy does not name Expo's push service.~~ Fixed: the policy names Expo, Sentry, PostHog,
   RevenueCat and ElevenLabs in all four languages.
2. `apps/site/site.config.ts` has an empty controller name, address and email; the site build refuses
   to run until they are filled (OWNER-TO-FILL).
