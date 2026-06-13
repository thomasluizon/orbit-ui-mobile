# Sweep #5 — Security (issue #107 agent-5, round 1)

READ-ONLY audit of working tree. Scope: web BFF/cookies, mobile token storage, Zod boundaries, XSS, CSRF, API authz/rate-limit/injection, secrets, dependency advisories.

Commands run: `npm audit --workspaces --include-workspace-root` (ui-mobile); `dotnet list package --vulnerable` + `--include-transitive` (orbit-api). No builds/tests/servers.

---

## Findings

### MED · apps/mobile/lib/supabase.ts:13-18 · root CLAUDE.md "no secrets baked in" / agent-5 bullet 8 · move Supabase URL+publishable key to required EXPO_PUBLIC env, drop the hardcoded fallbacks
The mobile Supabase URL (`https://wdscxamegetmhqldqsdg.supabase.co`) and publishable key (`sb_publishable_CGlL4PSxvp2Ia0SCHcathQ_iAQnmXis`) are hardcoded as literal `??` fallbacks, so they ship inside the APK even when env vars are unset. Supabase publishable/anon keys are designed to be public (RLS is the real boundary), so this is not a credential leak — but it is a baked-in secret per the written rule, and it pins prod infra into source/binary. Web (`apps/web/lib/supabase.ts:7-9`) does this correctly: reads env, throws if missing, no fallback. Recommend mirroring the web pattern. Severity MED (not HIGH) because the key class is publishable by design.

### LOW · apps/web/app/api/auth/send-code/route.ts (whole handler) + verify-code/route.ts:23 + google/route.ts:23 · agent-5 bullet 4 (Zod at trust boundaries) · parse request bodies with the shared Zod auth schema before forwarding
The three unauthenticated BFF auth routes read `await request.json() as unknown` and forward the raw body straight to the .NET backend with no Zod validation at the Next.js trust boundary. The backend re-validates via FluentValidation, so this is defense-in-depth, not an exploitable hole — but it is the systematic gap the bullet asks to flag: every other mutation path (server actions → typed inputs; client forms → zodResolver) is typed, while these public entry points accept arbitrary JSON. Low severity because the authoritative validation exists downstream.

### LOW · apps/web/app/api/auth/verify-code/route.ts:53-58 (and google:53, send-code:47, session:17) · orbit-api CLAUDE.md "never swallow errors" spirit / boundary error handling · the bare `catch {}` collapses all failures to a generic 500 with no server-side log
The catch blocks discard the caught error entirely (no logger call) and return `{ error: 'Authentication failed' }`. This is correct for NOT leaking detail to the client (good — no stack traces reach the user), but the error is also never logged on the BFF side, so a misconfigured `API_BASE` or upstream outage is invisible in web logs. The backend logs its own failures; this is only the proxy leg. Low severity — it is a diagnosability gap, not a vuln. (logout/route.ts:22-23 has the same empty catch, intentional best-effort revoke.)

---

## Non-findings verified (evidence of correctness)

- **Cookie flags (agent-5 bullet 1):** `apps/web/lib/auth-api.ts:10-15` — `COOKIE_OPTIONS = { httpOnly: true, sameSite: 'strict', secure: true, path: '/' }`. `secure: true` is unconditional (not env-gated). Applied uniformly via setAuthCookie/setRefreshCookie/setSessionCookies/clearSessionCookies and at every set site (verify-code, google, proxy.ts:63). PASS.
- **Bearer never reaches client (bullet 2):** Catch-all proxy (`app/api/[...path]/route.ts`) injects `Authorization` server-side only; response headers go through `SAFE_FORWARD_HEADERS` allowlist (no auth/set-cookie passthrough) + forced `cache-control: private, no-store`. verify-code/google strip `token`+`refreshToken` from the JSON before returning (`...safeResponse`). Web auth store holds NO token (grep clean). chat/stream pipes body only. PASS.
- **Mobile tokens (bullet 3):** `lib/secure-store.ts` uses expo-secure-store exclusively for auth_token/refresh_token. All 7 AsyncStorage call sites store non-secret UI state (support draft, retrospective cache, snooze timestamp, referral code, return URL, offline queue, last-visit). No token in AsyncStorage; no token logging (grep for console.*token clean — only hit is a keystore-empty error in a build script). PASS.
- **XSS (bullet 5):** All 4 `dangerouslySetInnerHTML` sites sanitized. `components/ui/markdown.tsx:40` DOMPurify with tag/attr allowlist (no script/handlers). `app-overlay.tsx:26-38` escapeHtml + DOMPurify allowlist a-only. `retrospective/page.tsx:31-36` escapeHtml + DOMPurify strong/br-only. `layout.tsx:97` themeBootstrapScript is a static string with `JSON.stringify`'d data — no user input. Mobile `components/ui/markdown.tsx` uses react-native-marked with a `SafeLinkRenderer` gating href to `^(https?:|mailto:)` (rejects javascript:/data:). PASS.
- **CSRF (bullet 6):** State-changing routes are POST/PUT/DELETE bound to sameSite=strict cookie; no state-changing GET found; no token-in-query in app code. PASS.
- **API authz (bullet 9):** 17/19 controllers carry class-level `[Authorize]`. The 2 without (AuthController, OAuthController) are auth-issuance surfaces; every sensitive AuthController action (request/confirm-deletion) is explicitly `[Authorize]`d; public ones are `[AllowAnonymous]` + rate-limited. Subscription webhook + Play RTDN are `[AllowAnonymous]` but verified by Stripe signature / Play push-token validator. Matches orbit-api CLAUDE.md hard rule. PASS.
- **Resource-level authz (bullet 9):** Spot-checked every `GetByIdAsync(request.*Id)` / `Id == request.*Id` handler. Delete/Log/Skip/Duplicate habit + GetHabitLogs + GetHabitFullDetail all enforce ownership (either `UserId == request.UserId` in the predicate or an explicit `habit.UserId != request.UserId → NoPermission/NotOwned` guard). No IDOR found. PASS.
- **Error responses / PII (bullet 9):** `UnhandledExceptionHandler` returns generic `"Unexpected server error"` + requestId only — no stack trace, no PII. PASS.
- **Injection (bullet 10):** Zero `FromSqlRaw`/`ExecuteSqlRaw`/interpolated SQL in src. Zero `Process.Start`/`ProcessStartInfo`. All data access via EF Core LINQ. PASS.
- **Rate limiting (bullet 7):** `[DistributedRateLimit("auth")]` on every AuthController + OAuthController auth action and on AI step-up/verify; `("chat")` class-level on ChatController; `("support")` on support; `("ai-resolve")` on clarification resolve. NOTE: `request-deletion`/`confirm-deletion` (AuthController:309,329) are `[Authorize]`d but NOT rate-limited — observed, not raised as a finding because they require a valid JWT (authenticated abuse only) and the deletion code itself has a MaxVerificationAttempts cap (ConfirmAccountDeletionCommand.cs:30). Objectively borderline; leaving as note per "uncertain → not a finding."
- **NEXT_PUBLIC secrets (bullet 8):** Only NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, NEXT_PUBLIC_VAPID_PUBLIC_KEY consumed client-side — all are public-by-design values. No server secret behind a NEXT_PUBLIC_ var. PASS.
- **OAuth login page (orbit-api):** `OAuthLoginPage.Render` HtmlEncodes every interpolated param; redirect_uri host allowlisted; PKCE S256 enforced; dedicated tightened CSP for /oauth. PASS.

---

## Dependency advisories (bullet 11)

### npm audit (orbit-ui-mobile) — 14 vulns (12 moderate, 2 high). All transitive, all under Expo build tooling / dev-only chains:
- **HIGH · underscore <=1.13.7 (GHSA-qpx9-hpmf-5gmw, DoS)** · via `sp-react-native-in-app-updates` → `node_modules/underscore`.
- **MOD · postcss <8.5.10 (GHSA-qx2v-qp2m-jg93, XSS in stringify)** · via `@expo/metro-config` and `next` → build-time only.
- **MOD · uuid <11.1.1 (GHSA-w5hq-g745-h8pq, buffer bounds)** · via `xcode` → `@expo/config-plugins` → Expo prebuild (build-time, iOS-only `xcode` pkg; Orbit mobile is Android-only).
- Remaining 11 are the `@expo/*` config/cli/metro chain depending on the postcss/uuid above. No runtime-shipped HIGH/CRITICAL in app code paths. Fixes require Expo SDK bumps (`npm audit fix --force` would downgrade next@9 / breaking) — defer to a dependency-bump task, not a code change.

### dotnet list --vulnerable (orbit-api) — OpenMcdf 2.3.1, 2× MODERATE (transitive):
- **MOD · OpenMcdf 2.3.1 (GHSA-jxpf-xq2m-q525 + GHSA-5qwm-7pvp-w988)** · transitive in Orbit.Api, Orbit.Infrastructure, Orbit.Application.Tests, Orbit.Infrastructure.Tests. Surfaces as the known NU1902 build warnings. Pre-acknowledged in the brief; listing per instruction. No direct reference — pulled by a doc/spreadsheet dependency. Bump the parent package when available.
- No HIGH/CRITICAL. No direct vulnerable packages.

---

## Verdict

**3 FINDINGS** (0 HIGH · 1 MED · 2 LOW) in first-party code.
Dependency advisories: 1 HIGH (underscore, transitive/build-chain) + 13 MODERATE (npm) + 2 MODERATE (OpenMcdf/NuGet) — all transitive, none in shipped app runtime paths; remediation is dependency bumps, deferred.

Counts: HIGH=0 · MED=1 · LOW=2 (first-party). Advisory HIGH=1, advisory MOD=15 (transitive only).
