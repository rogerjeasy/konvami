# Subscriptions, the free trial and the free tier (6.17, 4.8, spec §6.21.2, §6.19)

Status: built (2026-11-06) behind configuration; **off** until the owner sets up RevenueCat and the
store products (steps below). With nothing configured, nothing changes for the testers.

## Why

The store build needs a free tier, paid plans, a 7-day trial and minute packs (spec §6.21.2), and
the server has to enforce them: a limit in the app alone can be bypassed. RevenueCat and the store
accounts do not exist yet, so everything is built to be switched on by configuration.

## What

- **Three tiers, as data** (`services/api`: `domain/plans.py`, `TIERS`): Free (15 voice minutes a
  week, 2 partners), Plus (60 a week ≈ 250 a month, as many partners as wanted), Pro (140 a week
  ≈ 600 a month, plus scored exam simulations and premium voices). Minutes per week can be changed
  per environment (`plans.weekly_minutes`); the rest is what a tier means.
- **An entitlement** (table `entitlement`, migration `0035`) is what the learner has bought. Only
  RevenueCat's webhook writes it. The plan in force is the bought tier until its `expires_at`,
  then Free. The owner's account always has everything.
- **Minute packs** (tables `minute_pack*`, migration `0036`) add minutes that never expire. A week
  that goes past its quota has used the packs for the rest; how much is **worked out from the
  seconds the week really used** (`voice_week.seconds`, which a call that ends early gives back
  from) and the quota the week had (written down when its minutes are granted), never stored as a
  number of its own. So minutes used from a pack stay used however many weeks pass, and time given
  back is given back.
- **Enforcement on the server**: the weekly allowance of `VoiceCallService` asks the plan
  (`PlanService.weekly_seconds`); a call never starts with more time than is left. `exam`
  calls need the Pro perk; adding or copying a partner is limited inside `PersonaService`
  (`_room_for_one_more`), the one place every creating path goes through. A refusal is HTTP 402
  `plan_required`.
- **The testers keep working**: `plans.enforce = false` (the default) leaves every learner with
  `voice.weekly_minutes` and every feature, and the Plan screen says so.
- **The webhook** `POST /webhooks/revenuecat` is the one route without an access token. It exists in
  API Gateway only when its secret exists, and the function refuses any call whose `Authorization`
  header is not that secret (constant-time compare; an empty secret matches nothing). Events:
  purchase, renewal, product change and uncancellation set the tier; a cancellation keeps it to its
  end without renewing; a refund of the current subscription ends it, a refund of a **pack** takes
  that pack's minutes back and leaves the subscription alone; expiration ends it; a billing issue is
  noted; `TRANSFER` moves the plan to the new account; an older event never overwrites a newer one;
  a pack counted twice counts once (its transaction id is the key). Events about anonymous ids are
  accepted and ignored.
- **The app**: 6.17 Plan (`screens/plan`): the plan, what it includes (from the server), voice
  minutes, minutes from packs, the end or renewal date, "See plans", "Restore purchases",
  "Manage subscription" (the store's own page). The **paywall sheet** offers the plans with the
  store's prices and trial; it opens from the Plan screen, when a partner cannot be added, when an
  exam simulation needs Pro, and when the week's minutes are used up. 4.8 Ready offers "Try Plus
  free for N days" when the store has such an offer. After a purchase the plan is read again every
  2 seconds (6 times) until the webhook has reached the server.
- **The purchase layer** (`src/plan`) is an interface (`PurchaseDevice`) with RevenueCat on phones
  (`app-device.ts`, `react-native-purchases`, a native module: a development or store build) and
  "not available" on the web preview and Expo Go. It is enabled only when
  `EXPO_PUBLIC_REVENUECAT_IOS_KEY` / `_ANDROID_KEY` exist. Prices, names and the trial come from the
  store; nothing is hard-coded. The app names the learner to RevenueCat by their id
  (`GET /v1/plan` returns it as `userId`), which comes back as `app_user_id` in the webhook.

## What the owner must do (nothing here can be done from the code)

1. **App Store Connect** (Apple Developer account): create the app (bundle id from
   `app.config.ts`); accept the Paid Apps agreement and add banking and tax details; create one
   **subscription group** "Konvami" with auto-renewable subscriptions **Plus monthly**, **Plus
   yearly**, **Pro monthly**, **Pro yearly** (prices in CHF and EUR; Apple's Small Business Program
   for the 15% rate); on Plus monthly add an **introductory offer: free, 7 days** (new
   subscribers); create **consumable** products for minute packs (for example 60 minutes). Note
   the product ids.
2. **Google Play Console**: create the app; set up a merchant profile; create **subscriptions**
   Plus and Pro with a **monthly** and a **yearly base plan**, and a **free-trial offer of 7 days**
   on Plus monthly; create **managed (consumable) products** for the packs. Note the product ids.
   (A personal account also needs the closed test with 12 testers for 14 days before production.)
3. **RevenueCat** (app.revenuecat.com): create a project; add the iOS app (App Store Connect
   in-app purchase key / shared secret) and the Android app (a Google service-account JSON with
   Play permissions); import the products.
   - **Entitlements**: `plus` (attach the Plus products) and `pro` (attach the Pro products).
   - **Offerings** (the app relies on these names): `plus` with packages `$rc_monthly` and
     `$rc_annual`; `pro` with `$rc_monthly` and `$rc_annual`; `minutes` with one custom package
     per pack. Make `plus`, `pro` and `minutes` all available (none needs to be "current").
   - **API keys**: copy the **public SDK keys** (iOS `appl_…`, Android `goog_…`) into
     `apps/mobile/.env` as `EXPO_PUBLIC_REVENUECAT_IOS_KEY` / `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY`
     and into the EAS environment variables of the `preview` and `production` profiles. They are
     public by design; the secret keys never go in the app.
   - **Webhook**: Project settings → Integrations → Webhooks → add
     `<api_url>/webhooks/revenuecat` (the `api_url` Terraform output) with the
     **Authorization header value** set to a long random string you choose. Send events for both
     stores, for production and sandbox.
4. **Terraform** (`infra/envs/dev/terraform.tfvars`, gitignored; see `terraform.tfvars.example`):
   ```hcl
   revenuecat_enabled        = true
   revenuecat_webhook_secret = "<the same long random string>"
   plans = {
     enforce      = true   # leave false until the store build is ready: false keeps the testers' time
     products     = { "<plus monthly id>" = "plus", "<plus yearly id>" = "plus",
                      "<pro monthly id>"  = "pro",  "<pro yearly id>"  = "pro" }
     pack_minutes = { "<pack id>" = 60 }
   }
   ```
   Build the API package, `terraform plan -out=tfplan`, read it, apply. The plan creates the
   secret, grants the API read access and opens the one webhook route. Migrations `0035` and
   `0036` run on the apply.
5. **Test in the sandbox** with a development build (`react-native-purchases` is native): sandbox
   tester on iOS, a licensed tester on Android. Buy Plus (the trial), check 6.17 shows "Free trial",
   cancel, restore on a second device. Only then set `plans.enforce = true`.
6. **Sign in with the store account**: the store shows its own purchase sheet; the app never sees a
   card number.

## Differences from the spec

- Plus and Pro minutes are per **week** (Plus 60, Pro 140), not per month (250, 600): the allowance
  has been weekly since cost control. Minute packs are used after the week's quota and never expire.
- No free-tier pool, regional prices or kill switches per tier (spec §6.19 "free tier's live voice"
  is the existing spending guard).
- The Plan screen shows the plan; changing it happens in the store's sheet. A subscription cannot be
  cancelled inside the app (the stores require their own page).
- Pro's "premium voices" (ElevenLabs) are a perk that is checked but not yet used: ElevenLabs is not
  integrated.
- A packs refund after its minutes were used cannot take back more than is left; the balance floors
  at zero.
- Events for a learner whose account was deleted fail with a server error, and RevenueCat retries
  and then stops; nothing is stored for them.
