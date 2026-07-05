# Stories: onboarding-before-auth

Source PRD: `.claude/PRDs/onboarding-before-auth.prd.md`
Bundling: single issue by explicit instruction (one combined PR per repo per the minimum-PRs convention).

| # | Title | Repos | Type | Priority | Complexity | Depends on |
|---|-------|-------|------|----------|------------|------------|
| 1 | Onboarding before auth: pre-auth flow with signup as the final "save your plan" step | both | feature | high | large | none |

---

## Onboarding before auth: pre-auth flow with signup as the final "save your plan" step

**Type**: feature
**Repos**: both
**Priority**: high
**Complexity**: large
**Phase**: PRD phases 1–4 (API apply endpoint → shared step machine/store → mobile flow → web flow)
**Parity required**: yes

### User Story

As a fresh install, I want to set up my habits before creating an account — and have signup save the plan I just built — so that I experience Orbit's value before being asked for anything, and nothing I built is lost at the auth step.

### Acceptance Criteria

- [ ] Given a fresh install (no token, no local onboarding flag), when the app opens, then onboarding starts with zero auth prompts before the final step, on BOTH `apps/mobile` and `apps/web`
- [ ] Given the first onboarding screen, when the user taps "I already have an account", then they go straight to login and onboarding is skipped
- [ ] Given a user mid-onboarding, when the process is killed and the app reopens, then the flow resumes at the same step with all answers intact (AsyncStorage on mobile, localStorage on web, versioned key)
- [ ] Given the final step, when the user signs up (magic code or Google), then the accumulated answers (habits, optional first log, optional goal) are applied via one call to the new `POST /api/profile/onboarding/apply` — exactly once, even under retries/timeouts (transactional; `HasCompletedOnboarding` is the no-op guard)
- [ ] Given the final step, when the user logs into an EXISTING account, then: account already onboarded → local answers discarded silently; account never onboarded → answers applied as normal (conditional flush)
- [ ] Given an existing authenticated user with `hasCompletedOnboarding=false`, when they log in, then the post-auth onboarding overlay renders exactly as today (same components, direct API calls)
- [ ] Given an old app version (login-first), when it talks to the deployed API, then nothing breaks (endpoint is additive; all existing endpoints untouched; API deploys before clients)
- [ ] Given a cold start, when guards resolve, then no wrong-screen flash occurs (splash held until local flag + auth state resolve)

### Technical Notes

- **Backend first (orbit-api)**: `ApplyOnboardingCommand` + validator + handler — creates habits/log/goal in ONE transaction, sets `HasCompletedOnboarding` in the same transaction, no-ops with success if already true. No migration needed. Controller action on `ProfileController`. Free-tier habit cap respected (mirrors `FreeMaxHabits`).
- **Shared**: extend `packages/shared/src/utils/onboarding.ts` (terminal auth step, pre-auth path incl. goal step for fresh installs — new signups always have trial Pro); `ApplyOnboardingRequestSchema` in `types/` (reuse existing habit/goal field shapes — no invented fields); `API.profile.onboardingApply` in `api/endpoints.ts`; i18n keys ("Save your plan" framing, account link) in `en.json` AND `pt-BR.json`.
- **Mobile**: `apps/mobile/app/_layout.tsx` — three mutually exclusive `Stack.Protected` groups `(onboarding)` → `(auth)` → app, keyed on local-onboarding flag + `isAuthenticated`; hold splash via `expo-splash-screen` until both resolve. New persisted onboarding store (Zustand + AsyncStorage). Step components (`components/onboarding/*`) gain a pre-auth mode (store actions) while keeping authed-hook mode for the retained post-auth overlay. Meet-Astra import queues the chat draft locally (no mid-flow `/chat` route). Final step embeds the existing login flow (`login.tsx` machinery) with plan-summary framing; flush via the offline-queued mutation path; clear local store only on 2xx.
- **Web**: `apps/web/proxy.ts` public carve-out for the onboarding route; public onboarding page mirroring mobile; same store (localStorage), same conditional flush inside the login flow; post-auth overlay retention in `app/(app)/layout.tsx` unchanged for existing incomplete users.
- **Out of scope** (explicit): anonymous/guest server accounts, full guest mode ("Later" soft wall), onboarding content redesign, marketing-consent capture (separate issue).
- Validation: lint, type-check, unit tests in shared + both apps + API (handler: apply / no-op / rollback / cap); manual fresh-install walkthrough incl. process-death resume.
- Order: orbit-api PR first (deploy before clients), then one combined orbit-ui-mobile PR — paired PRs cross-linked.
- PRD sections: §6 architecture, §7 contract, §12 phases, §13 risks.

### Dependencies

- Blocked by: none
- Blocks: none
