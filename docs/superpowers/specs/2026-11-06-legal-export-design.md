# Legal pages, data export and deleting an account from the web

Spec §6.21.3 (store and legal checklist), §15 (legal documents), §16.3. Screens 6.18 Terms of Use
and Privacy policy, 6.19 Export my data, and a public web page for deleting an account (6.9 without
the app). Built on `feature/legal-export`.

## Read this first: the legal texts are a draft

The Terms of Use and the Privacy Policy were written from what the app does today. **They have not
been reviewed by a lawyer and must be before the app is published.** In particular check:

- the **provider** (controller) clause and the **applicable law** clause of the Terms (the text
  says "the law of the country where the provider is based", because the provider is not named
  yet);
- the **liability** clause (written for German-speaking consumer law: unlimited for intent, gross
  negligence and injury to life, body or health; otherwise limited to typical foreseeable damage);
- the **legal bases**, **international transfer** (OpenAI, US) and **retention** statements of the
  Privacy Policy, against the real data processing agreements;
- the French and Italian wording of everything (the German and English texts were written first).

**Nothing about the provider is invented.** The name, postal address and email of the controller
come from `apps/site/site.config.ts` (`controller.name`, `.address`, `.email`) and are empty today.
Until they are filled in:

- the website build refuses to run (as before);
- the app shows the pages with a **"Draft"** notice at the top, and "not set" where a detail
  belongs, in the app's language (`legal.unset`, `legal.draftTitle`, `legal.draftBody`);
- `pnpm legal:check` exits with an error. Run it before a store build.

## One text, two places

The Markdown under `apps/site/content/{privacy,terms}/<lang>.md` is the only source.

- The **site** renders it to HTML (`apps/site`, `pnpm --filter @konvami/site build`), published by
  `infra/modules/site` when `publish_site = true`. `terraform output -raw mobile_env` now also
  gives `EXPO_PUBLIC_TERMS_URL` (it already gave the privacy address).
- The **app** draws the same text with its own `Text`: `pnpm legal:generate` turns the Markdown
  into plain data (`apps/mobile/src/legal/documents.generated.ts`: headings, paragraphs, lists,
  bold) and `screens/legal` renders it (routes `/legal/terms`, `/legal/privacy`; they need no
  account, as the links sit under "Create account"). A site test fails while the generated file is
  out of date, and the generator refuses Markdown the app cannot draw (quotes, deeper headings,
  images), so nothing is dropped silently.
- `openLegal` (`lib/external.ts`) opens the website's page when `EXPO_PUBLIC_TERMS_URL` /
  `EXPO_PUBLIC_PRIVACY_URL` is set, and the app's own screen otherwise (it used to open a "Coming
  next" placeholder). `Terms` now has a link on 6.7 as well.

Changed in the content: a new Terms of Use page in four languages, and the Privacy Policy now
names the phrasebook, the reports a learner sends us (flags) and the data export. `updated` in
`site.config.ts` is 2026-11-06.

## 6.19 Export my data (GDPR art. 15 and 20, revFADP art. 25)

`POST /v1/account/export` writes one JSON file with everything stored for the learner and answers
with a link that works for an hour.

- **What is in it.** The account (first name, language, email, whether voice was agreed) and a row
  list for every table of the database that holds the learner's data: profile, goals, changes,
  partners, conversations with their turns and plans, reports, level steps, memories, cards and
  their reviews, phrases, exams, flags, the Tutor's questions, usage charges and the archives
  themselves. A recording is a link inside the file (valid for the same hour), not a bucket key.
- **What is not.** The password (the sign-in service stores only a hash), push tokens (they let
  whoever holds them notify the phone; the device and its settings are listed), and tables that
  are not about a learner: `deleted_user`, `schema_migration`, `spend_alert`.
- **A table cannot be forgotten.** `persistence/export_repository.py` lists every table as
  `EXPORTED` or `NOT_EXPORTED` with the reason, and a test reads the real schema and fails for a
  table in neither. A feature that adds a table has to decide.
- **Limits.** Three archives a day per learner (`export_limit`, HTTP 429), counted in the new table
  `data_export` (migration `0040`). The file sits under `exports/<user>/` in the media bucket; the
  bucket deletes it after a day (`delete-data-exports` lifecycle rule) and deleting the account
  deletes it at once. Tables are read in pages of 200 rows because the RDS Data API answers at most
  1 MiB at a time. It is made inside the request: fine for a learner with some months of use; a
  very large account would need a background job (the call worker's pattern).
- **No password prompt.** Deleting an account asks for the password again (a stolen session must
  not destroy everything); a copy goes to a one-hour link for the signed-in learner, who can read
  all of it in the app already. If that changes, add `recently_signed_in` to the route.

## Deleting an account from the web

Google Play asks for a web way to delete an account for people who uninstalled the app.
`GET {api}/public/delete-account` is a small self-contained page (four languages, system colours,
no outside file) and its two requests:

1. `POST /public/delete-account/request {email}`: the identity provider emails a 6-digit code to
   the address.
2. `POST /public/delete-account/confirm {email, code}`: when the code is right, the account is
   deleted by the same `AccountService.delete` as in the app (files, rows, sign-in).

**Proof of ownership.** Konvami has no email sender of its own (Amazon SES is not set up), so the
code is Cognito's forgot-password code: `forgot_password` sends it, and `confirm_forgot_password`
checks it. The new password it needs is random and nobody sees it; the account is deleted right
after. If the deletion then fails, the password has changed, and the learner resets it in the app
as usual. Nothing is deleted without the code.

**No enumeration.** The app client has `prevent_user_existence_errors` on, so for an address with
no account Cognito answers as if it had sent the code, and a wrong code and an unknown address fail
alike. The service turns every such failure into `invalid_code` and every success of the first step
into the same `202 {"sent": true}`. A test asks both questions about an address with an account and
one without and compares the answers.

**Abuse limits.** Cognito limits codes per address and wrong tries (`too_many_attempts`, HTTP 429);
API Gateway throttles `POST /public/*` on its own (1 request a second, burst 5, variable
`public_throttle`). The page sends a nonce-based content security policy (`default-src 'none'`,
only its own script and style, `frame-ancestors 'none'`), `no-store` and `nosniff`.

**Infra.** `infra/modules/api`: routes `GET`/`POST /public/{proxy+}` with no authorizer (a more
specific route wins over the token-checked `/{proxy+}`), the Lambda gets `KONVAMI_APP_CLIENT_ID`,
and `terraform output delete_account_url` gives the address for the stores' listings. Written and
validated (`terraform validate`), **not planned or applied**.

## What still needs a person

- A lawyer's review of the texts, and the controller's details in `apps/site/site.config.ts`, then
  `pnpm legal:generate` and `pnpm legal:check`.
- `publish_site = true` (after the details are filled in) so the stores get a privacy and a terms
  address; the Play listing also takes `delete_account_url`.
- The email with the code is Cognito's own "Your verification code" message, sent from its default
  address (about 50 emails a day). A custom message, and a sender of Konvami's own, come with
  Amazon SES (infra/README.md). Until then the page tells the visitor to expect an email from
  Amazon Web Services or Cognito.
- Apple's review needs a demo account and the in-app deletion (6.9), which exist; the web page is
  an addition, not a replacement.

## Not built

- The Privacy Policy does not name the web deletion page (its address depends on the environment);
  the stores' listings carry it.
- The export is not available while signed out (it needs the account), and is not offered by email.
- A record of the exports a learner made is kept only as a count in the last day; it is not shown.
