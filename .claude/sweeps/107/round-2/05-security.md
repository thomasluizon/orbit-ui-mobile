# Sweep #5 — Security (issue #107 agent-5, ROUND 2)

READ-ONLY re-audit of working tree. Baseline: ui-mobile `ae5c150`, orbit-api `eee06ae`.
Scope: verify round-1 fixes landed; fresh security checks across web BFF/cookies, mobile token storage, Zod boundaries, XSS, CSRF, API authz/IDOR/injection, secrets, dependency advisories.

Commands run: `npm audit --workspaces --include-workspace-root` (ui-mobile); `dotnet list package --vulnerable --include-transitive` (orbit-api). No builds/tests/servers.

---

## Findings (STILL-OPEN only)

### MED · apps/mobile/lib/supabase.ts:12-18 · root CLAUDE.md "no secrets baked in" (Security boundaries) / D24 NOT APPLIED · env-or-throw, drop the `??` literal fallbacks (mirror web)
D24 was decided in round-1 triage ("mobile `lib/supabase.ts`: env-or-throw (remove `??` literal fallbacks), mirroring web") but the fix was **never applied** — the file is byte-identical to round-1. The Supabase URL (`https://wdscxamegetmhqldqsdg.supabase.co`, line 14) and publishable key (`sb_publishable_CGlL4PSxvp2Ia0SCHcathQ_iAQnmXis`, line 18) still ship as hardcoded `??` fallbacks baked into the APK when env vars are unset. Web (`apps/web/lib/supabase.ts:7-9`) does this correctly: reads env, throws `'Supabase config missing'` if absent, no fallback. Supabase publishable keys are public-by-design (RLS is the real boundary), so this is not a credential leak — severity stays MED, not HIGH — but it violates the written rule and pins prod infra into the binary. Note: `apps/web/next.config.ts:23-24` ALSO carries the same two literals as `env` fallbacks (existing in round-1, not in the D24 scope as written, but the same hardcoded pair — listed here for completeness; if D24 is reopened, the web next.config fallbacks should go too for consistency).

### LOW · apps/web/app/api/auth/send-code/route.ts:20 + verify-code/route.ts:23 + google/route.ts:23 · D23 NOT APPLIED (Zod at trust boundaries) · parse request bodies with the shared Zod auth schema before forwarding
D23 ("the 3 public BFF auth routes + session route: Zod-parse request bodies at the boundary") was **not applied**. All three unauthenticated BFF auth routes still do `const body = await request.json() as unknown` and forward the raw body straight to the .NET backend with no Zod validation at the Next.js trust boundary. The backend re-validates via FluentValidation, so this is defense-in-depth, not an exploitable hole — but it is the systematic boundary gap the decision asked to close. Low severity because the authoritative validation exists downstream. (session/route.ts takes no body, so the "+ session route" clause is N/A for body parsing.)

### LOW · apps/web/app/api/auth/verify-code/route.ts:53 + google/route.ts:53 + send-code/route.ts:47 + session/route.ts:17 · D23 NOT APPLIED (log-on-500) / boundary error handling · bare `catch {}` collapses all failures to a generic 500 with no server-side log
The second half of D23 ("on 500 log server-side (no client detail)") was **not applied**. The catch blocks still discard the caught error entirely (no logger call) and return `{ error: 'Authentication failed' }` (or `{ expiresAt: null }` for session). Correct for NOT leaking detail to the client (good — no stack traces reach the user), but the error is never logged on the BFF side, so a misconfigured `API_BASE` or upstream outage is invisible in web logs. Low severity — diagnosability gap, not a vuln. (logout/route.ts:22-23 has the same empty catch — intentional best-effort revoke, NOT a finding.)

---

## Round-1 fixes — verification

| Round-1 item | Decision | Status | Evidence |
|---|---|---|---|
| Mobile supabase env-or-throw | D24 | **STILL OPEN** (MED) | `apps/mobile/lib/supabase.ts:12-18` — `??` fallbacks unchanged |
| BFF auth routes Zod-parse | D23 | **STILL OPEN** (LOW) | send-code:20, verify-code:23, google:23 — `request.json() as unknown` |
| BFF auth routes log-on-500 | D23 | **STILL OPEN** (LOW) | verify-code:53, google:53, send-code:47, session:17 — empty `catch {}` |
| Deletion endpoints rate-limited | D20 | **FIXED** | `AuthController.cs:310` request-deletion + `:331` confirm-deletion both `[DistributedRateLimit("auth")]` |
| `underscore` HIGH gone | DEF-14/D14 | **FIXED** | root `package.json:68` `"underscore": "^1.13.8"` override; `npm audit` 0 HIGH (was 2) |
| OpenMcdf advisories gone | (FileSignatures bump) | **FIXED** | `Orbit.Infrastructure.csproj:9` FileSignatures 7.2.1; `dotnet list --vulnerable` CLEAN across all 8 projects |

---

## Fresh checks — non-findings (evidence of correctness)

- **Cookie flags:** `apps/web/lib/auth-api.ts:10-15` — `COOKIE_OPTIONS = { httpOnly: true, sameSite: 'strict', secure: true, path: '/' }`. `secure: true` unconditional (not env-gated). Applied uniformly via setAuthCookie/setRefreshCookie/setSessionCookies/clearSessionCookies. PASS.
- **Bearer never reaches client:** catch-all proxy `app/api/[...path]/route.ts` injects `Authorization` server-side only; response headers pass through `SAFE_FORWARD_HEADERS` allowlist (no Authorization / Set-Cookie passthrough). verify-code:49 / google:49 strip `token`+`refreshToken` from JSON (`...safeResponse`). Web auth store holds no token. PASS.
- **Mobile tokens (SecureStore-only):** `lib/secure-store.ts:1-27` uses expo-secure-store exclusively for `auth_token`/`refresh_token` (getItemAsync/setItemAsync/deleteItemAsync). No token in AsyncStorage; no token logging. PASS.
- **XSS:** all 4 web `dangerouslySetInnerHTML` sites sanitized. `markdown.tsx:40-43` DOMPurify with fixed tag/attr allowlist (no script/handlers; ALLOWED_ATTR href/target/rel only). `app-overlay.tsx:18-38` escapeHtml + DOMPurify a-only allowlist. `retrospective/page.tsx` + `layout.tsx` (themeBootstrapScript is a static `JSON.stringify`'d string — no user input). Mobile markdown gates href to `^(https?:|mailto:)`. PASS.
- **CSRF:** state-changing routes are POST/PUT/DELETE bound to sameSite=strict cookie; the two GET handlers (session, plans) are read-only. PASS.
- **API authz coverage:** 17/19 controllers carry class-level `[Authorize]`. The 2 without (AuthController, OAuthController) are auth-issuance surfaces — every sensitive action `[Authorize]`'d (request/confirm-deletion), public ones `[AllowAnonymous]` + `[DistributedRateLimit("auth")]`. Subscription webhook + Play RTDN `[AllowAnonymous]` but Stripe-signature / Play-push-token verified. PASS.
- **IDOR / resource ownership:** spot-checked Update/Get/Log/Delete handlers for Habit/Goal/Tag/Notification + Sync batch ops — all enforce `UserId == request.UserId` in the predicate or via explicit guard. No IDOR found. PASS.
- **PII / stack in errors:** `UnhandledExceptionHandler` returns generic `"Unexpected server error"` + requestId only — no stack, no PII. `ValidationExceptionHandler` returns property-name errors only. PASS.
- **SQL injection:** zero `FromSqlRaw`/`ExecuteSqlRaw`/`FromSqlInterpolated`/interpolated SQL in src. All access via EF Core LINQ. PASS.
- **Command injection:** zero `Process.Start`/`ProcessStartInfo`. PASS.
- **Token logging:** no console/logger call prints a full token/password/Authorization in either repo. Push service logs a 20-char endpoint preview only. PASS.
- **NEXT_PUBLIC / EXPO_PUBLIC secrets:** only `*_SUPABASE_URL`, `*_SUPABASE_ANON_KEY`/`PUBLISHABLE_KEY`, `*_VAPID_PUBLIC_KEY`, `EXPO_PUBLIC_API_BASE`, AdMob IDs consumed client-side — all public-by-design. No server secret behind a public env var. PASS.
- **OAuth login page XSS:** `OAuthLoginPage.cs` HtmlEncodes every interpolated param; `OAuthController` allowlists redirect_uri host + enforces PKCE S256. PASS.

---

## Dependency advisories

### npm audit (orbit-ui-mobile) — 12 moderate, 0 HIGH/CRITICAL (was 14 = 12 moderate + 2 HIGH in round-1)
The 2 HIGH (`underscore` <=1.13.7, GHSA-qpx9-hpmf-5gmw, via `sp-react-native-in-app-updates`) are **resolved** by the root `overrides: { "underscore": "^1.13.8" }`. Remaining 12 are all transitive under Expo build tooling (postcss XSS GHSA-qx2v-qp2m-jg93 via `@expo/metro-config`+`next`; uuid GHSA-w5hq-g745-h8pq via `xcode`→prebuild, iOS-only/build-time). **DEF-4** (expo matrix bump) and **DEF-5** (postcss-in-next) cover these — not re-reported as findings. No runtime-shipped HIGH/CRITICAL.

### dotnet list --vulnerable (orbit-api) — CLEAN (0 vulnerable, was 2 MODERATE OpenMcdf in round-1)
"All projects... no vulnerable packages" across all 8 projects. The round-1 OpenMcdf 2.3.1 advisories (GHSA-jxpf-xq2m-q525 + GHSA-5qwm-7pvp-w988) are **resolved** — FileSignatures bumped to 7.2.1 (`Orbit.Infrastructure.csproj:9`), which no longer pulls vulnerable OpenMcdf. No NU1902 warnings expected.

---

## Verdict

**3 FINDINGS** (0 HIGH · 1 MED · 2 LOW) in first-party code — ALL THREE are unapplied round-1 decisions (D24, D23×2), NOT new regressions.

Counts: **HIGH=0 · MED=1 · LOW=2.**

Confirmed-fixed since round-1: D20 deletion rate-limits ✓ · `underscore` HIGH (npm 2 HIGH → 0) ✓ · OpenMcdf MODERATEs (dotnet vulnerable → clean) ✓. Dependency posture improved: npm 14→12 vulns (HIGH eliminated), dotnet 2→0. Remaining npm moderates are DEF-4/DEF-5 deferrals (not findings). All 12 fresh checks (cookies, bearer isolation, SecureStore, XSS, CSRF, authz, IDOR, PII, SQLi, cmd-injection, token-logging, public-env secrets, OAuth XSS) PASS.
