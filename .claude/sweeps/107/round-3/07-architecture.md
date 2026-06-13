# Sweep #7 — Architecture conformance, issue #107 ROUND 3 (verification)

Baseline: ui-mobile `6399d00`, orbit-api `dec5bcc` (both green). Only objective violations of WRITTEN rules in the per-workspace `CLAUDE.md` files. Every item re-read directly in the current tree. Uncertain → not a finding. `checkout` route NOT flagged (forwards X-Forwarded-For for geo-pricing). Reports NEW or still-open NON-deferred only.

Format: `SEVERITY · file:line · rule · fix`.

---

## Round-2 fixes — verification

| Check | Round-2 status | Round-3 result |
|---|---|---|
| 1 web mutation path | 1 LOW (chat-stream doc) open | **still 1 LOW** (below) |
| 2 mobile raw fetch | 2 MED + 1 LOW open | **all 3 FIXED** |
| 3 hardcoded API paths | 7 MED (50 literals) open | **5 files FIXED; 2 files / 6 literals still open** |
| 4 query keys | 1 MED + 2 LOW open | **all FIXED** |
| 5 named exports | 1 LOW (i18n) open | **FIXED** |
| 6 unnecessary `'use client'` | 6 LOW open | **all 6 FIXED** |
| 7 shared purity | clean | clean |
| 8 API layer boundaries + D18 | FIXED | still clean |
| 10 CQRS validators | all 6 FIXED | (unchanged) |
| 11 entity factories | clean | clean |
| 12 repository/UoW | clean | clean |

Details of round-2 items now CONFIRMED FIXED:
- **Check 2 (mobile raw fetch):** `google-auth.ts` raw fetch + hand-rolled `mergeRequestIdIntoPayload` GONE (both round-2 MEDs); `auth-store.ts` logout raw fetch GONE. The one remaining raw fetch — `auth-store.ts:125` `refreshSessionToken` → `API.auth.refresh` — now carries the required WHY JSDoc (`:105-110`: "apiClient's own 401 handler calls this function, so routing it back through apiClient would invert the dependency and lose the clearOnFailure contract"), satisfying the round-2 LOW's "WHY JSDoc or route via path-guard." Resolved.
- **Check 3 (hardcoded paths):** `habits.ts`, `profile.ts`, `goals.ts`, `notifications.ts`, `auth.ts` (deletion actions → `API.auth.requestDeletion`/`.confirmDeletion`) all migrated to `API.*`. Down from 7 files/50 literals to 2 files/6 literals (below).
- **Check 4 (query keys):** `aiKeys.capabilities()` adopted both platforms (`advanced/page.tsx:150`, `advanced.tsx:99`); `subscriptionKeys.billing()` adopted both (`use-billing.ts` web:23 / mobile:10); `habitKeys.summaryPrefix()` adopted (`use-summary.ts:76`). All resolved.
- **Check 5:** `apps/mobile/lib/i18n.ts:7` now `export const i18n = i18next`. Resolved.
- **Check 6:** all 6 flagged components (`streak-sections.tsx`, `achievement-category-section.tsx`, `date-group-section.tsx`, `habit-detail-sections.tsx`, `profile-nav-icon.tsx`, `local-image.tsx`) no longer start with `'use client'`. Resolved.

---

## STILL-OPEN findings

### Check 1 — web mutation path

- **LOW · `apps/web/hooks/use-chat-composer.ts:453` · apps/web/CLAUDE.md "All mutations through Server Actions … Never call the API from a client component."** The client hook `fetch(API.chat.stream, …)` (streaming can't return from a Server Action — platform-forced). The mobile twin documents this (`lib/chat-stream.ts` JSDoc) and the auth/session exception is documented in CLAUDE.md, but the web streaming exception is **still undocumented** — no JSDoc on the hook and "chat stream" was not added to the apps/web/CLAUDE.md exception sentence. **STILL OPEN** (round-2 LOW unfixed). Fix: one JSDoc line on the hook OR extend the apps/web/CLAUDE.md exception sentence.

### Check 3 — hardcoded `/api/` literals (the only sizeable remaining cluster)

5 of the 7 round-2 action files were migrated; 2 remain raw and do not import `API`. Each path already exists in `packages/shared/src/api/endpoints.ts` — every fix is "swap literal → existing constant."

- **MED · `apps/web/app/actions/tags.ts` · 5 literals (lines 6, 13, 24, 31, 40).** File does not import `API`. Maps to `API.tags.list` (`:71`) / `.create` (`:72`) / `.update(tagId)` (`:73`) / `.delete(tagId)` (`:74`) / `.assign(habitId)` (`:75`) — all defined.
- **MED · `apps/web/app/actions/support.ts` · 1 literal (line 7).** File does not import `API`. `'/api/support'` → `API.support.send` (endpoints.ts:142).

Mobile: zero hardcoded `/api/` literals in production code (test files assert apiClient args with path strings — not a finding).

---

## Re-verified clean (fresh)

- **Check 7 — shared purity:** zero `react`/`react-dom`/`next`/`react-native`/`expo` imports in `packages/shared/src`; zero `export default`. Clean.
- **Check 8 — API layer boundaries:** `Orbit.Domain` has zero `using Orbit.Application|Infrastructure|Api` and zero `Microsoft.EntityFrameworkCore`; `Orbit.Application` has zero `using Orbit.Infrastructure|Api`. D18 Infrastructure CLAUDE.md reword from round-2 stands. orbit-api: ZERO open architecture findings.
- **Named exports / `export default`:** no new non-framework/non-config/non-screen `export default` in mobile or shared.
- **`'use client'`:** the 6 round-2 targets fixed; no new pure-render component flagged in spot-checks. (161 files carry the directive; round-2 did the systematic pass — this verification confirms the flagged set resolved, not a fresh 161-file re-audit.)

---

## Verdict

**3 still-open findings — 0 HIGH · 2 MED · 1 LOW.** (Down from round-2's 14.)

- **orbit-ui-mobile (web): 3 findings — 2 MED (tags.ts 5 literals, support.ts 1 literal) + 1 LOW (chat-stream exception undocumented).**
- **orbit-api: ZERO open architecture findings** (sustained from round-2).

Confirmed-fixed since round-2: mobile raw-fetch cluster (3), 5 of 7 hardcoded-path action files (44 literals), query-key factory adoption (aiKeys/billing/summary, both platforms), i18n named export, all 6 unnecessary `'use client'` directives. If the remaining hardcoded-path miss is counted per literal instead of per file, it is 6 string replacements across 2 files.
