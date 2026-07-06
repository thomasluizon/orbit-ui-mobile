# PRD: Marketing Email Consent + Resend Contact Sync

## 1. Executive Summary

Orbit's email infrastructure is fully built (#314, completed 2026-07-03): Resend Pro with a verified marketing domain (`updates.useorbit.org`) intended for product-update broadcasts. But nothing can be sent to actual users: the `User` entity has no marketing-consent field, product users are never synced into any Resend audience (only landing-page waitlist confirmers are), and LGPD — the binding regime for a Brazilian LTDA — requires free, informed, unambiguous, specific consent before promotional email. Consent bundled into ToS acceptance is invalid.

This feature adds the missing plumbing, and only the plumbing: a nullable marketing-consent field on `User`, a one-time in-app consent prompt shown to any user with no recorded decision (covers new and existing users with one surface), an always-available settings toggle, bidirectional sync with a dedicated Resend audience (opt-in → contact upserted; opt-out or email-link unsubscribe → both sides updated, the latter via a Resend webhook), and contact removal on account deletion. Composing and sending broadcasts stays in Resend's dashboard — its Broadcasts product handles the editor, segments, and managed one-click unsubscribe (which satisfies LGPD's ~2-business-day revocation bar automatically). No admin dashboard is built.

MVP goal: the operator can send a product-update email from the Resend dashboard to every consenting user, segmented by locale, with consent state that is honest in both directions. Cost: $0/mo extra until 1,000 contacts (Resend free marketing tier, verified live 2026-07-04).

## 2. Mission

Make it possible to talk to Orbit's users by email — lawfully, honestly, and with zero new send infrastructure.

**Core principles**
1. **Consent is explicit and its own question** — never bundled with ToS, default off, LGPD-valid.
2. **The toggle never lies** — in-app state and Resend suppression state converge from both directions.
3. **Send from Resend, not from code** — Broadcasts owns composition, segmentation, and unsubscribe compliance; Orbit owns only consent + contact sync.
4. **One prompt, everyone** — a single reusable surface serves existing and new users; asked once, never nags.
5. **Parity** — prompt and toggle land identically on web and mobile.

## 3. Target Users

- **Primary: the operator (Thomas)** — needs to announce product updates (and eventually lifecycle emails) to real users from the Resend dashboard; today the audience is empty and there is no lawful basis to fill it.
- **Secondary: the Orbit user** — consumer-grade; needs a clear, dismissible ask ("Want product updates by email?"), a settings toggle that reflects reality, and an unsubscribe link that actually works from the email itself.

## 4. Scope

### In Scope

**Backend (orbit-api)**
- [ ] `User.MarketingEmailConsent` (nullable bool; `null` = never asked, `false` = declined/opted out, `true` = consented) + `MarketingConsentUpdatedAtUtc` — EF migration in `src/Orbit.Infrastructure/Migrations/`
- [ ] `PUT /api/profile/marketing-consent` — records the decision; on `true` upserts the contact into the product-users Resend audience (locale + plan as contact properties); on `false` marks the Resend contact `unsubscribed`
- [ ] Consent state surfaced on the existing profile response (additive field)
- [ ] Resend webhook endpoint (`[AllowAnonymous]`, Svix signature-verified): on contact-unsubscribed events from the product audience, set the matching user's consent to `false` (sync-back)
- [ ] `IMarketingContactsService` extended beyond the waitlist single-audience scope: upsert / set-unsubscribed / delete against a configurable product-users audience
- [ ] Account deletion flow also deletes the Resend contact (LGPD erasure)

**Frontend (apps/web + apps/mobile — parity)**
- [ ] One-time consent prompt (dismissible card/modal per DESIGN.md canon) shown when profile consent is `null`; "Yes" → consent true; "No thanks" → consent false; either way the prompt never returns. For fresh installs it appears after onboarding completes, not during it
- [ ] Settings toggle "Product updates by email" bound to the consent field (optimistic update, existing settings patterns)

**Shared (packages/shared)**
- [ ] Zod schema updates (profile field + consent request), endpoint constant, i18n keys in `en.json` AND `pt-BR.json`

**Ops (no code)**
- [ ] Create the product-users audience in Resend; configure the webhook (endpoint URL + signing secret env var); broadcast template footer carries the LTDA postal address

### Out of Scope

- [ ] **Admin dashboard / in-app broadcast composer** — Resend's dashboard is the send UI; a custom admin panel is deferred until the repetition/risk trigger fires (research decision this session)
- [ ] **Sending any email from Orbit code for marketing** — Resend only auto-honors unsubscribes for Broadcasts; hand-rolled fan-out via `emails.send` would reimplement suppression/compliance. Transactional email untouched
- [ ] **Backfilling existing users into the audience without consent** — unlawful under LGPD; the prompt is the backfill mechanism
- [ ] **Email content/templates/lifecycle campaigns** — operational work in the Resend dashboard, not product scope
- [ ] **Waitlist stream changes** — the existing waitlist audience/flow stays as-is

### Repo Touch Matrix

| Capability | Frontend | Backend | Shared |
|------------|----------|---------|--------|
| Consent field + migration | no | yes | yes (profile schema) |
| Consent endpoint + Resend upsert | yes (caller) | yes | yes |
| Webhook sync-back | no | yes | no |
| One-time prompt | yes | no | yes (i18n) |
| Settings toggle | yes | no | yes (i18n) |
| Deletion cleanup | no | yes | no |

## 5. User Stories

1. **As the operator**, I want every consenting user in a Resend audience with locale properties, so that I can send a pt-BR and an en product update from the dashboard without touching code. — `backend`
2. **As an existing user**, I want to be asked once whether I'd like product updates by email, so that I can opt in without hunting through settings. *(Example: next app open after release shows the prompt; answering either way dismisses it forever.)* — `both`
3. **As a new user**, I want the same ask shortly after I finish onboarding, so that signup itself stays friction-free. — `both`
4. **As any user**, I want a settings toggle for product-update emails, so that I can change my mind anytime. *(Example: Settings → toggle off → no more broadcasts.)* — `both`
5. **As a user who unsubscribes via the email link**, I want my in-app toggle to show "off" afterwards, so that the app never misrepresents my consent. *(Webhook sync-back.)* — `backend`
6. **As a user who deletes my account**, I want my email removed from the marketing audience, so that a deleted account never receives another email. — `backend`
7. **As the operator**, I want declined users recorded as `false` (not `null`), so that the prompt never re-nags and consent decisions are auditable via the timestamp. — `backend`

## 6. Architecture & Patterns

*Research note: deep-research already ran this session (Resend pricing/features, LGPD floor, build-vs-buy) — findings folded in; no new research needed.*

**High-level**: consent is a profile attribute owned by the .NET API; Resend is a synced downstream (and, via webhook, an upstream for unsubscribe events). The Resend contact's `unsubscribed` flag is what Broadcasts enforces at send time, so both directions must converge on it.

**Backend (CQRS)**
- `UpdateMarketingConsentCommand` + validator + handler: sets field + timestamp, then syncs Resend (upsert with `unsubscribed:false` on consent; set `unsubscribed:true` on withdrawal). Resend call failures must not lose the local decision — persist first, sync after (retry/log on failure; a periodic reconcile is out of scope at this volume).
- Webhook controller: verifies Svix signature (Resend's webhook signing), filters to the product audience, maps contact email → user, sets consent `false`. Idempotent by construction (setting `false` twice is a no-op).
- `ResendContactsService`: audience id becomes a parameter/config — waitlist audience (existing) + product-users audience (new setting).
- Account deletion handler: add contact deletion alongside existing cleanup.

**Frontend**
- Prompt: shown from the global overlay host (mobile `_layout.tsx` GlobalOverlays / web app layout) when `profile.marketingEmailConsent === null` and onboarding is complete; answering calls the consent endpoint via TanStack mutation with optimistic profile-cache update.
- Settings: one new row in the existing settings/preferences screen on both platforms, same mutation.

**Shared**
- Profile schema gains `marketingEmailConsent: z.boolean().nullable()` (additive — old mobile clients simply ignore it; append-only rule respected).
- `API.profile.marketingConsent` endpoint constant; i18n keys for prompt + toggle copy.

## 7. API Contract

**`PUT /api/profile/marketing-consent`** — `[Authorize]` (JWT bearer / BFF cookie)
```jsonc
// request
{ "consent": true }
// response 200
{ "marketingEmailConsent": true }
```

**Profile response (additive)**: `marketingEmailConsent: boolean | null`.

**`POST /api/webhooks/resend`** — `[AllowAnonymous]`, Svix-signature-verified (secret via env). Consumes Resend contact events; acts only on unsubscribe-state changes for the product audience; returns 2xx fast. (Exact event names/payloads verified against live Resend docs at implementation time per standing rule.)

## 8. UI/UX

**Prompt (both platforms)**: dismissible card/sheet — title ("Get product updates?"), one line of value copy, Yes / No thanks. Shown once (`null` state only), never during onboarding. DESIGN.md canon: translucent card on dark / white on light, pill CTA, violet accent, semantic tokens only.
**Settings (both platforms)**: "Product updates by email" toggle row in the existing notifications/preferences section.
**i18n**: prompt title/body/CTAs + settings label in `en.json` AND `pt-BR.json`, same edit. Brand words literal.

## 9. Data Model

- `Users` migration: `MarketingEmailConsent` (bool, nullable, default null) + `MarketingConsentUpdatedAtUtc` (timestamptz, nullable). Domain methods on `User` (e.g. `SetMarketingConsent(bool)`), consistent with existing entity style.
- No new tables. No new query keys (profile key reused).

## 10. Security & Configuration

- Webhook: Svix signature verification with `Resend__WebhookSecret` (new Render env var); reject unsigned/invalid; no user-controlled data trusted.
- New config: `Resend__ProductAudienceId` (Render env var).
- Validation: FluentValidation on the command (bool, authenticated user); Zod on the shared request schema.
- LGPD posture: default-off, explicit yes, timestamped decisions, erasure on delete, sub-2-day revocation honored (Resend-managed unsubscribe is immediate; webhook keeps the app truthful).
- Broadcast compliance (ops): one-click unsubscribe is Resend-managed; LTDA postal address goes in the broadcast template footer.

## 11. Success Criteria

**MVP success**: operator sends a test broadcast from the Resend dashboard to the product audience; only consenting users receive it; a user who unsubscribes via the email link shows toggle-off in the app afterwards.

**Functional**
- [ ] Consent prompt appears exactly once per undecided user, on both platforms, never during onboarding
- [ ] Toggle reflects and updates consent on both platforms
- [ ] Opt-in creates/updates the Resend contact with locale property; opt-out sets `unsubscribed:true`
- [ ] Email-link unsubscribe flips the app toggle off via webhook
- [ ] Account deletion removes the Resend contact
- [ ] Old app versions unaffected (additive profile field, additive endpoints)

**Quality**
- [ ] Unit tests: consent command handler (incl. Resend-failure-doesn't-lose-decision), webhook handler (signature, idempotency, unknown-email), prompt visibility logic + toggle mutation on both apps
- [ ] Webhook signature verification covered by tests

## 12. Implementation Phases

**Phase 1 — Backend consent + sync (deploy first)**
- [ ] Migration + `User` domain methods
- [ ] `UpdateMarketingConsentCommand` + endpoint + profile field
- [ ] `ResendContactsService` multi-audience extension + upsert/unsubscribe/delete
- [ ] Deletion-flow cleanup
Validation: API tests green; endpoint live; old clients unaffected.

**Phase 2 — Webhook sync-back**
- [ ] Webhook endpoint + Svix verification + event handling (verify event shapes against live Resend docs)
- [ ] Render env vars (`Resend__WebhookSecret`, `Resend__ProductAudienceId`); webhook registered in Resend dashboard
Validation: signed test event flips consent; unsigned rejected.

**Phase 3 — Frontend prompt + toggle (both platforms, one phase)**
- [ ] Shared schema/endpoint/i18n
- [ ] One-time prompt in both apps' overlay hosts
- [ ] Settings toggle in both apps
Validation: unit tests green both apps; parity check; manual walkthrough of prompt-once behavior.

**Phase 4 — Ops cutover**
- [ ] Create product audience in Resend; footer address in template; send test broadcast end-to-end
Validation: MVP success criteria pass.

## 13. Risks & Mitigations

1. **Consent recorded but Resend sync fails** → user opted in but gets no emails. *Mitigation*: persist-first + logged retry; volume is tiny, drift is visible in the Resend dashboard.
2. **Webhook payload/event names assumed wrong** → sync-back silently dead. *Mitigation*: verify against live Resend docs at implementation; integration-style unit test with a captured real payload; Sentry alert on signature/processing failures.
3. **Prompt fatigue / dark-pattern perception** → *Mitigation*: shown once ever, both answers persist, plain copy, no re-ask campaigns.
4. **Contact-count creep past free tier** → surprise $40/mo. *Mitigation*: known cliff at 1,000 contacts (verified live); the operator watches the audience size; Brevo remains the documented off-ramp if contacts balloon while volume stays low.
5. **Mobile release lag (Play review) leaves web/mobile prompt out of sync** → acceptable: consent is per-user server state; whichever platform asks first wins and the other never re-asks.

## 14. Open Questions

- None blocking. (Verify at implementation time, not decision time: exact Resend webhook event names/payload shape and contact-upsert-by-email semantics — flagged per the never-answer-from-memory rule.)
