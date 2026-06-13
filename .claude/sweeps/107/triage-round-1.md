# Round-1 triage — issue #107 (authoritative for all fix agents)

Reports live in `.claude/sweeps/107/round-1/*.md` + `seed-findings.md`. Every fix agent MUST read the reports relevant to its scope and fix every finding whose file falls in its ownership globs, applying the decisions below. When a report suggestion conflicts with a decision here, the DECISION wins.

## Global rules (all agents)

- Cross-platform parity: every frontend fix lands in BOTH apps/web AND apps/mobile.
- i18n keys: do NOT edit en.json/pt-BR.json. Write additions to `.claude/sweeps/107/i18n-additions/<your-agent-name>.json` as `{ "dot.key.path": { "en": "...", "pt": "..." } }`. Reference keys in code immediately (merge happens centrally).
- Code standards: the 10 CLAUDE.md rules apply to every line you write. No narration comments. No `any`. Behavior-asserting tests.
- Tests: cover your area's sweep-9 gaps + new logic you introduce. Low-entropy fixture strings only.
- You may run targeted `npx vitest run <paths>` and `npx tsc --noEmit` per workspace; full validation is central afterwards. Do NOT run `npm install` (only the DEPS agent does), do NOT commit, do NOT touch files outside your ownership.
- If you believe a finding must be deferred instead of fixed, do NOT silently skip: list it in your final report with a one-line justification for the register.

## Decisions

- **D1** `API.notifications.pushToken`: DELETE the constant (zero usages verified; web-push `subscribe` is the real path). No backend route.
- **D2** config drift: API is canonical. `appConfigSchema.settings` → `{ syncIntervalSeconds: z.number(), syncMaxBatchSize: z.number() }`. Migrate any consumer of the old fields to existing shared constants. Update DEFAULT_CONFIG, factories, tests.
- **D3** error codes end-to-end: backend — every `Result.Failure` carries a stable code (extend `ErrorMessages`/error catalog; controllers stop hand-rolling `new { error = ... }` and use `ResultActionResultExtensions` uniformly; keep English message as fallback text). FluentValidation `.WithMessage` keeps text but validators' error payloads flow through the same errorCode emission where the extension supports it. Client — `getErrorMessage` resolves `errorCode` → i18n key (map in packages/shared), falls back to server text; `AUTH_BACKEND_ERROR_MAP` re-keyed to codes.
- **D4** fg-4 contrast: usage migration, not ramp change. Placeholders + any text <24px using fg-4 → fg-3 (central defaults in field-input/app-text-input/.form-input + the usage list in 04-a11y.md). fg-4 stays for decorative icons/disabled.
- **D5** `--fg-on-primary` becomes scheme×mode-resolved: white where white passes AA on the accent; ink `rgb(2,6,24)` where it fails (compute per scheme×mode; expected fails: green/orange/cyan both modes, blue/rose dark). Web globals.css per-scheme blocks + `createTokensV2` + shared acceptance test + one DESIGN.md hand-tune line.
- **D6** status text contrast: add `--status-overdue-text` / `--status-bad-text` per mode (AA-passing darker variants; light overdue ≈ darken until ≥4.5 on #F8FAFC). Dots/icons keep canonical values (3:1 non-text passes). Text usages migrate to the -text tokens. DESIGN.md amended.
- **D7** DESIGN.md gradient-surface list += Calendar, Chat (ratify #164 shipped reality).
- **D8** DESIGN.md ratifies SVG `stroke-dashoffset` ring/progress animation as sanctioned (paint property).
- **D9** layout-prop animations → compliant rewrites on BOTH platforms: progress dots width → `scaleX` (fixed-width track); refetch indicator height → `scaleY`; collapsible/advanced-section grid-rows + LayoutAnimation → instant container with opacity+translateY content entrance.
- **D10** web `themeColor` literal: resolve per mode via Next viewport `themeColor` media array; remove the raw slate literal from layout metadata.
- **D11** function-size: wave-3 splits everything >100 lines EXCEPT named orchestration cores (deferral DEF-2b): `HabitList` main (web+mobile), `TodayScreen` (mobile (tabs)/index.tsx), `ProfileScreen` (mobile (tabs)/profile.tsx). `useChatComposer` both platforms: ATTEMPT a sub-hook split; defer only if it genuinely resists. Splits must be behavior-identical; tests stay green.
- **D12** DRY: byte-identical ≥300-char web↔mobile duplications lift to packages/shared as framework-free cores (chat-composer-core precedent; React hooks → shared core + thin platform wrappers). <300 chars: leave (DEF-8, rule 6).
- **D13** dead Zod exports: delete ONLY when schema AND its inferred type have zero external importers (barrel re-export consumed elsewhere counts as an importer). Schemas backing an imported type stay.
- **D14** expo matrix bump → DEFER (DEF-4). `underscore` HIGH → FIX now via root `overrides: { "underscore": "^1.13.8" }`.
- **D15** postcss-nested-in-next → DEFER (DEF-5, no fixed upstream).
- **D16** Stripe.net 50→52 → DEFER (DEF-6). JWT patch bumps (JsonWebTokens 8.19, JwtBearer 10.0.9) → FIX. coverlet/Test.Sdk majors → FIX (test-only). xunit v3 → DEFER (DEF-7).
- **D17** web auth-mutations-via-BFF-routes: sanctioned platform exception — document in apps/web/CLAUDE.md (cookie-setting auth/session endpoints use BFF routes; Server Actions remain the rule otherwise).
- **D18** Infrastructure CLAUDE.md "DbContext is the only thing that knows about EF" claim → rewrite to reality (Application composes EF queries; Infrastructure owns context/migrations/EF plumbing).
- **D19** apps/web/CLAUDE.md Server-Action sample: drop the unused `revalidateTag` convention lines (TanStack invalidation is the practice).
- **D20** add `[DistributedRateLimit]` to request-deletion + confirm-deletion endpoints (issue agent-5 names account deletion).
- **D21** mobile `tailwind.config.js`: if nativewind absent from deps → delete the file (+ orphaned tailwind devDep); else strip drifted token literals.
- **D22** ONE new EF migration (orbit-api) containing: (a) the idempotent `CREATE INDEX IF NOT EXISTS` ops from orphan `20260410235000_AddPerformanceIndexes.cs` (then DELETE the orphan file), (b) the new `(UserId, CreatedAtUtc DESC)` notifications index. Proper `dotnet ef migrations add AdoptPerformanceIndexes` scaffold so Designer + snapshot stay coherent.
- **D23** the 3 public BFF auth routes + session route: Zod-parse request bodies at the boundary; on 500 log server-side (no client detail).
- **D24** mobile `lib/supabase.ts`: env-or-throw (remove `??` literal fallbacks), mirroring web.
- **D25** Today/Calendar horizontal swipe: migrate PanResponder → RNGH `Gesture.Pan` (worklet). Note in PR body for user visual QA.
- **D26** dnd-kit: add KeyboardSensor + sortableKeyboardCoordinates to habit + checklist reorder (web).
- **D27** web overlay-stack: register app-date-picker, emoji picker, DescriptionViewer as stack layers (ESC resolves top-most, LIFO); ConfirmDialog restores focus to trigger; ControlsMenu gets focus-in/arrow/Home/End/restore parity with sibling menus; level-up + tour + PushPrompt close on ESC (web) and back (mobile, one layer per press; tour back must not fall through).
- **D28** mobile global ErrorBoundary: export from root `_layout.tsx` (Expo Router contract) with designed retry screen mirroring web error.tsx; (chat) web segment gets an error.tsx too.

## Deferral register (round 1 final — re-sweeps must not report these)

- DEF-1 Lighthouse/runtime perf measurements — user-owned.
- DEF-2 file-level length of the 5 pre-justified orchestration files; **DEF-2b** function-level: `HabitList` (web `components/habits/habit-list.tsx`, mobile `components/habit-list.tsx`), `TodayScreen` (mobile `(tabs)/index.tsx`), `ProfileScreen` (mobile `(tabs)/profile.tsx`) — coupled form/dirty/mutation/bulk/drag state; rule 6 over rule 7 per issue #107 status note.
- DEF-3 version-pin matrix (worklets 0.7.2, expo overrides, hermes/memoize/promise/regenerator pins, RN junction).
- DEF-4 expo matrix 55.0.12→55.0.26 bump (moderate build-time advisories vs pinned-matrix regression risk; needs APK release-guard cycle).
- DEF-5 postcss@8.4.31 nested in next@16.2.7 (no fixed stable next).
- DEF-6 Stripe.net 50→52 major (payment surface; advisory-free).
- DEF-7 xunit 2.9.3 → v3 migration.
- DEF-8 byte-identical web↔mobile duplications <300 normalized chars (rule 6 over rule 10).

## Wave plan

- **W1 (parallel)**: API-A hot-path perf · API-B migrations/caching · API-C validators+security+nuget+tests · API-D C# splits · SHARED contract/constants/DRY-cores · CANON tokens+DESIGN.md+CLAUDE.md · DEPS npm cleanup.
- **W1.5 (exclusive API)**: ERRORS-API — D3 backend across all 101 Result.Failure sites + controllers; emits `.claude/sweeps/107/error-codes.json` (code → en text) for the client side.
- **W2 (parallel, file-partitioned)**: habits-forms · habits-today-list · goals+breakdown · auth-login(+D3 client) · chat · profile-settings · calendar+notifications · platform-shell(overlays/tour/gamification/upgrade/nav).
- **W2.5**: central i18n merge of `.claude/sweeps/107/i18n-additions/*.json` into both locales.
- **W3 (parallel)**: TS function splits >100L per D11, partitioned by directory.
- **Phase D**: central validation both repos → round-2 battery.
