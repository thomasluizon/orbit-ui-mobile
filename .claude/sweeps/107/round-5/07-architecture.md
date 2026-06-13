# Sweep #7 — Architecture conformance, issue #107 ROUND 5 (final verification)

Read-only. Baselines: ui-mobile `3520d10`, orbit-api `fcfdc95` (both committed green). Only objective violations of WRITTEN rules in the per-workspace `CLAUDE.md` files. Every item re-read in the current tree. Uncertain → not a finding. `checkout` route NOT flagged (geo-pricing X-Forwarded-For). Round-3 report read first. Reports NEW or still-open NON-deferred only.

Format: `SEVERITY · file:line · rule · fix`.

---

## Round-3 still-open items — all 3 CONFIRMED FIXED

| Round-3 item | Round-5 result | Evidence |
|---|---|---|
| MED `app/actions/tags.ts` · 5 raw `/api/` literals | **FIXED** | File now `import { API } from '@orbit/shared/api'` (`:3`) and uses `API.tags.list/.create/.update(tagId)/.delete(tagId)/.assign(habitId)` (`:7,14,25,32,41`). Zero raw literals. |
| MED `app/actions/support.ts` · 1 raw `/api/support` literal | **FIXED** | `import { API }` (`:3`); `API.support.send` (`:8`). |
| LOW `hooks/use-chat-composer.ts` · chat-stream client `fetch` undocumented | **FIXED** | Two-part fix: (1) `apps/web/CLAUDE.md` "All mutations through Server Actions" line now lists "Sanctioned exceptions: … (2) the SSE chat send in `hooks/use-chat-composer.ts` fetches the BFF chat-stream route directly because a Server Action cannot return a streaming `ReadableStream`."; (2) `useChatComposer` carries a JSDoc (`use-chat-composer.ts:80-85`) stating "The streaming send is the one sanctioned client-side `fetch` … see apps/web/CLAUDE.md." |

`git diff 6399d00 3520d10 -- apps/web/app/actions` confirms zero remaining raw `/api/` literals in the Server Actions directory.

---

## Round-4 split — new files re-checked (no new violations)

The round-4 commit decomposed three large units. All extracted files conform:
- `apps/web/app/(chat)/chat/chat-composer-bar.tsx:457` `export function ChatComposerBar`, `chat-empty-state.tsx:13` `export function ChatEmptyState` — named exports, no raw `fetch`, no `'use client'` violation (presentational, wired into `page.tsx:18-19,122,140`).
- `apps/web/hooks/use-chat-image-attachment.ts:12` / `use-chat-pending-operations.ts:23` — named exports; pending-ops routes through the chat Server Actions (`@/app/actions/chat`), NOT raw fetch.
- `apps/mobile/app/calendar-sync-auto-section.tsx:30` `export function CalendarAutoSyncSection`, `calendar-sync-styles.ts` (StyleSheet) — named exports.
- `apps/mobile/hooks/use-pending-operation-execution.ts:35` — named export; all four pending-op calls go through `apiClient` (`API.ai.pendingOperation*`), not raw `fetch`. Conforms to apps/mobile/CLAUDE.md "All mutations through `apiClient`."

Dead exports removed this round (rule-2): `use-summary.ts#useInvalidateSummary`, `subscription.ts#claimAdReward`, `offline-runtime.ts#getCachedConnectivity`, `auth-proxy.ts#buildEmailLogContext` — all confirmed zero importers tree-wide (grep returned no matches). `highlightText` web-local copy deleted; both platforms now import the shared `@orbit/shared/utils` core.

---

## Re-verified clean (fresh)

- **No NEW raw `/api/` literals in production code.** Tree-wide grep for `['"`]/api/` in `apps/**/*.{ts,tsx}` resolves only to: `apps/web/app/actions/*` (now zero — all `API.*`); the documented BFF auth-route exceptions (`stores/auth-store.ts:35,67` session/logout; `app/(auth)/login/use-login-flow.ts:105,128,163` send-code/verify-code — `app/api/auth/*` cookie flows, CLAUDE.md exception (1)); `proxy.ts:79` path-guard; and `__tests__/**` files asserting apiClient/serverAuthFetch args with path strings (round-3 calibration: tests are not a contract surface). No production hook/component reintroduced a literal.
- **Named exports.** No new non-framework/non-config/non-screen `export default` in `apps/web/hooks`, mobile, or shared (greps empty). The round-4 extracted files all use named exports.
- **Shared purity (Check 7):** zero `react`/`react-dom`/`next`/`react-native`/`expo` imports in `packages/shared/src`; `highlightText` lift into shared added no framework dependency. Clean.
- **API layer boundaries (Check 8):** `fcfdc95` touched only `Orbit.Application` command/tool files + tests — no `Orbit.Domain`/`Orbit.Application` upward `using` introduced. orbit-api: ZERO architecture findings, sustained.
- **`'use client'`:** the round-3 set stays fixed; the new extracted client hooks (`use-chat-image-attachment`, `use-chat-pending-operations`) legitimately need the directive (refs/state). No pure-render component flagged.

---

## Verdict

**ZERO FINDINGS.** (Down from round-3's 3.)

- **orbit-ui-mobile: ZERO.** Both round-3 MED (tags.ts, support.ts → `API.*`) and the round-3 LOW (chat-stream exception undocumented in both CLAUDE.md and the hook JSDoc) are RESOLVED. The round-4 split introduced no new layer/export/path violations; four dead exports were removed.
- **orbit-api: ZERO** (sustained from round-3; the round-4 commit changed no controllers and respected the layer boundaries).
