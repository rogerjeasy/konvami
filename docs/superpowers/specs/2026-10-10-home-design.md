# Konvami — Section 5 · Home (design)

> **Status:** Approved in conversation on 2026-10-09; this file is the written version.
> **Scope:** What a learner lands on after signing in or finishing onboarding: the five tabs, the
> Today screen, a first practice conversation with a partner, and reading conversations again.
> **Parent spec:** `2026-10-06-language-companion-app-design.md` (§6.3, §6.4, §6.5, §6.9, §6.15,
> §8.5, §11, §12.1, §14, §17.3).
> **Design source:** none. The canvas stops at section 3, so these screens are built directly in the
> visual language of sections 1–4 and reviewed in the running app (as decided for section 4).

---

## 1. Goal and success criteria

After onboarding, the learner sees Today, starts talking with a partner in one tap, and afterwards
finds that conversation counted and readable.

Done means:

1. Every name and number on screen comes from the database. What does not exist yet (cards, a
   plan, charts) is left out or said to be coming; nothing is filled in with sample data.
2. From Today to talking takes one tap (spec §14.3: at most two).
3. A conversation counts, in the streak, the minutes and the library, once it has ended and the
   learner said something in it.
4. Days follow the learner's calendar (the device's time zone), not the server's.
5. Typecheck, lint, tests and `terraform validate` pass; screens pass the visual check of
   AGENTS.md rule 2.6 in light and dark.

## 2. Decisions

| # | Decision | Reason |
| --- | --- | --- |
| H1 | **Headless tabs with our own tab bar** (`expo-router/ui`), not the system's native tab bar | The bar is drawn from the design tokens, is the same on iOS, Android and the web preview, and becomes a side rail on wide windows. The native bar cannot do the last two |
| H2 | **Practice calls run on the existing Lambda worker**, capped at 10 minutes | The worker's limit is 15 minutes (onboarding design O2). Longer sessions need the Fargate sideband of spec §10.2 |
| H3 | **Practice uses the efficient voice model** by default; a Terraform variable | Spec §17.3 lever 2: the efficient tier for a buddy's free conversation. It is where most voice minutes go |
| H4 | **A partner's instructions are built per call on the server**, in the layers of spec §8.5: who they are, their role, the learner, the language, how to speak at the learner's level | The app never sees or sends instructions. Role decides how mistakes are treated: a buddy recasts, a teacher corrects briefly, an exam coach runs speaking tasks |
| H5 | **One answer for Today** (`GET /v1/home`) | One request, one loading state, and one place (the server) that decides what Today shows |
| H6 | **Days are cut by the database** in the time zone the app names; an unknown zone counts as UTC | PostgreSQL knows every zone's rules. The Lambda runtime need not ship a time-zone database |
| H7 | **A conversation keeps its partner by reference**; removing a partner keeps the conversation without one | The library must not lose a conversation because a persona was deleted |
| H8 | **Learn and Progress are empty states** that say what will be there | Their features (cards, grammar map, charts) are not built; a made-up chart would mislead |

## 3. Screens

| # | Screen | Route | Content |
| --- | --- | --- | --- |
| 5.1 | Today (tab) | `/today` | Greeting · the partner to talk to next and one button · this week (days, streak, minutes) · level, with skills when measured · "Let's polish this" from the placement test · exam countdown · the last three conversations |
| 5.2 | Talk (tab) | `/talk` | The learner's partners, with when they last talked |
| 5.3 | Conversation | `/call/[personaId]` | The live call: the partner's avatar, captions, mute, time left, End |
| 5.4 | Conversation done | `/conversations/[id]/done` | Waits until the call is saved; then duration and the streak. A call without a word is said to be too short |
| 5.5 | Library (tab) | `/library` | Past conversations, newest first, a page at a time |
| 5.6 | Transcript | `/conversations/[id]` | One conversation as chat bubbles |
| 5.7 · 5.8 | Learn · Progress (tabs) | `/learn` · `/progress` | What will be there |
| 5.9 | Account | `/account` | Name, email, Sign out |

`/home` stays the gate: it continues onboarding where the learner left off and enters `/today`
once it is done. The tabs guard themselves the same way, because on the web any of their
addresses can be opened directly.

The tab bar lies along the bottom on phones and stands at the side above the `wide` breakpoint.
At large text sizes only the open tab keeps its name. Switching tabs only fades the mark behind
the icon (AGENTS.md 2b.4); Today's entrance plays once, when the tabs mount.

## 4. Backend

| Change | What |
| --- | --- |
| `domain/practice.py` | The partner's instructions and their one tool, `end_conversation` |
| `domain/conversations.py` | The list, one transcript, each partner's history, and the streak and week worked out from the days practised |
| `domain/home.py` | What Today shows, composed from the profile, the placement result, the partners and the conversations |
| Migration `0005` | `voice_session` allows `practice` and gains `persona_id` (set to null when the partner is removed) |
| `POST /v1/voice/calls` | `purpose: practice` with `personaId`; the call uses that partner's voice. `localDate`: today on the device's calendar, so a persona names the right weekday |
| `GET /v1/home?tz=` | Today in one answer |
| `GET /v1/conversations?before=&limit=` · `GET /v1/conversations/{id}` | The library, a page at a time, and one transcript |
| Terraform `voice` variable | `practice` model and time limit |

**The streak:** days in a row with practice, ending today or, while today is still open,
yesterday. **The week:** Monday to Sunday.

## 5. Not in this feature

Session report and correction chips, help buttons (stuck, slower, translate), memory between
conversations (a partner is told how often they have talked, and to say honestly that they do
not remember what was said), audio recordings, Persona Studio, cards, the daily plan,
subscriptions and quotas (the limit is the existing 10 calls a day).

## 5a. What the real calls showed (2026-10-10)

The same scripted conversation (a simulated A2 learner who makes mistakes, asks for a phrase in
French, asks whether the partner is human, and says goodbye) was run through the real screens
against the production services, with in-memory storage:

| Run | Partner said | What happened |
| --- | --- | --- |
| Efficient model, first instructions | 384 words to the learner's 76 | Five-sentence replies with two questions; the "friend" quoted corrected sentences back; said "it's Friday" on the learner's Saturday |
| Efficient model, final instructions | 225 words | No corrections aloud, one question at a time, the phrase given in German only; still two to three sentences |
| Flagship model, final instructions | 138 words | Two short sentences and one question every time; mistakes repeated correctly in passing |
| Efficient model as the teacher | | Corrects briefly with the reason, as its role says, but got one grammar explanation wrong |

All four ended with the partner calling `end_conversation` on "Tschüss", and the app showed the
summary, the streak and the transcript. Changes that came out of it: a sentence limit per level,
the rule against quoting mistakes back, the phrase rule, and the device's date sent with each
call (`localDate`; a date no time zone can have right now is ignored).

**Open:** the teacher and the exam coach explain grammar, where a wrong explanation costs trust.
Spec §17.3 already routes "demanding Teacher sessions" to the flagship model; routing by role is
not built (the `voice` variable has one model per purpose).

## 6. Testing

- **Backend:** domain rules and API handlers against in-memory repositories; the conversation
  queries against PostgreSQL through the same contract tests.
- **App:** unit tests for the stores and the pure helpers; behavior tests per screen with the fake
  API and the fake voice engine.
- **Visual:** `.playwright-mcp/check/setup5.js` stands in for Cognito, the API and WebRTC;
  `all5.js` captures every state at the five sizes in light and dark.
- **Voice end to end:** a scripted practice conversation through the real screens against the
  production services and the real voice model, with in-memory storage.
