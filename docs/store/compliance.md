# Age rating, AI-content policy, consent, DSA and reviewer notes

Written 2026-11-05 (spec §6.21.3 to §6.21.5). The stores change their forms often: **use the answers
below as the intent, and re-read each question in the live form.** Nothing here has been submitted.

## 1. Minimum age and age rating

- **Konvami is for people aged 16 and over** (decision D16). It is enforced in the app on 2.1 Age
  check: the birthday stays on the device, only an age bracket is stored, and under-16s see
  "Age restricted". The privacy policy says the same.
- **Content is suitable for a young audience**: the partners' instructions keep conversation
  appropriate (spec §16.3), so the content rating stays low even though the minimum age is 16.

| Store                             | Answers                                                                                                                                                                                                                                                                                                                                                                                       |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| App Store age rating              | Answer the content questions honestly: no violence, sexual content, gambling, contests, medical advice or unrestricted web access. **AI-generated conversation: yes** (a chatbot the user talks to). User-generated content shared with others: **no** (partners and notes are private). Expected result: low rating. The rating is about content and does not enforce 16+; the age gate does |
| Google Play content rating (IARC) | Category: education or reference. Users can interact with each other: **no**. Shares location: **no**. Allows purchases: **no** today (yes once RevenueCat ships). Contains AI-generated content that users can prompt: **yes**. Expected result: low rating                                                                                                                                  |
| Google Play target audience       | **16 and over** (and 18+). Do **not** pick any age under 13 or "Designed for Families"                                                                                                                                                                                                                                                                                                        |
| Apple "Made for Kids"             | No                                                                                                                                                                                                                                                                                                                                                                                            |

## 2. Google Play: AI-generated content policy

Google requires apps that generate content with AI to let users report offensive output, and to
test against abuse. What the app has:

| Requirement                                       | Status                                                                                                                                                   |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| In-app way to report offensive or wrong AI output | **Built**: a flag on each partner line (5.6) and "That's wrong" on each correction (5.10); reasons: offensive or unsafe, wrong, I didn't say that, other |
| Someone reviews reports                           | **Built**: the owner's queue, 6.15 Reports (open, resolved, dismissed). **The owner must read it**                                                       |
| Reporting during a live call                      | Not built (design README, row 5.6, 5.10). Reports are made from the transcript afterwards                                                                |
| Safety rules in the AI instructions               | Built, server-side: users cannot inject a system prompt (spec §16.3)                                                                                     |
| Moderation of text the user writes for a persona  | **Not built** (Phase 3, being built separately). Say so in the review notes if still true at submission                                                  |
| Clear that partners are AI                        | Built: 2.5 and the partners never claim to be human; the listing says it (EU AI Act Article 50, spec §6.21.3)                                            |

## 3. Apple 5.1.2(i): sharing personal data with third-party AI

Before any data is sent, 2.5 "How Konvami uses AI" names the provider, says what it receives and
why, and asks for explicit agreement ("Agree and continue"). It can be read again in Profile ›
Privacy and AI (6.7); consent is withdrawn by deleting the account.

- **Names today: OpenAI only** (voice, transcripts, learning profile, memories). It is required for
  the app to work. ElevenLabs and AWS Bedrock are not used and are not named.
- The consent record (`v2`) is stored with its date. When ElevenLabs or another provider is added,
  ask again with a new version before anything is sent to it.

## 4. Account deletion

- In the app: Profile › Privacy and AI › Delete account (6.9). It deletes the sign-in and every row
  and file at once. Apple 5.1.1(v) is met.
- **Google Play also needs a web page** where someone who has uninstalled the app can ask for
  deletion, entered in the Data safety form. **Not built yet** (listed for Phase 3). Until it
  exists, the privacy policy's "write to us" address is the only route.

## 5. Other review risks seen in the code

These are things a reviewer will notice on the first run. None was changed by this work.

| Where                       | What                                                                                                        | Why it matters                                                                                                                                                              |
| --------------------------- | ----------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2.7 All set (`all-set.tsx`) | Says "7 days of Plus are on us. No card needed."                                                            | There is no plan, no trial and no billing: a false claim (guideline 2.3.1). Remove or replace when RevenueCat ships                                                         |
| 2.2 and 3.1                 | Apple and Google buttons show a "coming soon" notice                                                        | Placeholder features are rejected (guideline 2.1). Hide the buttons until the sign-ins work. Sign in with Apple becomes mandatory the day Google sign-in ships              |
| 3.1                         | "Email me a sign-in link instead" shows "coming soon"                                                       | Same                                                                                                                                                                        |
| Terms and Privacy links     | `EXPO_PUBLIC_TERMS_URL` and `EXPO_PUBLIC_PRIVACY_URL` are empty, so links open an in-app "coming soon" page | A privacy policy URL is mandatory in both stores and inside the app                                                                                                         |
| 2.6 Microphone              | Says "Prefer typing? Text mode is always there"                                                             | No typed practice mode exists in `screens/conversation` or `screens/talk`, so this looks untrue: reword it in all four languages (`microphone.pointText`) or build the mode |
| Dev tools                   | `expo-dev-client` is left out of store builds by Expo                                                       | Open the built `.ipa` and `.aab` once and confirm no local-network prompt and no developer menu                                                                             |

## 6. EU trader status (Digital Services Act)

Both stores ask whether the developer is a "trader". Selling subscriptions makes the developer one
once RevenueCat is live; **the stores then publish the developer's address, phone number and email
on the EU store pages** (spec §6.21.5). Decide before declaring:

- a business address service or a P.O. box that accepts the stores' verification mail;
- a dedicated phone number and a support email (not a personal one);
- the seller name is the developer's **personal legal name** for an individual account.

All of these are **OWNER-TO-FILL**: Seller name, postal address, phone number, support email, and
whether to declare as trader now or when subscriptions launch.

## 7. Reviewer notes (paste into App Store Connect "Notes" and Play Console "App access")

Do not store credentials in this repository. Create the account first, then paste the text with the
real values into the store forms only.

```text
Konvami is a voice-first German practice app. Users talk to AI partners; all partners are AI and say
so. The app is for people aged 16 and over.

DEMO ACCOUNT
Email: OWNER-TO-FILL (an inbox the owner controls)
Password: OWNER-TO-FILL
The account has finished sign-up, the AI consent screen (2.5), the setup conversation and the
placement test, so you land on the Today screen. It has voice minutes for this week. If a call
refuses to start, the weekly allowance is used up (it resets on Monday 00:00 UTC): tell us and we will reset it.

HOW TO SEE EACH FEATURE
- Talk tab: choose a partner and tap "Start talking". Allow the microphone. Speak or stay silent;
  the partner starts the conversation. Tap "End conversation", then open the report from the
  Library tab or the finished-conversation screen.
- Talk tab › Role-plays: eight situations. Learn tab: flashcards, Phrasebook, Grammar map.
- Profile › Privacy and AI: the AI consent, "Keep recordings" and "Delete account".
- Profile › What my partners know: the memories and how to delete them.
- Flagging AI output: Library › open a conversation › the flag beside a partner line.

AI AND DATA
Voice and text are processed by OpenAI to let partners listen and reply; the user agrees on the
screen "How Konvami uses AI" before the first conversation. Servers are in AWS Frankfurt. There is no
advertising and no tracking. Account deletion is in Profile › Privacy and AI › Delete account.

NOT IN THIS VERSION
No in-app purchases or subscriptions. Sign in with Apple and Google are not offered. (Update when true.)
Voice requires the network; a stable connection is needed for a call.
```
