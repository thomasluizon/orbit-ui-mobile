# Plan: #379 — Production launch umbrella (Play listing overhaul · super-QA matrix · launch checklist)

## Summary

Execute the full #379 launch umbrella across four repos as a three-track orchestration, driving everything Claude-can-drive this session and packaging every human-only step (Play Console, real billing, final screenshot sign-off) as a precise, verification-checked runbook. **Track A** refreshes the *existing* Play listing copy + framing assets (thomas-brain) and reconciles the landing page (orbit-landing-page) against the current `FEATURES.md`. **Track B** builds the committed, re-runnable super-QA matrix (`.claude/reports/launch-qa-matrix.md`), browser-drives the **web** half against a seeded local stack, and turns each failure into its own GitHub fix-issue with fixes landing in bundled PRs by area. **Track C** produces fire-ready launch-ops drafts (Play Data Safety answers, content-rating answers, pre-reg announcement copy, post-launch watch checklist) — everything short of the flip itself, which stays gated on #243 + the remaining open issues.

## User Story

As the solo founder preparing Orbit's Play production launch,
I want the store listing, an exhaustive QA pass, and all launch-ops artifacts prepared and verified,
So that flipping production ON is a mechanical, low-risk step once the final gate (#243 + remaining issues) clears.

## Metadata

| Field | Value |
|---|---|
| Type | NEW_CAPABILITY (launch orchestration) |
| Complexity | HIGH |
| Repos | both (+ thomas-brain, orbit-landing-page) |
| Parity Required | yes (QA matrix asserts web/mobile parity; fixes land both platforms) |
| GitHub Issue | #379 |
| Web Affected | yes |
| Mobile Affected | yes (manual QA + parity fixes) |

## Locked decisions (from grilling)

1. **Execution model** — drive everything drivable; each human-only step becomes a verification-checked runbook. You execute, paste results, I verify.
2. **Environment** — web QA against a **local dev stack** (docker Postgres + orbit-api@origin/main + web dev), tiers seeded directly via the `postgres-local` MCP.
3. **Blocker scope** — all of #379 A/B/C to the drivable limit; **#161 / #387 / #402 / #395 / #243 tracked separately**, launch flip stays gated on them. #243 runs dead-last per the agreed sequence (it needs #379's fix-issues to have landed first — frozen baseline).
4. **Matrix axes** — full **feature × applicable tier × both platforms**; pt-BR only where `FEATURES.md` flags locale.
5. **Fix policy** — **issue per distinct failure** (matrix stays honest/re-runnable) + **fixes in bundled PRs by area** (not one PR per bug).
6. **Repo scope** — real paired PRs to **thomas-brain** (copy + assets) and **orbit-landing-page** (#29 consistency); matrix report + fix-PRs in **orbit-ui-mobile**/**orbit-api**.
7. **Part C boundary** — fire-ready drafts + runbook only; **we cannot flip today** (gate unmet). API sourced from **origin/main** (ignore stale `chore/backend-convention-guards`). App on **SDK 56**; #402 (SDK 57) is not a launch dependency.

## Exploration context (grounding, with file refs)

**Tier seeding (orbit-api).** Tiers are runtime-computed `[NotMapped]` props on `User` — not a stored column (`src/Orbit.Domain/Entities/User.cs:83-92`). Gate = `HasProAccess = IsPro || IsTrialActive`; Retrospective is **Yearly-Pro only** (`PayGateService.cs:96-107`, `IsYearlyPro`). **Signup auto-grants a 7-day trial** (`User.cs:113`) → Free must explicitly null `TrialEndsAt`. Local DB target: `orbit`@`localhost:5432`, `postgres/postgres` (`appsettings.Development.json:9`). Seed SQL per tier captured (goes verbatim into the matrix report's seeding section):

| Tier | `Plan` | `IsLifetimePro` | `PlanExpiresAt` | `TrialEndsAt` | `SubscriptionInterval` |
|---|---|---|---|---|---|
| Free | 0 | false | NULL | **NULL** | NULL |
| Trial | 0 | false | NULL | `now()+'7 days'` | NULL |
| Pro (monthly) | 1 | false | `now()+'30 days'` | NULL | 0 |
| Yearly-Pro | 1 | false | `now()+'365 days'` | NULL | 1 |

Free-tier limits: 10 top-level habits, 20 AI msgs/mo (`AppConstants.cs:17-19`; runtime-overridable via `AppConfigs`). Reset AI paygate mid-QA: `"AiMessagesUsedThisMonth"=0`. Admin (for broadcast test): `"IsAdmin"=true`.

**Local stack bringup (`dev-server` skill).** docker `orbit-postgres` (postgres:17) → API `dotnet run --project src/Orbit.Api` (gate `:5000/health` 200) → web `npm run web` (gate `:3000` HTML). Each gated on the previous; long-runs in background.

**Web route/gating inventory (apps/web).** Auth gate `apps/web/proxy.ts` (PUBLIC_PATHS: `/login /onboarding /auth-callback /r/ /u/ /terms /privacy /delete-account`). UI gating primitive: `hasProAccess`/`isYearlyPro`/`canViewGamification`/`socialOptIn`; two paywall modes — hard redirect to `/upgrade` (goals tab, `/calendar-sync`, `/retrospective`, `/achievements`, create-over-cap) vs in-place lock (`/insights`, `/ai-settings`, `/advanced` MCP). Full route tree mapped (Habits `/`, Astra `/chat`→desktop copilot rail, Goals=4th tab, Calendar `/calendar`+`/calendar-sync`, Insights `/insights` web-only, Explore `/explore` web-only, Social `/social`+`/social/challenges`+`/public-profile`+`/u/[slug]`+`/r/[code]`, Gamification `/achievements`+`/streak`+`/wrapped`, Notifications=bell popover, Settings `/profile`+`/preferences`+`/ai-settings`+`/advanced`+`/support`+`/about`, Billing `/upgrade`+`/retrospective`, Auth `/onboarding`+`/login`+`/auth-callback`, Legal `/terms`+`/privacy`+`/delete-account`). Reachability-per-tier summary captured → drives the matrix.

**Play listing already exists (thomas-brain).** Copy: `orbit/google-play/listing/{en,pt-BR}/{full,short}-description.txt` (headline order already Astra→MCP→social→tracker→free). Framing pipeline: **Puppeteer HTML→PNG** via `scripts/render.mjs` (presets `gplay-phone` 393×852, `gplay-tablet` 1280×800, `feature-graphic` 1024×500). Compositions authored: phone `01-astra-chat`..`05-social`, tablet `01-02`, feature-graphic, pt-BR mirror. **Inner `.screen.html` mirror the live app verbatim** (real captures are reference only, never pipeline input). So refresh+render is drivable; live-app fidelity sign-off is the human step.

**Landing page (orbit-landing-page).** All copy in `src/i18n/translations.ts` (en + pt-BR); sections in `src/components/*.astro`. **Drift:** landing states Free = "20 AI messages/mo"; the listing omits the number (tool counts 61/79/15 match).

**Announcement (orbit-api).** `POST /api/admin/marketing/broadcast` (`AdminController.cs:23-42`, `[Authorize(AdminPolicy)]`) with `{SubjectEn,SubjectPt,BodyHtmlEn,BodyHtmlPt,TestEmail?}`. Recipients = `MarketingEmailConsent == true` (`SendMarketingBroadcastCommand.cs:46`); per-recipient locale from `User.Language`. Resend, `news@updates.useorbit.org`, one-click unsubscribe + CNPJ footer auto-appended. `TestEmail` sends an EN preview only — preview before blast. Body is admin-supplied HTML wrapped in `Templates/Layout.html`.

**Data-safety facts (code-grounded).** Collected: account identity (name/email), habit/goal content, AI chat + voice (→ **OpenAI**), push token (→ **FCM/Google**), Google OAuth+Calendar tokens, payment refs (**Stripe** web / **Play Billing** mobile), advertising ID (**AdMob**, non-Pro only), crash diagnostics (**Sentry**, PII-scrubbed), preferences/gamification. **No product-analytics SDK** (only Sentry). HTTPS throughout. Deletion = in-app → email code → soft-deactivate → **7-day grace** → cron hard-delete (`AccountDeletionService.cs`). Sub-processors: Google (OAuth/Calendar/FCM/AdMob/Play), Stripe, OpenAI, Resend, Supabase, Render, Sentry.

**Compliance findings (become fix-issues + a bundled privacy PR):**
- **F1** — AdMob / advertising-ID collection is **absent from the privacy policy** third-party list (`en.json` privacy block ~1370-1378). Must be declared in Data Safety AND added to the policy (both locales, web + mobile).
- **F2** — privacy `deletion.step4` says data is deleted "immediately" but code uses a **7-day grace** (retention section already says 7-day). Align copy.
- **F3** — Sentry, Supabase/Render, Play Billing not fully enumerated in the policy's sharing/residency lists. Reconcile.

## Track A — Play listing overhaul (thomas-brain + orbit-landing-page)

Assets largely **exist** → this is audit → refresh → render → reconcile, not greenfield.

- **A1** Audit `orbit/google-play/listing/{en,pt-BR}/{full,short}-description.txt` against current `FEATURES.md` (tool counts 61/79/15, gating, headline order). Update only where drifted. Keep "Orbit"/"Astra" untranslated.
- **A2** Refresh screenshot compositions' headlines/branding + re-render via `scripts/render.mjs` (phone 01-05, tablet 01-02, both locales). **Inner `.screen.html` fidelity vs the live app = human sign-off** (deferred), but I refresh copy/layout + render candidates and produce the exact reference-capture shot-list + tier-seeding for verification.
- **A3** Regenerate `feature-graphic.html` (+ pt-BR) against the navy-violet system; render at `gplay-feature` preset.
- **A4** Reconcile **orbit-landing-page** `src/i18n/translations.ts` (en + pt-BR) against the final listing — fix the Free-tier message-count drift, align feature/pricing/MCP copy. Section components only if copy keys change.
- **A5** Open paired PRs: thomas-brain (copy + rendered assets), orbit-landing-page (#29 consistency).

## Track B — Super-QA matrix (orbit-ui-mobile + orbit-api fixes)

- **B1** Scaffold `.claude/reports/launch-qa-matrix.md`: legend (tiers/platforms/symbols), the tier-seeding SQL block, per-domain tables with columns **Feature · Tier(s) · Platform · Locale · Expected (incl. gating assertion) · Result · Evidence · Notes**. Rows generated from `FEATURES.md` × the web route inventory. Mobile + real-billing rows pre-marked **MANUAL → runbook**.
- **B2** Bring up the local stack (`dev-server`); confirm API on origin/main; seed four accounts (Free/Trial/Pro/Yearly) via `postgres-local`.
- **B3** Browser-drive the **web** rows per tier, capturing a screenshot per row into the scratchpad; assert both function AND gating (e.g. Free blocked at goals/insights/calendar-sync/retrospective; Trial reaches all-but-retrospective; Yearly unlocks retrospective). Explicitly verify the flagged edge: `/achievements` gamification-flag behavior.
- **B4** Each distinct failure → its own GitHub fix-issue (`gh issue create`, labeled), linked from the matrix cell.
- **B5** Fix failures in **bundled PRs by area** (both platforms per parity), incl. the compliance fixes F1-F3 (privacy policy i18n, both locales, web + mobile). Re-run affected rows to green.
- **B6** Commit the completed matrix report to orbit-ui-mobile.

## Track C — Launch-ops drafts + runbook (fire-ready)

- **C1** Play **Data Safety** form answers — full mapping from the data-collection inventory (data type → collected? shared? purpose → third party → encrypted-in-transit → deletable), including the AdMob advertising-ID declaration.
- **C2** Play **content-rating** questionnaire answers (grounded: user-generated content via social/handles, no violence/gambling; ad presence = yes/AdMob).
- **C3** **Pre-reg announcement** copy: `SubjectEn/SubjectPt` + `BodyHtmlEn/BodyHtmlPt` (navy-violet, matches `Layout.html`), plus the exact `POST /api/admin/marketing/broadcast` runbook (TestEmail preview → blast; respects consent automatically).
- **C4** **Launch runbook** (`.claude/reports/launch-runbook-379.md`): the ordered human checklist — #161 address fix, apply listing text, upload assets, submit Data Safety + content rating, verify pre-reg auto-conversion, flip production, post-launch watch (Sentry ×3 / Discord / Play vitals+ANR / first reviews), with the gate condition (all issues + #243 green) stated up front.

## Files to Change

**orbit-ui-mobile**
- CREATE `.claude/reports/launch-qa-matrix.md` (Track B)
- CREATE `.claude/reports/launch-runbook-379.md` (Track C)
- CREATE `.claude/reports/launch-data-safety-379.md` (Track C1/C2 answers)
- CREATE `.claude/reports/launch-announcement-379.md` (Track C3 copy + runbook)
- UPDATE `packages/shared/src/i18n/{en,pt-BR}.json` — privacy policy fixes F1-F3 (bundled PR)
- UPDATE `apps/web/**` + `apps/mobile/**` — any parity fixes surfaced by the matrix (scope TBD by findings)

**orbit-api** (only if matrix surfaces backend fixes)
- UPDATE per finding (bundled PR)

**thomas-brain** (paired PR)
- UPDATE `orbit/google-play/listing/{en,pt-BR}/*.txt` (A1)
- UPDATE + re-render `orbit/google-play/**/*.html` + `.png` (A2/A3)

**orbit-landing-page** (paired PR, #29)
- UPDATE `src/i18n/translations.ts` (A4)

## Tasks

| # | Track | Driver | Action | Verify |
|---|---|---|---|---|
| 1 | B | Claude | Scaffold matrix report (legend, seeding SQL, per-domain row skeleton) | File compiles as valid MD; every FEATURES.md domain present |
| 2 | B | Claude | Bring up local stack; confirm API@origin/main; seed 4 tier accounts | `/health` 200, `:3000` HTML, 4 accounts show correct `HasProAccess`/`IsYearlyPro` |
| 3 | B | Claude | Browser-drive web rows × tier; screenshot per row; assert function + gating | Each web row has result + evidence; gating asserts pass or become findings |
| 4 | B | Claude | File a fix-issue per distinct failure; link from matrix | Every ✗ cell links an open issue |
| 5 | B | Claude | Bundled fix PRs by area (both platforms) incl. privacy F1-F3; re-run to green | Fixed rows re-driven green; `/validate` passes |
| 6 | A | Claude | Audit + refresh thomas-brain listing copy vs FEATURES.md | Counts/gating/headline order match; en+pt-BR parallel |
| 7 | A | Claude | Refresh + render compositions & feature graphic (both locales) | `render.mjs` produces PNGs; headlines current |
| 8 | A | Claude | Reconcile landing `translations.ts` drift (en+pt-BR) | Free msg-count + feature/pricing copy consistent with listing |
| 9 | A | Claude | Paired PRs: thomas-brain + orbit-landing-page | PRs open, cross-linked to #379 |
| 10 | C | Claude | Draft Data Safety + content-rating answers | Every collected data type mapped; AdMob declared |
| 11 | C | Claude | Draft announcement EN/pt-BR HTML + broadcast runbook | Renders in Layout shell; TestEmail step first |
| 12 | C | Claude | Write launch runbook with gate condition + watch checklist | Ordered, human-executable, gate stated |
| 13 | — | Human | Execute runbook items (Play Console, real-billing QA rows, mobile QA rows, #161, send blast, flip) | Pasted results verified by me |

**Sequencing:** front-load Track B (tasks 1-5, the critical feeder to #243). Track A (6-9) and Track C (10-12) run in parallel — independent, delegate-able to subagents. Task 5's fixes may iterate. Task 13 is deferred to you (runbook).

## Validation Commands

```bash
# Web QA stack
# (dev-server skill brings up docker + api + web with gates)
# Per-repo gates after any code fix (bundled PRs):
cd apps/web && npm run lint && npm run type-check && npm test
cd apps/mobile && npm run type-check && npm test
cd packages/shared && npm test
# API (only if backend fixes):
dotnet test    # from orbit-api root
# thomas-brain asset render:
node scripts/render.mjs orbit/google-play/phone/02-habits.html --preset gplay-phone
# landing-page:
cd orbit-landing-page && npm run build
```

## Risks

| Risk | Mitigation |
|---|---|
| Matrix is huge; web-driving all tiers is long | Front-load, run per-tier in sequence, screenshot-per-row; parallelize A/C via subagents while B runs |
| Local stack flakiness (docker/API startup) | dev-server readiness gates; API `/health` poll before web; do not proceed on a failed gate |
| Fix-issue count balloons | Bundle by area (decided); triage severity — launch-blocking vs post-launch in the matrix |
| Screenshot fidelity to live app | Inner-screen sign-off deferred to you; I refresh+render + provide reference shot-list/seeding |
| Privacy-policy edits are legal-facing | F1-F3 are code-grounded reconciliations; keep to declared facts, both locales, both platforms |
| Touching 4 repos = 4 PRs | Separate histories; cross-link all to #379; landing = #29 |
| #243 regression if fixes land after it | #243 is sequenced AFTER this per the agreed order; not run here |

## Acceptance Criteria (this session's drivable scope)

- [ ] `.claude/reports/launch-qa-matrix.md` committed: full feature × tier × platform (pt-BR where flagged); every **web** row driven with result + evidence; mobile/billing rows marked MANUAL with runbook refs.
- [ ] Every web-QA failure has its own linked GitHub fix-issue; fixes landed in bundled PRs (both platforms), affected rows re-driven green, `/validate` clean.
- [ ] Compliance F1-F3 fixed in the privacy policy (both locales, web + mobile).
- [ ] thomas-brain listing copy + assets refreshed and rendered; paired PR open.
- [ ] orbit-landing-page drift reconciled; paired PR open (#29).
- [ ] Track C drafts written and fire-ready: Data Safety answers, content-rating answers, announcement EN/pt-BR + broadcast runbook, launch runbook with the gate condition.
- [ ] Deferred human runbook is explicit and executable (Play Console, real-billing rows, mobile rows, #161, blast, flip).

**Out of scope / tracked separately:** #161, #387, #402, #395, and #243 (runs last against the frozen post-#379 baseline). The production flip itself — gated, cannot fire today.
