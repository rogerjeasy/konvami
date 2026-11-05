# Privacy labels and Data safety answers

Written 2026-11-05 from the database (`services/api/src/konvami_api/persistence/migrations`), the
code, and the privacy policy (`apps/site/content/privacy/en.md`). **The policy, these answers and the
iOS privacy manifest in `apps/mobile/app.config.ts` (`PRIVACY_MANIFEST`) must say the same thing.**
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
| Expo (push service)                           | Push token and the notification text                                                                               | **Not yet in the policy: add it**                            |
| Apple and Google push gateways                | Pass the notification on                                                                                           | Independent controllers                                      |

Not integrated yet, so **not** declared: ElevenLabs, AWS Bedrock, Sentry, PostHog, RevenueCat. Add
each to the three places above, and to the answers below, in the same change that integrates it
(Sentry adds Crash data and Performance data; PostHog adds Product interaction as analytics;
RevenueCat adds Purchases and a purchase id).

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

These nine types are the same as `NSPrivacyCollectedDataTypes` in `app.config.ts`.

## Google Play: Data safety form

| Section                     | Answer                                                                                                                                                                                 |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Collects or shares data     | Collects: yes. Shares: no (OpenAI and AWS act on Konvami's behalf under a processing agreement, which Google does not count as sharing; re-read the form's wording when filling it in) |
| Encrypted in transit        | Yes (HTTPS; WebRTC for voice)                                                                                                                                                          |
| Users can request deletion  | Yes: in the app (Profile › Privacy and AI › Delete account). Google also needs a **web link** to request deletion: the web form is not built yet                                       |
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

## Retention, as the policy states it

Kept until the learner deletes the account or the item. Account deletion removes the sign-in and
everything stored at once, recordings and photo included; database backups are overwritten within
7 days. OpenAI keeps what it receives for up to 30 days. A photo uploaded but never confirmed is
deleted after one day.

## Differences to fix before submitting

1. The policy says Konvami "contains no analytics or advertising tools" and lists only AWS and
   OpenAI as recipients. That was true on 2026-10-23. Push from the server (merged 2026-10-26) sends
   the push token and notification text through Expo's push service, so **the policy must name Expo**
   and say the token is kept in `push_device`.
2. `apps/site/site.config.ts` has an empty controller name, address and email; the site build refuses
   to run until they are filled (OWNER-TO-FILL).
