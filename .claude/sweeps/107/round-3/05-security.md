# Sweep #5 — Security, issue #107 ROUND 3 (verification)

READ-ONLY re-audit. Baseline: ui-mobile `6399d00`, orbit-api `dec5bcc` (both green).
Commands run: `npm audit --workspaces --include-workspace-root` (12 moderate, 0 HIGH/CRITICAL); `dotnet list package --vulnerable --include-transitive` (0 vulnerable, all 8 projects). No builds/servers.
Reports NEW or still-open NON-deferred findings only.

---

## Round-2 findings — verification (all 3 FIXED)

| Round-2 item | Decision | Round-3 status | Evidence |
|---|---|---|---|
| Mobile supabase env-or-throw | D24 | **FIXED** | `apps/mobile/lib/supabase.ts:12-17` reads `process.env.EXPO_PUBLIC_SUPABASE_URL` / `_PUBLISHABLE_KEY` only and `throw new Error('Supabase config missing')` if absent. The hardcoded `??` URL + publishable-key fallbacks are GONE — now mirrors `apps/web/lib/supabase.ts:7-9` exactly. |
| BFF auth routes Zod-parse | D23 | **FIXED** | `send-code:22` `sendCodeRequestSchema.safeParse`, `verify-code:24` `verifyCodeRequestSchema.safeParse`, `google:24` `googleAuthRequestSchema.safeParse` — each returns 400 `'Invalid request'` on failure before forwarding. `session` takes no body (GET) — N/A, correct. |
| BFF auth routes log-on-500 | D23 | **FIXED** | All four route `catch` blocks now call `logAuthRouteFailure(<route>, requestId, error)` (send-code:57, verify-code:62, google:62, session:19) via the new shared `lib/auth-proxy.ts` helper — server-side log without leaking detail to the client (still returns generic `'Authentication failed'` / `{ expiresAt: null }`). |
| Deletion endpoints rate-limited | D20 | **FIXED** (confirmed) | `AuthController.cs` `[DistributedRateLimit("auth")]` on the deletion actions (request-deletion + confirm-deletion). |
| `underscore` HIGH gone | D14 | **FIXED** (confirmed) | root `package.json:68` `"underscore": "^1.13.8"` override; `npm audit` 0 HIGH. |
| OpenMcdf advisories gone | — | **FIXED** (confirmed) | `dotnet list --vulnerable` CLEAN across all 8 projects. |

---

## Findings (STILL-OPEN)

**ZERO FINDINGS.** All three round-2 security findings (D24, D23 Zod-parse, D23 log-on-500) are resolved, and the fresh checks below surface no new first-party security issue.

---

## Fresh checks — non-findings (evidence of correctness)

- **Cookie flags:** `apps/web/lib/auth-api.ts:11-13` — `httpOnly: true`, `sameSite: 'strict'`, `secure: true` (unconditional), `path: '/'`. PASS.
- **Bearer never reaches client:** verify-code:57 / google:57 strip `token`+`refreshToken` from the JSON (`...safeResponse`) before responding; cookies set server-side via `setSessionCookies`. Web auth store holds no token. PASS.
- **Mobile tokens (SecureStore-only):** `lib/secure-store.ts:1-27` uses expo-secure-store exclusively for `auth_token`/`refresh_token`. The only AsyncStorage usage (`lib/auth-flow.ts`) stores `AUTH_RETURN_URL_KEY` (a deep-link return URL) — not a token. PASS.
- **XSS:** all 4 web `dangerouslySetInnerHTML` sites sanitized. `markdown.tsx:40-43` DOMPurify with fixed `ALLOWED_TAGS`/`ALLOWED_ATTR` (no scripts/handlers); `app-overlay.tsx:312` renders `linkifyText(description)` which `escapeHtml`s each part (`:31`) then `DOMPurify.sanitize` with `ALLOWED_TAGS: ['a']` only (`:38`); `retrospective-card.tsx:85` via the same `renderMarkdown`; `layout.tsx:101` is a static `JSON.stringify`'d theme bootstrap (no user input). PASS.
- **CSRF:** state-changing routes are POST/PUT/DELETE bound to the sameSite=strict cookie; `session` GET is read-only. PASS.
- **API authz coverage:** only `OAuthController` lacks class-level `[Authorize]` — an auth-issuance surface (OAuth login/callback, public by design with PKCE S256 + redirect-host allowlist). AuthController guards sensitive actions and rate-limits public ones (`[DistributedRateLimit("auth")]`). PASS (matches round-2's 17/19 class-level pattern).
- **IDOR / ownership:** spot-checked `UpdateHabitCommand` (`:54/:58` + linked-goal guard `:123`), `DeleteGoalCommand:25`, `GetGoalByIdQuery:49` — all enforce `UserId == request.UserId` in the predicate. No IDOR. PASS.
- **SQL injection:** zero `FromSqlRaw`/`ExecuteSqlRaw`/`FromSqlInterpolated` in `src`. All access via EF Core LINQ. PASS.
- **NEXT_PUBLIC / EXPO_PUBLIC secrets:** client-consumed env limited to `*_SUPABASE_URL`, `*_SUPABASE_ANON_KEY`/`_PUBLISHABLE_KEY`, `EXPO_PUBLIC_API_BASE` — all public-by-design (RLS is the real boundary). No server secret behind a public env var. PASS.

---

## Dependency advisories

- **npm audit (orbit-ui-mobile):** 12 moderate, 0 HIGH/CRITICAL. All transitive under Expo build tooling (`@expo/config-plugins`/`xcode`/`@expo/cli` chain — build-time, iOS-prebuild). Covered by DEF-4 (expo matrix bump) + DEF-5 (postcss-in-next). Not re-reported. The 2 round-1 `underscore` HIGH remain resolved by the root override.
- **dotnet list --vulnerable (orbit-api):** CLEAN — "no vulnerable packages" across all 8 projects. The round-1 OpenMcdf MODERATEs remain resolved.

---

## Verdict

**ZERO FINDINGS.**

Counts: **HIGH=0 · MED=0 · LOW=0.**

All three round-2 security findings resolved: D24 mobile supabase env-or-throw ✓, D23 BFF Zod-parse ✓, D23 BFF log-on-500 ✓. Round-1 fixes hold: D20 deletion rate-limits ✓, `underscore` HIGH gone ✓, OpenMcdf clean ✓. All fresh checks (cookies, bearer isolation, SecureStore, XSS×4, CSRF, authz, IDOR, SQLi, public-env secrets) PASS. Dependency posture unchanged: npm 12 moderate / 0 HIGH (DEF-4/5), dotnet 0 vulnerable.
