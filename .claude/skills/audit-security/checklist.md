# Orbit Security Checklist

The category list `/audit-security` walks. Self-contained — it names exactly what to grep
for and what the Orbit-correct state is, so the audit needs no external scanner. Each item
maps to a tier (see the skill's Phase 0): **Tier 1** = exploitable now, **Tier 2** =
should-fix, **Tier 3** = enterprise/out-of-scope.

Every finding cites a file:line and a **threat** (who reaches it, what they get).

> **Machine-read.** `.claude/workflows/audit.mjs` passes this file's path to every security
> finder as "the contract for what counts and how findings are shaped"
> (`KIND.security.checklist`), section-scoped per surface. Editing this file edits the finder
> prompt; the skill's pipeline, guardrails, and output shape belong in `SKILL.md`, which the
> finders never read.

---

## A. Authorization & data-isolation — the Orbit flagship

> Habit data, goals, logs, and account settings are per-user. The #1 risk is one user
> reading or mutating another user's rows (IDOR), directly or **through an AI/MCP tool**.

- [ ] **Every orbit-api query/command handler scopes by the authenticated `userId`** —
  taken from the JWT (`ICurrentUserService` / the auth context), never from a
  client-supplied field. A handler that loads/updates/deletes an entity by `id` with no
  ownership filter is **Tier 1 (IDOR)**. Grep handlers for `FirstOrDefault`/`FindAsync`/
  `Where(` on user-owned entities and confirm a `userId ==` clause sits alongside.
- [ ] **No ownership decision trusts a request body / query-string user id.** The only
  trustworthy identity is the token. A `userId` accepted from the client is **Tier 1**.
- [ ] **Web Server Actions / BFF routes re-check auth** — they don't assume the cookie was
  already validated upstream.
- [ ] **List endpoints filter to the caller** — no "return all habits" that forgets the
  `userId` predicate.
- [ ] **Mass-assignment**: update commands bind only allowed fields; a client can't set
  `UserId`, `IsPro`, role, or balance through an unscoped DTO bind.
- [ ] **The Supabase layer is shut, and this is NOT repo-readable, so QUERY it.** Orbit's
  Postgres IS Supabase and the web bundle ships a real publishable key, so PostgREST is a
  second, code-invisible door onto the same rows. EF Core migrations create tables with RLS
  **off** by default. A reader-only audit that skips this reports a naked database as clean.
  Run all three, never infer:
  1. `select c.relname, c.relrowsecurity, (select count(*) from pg_policy p where p.polrelid
     = c.oid) from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname =
     'public' and c.relkind = 'r'` (via the postgres MCP). Any table with
     `relrowsecurity = false` is **Tier 1**.
  2. `select grantee, table_schema, count(*) from information_schema.role_table_grants where
     grantee in ('anon','authenticated') group by 1,2`. A `public`-schema grant to `anon` or
     `authenticated` is **Tier 1** unless a policy set deliberately backs it.
  3. Prove it from outside with the real publishable key:
     `curl -s -o /dev/null -w '%{http_code}' "$SUPABASE_URL/rest/v1/Users?select=*" -H
     "apikey: $ANON_KEY"`. Anything other than 401/403 on a user-owned table is **Tier 1**.
  Verified clean 2026-07-26: RLS on all 48 tables, zero `public` grants to anon/authenticated,
  live probe 401, and a `public.rls_auto_enable` event trigger enables RLS on each new table.
  Re-verify rather than trusting that line, since it is a snapshot of a live system.

## B. Injection

- [ ] **No raw or string-interpolated SQL** — EF Core LINQ or parameterized queries only.
  `FromSqlRaw`/`ExecuteSqlRaw` with interpolated user input is **Tier 1**.
- [ ] **XSS** — no `dangerouslySetInnerHTML` fed unsanitized user text; no untrusted HTML
  rendered raw in web. (React escapes by default; the risk is the explicit escape hatch.)
- [ ] **Command injection** — no `Process.Start` / shell exec with user-controlled args.
- [ ] **Path traversal** — file paths never built from unsanitized user input (`..`, abs
  paths). Relevant if any upload/export/file route exists.

## C. Secrets & credentials

- [ ] **No secret in source or committed config** — JWT signing key, DB password, OpenAI
  key, Stripe secret/`WebhookSecret`, Play service-account JSON, VAPID private key,
  Firebase Admin credentials. All come from env / secret store. A committed secret is
  **Tier 1** (and a credential rotation, not just a code fix).
- [ ] **No high-entropy literals** in `appsettings*.json`, `.env*` tracked in git, or
  inline in `Program.cs`. (Test fixtures use low-entropy placeholders — see the GitGuardian
  note in project memory; real entropy in tests trips the scanner.)
- [ ] **Client bundles carry only public keys** — `EXPO_PUBLIC_*` / `NEXT_PUBLIC_*` are
  public by design; nothing secret rides them. The Supabase publishable key + URL are
  intentionally public; the service-role key must never reach a client.

## D. CORS, headers & transport

- [ ] **CORS not permissive** — never `AllowAnyOrigin()` combined with
  `AllowCredentials()` (**Tier 1**); avoid blanket `AllowAnyHeader()`/`AllowAnyMethod()`
  on credentialed endpoints (**Tier 2**). Origins are an explicit allow-list.
- [ ] **Security-headers middleware intact** — `nosniff`, `X-Frame-Options: DENY`,
  referrer-policy, XSS protections not disabled.
- [ ] **HTTPS enforced**; HSTS where applicable. Debug mode off in production config.

## E. Rate-limiting & resource bounds

- [ ] **Abusable routes are rate-limited** — login, signup, password-reset, and the AI/chat
  endpoints. A missing limit on auth = credential-stuffing / brute-force surface (**Tier
  2**). A missing limit on the AI endpoint = cost-amplification (**Tier 2**, → Tier 1 if it
  can drain the OpenAI budget).
- [ ] **Request-size limits in place** — Kestrel 10MB global, chat endpoint 20MB (per the
  review rubric). An unbounded body is a DoS/cost vector.
- [ ] **Public unauthenticated write forms carry bot protection** (CAPTCHA / Cloudflare
  Turnstile): signup, send-code, password-reset, the iOS waitlist, any landing form. A rate
  limit throttles one IP; a bot pool walks around it. No bot gate on a public write form is
  **Tier 2**.
- [ ] **Provider-side hard cost caps and spend alerts exist** for every paid API the server
  calls (OpenAI, Resend, Stripe, FCM). An application rate limit bounds one caller; only the
  provider cap bounds the bill. Not repo-readable: verify in the provider console and put it
  in the Deferred ledger, never report it clean.

## F. AI-abuse & MCP tool safety — Orbit-specific

> User text reaches the model, and the model can invoke tools that **mutate user data**.

- [ ] **Every AI/MCP tool derives `userId` from the session**, not from a model-supplied or
  client-supplied argument. The mutating tools (`execute_agent_operation_v2`,
  `bulk_delete_habits`, `bulk_log_habits`, `bulk_skip_habits`, `delete_goal`,
  `delete_habit`, `manage_account`, `manage_subscription`, …) must be incapable of
  targeting another user's rows. A tool that takes a target-user id is **Tier 1**.
- [ ] **Authorization is never delegated to the model** — the model decides *what to do*,
  the server decides *whether the caller may*. Tool handlers enforce ownership independently
  of the prompt. A handler that acts on the model's word without its own check is **Tier 1**.
- [ ] **Destructive/bulk tools have a confirmation/step-up gate** where the surface provides
  one (`confirm_agent_operation_v2` / `step_up_agent_operation_v2`) — a prompt-injected
  "delete all my habits" shouldn't execute silently.
- [ ] **Prompt-injection blast radius is bounded** — crafted user text can't escalate a
  tool beyond the user's own data or trigger an unbounded loop. The cost/iteration ceiling
  is server-enforced, not prompt-enforced.
- [ ] **Model output isn't reflected as trusted HTML/markup** without escaping.
- [ ] **A self-harm or crisis disclosure gets a crisis response**: the Astra system
  prompt or a server-side check routes self-harm text to a supportive reply that names
  crisis resources for the user's locale (BR: CVV 188, US: 988), never to a productivity
  nudge. This is Orbit's own product-safety bar for its audience, and no handling
  anywhere in `orbit-api` is **Tier 1** by that policy. Companion-chatbot statutes
  (California SB 243, in force 2026) are conditional context only: whether Astra is a
  covered companion chatbot rather than a productivity-only bot is a legal call, and
  the statute's duty is a published protocol with crisis referral, not this exact
  implementation — cite it as context, never as the severity basis.

## G. Error handling & data exposure

- [ ] **No stack traces / DB schema / internal paths in API responses** — production error
  responses are generic; details go to the logger only. Verbose leakage is **Tier 2**.
- [ ] **No sensitive data in logs** — passwords, tokens, full PII never hit `ILogger` /
  `console`. Structured logging stays PascalCase + English (orbit-api rule).
- [ ] **Catch blocks don't swallow security-relevant failures** — `Result<T>` propagated
  (`PropagateError`), no empty `catch {}` hiding an auth/validation error.
- [ ] **Validation at every boundary** — each new endpoint has FluentValidation **and** a
  domain-entity guard; numeric bounds, date ranges, mutually-exclusive options enforced
  server-side. The backend is the source of truth; frontend Zod is convenience only.

## H. Client auth-state & token storage

- [ ] **Web auth cookie**: httpOnly + sameSite strict + secure **always** — not relaxed in
  any env branch. A non-httpOnly or non-strict cookie is **Tier 1/2** depending on reach.
- [ ] **Mobile tokens in SecureStore, never AsyncStorage** — an AsyncStorage-persisted
  token is **Tier 1** (readable on a compromised/rooted device, plaintext).
- [ ] **No auth state leaked to logs / crash reports / analytics** — tokens scrubbed from
  Sentry breadcrumbs and any telemetry.

## I. Auth failure paths & account enumeration

> Attackers probe the error path first, not the happy path. Orbit's auth is passwordless
> email-code (send-code / verify-code) plus password reset, so the thing that leaks is
> **which emails have accounts**.

- [ ] **A known and an unknown account get the same answer**: send-code, password-reset,
  and signup return the same status, body shape, and latency class for a registered and an
  unregistered email. A differential response is account enumeration (**Tier 2**).
- [ ] **Repeated failures are throttled per account, not only per IP**: N wrong codes in a
  row backs off or closes the attempt window for that account. Per-IP-only throttling leaves
  distributed brute force open (**Tier 2**).
- [ ] **Verification / reset tokens are single-use and expiring**: clicking the link twice
  is rejected cleanly, never a 500 and never a second session. A consumed token that still
  authenticates is **Tier 1**.
- [ ] **Signup with an existing email neither confirms the account to an anonymous caller
  nor mutates the existing user** (re-link, overwrite, reset of a field). Mutation is
  **Tier 1**.

## J. Legal & data-handling posture

> Collecting user data puts Orbit under GDPR/LGPD/CCPA at any scale, and selling a
> subscription adds consumer-protection exposure (FTC and state equivalents). Every item
> here is repo- or live-checkable; the policy's legal wording is not, and is not a finding.

- [ ] **A privacy policy is reachable and linked** from the app and the landing page, and
  the processors it names match the ones the code actually calls (Supabase/Render region,
  Stripe, PostHog US Cloud, Sentry, Resend, Firebase, OpenAI). The AI flow is named in
  plain terms — user text reaches OpenAI and the policy says so; state AI-disclosure laws
  make silence its own violation. A policy that contradicts the real processor list is
  **Tier 2**.
- [ ] **Account deletion and data export are user-reachable**, not a manual DB action (GDPR
  erasure + portability). Missing a user-facing delete path is **Tier 2**.
- [ ] **Third-party data flows are intentional**: analytics, crash, and log payloads carry
  no email, token, or habit content beyond what the policy declares. An undisclosed PII flow
  to a processor is **Tier 1**.
- [ ] **No copyleft contamination in shipped dependencies**: a GPL/AGPL package under
  `apps/*` or a NuGet reference in a shipped project forces source disclosure. Cite the
  package and its license (**Tier 2**).
- [ ] **Object storage is private and deletion is complete**: every Supabase storage
  bucket (`SupabaseObjectStorageService.cs`) rejects anonymous reads — prove it from
  outside with the publishable key, like the RLS probe, never by inference. A public
  bucket over user content is **Tier 1**. Account deletion removes the user's storage
  objects along with the rows; content the policy promises to delete but that survives in
  a bucket is **Tier 2**.
- [ ] **Cancellation is easy online and unobstructed**: a subscriber reaches a working
  cancel path from the app without contacting support — in-app, or the Play
  Subscription Center link the app already opens (`apps/mobile/app/upgrade.tsx`,
  `apps/web/components/upgrade/play-billing-dashboard.tsx`), which is compliant. The
  finding is obstruction: a dead or hidden path, a forced support email, or friction
  added to delay the exit (ROSCA demands a simple mechanism; counting steps against
  signup is not the test). An obstructed or missing path is **Tier 2**.
- [ ] **Trial-to-paid conversion notice matches the duty that applies**: derive the
  requirement from the trial length, the user's jurisdiction, and the billing channel
  before flagging — California's pre-expiry reminder binds free periods over 31 days
  (Orbit's trial is 7), and Play's duty is upfront conversion disclosure. Where a
  reminder is due, provider-side delivery counts, with proof the customer was actually
  notified: an enabled and sent Stripe reminder email, or an Orbit-sent equivalent.
  `customer.subscription.trial_will_end` is the webhook TRIGGER for such an email;
  receiving or handling the event alone never satisfies the check. Today the trial
  holds no card; re-derive when ORB-138 applies the price. A charging trial missing a
  notice its duty demands is **Tier 2**.
- [ ] **No invented social proof**: no testimonial, review count, star rating, or
  `aggregateRating` structured data inside the supplied audit roots that does not trace
  to a real user statement. An invented review is **Tier 1** (the FTC fake-review rule
  fines per violation). The landing repository and the live Play store listing sit
  OUTSIDE this audit's roots (`audit.mjs` passes only orbit-ui-mobile and orbit-api):
  put both in the Deferred ledger every run, never let an empty local grep stand for a
  clean result on them. Landing JSON-LD verified clean by hand 2026-08-13; that line is
  a snapshot, not coverage.

## Tier 3 — out of scope for this audit (acknowledge, don't itemize as findings)

WAF / DDoS scrubbing · SIEM / centralized security logging · scheduled external pen-tests ·
secrets-vault auto-rotation · SOC2 / formal compliance controls · threat-intel feeds ·
hardware key management. Real at scale; deliberately deferred for a solo, pre-full-launch
app. List them once under "out of scope," never one-per-line as findings.

---

## Self-check

This checklist holds itself to the repo standard: it names the Orbit-correct state for
each item (not generic advice), maps each to a tier so the audit stays calibrated, and
demands a file:line + threat for every finding. If an item can't be tied to a line in the
repo, it's guidance — not a finding.
