# Sweep 06 — Code Quality (the 10 Code Standards) — issue #107, ROUND 5 (final verification)

Date: 2026-06-13 · Read-only verification of committed baselines.
- orbit-ui-mobile: `main` @ **3520d10** (clean working tree).
- orbit-api: **fcfdc95** (clean working tree).

Method:
- `npm run type-check` (turbo, 3/3 green — FULL TURBO cache replay, clean) + `turbo run lint --force` (3/3 green, **uncached**, zero warnings — shared/web `eslint .`, mobile `expo lint`).
- Rule-7 TS: `measure-fns.mjs` (TS-AST line-span of every Function/Arrow/Method node, excludes `__tests__`/`.test`/`.d.ts`) → 214 nodes >100L. Reconciled each against the full register (`wave3-deferrals.md` + `round-4-deferrals.md` + `round-3/06-quality.md` + `round-3-guidance.md`) via `round-5/reconcile.mjs` (per-path registered-name matching; parenthesis-tolerant paths). Literal-bodied (`StyleSheet.create`/data/store factories) and `(anon)` non-logic nodes excluded per calibration.
- Rule-7 C#: `round-5/measure-cs.mjs` (brace-depth body measurer; excludes test projects, EF `Migrations/`, `.Designer.cs`). Validated non-no-op (detects 17 methods >60L; largest 94L).
- Rule-10: `measure-dup.mjs` (normalized web↔mobile body dup ≥300 chars) + direct grep of `highlightText` imports both platforms.
- Rules 2/3/4/5: fresh grep of the round-3 still-open survivors against current source.

Deferral registers honored in full: DEF-1..DEF-8, DEF-2b, every `DEFER:root` / `SKIP:not-a-function` / `DEFER:adapter` in the register (270 file:line tokens / 209 path tokens parsed). dotnet/tests NOT run (per scope).

## Headline: every round-3 still-open finding is RESOLVED or correctly registered. ZERO new findings.

- **Rule 7 (TS): zero UNregistered >100L functions.** 214 measured − 22 literal-bodied (SKIP) − 4 `(anon)` non-logic (all SKIP-registered) = 188 named functions, **all** reconcile to DEF-2b / DEFER:root / registered SPLIT-child. The round-4 closure claim ("zero unregistered apps/web + apps/mobile >100L functions") holds against the current tree.
- **Rule 7 (C#): zero methods >100L.** Largest is 94L (`AgentCatalogService.SessionLifecycleOperations`). Confirms round-2's 11 C# rule-7 fixes still hold.
- **Rule 10: highlightText now consumes shared on BOTH platforms.** The only ≥300-char body that lifted cleanly. Remaining 29 ≥300-char identical bodies are all DEFER:adapter (genuine platform adapters). Zero new finding.
- **Rule 2: all 5 round-3 dead-export survivors DELETED** (`getCachedConnectivity`, `claimAdReward`, `useInvalidateSummary`, `buildEmailLogContext`, `SectionThemeProps` — zero matches in any `.ts`/`.tsx`; only sweep-doc mentions remain).
- **Rules 3 / 4 / 8 / 9: clean** (no `any` in prod, no `console.log` in prod source, round-2 rule-8/9 fixes intact).
- **Rule 5: the 2 lint-exempt config comments persist** (next.config.ts HSTS narration; eslint.config.js react-hooks WHY block — both without URLs, both outside `local/no-comments` scope). Unchanged LOW residual.

---

## Findings

### Rule 5 — comments in lint-exempt config files (still open, both round-3 items; LOW)

- LOW · apps/web/next.config.ts:17 · rule 5 · narration WHY without URL ("HSTS: 2 years, include subdomains. Production traffic is HTTPS-only via Vercel.") in a config file outside the `local/no-comments` glob — delete or attach an upstream doc link.
- LOW · apps/mobile/eslint.config.js:7-10 · rule 5 · WHY block ("eslint-config-expo@55 ships react-hooks v5 …") has no URL on the block (line 1 `// https://docs.expo.dev/…` is URL-bearing → allowed; the 7-10 block is not) — add the upstream issue link or delete.

These are the only open code-quality findings; both are pre-existing LOW residuals carried from round-3, both in files the comment linter does not police, and both explain a real upstream constraint (just without a link). No autofix removes them; they require a human delete-or-link decision.

---

## Rule 7 reconciliation detail (the crux)

### (a) Unregistered >100-line functions: ZERO.

`reconcile.mjs` initially surfaced 4 named functions whose exact `path:line` was not a register token. All 4 are explicitly named SPLIT-children in `wave3-deferrals.md` prose (confirmed by direct grep + Read), not unregistered:

| measured | file:line | fn | register entry |
|---|---|---|---|
| 173 | apps/mobile/components/habits/habit-detail-drawer.tsx:118 | `HabitDetailContent` | wave3:60 — "HabitDetailContent[156, section list] … stays ~156 as a flat data-driven section list (further splits = trivial SettingsRow fragments)" |
| 144 | apps/mobile/app/retrospective.tsx:301 | `RetrospectiveContent` | wave3:44 — SPLIT to 5 pieces incl. "RetrospectiveContent[132]" |
| 130 | apps/mobile/components/ui/create-api-key-modal.tsx:141 | `ApiKeyCreateForm` | wave3:54 — SPLIT to 3 pieces incl. "ApiKeyCreateForm[111]" |
| 101 | apps/mobile/components/habits/habit-row.tsx:464 | `HabitRowTrailing` | wave3:57 — SPLIT to 3 pieces incl. "HabitRowTrailing[status control + menu button]" |

Three grew modestly since registration (HabitDetailContent 156→173, RetrospectiveContent 132→144, ApiKeyCreateForm 111→130). Read directly: each is a **pure presentational child** (15/11/18 destructured props respectively, single `return`, no control-flow logic) — the growth is added JSX rows, introducing **no new clean seam**. Splitting further yields the trivial fragments the register already anticipated. NOT findings.

The 4 `(anon)` non-literal nodes are all SKIP-registered: `(tabs)/index.tsx:1030` (useMemo-returns-JSX inside DEF-2b TodayScreen), `auth-store.ts:177` (`create<AuthState>()` Zustand factory), `calendar-sync/page.tsx:544` (`.map()` inline list renderer — wave3:349), `fresh-start-animation.tsx:41` (useEffect body inside the registered FreshStartAnimation root). NOT findings.

### (b) Illegitimate-defer spot-checks: ZERO illegitimate.

Read 6 of the largest registered roots/children to test whether any "obviously decomposes" into a clean presentational/logic seam beyond what's already extracted:

- **CalendarSyncScreen** (645, DEFER:root) — the `step` discriminated-union state machine driven by 3 effects (focus refetch / review-suggestions sync / events sync) + shared handlers all reading the same `events`/`selectedIds`/tokens. Per-step screens would thread 10+ props each. **Legitimate.**
- **UpgradeScreen** (592, DEFER:root) — coupled billing-state root: hooks + 5 useState + derived booleans (`showBilling`/`showsProPanel`/`showGradient`) + checkout handlers feeding the in-component render closures the register names. **Legitimate.**
- **AiSettingsScreen** (545, DEFER:root) — two optimistic toggle mutations (exactly 2 uses, below rule-6 third-use threshold) + facts list/selection/pagination bound to one screen's query+local state; the web twin only split because web pages co-locate `_components`. **Legitimate.**
- **RetrospectiveContent / ApiKeyCreateForm / HabitDetailContent** (the grown SPLIT children above) — pure prop-threaded presentational units. **Legitimate.**

No registered root spot-checked shows an obvious clean seam left on the table.

---

## Confirmed RESOLVED since round 3 (do NOT re-report)

- **Rule 2 (all 5 survivors deleted):** `apps/mobile/lib/offline-runtime.ts` `getCachedConnectivity`; `apps/web/app/actions/subscription.ts` `claimAdReward`; `apps/web/hooks/use-summary.ts` `useInvalidateSummary`; `apps/web/lib/auth-proxy.ts` `buildEmailLogContext`; `apps/mobile/components/habits/habit-form-fields/types.ts` `SectionThemeProps` — zero references in any source file; only sweep-doc mentions remain.
- **Rule 10 (highlightText):** both `apps/web/components/ui/highlight-text.tsx:3` and `apps/mobile/components/ui/highlight-text.tsx:3` now `import { highlightText } from '@orbit/shared/utils'`. Absent from the ≥300-char dup list (was 699 in round-3).
- **Rule 7 C#:** 0 methods >100L (largest 94). Round-2's 11 fixes hold.

## Evaluated — NOT findings

- **Rule 10 remaining 29 ≥300-char web↔mobile bodies:** all DEFER:adapter (optimistic-cache `onMutate` ×N for tags/checklist-templates/goals/notifications, `useTagSelection`/`useDismissGuard` wrappers [cores already shared D33], `onCodeInput`, `queuePendingNotificationDelete`, `findCachedGoals`, tour-mock `restore`, `setGeneral`, and onboarding/goal/habit/chat anon view/handler pairs). Each lives inside a platform-specific hook/component (mobile apiClient + SQLite offline queue + RN primitives vs web Server Action + cookie + DOM); lifting the body alone drags platform I/O across the seam or leaves a net-negative 1-line wrapper. The two heaviest cores (tag-selection, dismiss-guard) were already lifted. Whole-wrapper lifting is a cross-repo refactor touching both platforms' twins — out of a verification pass's scope, and sanctioned as D12 adapters.
- **Rule 7 C# 80–94L capability/handler methods** (`AgentCatalogService.*Capabilities`, `HandlePlayNotificationCommand.Handle` 92, `CreateHabitCommand.Handle` 85): all under the 100-line cap; the `*Capabilities` methods are list-of-capability-object builders (data-shaped). Not flagged.
- **Rule 4 `console.log` grep hits:** all in `.md`/`.mjs`/`.cjs`/`.yml` tooling, sweep scripts, CLAUDE.md, and release scripts — zero in production `.ts`/`.tsx` source.
- **Rule 5 config comments** are reported above as the only open findings; all in-app `//` narration remains lint-stripped (no autofix violations surfaced in the uncached lint run).

## Verdict

| Severity | Count | Breakdown |
|---|---|---|
| HIGH | 0 | — |
| MED  | 0 | — |
| LOW  | 2 | rule 5: 2 lint-exempt config-file comments without URLs (next.config.ts HSTS; eslint.config.js react-hooks block) — unchanged round-3 residual |
| **Total** | **2** | |

Zero-finding checks (all clean): rule 7 TS (214 measured → 0 unregistered; 4 SPLIT-children + 4 anon all registered; 6 largest roots spot-checked legitimate), rule 7 C# (0 >100L, largest 94), rule 10 (highlightText shared both platforms; 29 residuals all sanctioned DEFER:adapter), rule 2 (all 5 round-3 dead exports deleted), rule 3 (`any`), rule 4 (`console.log`/`Console.Write`), rule 8, rule 9, type-check (3/3 FULL TURBO), lint (3/3 uncached, zero warnings).

The 2 LOW rule-5 config comments are the **only** open code-quality items in either repo — both pre-existing, both in comment-linter-exempt config, both a delete-or-add-URL human call.
