# Stories: marketing-email-consent

Source PRD: `.claude/PRDs/marketing-email-consent.prd.md`
Bundling: single issue by explicit instruction (one combined PR per repo per the minimum-PRs convention).

| # | Title | Repos | Type | Priority | Complexity | Depends on |
|---|-------|-------|------|----------|------------|------------|
| 1 | Marketing email consent + Resend audience sync (enable product-update broadcasts) | both | feature | high | medium | none |

---

## Marketing email consent + Resend audience sync (enable product-update broadcasts)

**Type**: feature
**Repos**: both
**Priority**: high
**Complexity**: medium
**Phase**: PRD phases 1–4 (backend consent + sync → webhook sync-back → frontend prompt + toggle → ops cutover)
**Parity required**: yes

### User Story

As the operator, I want users to grant explicit marketing-email consent in-app and be synced into a Resend audience, so that I can send product-update broadcasts from the Resend dashboard — lawfully (LGPD), segmented by locale, with consent state honest in both directions.

### Acceptance Criteria

- [ ] Given a user with no recorded consent decision (`marketingEmailConsent === null`) who has completed onboarding, when they open the app, then a one-time consent prompt appears on BOTH `apps/web` and `apps/mobile`; answering Yes or No persists the decision (`true`/`false` + timestamp) and the prompt never shows again
- [ ] Given any user, when they visit settings, then a "Product updates by email" toggle reflects and updates their consent on both platforms
- [ ] Given a user opting in, when consent is saved, then the user is upserted as a contact in the product-users Resend audience with locale (and plan) properties; opting out sets the contact `unsubscribed:true`
- [ ] Given a user who unsubscribes via a broadcast's email link, when Resend delivers the webhook event, then the user's consent flips to `false` in the API (Svix signature verified; unsigned/invalid requests rejected)
- [ ] Given a user who deletes their account, when deletion completes, then their contact is removed from the Resend audience
- [ ] Given an old app version, when it fetches the profile, then nothing breaks (consent field and endpoints are strictly additive)
- [ ] Given the ops cutover, when a test broadcast is sent from the Resend dashboard to the product audience, then only consenting users receive it (MVP success)

### Technical Notes

- **Backend first (orbit-api)**: EF migration in `src/Orbit.Infrastructure/Migrations/` — `Users.MarketingEmailConsent` (nullable bool) + `MarketingConsentUpdatedAtUtc`; domain method `User.SetMarketingConsent(bool)`. `UpdateMarketingConsentCommand` + validator + handler (persist first, Resend sync after — a Resend failure must not lose the local decision). `PUT /api/profile/marketing-consent`; consent surfaced on the profile response (additive). Extend `ResendContactsService`/`IMarketingContactsService` beyond the waitlist single-audience scope: upsert / set-unsubscribed / delete against `Resend__ProductAudienceId`. Account-deletion flow deletes the contact. Webhook `POST /api/webhooks/resend` (`[AllowAnonymous]`, Svix signature via `Resend__WebhookSecret`), idempotent, filters to the product audience — verify exact Resend event names/payload shapes against LIVE docs at implementation time.
- **Shared**: profile Zod schema gains `marketingEmailConsent: boolean | null`; consent request schema; `API.profile.marketingConsent` in `api/endpoints.ts`; i18n keys (prompt title/body/CTAs, settings label) in `en.json` AND `pt-BR.json` same edit.
- **Frontend (both platforms)**: one-time prompt from the global overlay hosts (mobile `apps/mobile/app/_layout.tsx` GlobalOverlays; web `apps/web/app/(app)/layout.tsx`), shown only when consent is `null` and onboarding complete, never during onboarding; DESIGN.md canon (semantic tokens, pill CTA). Settings toggle row in the existing preferences section, TanStack mutation with optimistic profile-cache update.
- **Ops (no code, same task)**: create the product-users audience in Resend; register the webhook + secret; set Render env vars (`Resend__ProductAudienceId`, `Resend__WebhookSecret`); LTDA postal address in the broadcast template footer; end-to-end test broadcast.
- **Out of scope** (explicit): admin dashboard / in-app composer; any marketing send from Orbit code (Broadcasts only — unsubscribe suppression is Broadcasts-only); backfilling users without consent; waitlist stream changes.
- Validation: lint, type-check, unit tests — consent handler (incl. Resend-failure path), webhook (signature, idempotency, unknown email), prompt visibility + toggle on both apps.
- Order: orbit-api PR first (deploy before clients), then one combined orbit-ui-mobile PR — paired PRs cross-linked.
- PRD sections: §6 architecture, §7 contract, §10 security/config, §12 phases.

### Dependencies

- Blocked by: none
- Blocks: none (prompt timing interacts with the onboarding-before-auth issue — whichever lands second respects "never during onboarding")
