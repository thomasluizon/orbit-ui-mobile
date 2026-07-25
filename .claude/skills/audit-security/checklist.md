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
