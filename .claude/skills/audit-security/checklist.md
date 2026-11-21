# Orbit Security Checklist

The category list that `/audit-security` walks. Each item names what to search for and the
Orbit-correct state. Every finding cites a `file:line` and a threat: who reaches it and what
they get. Tier 1 is exploitable now. Tier 2 should be fixed before or at launch.

## A. Authorization and data isolation

Habit data, goals, logs and account settings belong to one user. The main risk is one user
reading or changing the rows of another user (IDOR), directly or through an AI or MCP tool.

- [ ] **Every orbit-api query and command handler scopes by the authenticated `userId`.** The
  value comes from the JWT (`ICurrentUserService` or the auth context), never from a client
  field. A handler that loads, updates or deletes an entity by `id` with no ownership filter is
  **Tier 1 (IDOR)**. Search handlers for `FirstOrDefault`, `FindAsync` and `Where(` on
  user-owned entities. Confirm a `userId ==` clause sits beside each one.
- [ ] **No ownership decision trusts a body or query-string user id.** Only the token is
  trusted. A `userId` accepted from the client is **Tier 1**.
- [ ] **Web Server Actions and BFF routes check auth again.** They do not assume the cookie
  was validated upstream.
- [ ] **List endpoints filter to the caller.** No "return all habits" that forgets `userId`.
- [ ] **Mass assignment is closed.** Update commands bind only allowed fields. A client cannot
  set `UserId`, `IsPro`, a role or a balance through an unscoped DTO.
- [ ] **The database is closed to the internet.** The Postgres database is a Render database
  (`render_postgres` in `orbit-api/infra/production.tf`) with an operator IP allow-list. An
  empty list blocks every external connection, so it is the closed state and never a finding.
  The tracked values (the `variables.tf` default and `example.tfvars`) are `[]` placeholders.
  Never report them. The live list is in the ignored `local.tfvars` and on the Render Postgres
  Networking screen. Only a `0.0.0.0/0` entry in the live list is **Tier 1**. Without Render
  access, put the live setting in the Deferred list as UNVERIFIED, never as clean.

## B. Injection

- [ ] **No raw or interpolated SQL.** Use EF Core LINQ or parameterized queries. `FromSqlRaw`
  or `ExecuteSqlRaw` with interpolated user input is **Tier 1**.
- [ ] **No XSS.** No `dangerouslySetInnerHTML` fed unsanitized user text. React escapes by
  default, so the risk is the explicit escape hatch.
- [ ] **No command injection.** No `Process.Start` or shell call with user-controlled arguments.
- [ ] **No path traversal.** File paths are never built from unsanitized user input (`..` or
  absolute paths). This applies to any upload, export or file route.

## C. Secrets and credentials

- [ ] **No secret in source or committed config.** This covers the JWT signing key, the
  database password, the OpenAI key, the Stripe secret and `WebhookSecret`, the Play
  service-account JSON, the VAPID private key and the Firebase Admin credentials. All come
  from the environment or a secret store. A committed secret is **Tier 1**, and the fix is a
  credential rotation as well as a code change.
- [ ] **No high-entropy literal** in `appsettings*.json`, in a tracked `.env*` file or inline
  in `Program.cs`. Test fixtures use low-entropy placeholders.
- [ ] **Client bundles carry only public keys.** `EXPO_PUBLIC_*` and `NEXT_PUBLIC_*` are public
  by design. A provider secret never reaches a client.

## D. CORS, headers and transport

- [ ] **CORS is not permissive.** `AllowAnyOrigin()` with `AllowCredentials()` is **Tier 1**.
  A blanket `AllowAnyHeader()` or `AllowAnyMethod()` on a credentialed endpoint is **Tier 2**.
  Origins are an explicit allow-list.
- [ ] **The security-headers middleware is intact.** `nosniff`, `X-Frame-Options: DENY` and the
  referrer policy stay on.
- [ ] **HTTPS is enforced**, with HSTS where it applies. Debug mode is off in production config.

## E. Rate limits and resource bounds

- [ ] **Abusable routes are rate-limited.** These are login, signup, password reset and the AI
  chat endpoints. A missing limit on auth is a brute-force surface (**Tier 2**). A missing limit
  on the AI endpoint amplifies cost (**Tier 2**, and **Tier 1** if it can drain the OpenAI budget).
- [ ] **Request-size limits are in place.** Kestrel allows 10 MB globally and the chat endpoint
  allows 20 MB. An unbounded body is a DoS and cost vector.
- [ ] **Public unauthenticated write forms carry a bot gate** (CAPTCHA or Cloudflare Turnstile).
  These are signup, send-code, password reset, the iOS waitlist and any landing form. A rate
  limit throttles one IP, and a bot pool walks around it. A missing gate is **Tier 2**.
- [ ] **Every paid API has a provider-side hard cap and a spend alert.** This covers OpenAI,
  Stripe, FCM and AWS. An application rate limit bounds one caller, and only the provider cap
  bounds the bill. The repo cannot show it. Put it in the Deferred list as "verify in the
  provider console".

## F. AI abuse and MCP tool safety

User text reaches the model, and the model can call tools that change user data.

- [ ] **Every AI and MCP tool derives `userId` from the session**, never from an argument that
  the model or the client supplies. The mutating tools (`execute_agent_operation_v2`,
  `bulk_delete_habits`, `bulk_log_habits`, `bulk_skip_habits`, `delete_goal`, `delete_habit`,
  `manage_account`, `manage_subscription` and the others) cannot target the rows of another
  user. A tool that takes a target-user id is **Tier 1**.
- [ ] **The model never authorizes.** The model decides what to do, and the server decides
  whether the caller may. A handler that acts on the word of the model with no ownership check
  of its own is **Tier 1**.
- [ ] **Destructive and bulk tools have a confirmation or step-up gate** where the surface has
  one (`confirm_agent_operation_v2`, `step_up_agent_operation_v2`). A prompt-injected "delete
  all my habits" must not run silently.
- [ ] **The prompt-injection blast radius is bounded.** Crafted user text cannot push a tool
  beyond the data of the user or start an unbounded loop. The server enforces the cost and
  iteration ceiling, not the prompt.
- [ ] **Model output is not shown as trusted HTML** without escaping.
- [ ] **A self-harm or crisis disclosure gets a crisis reply.** The Orbit system prompt or a
  server-side check routes self-harm text to a supportive reply. The reply names crisis
  resources for the locale of the user (BR: CVV 188, US: 988), never a productivity nudge.
  This is the product-safety bar of Orbit for its audience. No handling in `orbit-api` is
  **Tier 1** by that bar. Companion-chatbot statutes (California SB 243) are context only.
  Whether the assistant is a covered companion chatbot is a legal call. Never use the statute
  as the basis for the severity.

## G. Error handling and data exposure

- [ ] **No stack trace, database schema or internal path in an API response.** Production errors
  are generic, and details go to the logger only. Verbose leakage is **Tier 2**.
- [ ] **No sensitive data in logs.** Passwords, tokens and full PII never reach `ILogger` or
  `console`. Structured logging stays PascalCase and English.
- [ ] **Catch blocks do not swallow a security failure.** `Result<T>` propagates
  (`PropagateError`), and no empty `catch {}` hides an auth or validation error.
- [ ] **Validation sits at every boundary.** Each endpoint has FluentValidation and a
  domain-entity guard. Numeric bounds, date ranges and exclusive options are enforced on the
  server. Frontend Zod is a convenience only.

## H. Client auth state and token storage

- [ ] **The web auth cookie is httpOnly, sameSite strict and secure in every environment.** A
  relaxed cookie is **Tier 1** or **Tier 2**, by how far it reaches.
- [ ] **Mobile tokens live in SecureStore, never AsyncStorage.** A token in AsyncStorage is
  **Tier 1**: it is plaintext on a rooted or compromised device.
- [ ] **No auth state leaks to logs, crash reports or analytics.** Sentry breadcrumbs and every
  other telemetry channel have tokens scrubbed.

## I. Auth failure paths and account enumeration

Attackers probe the error path first. Orbit auth is passwordless email code (send-code and
verify-code) plus password reset, so the leak is which emails have accounts.

- [ ] **A known and an unknown account get the same answer.** Send-code, password reset and
  signup return the same status, body shape and latency class for a registered and an
  unregistered email. A difference is account enumeration (**Tier 2**).
- [ ] **Repeated failures are throttled per account, not only per IP.** N wrong codes in a row
  back off or close the attempt window for that account. A per-IP limit alone leaves
  distributed brute force open (**Tier 2**).
- [ ] **Verification and reset tokens are single-use and expire.** A second click on the link
  is rejected cleanly, with no 500 and no second session. A consumed token that still
  authenticates is **Tier 1**.
- [ ] **Signup with an existing email does not confirm the account to an anonymous caller and
  does not change the existing user** (re-link, overwrite or reset of a field). A change is
  **Tier 1**.

## J. Legal and data-handling posture

Collecting user data puts Orbit under GDPR, LGPD and CCPA at any scale. The legal wording of
the policy is not a finding. Only what the repo or a live request can show is a finding.

- [ ] **A privacy policy is reachable and linked** from the app and the landing page. The
  processors it names match the ones the code calls (Render region, AWS, Stripe, PostHog US
  Cloud, Sentry, Firebase, OpenAI, Cloudflare Turnstile, Google and Apple sign-in, APNs). The
  policy says in plain words that user text reaches OpenAI. A policy that contradicts the real
  processor list is **Tier 2**.
- [ ] **Account deletion and data export are reachable by the user**, not a manual database
  action (GDPR erasure and portability). A missing user-facing delete path is **Tier 2**.
- [ ] **Third-party data flows are intentional.** Analytics, crash and log payloads carry no
  email, token or habit content beyond what the policy declares. An undisclosed PII flow to a
  processor is **Tier 1**.
- [ ] **No copyleft in shipped dependencies.** A GPL or AGPL package under `apps/*`, or in a
  shipped NuGet project, forces source disclosure. Cite the package and its license (**Tier 2**).
- [ ] **Object storage is private, and deletion is complete.** Every S3 bucket
  (`S3ObjectStorageService.cs`) rejects anonymous reads. Prove it with an anonymous request from
  outside, never by inference. A public bucket over user content is **Tier 1**. Content that the
  policy promises to delete, but that survives in a bucket after account deletion, is **Tier 2**.
- [ ] **Cancellation is easy online.** A subscriber reaches a working cancel path from the app
  without support. The in-app path or the Play Subscription Center link that the app opens
  (`apps/mobile/app/upgrade.tsx`, `apps/web/components/upgrade/play-billing-dashboard.tsx`) is
  compliant. The finding is obstruction: a dead or hidden path, a forced support email or added
  friction. An obstructed or missing path is **Tier 2**.

## Deferred list (every run)

The repo cannot prove these. Record each one as "verify live", never as clean: the live Render
allow-list, the provider spend caps, the trial-to-paid conversion notice, any testimonial or
rating on the landing repository or the Play listing, and the public state of each S3 bucket.
