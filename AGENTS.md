# Konvami: agent instructions

Konvami is a voice-first language partner (iOS + Android, one Expo codebase), published on the App
Store and Google Play. First market: Switzerland, Germany, France. UI in English, German, French,
Italian.

- **Product and system spec:** `docs/superpowers/specs/2026-10-06-language-companion-app-design.md`.
  Read the relevant section before building a feature. Decisions D1–D19 (§2.2) are settled.
- **Approved UI design:** the claude.ai Design canvas (link and screen list in
  `docs/design/README.md`). Build screens exactly as drawn, in light and dark.
- **Brand:** `design/brand/konvami/`. The v2 logo (solid teal tile, no gradient) is drawn from
  `packages/design-tokens/src/logo.ts`; regenerate icons with `pnpm brand:export`.
- **Infrastructure:** `infra/README.md`. Konvami shares the NextChronicle `nc-dev` AWS account.

These rules apply to **every session**. When a request conflicts with one, say so before writing
code.

## 1. Engineering principles (non-negotiable)

1. **DRY and reuse first.** Before writing a component, hook, helper or Terraform resource, search
   for an existing one (`src/components`, `src/lib`, `src/hooks`, `packages/*`, `infra/modules`).
   Extend it instead of copying it. The second time logic appears, extract it.
2. **Separation of concerns.**
   - `src/app/` holds routes only: each file renders a screen from `src/screens/`.
   - `src/screens/<name>/` holds screen bodies and their private parts.
   - `src/components/` holds reusable, presentational UI with no data fetching or navigation.
   - `src/lib/` holds pure logic (layout rules, formatting, storage, routes), unit tested.
   - `src/i18n/` holds strings; `src/preferences/` holds device settings; `packages/` holds code
     shared between apps.
   - Backend (Python) keeps API handlers, domain logic, providers (OpenAI, ElevenLabs, AWS) and
     persistence in separate layers. Providers sit behind interfaces (spec §15 Portability).
3. **No hard-coded values.**
   - Colors, fonts, type sizes, radii, sizes, spacing, motion and breakpoints come from
     `@konvami/design-tokens` (via Tailwind classes such as `bg-primary`, `text-fg-muted`,
     `rounded-button`, or `useTheme().color` for SVG). ESLint rejects hex colors in app code.
   - User-facing text comes from `src/i18n/locales/*` (all four languages, same keys; a test
     enforces it). Dates and numbers use `Intl` (`src/lib/format.ts`).
   - Routes come from `src/lib/routes.ts`. Environment-specific values (API URLs, client ids)
     come from `EXPO_PUBLIC_*` variables or Terraform outputs, never from source.
   - A number that must exist in code (drawing geometry, a timeout) is a named constant with a
     comment saying what it is.
4. **Secrets and environment files are never committed or pushed.**
   - Only `*.example` files are tracked (`.env.example`, `terraform.tfvars.example`). Real `.env`,
     `*.tfvars`, Terraform state and plans, signing keys (`.p8`, `.p12`, `.jks`, `.key`, `.pem`)
     stay local; `.gitignore` covers them and `pnpm check:secrets` (run in CI and the pre-commit
     hook) fails if one is tracked or staged.
   - API keys (OpenAI, ElevenLabs, RevenueCat secret) live only in AWS Secrets Manager and are read
     server-side. `EXPO_PUBLIC_*` values ship inside the app, so they must never be secrets.
   - Never paste a secret into a commit message, log line, test fixture or document.
5. **Small, typed, tested units.** TypeScript `strict` with `noUncheckedIndexedAccess`; Python with
   mypy and Ruff. New logic gets a unit test next to it (`foo.ts` → `foo.test.ts`); new screens get
   a behavior test (Testing Library) for their main path.
6. **Comments explain why**, not what. Keep them current when code changes.
7. **Supply chain:** pnpm blocks install scripts and too-new versions. Never add
   `minimumReleaseAgeExclude` entries; pick an older version instead. In `apps/mobile`, add packages
   with `npx expo install`, then check the lockfile resolved mature versions.

## 2. UI rules: every screen, every size

1. **Responsive with no overflow, clipping or overlap** on any window, from a 320 × 568 phone to a
   landscape tablet and a desktop browser:
   - Use flex layouts. Never give a text container a fixed height; text wraps and grows.
   - Screens scroll when content is taller than the window; the main action stays reachable
     (pinned actions, as in `HeroLayout`).
   - Layout decisions come from `src/lib/layout.ts` (`useScreenLayout()`): compact gutters under
     360 pt, side-by-side above the `wide` breakpoint, readable text columns
     (`max-w-content`), screens capped at `max-w-screen`.
   - Absolute positioning is only for decorative drawings that scale with their box (see
     `GreetingOrbit`), never for text blocks or controls.
2. **OS text size is respected.** Never set `allowFontScaling={false}`. Only decorative text inside
   illustrations may cap growth (`maxFontSizeMultiplier={ILLUSTRATION_MAX_FONT_SCALE}`).
3. **Light and dark mode** for every screen, from the same tokens (CSS variables per theme). Text
   contrast ≥ 4.5:1; the tokens test checks the pairs. No purple, indigo, lavender, gradient washes
   or glows: graphite and stone surfaces with one deep-teal accent.
4. **Accessibility:** touch targets ≥ 44 pt (`min-h-tap`), real roles and labels on every control,
   decorative drawings hidden (`aria-hidden`), headings marked, Reduce Motion respected
   (`useReduceMotion`). Learner mistakes are never shown as red alarms during practice (spec §14.3).
5. **One `Text`, one `Button`.** Use `src/components/text.tsx` and `button.tsx`; add a variant to a
   shared component rather than styling a one-off.
6. **Verify visually before saying a UI task is done:** run the web build (`pnpm --filter
@konvami/mobile web`) and check with Playwright at 390 × 844, 320 × 568, 820 × 1180,
   1180 × 820 and 1440 × 900, in light and dark, with no horizontal overflow and every primary
   action on screen.

## 2b. Motion: the app should feel alive

Konvami should be fun to use. Motion is part of the design, not decoration added at the end.

1. **Every screen has purposeful motion.** Content enters with a short rise and fade (`Reveal`),
   in a stagger, so the eye reads the screen in order. First-time and celebratory moments (logo,
   greetings, a saved word, a level-up) may `Pop`. Illustrations show the product working (a voice
   orb that breathes, a ring that fills), with ambient `Loop`s. Buttons shrink slightly when
   pressed (`PressScale`, built into `Button` and `TextButton`).
2. **Use the shared building blocks** in `src/components/motion.tsx`, `src/components/pager.tsx`
   and `src/lib/motion.ts`. All timing, easing and springs come from the `motion` tokens. Never
   write ad-hoc durations or curves in a screen.
3. **Cross-platform and on the UI thread:** Reanimated 4 CSS animations and transitions,
   `useAnimatedStyle` for anything driven by a finger or scroll. Do not use core `Animated` or
   layout-animation `entering` (on web it absolutely positions elements and breaks layouts).
   Animate `transform` and `opacity`, not layout properties.
4. **Respect frequency:** things used dozens of times a day (tab switches, list scrolling) get
   little or no motion; onboarding, success and empty states get the delight.
5. **Reduce Motion ships with the animation:** fewer and gentler (fades only, no loops).
6. **Haptics** (`src/lib/haptics.ts`): one per user action, at the same moment as the visual,
   never the only feedback.
7. Decorative, animated drawings ignore touches (`pointerEvents: 'none'`) so they never block a
   control.

## 3. Stack and commands

- **Monorepo:** pnpm 12 + Turborepo, Node 24, TypeScript 6.0.x.
  - `apps/mobile`: Expo SDK 57, Expo Router, NativeWind 4 (Tailwind 3, theme generated from the
    tokens), i18next. Follow `apps/mobile/AGENTS.md`.
  - `packages/design-tokens`: the single source of design values and the logo geometry.
  - `infra/`: Terraform. Backend (Python 3.12+, Poetry, FastAPI on Lambda) is added under
    `services/` when the first API feature starts (spec §10.2).
- **Commands (repo root):** `pnpm install` · `pnpm typecheck` · `pnpm lint` · `pnpm test` ·
  `pnpm format` · `pnpm check:secrets` · `pnpm brand:export`.
- **Done means:** typecheck, lint, tests and `terraform validate` pass, and UI changes were checked
  visually (rule 2.6). Report failures honestly, with the output.

## 4. Infrastructure rules

- Every AWS resource is created through Terraform in `infra/`. Nothing is clicked in the console or
  created with the CLI (read-only CLI calls are fine).
- Konvami lives **on top of the NextChronicle `nc-dev` account** (`503002144480`, profile `nc-dev`,
  IAM Identity Center sign-in). It reuses that account's state bucket (under the `konvami/` key
  prefix) and GitHub OIDC provider, and never modifies NextChronicle's resources or state.
- Konvami's resources are named `kv-<env>-*`, tagged `Project=konvami`, and live in
  `eu-central-1` (Frankfurt). Never `us-east-1`.
- Reusable pieces go in `infra/modules/`; environments in `infra/envs/<env>/` only wire modules.
- Plan before apply (`terraform plan -out=tfplan`, then `terraform apply tfplan`), and show the
  plan to the user before applying anything.

## 5. Git

- Commit or push only when asked. Branch from `main` for feature work.
- Commit messages and PR bodies never include a `Co-Authored-By` trailer or a "Generated with"
  line.
- Reference the spec section or screen number (for example "1.5 Welcome") in commit messages.

<!-- BEGIN:turborepo-agent-rules -->

# This is NOT the Turborepo you know

Turborepo configuration, task behavior, and CLI commands can vary between installed versions and may differ from your training data. Resolve the `turbo` package from this file's directory or relevant workspace; in monorepos, it may not be visible from the repository root. For example, run `node -p "require.resolve('turbo/package.json')"` from a workspace that depends on `turbo`.

Read `docs/README.md` inside that installed package first, then read the relevant pages from its `docs/` directory before changing Turborepo configuration or commands. Heed deprecation notices. These bundled docs match the installed package version and are available without network access.

This block is written and re-added by `turbo` before repository-scoped commands when an AI agent is detected. In the Turborepo source repository, its template is defined in `crates/turborepo-cli/src/cli/agent_guidance.rs`. Removing the managed block while updates are enabled means a later qualifying invocation will add it again. Set `"agentGuidance": false` in the root `turbo.json` or `turbo.jsonc` to opt out; this does not remove an existing block. Keep the block committed with your work to avoid an uncommitted change on the next agent invocation.
<!-- END:turborepo-agent-rules -->
