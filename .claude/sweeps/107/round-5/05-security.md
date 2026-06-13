# Sweep #5 — Security, issue #107 ROUND 5 (final verification)

READ-ONLY. Baselines: ui-mobile `3520d10`, orbit-api `fcfdc95` (both committed green).
Commands run: `npm audit --omit=dev --json` (12 moderate, 0 high/critical); `dotnet list package --vulnerable --include-transitive` (0 vulnerable, all 8 projects). No builds/servers/browsers. Round-3 report read first. Reports NEW or still-open NON-deferred only.

---

## Round-3 status — sustained

Round-3 was ZERO FINDINGS (all round-2 items — D24 mobile supabase env-or-throw, D23 BFF Zod-parse, D23 BFF log-on-500 — resolved; round-1 D20 deletion rate-limits + `underscore` HIGH + OpenMcdf all clean). Re-verified those anchors hold:
- **Cookie flags** `apps/web/lib/auth-api.ts:11-13` — `httpOnly: true`, `sameSite: 'strict'`, `secure: true` (unconditional), `path: '/'`. PASS.
- **Bearer never reaches client** — verify-code/google strip `token`+`refreshToken` before responding; cookies set server-side. Web auth store holds no token. PASS.
- **Mobile tokens SecureStore-only** — `lib/secure-store.ts` expo-secure-store for `auth_token`/`refresh_token`; only AsyncStorage use is `AUTH_RETURN_URL_KEY` (a deep-link URL, not a token). PASS.
- **Deletion rate-limits** — `AuthController` `[DistributedRateLimit("auth")]` on request/confirm-deletion. PASS.

## Round-4 delta review

The round-4 commits introduced no new auth/crypto/token-handling surface. Security-relevant touches reviewed:
- `apps/web/hooks/use-profile.ts:19-21` added `writeLocaleCookie` — sets a NON-sensitive `i18n_locale` preference cookie with `samesite=strict;path=/` (no `httpOnly` needed; it is a display-language hint, not a credential, and is read by the i18n layer). Not a security finding.
- `apps/web/hooks/use-chat-pending-operations.ts` + `apps/mobile/hooks/use-pending-operation-execution.ts` (extracted from `useChatComposer`) — route step-up/confirm/execute through the existing Server Actions / `apiClient`; the agent step-up challenge + confirmation-token flow is unchanged from the pre-split inline code (behavior-preserving extraction). No token leaked to logs/client; errors mapped through `getErrorMessage`. PASS.
- `apps/web/lib/auth-proxy.ts` — `buildEmailLogContext` was REMOVED (dead). The remaining `logAuthRouteFailure` still logs server-side only (route, requestId, error) without leaking to the client response. PASS.
- The web chat send still goes to the BFF `/api/chat/stream` route (cookie-bearing proxy); the mobile send uses `apiClient` (Bearer from SecureStore). No upstream API URL exposed client-side beyond `EXPO_PUBLIC_API_BASE` (public by design). PASS.

## Fresh checks — non-findings (evidence of correctness)

- **XSS:** the 4 web `dangerouslySetInnerHTML` sites unchanged and sanitized — `markdown.tsx` DOMPurify fixed allowlist; `app-overlay.tsx` `escapeHtml` + DOMPurify `ALLOWED_TAGS: ['a']`; `retrospective-card.tsx` via the same renderer; `layout.tsx` static theme bootstrap. PASS.
- **CSRF:** state-changing routes POST/PUT/DELETE bound to the sameSite=strict cookie; `session` GET read-only. PASS.
- **API authz coverage:** only `OAuthController` lacks class-level `[Authorize]` (auth-issuance, public-by-design PKCE S256 + redirect-host allowlist). PASS.
- **IDOR / ownership:** SkipHabit (the round-4-touched command) enforces `UserId` ownership — `SkipHabitCommandHandlerTests.Handle_WrongUser_ReturnsFailure` asserts `HabitNotOwned`; the goal/tag/user-fact batched fetches all carry `UserId == request.UserId` in the predicate (`BulkDeleteUserFactsCommand.cs:26`, `AssignTagsTool.cs:117`, `CreateHabitTool.cs:305`). No IDOR introduced by the batching. PASS.
- **SQL injection:** zero `FromSqlRaw`/`ExecuteSqlRaw`/`FromSqlInterpolated` in `src`; the new batched queries use EF Core LINQ `.Contains(...)` (parameterized). PASS.
- **Public-env secrets:** client-consumed env still limited to `*_SUPABASE_URL`, `*_SUPABASE_*_KEY`, `EXPO_PUBLIC_API_BASE`. No server secret behind a public var. PASS.

## Dependency advisories

- **npm audit (`--omit=dev`):** 0 critical / 0 high / 12 moderate — all transitive under Expo build tooling + next/postcss = DEF-4 + DEF-5. No new non-deferred advisory.
- **dotnet `--vulnerable`:** ZERO across all 8 projects (`Orbit.Analyzers`, `Orbit.Api`, `Orbit.Application`, `Orbit.Domain`, `Orbit.Infrastructure`, 3 test projects).

---

## Verdict

**ZERO FINDINGS.**

Counts: **HIGH=0 · MED=0 · LOW=0.**

Round-3 ZERO-FINDINGS posture sustained. Round-4 introduced no new credential/token/crypto surface — the locale cookie is a non-sensitive preference; the extracted pending-operation hooks preserve the prior step-up/confirm/execute flow; the dead `buildEmailLogContext` helper was removed. All fresh checks (cookies, bearer isolation, SecureStore, XSS×4, CSRF, authz, IDOR on batched queries, SQLi, public-env) PASS. Dependency posture unchanged: npm 12 moderate / 0 high (DEF-4/5), dotnet 0 vulnerable.
