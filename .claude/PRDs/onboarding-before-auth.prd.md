# PRD: Onboarding Before Auth

## 1. Executive Summary

Orbit currently shows a login/signup wall on first launch; onboarding only starts after authentication. Deep research (2026-07-04, this session) shows this is the minority anti-pattern: forced account creation is a quantified conversion killer (Baymard: 19% cite it as an abandonment reason; NN/g: "login walls stop users in their tracks"), while the canonical counter-experiment — Duolingo moving signup back a few steps — produced ~+20% DAU (First Round Review, verified live). Every comparable subscription habit/wellness funnel (Fabulous, Habitify, Productive, Me+, Finch, Noom, Flo, Calm) runs personalization before any account step; the only login-first holdouts (Habitica, Headspace) do so for reasons Orbit doesn't share.

This feature flips Orbit's first-run flow on BOTH platforms: onboarding runs pre-auth, accumulating the user's choices (template packs, first habit, first log, goal) in local state; the final step is signup framed as "save your plan" — the account becomes the mechanism for keeping what the user just built, riding the endowed-progress effect (~1.8× completion for pre-invested users, Nunes & Drèze 2006). Immediately after auth succeeds, the client flushes the accumulated answers to a new idempotent API endpoint in one transactional call.

MVP goal: a fresh install reaches the "aha" (a habit created and logged) before ever seeing an auth screen, with zero data loss at the auth boundary and zero changes to the auth/trial model itself.

## 2. Mission

Let new users experience Orbit's value before asking for anything.

**Core principles**
1. **Value before identity** — the wall comes after the user has built something, never before.
2. **Never lose their work** — everything built pre-auth survives process death and auth (local persistence + transactional flush).
3. **No new identity machinery** — no anonymous/guest server accounts; the .NET JWT model is untouched.
4. **Parity is the feature** — web and mobile ship the identical reordered flow off the shared step machine.
5. **Reversible** — the server flag, existing endpoints, and post-auth overlay all remain; rollback is a frontend revert.

## 3. Target Users

- **Primary: the fresh install** — someone who found Orbit on Google Play (or the web app) and gives it one session to prove itself. Low patience, no commitment; 21% of users open an app exactly once (Localytics via Appcues). Needs to feel the product before trading an email for it.
- **Secondary: the returning user** — already has an account (possibly on another device). Needs a visible "I already have an account" escape on the very first screen so onboarding never blocks them.
- **Tertiary: the existing incomplete user** — authenticated but `HasCompletedOnboarding=false`. Keeps today's post-auth overlay experience unchanged.

Technical comfort: consumer-grade; assume nothing.

## 4. Scope

### In Scope

**Frontend (apps/mobile)**
- [ ] Restructure first-run routing into three mutually exclusive groups — `(onboarding)` → `(auth)` → app — using `Stack.Protected` guards (SDK 53+ idiom, current on SDK 56)
- [ ] Onboarding runs pre-auth; step data accumulates in a local onboarding store, mirrored to AsyncStorage after each step (survives process death)
- [ ] "I already have an account" link on the first onboarding screen → straight to login, skipping onboarding
- [ ] Final onboarding step = auth, framed as "save your plan" (shows the habits the user built; CTA doubles as signup); reuses the existing login flow (magic code + Google) as an embedded step
- [ ] Post-signup flush of accumulated answers to the new apply endpoint, retry-safe; local answers cleared only on server success
- [ ] Splash screen held (`expo-splash-screen`) until AsyncStorage onboarding flag + auth state both resolve (no guard flicker)
- [ ] Post-auth overlay retained for authenticated users with `HasCompletedOnboarding=false` (today's behavior, same components, direct API calls)

**Frontend (apps/web)**
- [ ] Same reordered flow: onboarding as a public (unauthenticated) route; `proxy.ts` carve-out so it isn't redirected to `/login`
- [ ] Local state via the same shared step machine, persisted to `localStorage`
- [ ] Same "save your plan" auth step, same conditional flush, same retained post-auth overlay

**Shared (packages/shared)**
- [ ] Step machine (`utils/onboarding.ts`) extended: steps produce local-state actions instead of assuming authenticated hooks; auth step added as the terminal step
- [ ] Zod schema + endpoint constant for the apply payload
- [ ] i18n keys for the new auth-step copy in `en.json` AND `pt-BR.json`

**Backend (orbit-api)**
- [ ] New additive endpoint `POST /api/profile/onboarding/apply`: accepts the full onboarding payload (habits, optional first log, optional goal), applies it in ONE transaction, and sets `HasCompletedOnboarding=true` in the same transaction
- [ ] Idempotency: if `HasCompletedOnboarding` is already true, the endpoint no-ops with success (the flag is the applied-marker; the transaction guarantees all-or-nothing, so retries are safe)
- [ ] Existing endpoints (`POST /api/habits`, log, goals, `PUT /api/profile/onboarding`) untouched — old clients keep working (append-only compat)

### Out of Scope

- [ ] **Anonymous/guest server accounts** — pre-auth actions don't need the server; a second identity system beside the .NET JWT is pure overhead (research: anonymous accounts only warranted when pre-auth state must persist server-side/cross-device)
- [ ] **Full guest mode** (Duolingo's "Later" soft wall / Habitify's Guest tier) — the whole app running accountless is a large offline-first investment; separate future decision
- [ ] **Onboarding content redesign** — steps keep today's content; only ordering and persistence mechanics change
- [ ] **Paywall changes** — no paywall exists in onboarding today; none added
- [ ] **Marketing-consent capture at signup** — handled by the separate marketing-email-consent PRD

### Repo Touch Matrix

| Capability | Frontend | Backend | Shared |
|------------|----------|---------|--------|
| Route restructure (pre-auth onboarding) | yes | no | no |
| Local onboarding state + persistence | yes | no | yes |
| Auth-as-final-step UI | yes | no | yes (i18n) |
| Apply endpoint + transactional flush | yes (caller) | yes | yes (schema/endpoint) |
| Post-auth overlay retention | yes | no | no |

## 5. User Stories

1. **As a fresh install**, I want to set up my habits before creating an account, so that I see what Orbit does for me before deciding to commit. *(Example: pick the "Morning routine" pack, tweak it, log my first habit — all before any email prompt.)* — `both`
2. **As a fresh install finishing onboarding**, I want the signup screen to show the plan I just built and save it to my new account, so that signing up feels like keeping my work, not paying a toll. *(Example: "Save your plan — 3 habits ready to go" above the email field.)* — `both`
3. **As a returning user**, I want an "I already have an account" link on the very first screen, so that I can log straight in without touring onboarding. *(Example: reinstalled the app on a new phone.)* — `both`
4. **As a user whose app was killed mid-onboarding**, I want my answers still there when I reopen, so that I don't repeat steps. *(Example: Android kills the process at step 3; relaunch resumes at step 3 with my habit intact.)* — `frontend`
5. **As a user who picks "Log in" at the final step and has an existing fully-onboarded account**, I want my old data untouched, so that a re-run of onboarding never clobbers my real habits. *(Conditional flush: discard local answers silently.)* — `both`
6. **As a user who picks "Log in" and has an account that never completed onboarding**, I want my new answers applied, so that my setup work isn't wasted. *(Conditional flush: apply as normal.)* — `both`
7. **As an existing authenticated user who never finished onboarding**, I want the onboarding overlay to appear after login exactly as today, so that nothing changes for me. — `both`
8. **As a user on a flaky connection**, I want the post-signup save to retry safely, so that a timeout never duplicates my habits or loses my plan. *(5–10% of mobile requests fail — Android Vitals via research.)* — `both`

## 6. Architecture & Patterns

**High-level approach**: local-first onboarding + one transactional post-auth flush. No server identity before signup; a client-side anonymous analytics id (if/when product analytics lands) covers funnel stitching.

**Frontend (mobile)**
- Root `_layout.tsx`: replace the redirect-based `AuthGuard` gating for first-run with three `Stack.Protected` groups keyed on `(hasCompletedLocalOnboarding, isAuthenticated)`; guards mutually exclusive; splash held until both resolve.
- New `onboarding-store` (Zustand, mirrors existing store patterns): step index + accumulated payload; AsyncStorage persistence per step write.
- Step components (`components/onboarding/*`) switch from authed mutation hooks to store actions when running pre-auth; the same components keep calling the authed hooks when rendered in the post-auth overlay (mode via prop/context from the host).
- "Meet Astra" step's import action pre-auth: queue the chat draft locally (AsyncStorage draft already exists as a mechanism) and continue onboarding; no mid-flow route to `/chat` (auth required there).
- Pro-gated goal step (step 4): shown pre-auth for fresh installs — every new signup receives the 7-day trial (`User.Create`), so the goal will be creatable at flush time.
- Flush: after `login()` succeeds inside the auth step, fetch profile → if `hasCompletedOnboarding` false → `POST onboarding/apply` (offline-queued like the existing `performQueuedApiMutation` path) → on 2xx clear local store → enter app. If true → clear local store, enter app.

**Frontend (web)**
- `proxy.ts`: add the onboarding route to the public whitelist.
- Onboarding page as a public route (mirrors mobile's `(onboarding)` group); step machine + store shared; `localStorage` persistence.
- Same conditional flush inside the login flow.

**Backend (CQRS)**
- `ApplyOnboardingCommand` + validator + handler: creates habits (reusing existing habit-creation domain logic), optional first log, optional goal, sets `HasCompletedOnboarding` — all inside one transaction. Guard clause: `if (user.HasCompletedOnboarding) return success (no-op)`.
- Controller action on `ProfileController` (`[Authorize]`).
- No migration: `HasCompletedOnboarding` already exists and serves as the idempotency marker.

**Shared**
- `utils/onboarding.ts`: step order gains the terminal auth step; `getOnboardingNextStep` handles the pre-auth path (goal step included for fresh installs).
- `types/`: `ApplyOnboardingRequestSchema` (habits: array of {title, frequency/schedule fields, source pack id?}, firstLog?: {habitIndex, date}, goal?: {…}).
- `api/endpoints.ts`: `API.profile.onboardingApply`.

## 7. API Contract

**Endpoint**: `POST /api/profile/onboarding/apply` (add to `packages/shared/src/api/endpoints.ts`)
**Auth**: JWT bearer (mobile) / httpOnly cookie via BFF (web) — standard `[Authorize]`.

Request (Zod in `packages/shared/src/types/`):
```jsonc
{
  "habits": [
    { "title": "Drink water", "frequency": { /* existing habit frequency shape */ }, "templateId": "hydration-1" }
  ],
  "firstLog": { "habitIndex": 0, "date": "2026-07-04" },   // optional
  "goal": { "title": "Read 12 books", "target": 12, "unit": "books" } // optional, applied only if user has Pro access
}
```

Response `200`:
```jsonc
{ "applied": true }      // or { "applied": false } when no-op (already onboarded)
```

Semantics: all-or-nothing transaction; safe to retry; `applied:false` is success. Field shapes reuse the existing habit/goal creation schemas — no invented fields.

## 8. UI/UX

**Web flow**: unauthenticated visit → onboarding route (public) → steps → final "save your plan" auth step (embeds existing login UI) → app. `/login` remains directly reachable (link on first onboarding screen + all existing deep links).
**Mobile flow**: `(onboarding)` group → `(auth)` group (final step host) → app tabs. Existing `/login` route preserved for the "already have an account" path and sign-out.
**i18n**: new keys for the auth-step framing ("Save your plan", habit-count summary line, "I already have an account") in `en.json` AND `pt-BR.json` in the same edit. Brand words stay literal.
**Design**: DESIGN.md canon applies (navy-violet orbital, gradient headers, pill CTAs); the auth step is a restyled host of the existing login components, not a new design surface. 412px shell on both platforms.

## 9. Data Model

- **No new entities, no migration.** `HasCompletedOnboarding` (existing `Users` column) doubles as the idempotency marker for apply.
- New TanStack keys: none required (profile invalidation reuses existing profile key after flush).
- Local: onboarding store persisted under a versioned AsyncStorage/localStorage key (schema-versioned so a future step change can discard stale drafts safely).

## 10. Security & Configuration

- Auth model untouched: magic-code/Google → .NET JWT; SecureStore (mobile) / httpOnly cookie (web).
- The apply endpoint is `[Authorize]` — nothing pre-auth ever writes to the API.
- Validation: FluentValidation on `ApplyOnboardingCommand` (habit count caps mirror `FreeMaxHabits` config; title lengths reuse habit validator rules) + the shared Zod schema client-side.
- No new env vars.
- Play Console note: keep demo credentials current in App access regardless (reviewer-access requirement applies while any account gate exists).

## 11. Success Criteria

**MVP success**: a fresh install can complete onboarding, sign up on the final step, and land in the app with their habits/log/goal present — with the API deployed first and old app versions unaffected.

**Functional**
- [ ] Fresh install sees onboarding with zero auth prompts before the final step
- [ ] Process death at any step resumes at that step with data intact
- [ ] Signup flush creates exactly the built habits/log/goal — once, even under retries
- [ ] "Already have an account" on first screen skips onboarding entirely
- [ ] Conditional flush: onboarded account → silent discard; un-onboarded account → apply
- [ ] Existing authed incomplete users still get the post-auth overlay
- [ ] Old client versions (login-first) keep working against the deployed API

**Quality**
- [ ] Unit tests: step machine transitions (shared), onboarding store persistence/flush logic (both apps), `ApplyOnboardingCommand` handler incl. no-op + transactional rollback (API)
- [ ] No guard flicker on cold start (splash gate verified on device)

## 12. Implementation Phases

**Phase 1 — Backend apply endpoint (deploy first)**
Goal: the additive endpoint live in prod before any client depends on it.
- [ ] `ApplyOnboardingCommand` + validator + handler (transactional, no-op guard)
- [ ] Controller action + shared Zod schema + endpoint constant
- [ ] Handler unit tests (apply, no-op, partial-failure rollback, free-tier habit cap)
Validation: endpoint deployed; existing clients unaffected.

**Phase 2 — Shared step machine + local store**
Goal: onboarding logic runs off local state.
- [ ] Extend `utils/onboarding.ts` (terminal auth step, pre-auth path)
- [ ] Onboarding store with persistence (mobile AsyncStorage / web localStorage), versioned key
- [ ] i18n keys (en + pt-BR)
Validation: shared tests green; store round-trips persistence.

**Phase 3 — Mobile flow**
Goal: reordered first-run on Android.
- [ ] `Stack.Protected` route groups + splash gate
- [ ] Step components in pre-auth mode; Astra-draft queue behavior
- [ ] Auth-as-final-step host embedding existing login flow; conditional flush
- [ ] Post-auth overlay retained for incomplete existing users
Validation: fresh-install walkthrough on emulator (incl. process-death resume); mobile unit tests green.

**Phase 4 — Web flow (parity)**
Goal: identical flow on web.
- [ ] `proxy.ts` carve-out + public onboarding route
- [ ] Same pre-auth mode, flush, overlay retention
Validation: web walkthrough; web unit tests green; parity check across both apps.

## 13. Risks & Mitigations

1. **Flush fails after signup (flaky network)** → user is authed but plan missing. *Mitigation*: transactional endpoint + retry via the existing offline-queue mechanism; local answers cleared only on 2xx; on next launch, un-flushed answers + `hasCompletedOnboarding=false` re-trigger the flush.
2. **Duplicate habits under retry** → *Mitigation*: single transaction + `HasCompletedOnboarding` no-op guard makes retries idempotent by construction.
3. **Guard flicker / wrong-group flash on cold start** → *Mitigation*: hold splash until AsyncStorage flag + auth state resolve; guards mutually exclusive.
4. **Existing-user clobbering via re-run onboarding** → *Mitigation*: conditional flush (no-op when account already onboarded) — decided this session.
5. **Regression for old app versions** → *Mitigation*: strictly additive contract; API deploys before clients; all existing endpoints/flows retained.

## 14. Open Questions

- None blocking. (Deferred by decision, not open: guest mode / soft "Later" wall — future initiative; Google Credential Manager surface details — verify live at implementation time per standing rule.)
