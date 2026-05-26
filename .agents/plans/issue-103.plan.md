# Plan: Migrate Orbit (web + mobile) to v2 Linear-tactical design

## Summary

Direct-replacement visual migration of the entire frontend (`apps/web` Next.js 15 + `apps/mobile` Expo SDK 53) from the current "AI-default" look (Manrope, glow shadows, primary-tinted backgrounds, cards-inside-cards) to the v8 Linear-tactical chrome (Geist Sans + Geist Mono, OKLCH-tinted neutrals, hairline borders, dark mode default, Astra-headlined AI prominence, Saturn-ring celebrations). Backend (`orbit-api`) is untouched. No feature changes, no route changes, no API contract changes — only the visual layer and a small set of i18n string updates. Seven sequential phases on a single branch (`redesign/v2`), single PR.

Source-of-truth documents:
- **PRD**: `.agents/PRDs/redesign-v2.prd.md` (mirrored as GitHub issue #103 body)
- **Visual spec**: `.tmp/render/` — 12 JSX files (6,901 lines) + reference PNGs + canvas (`Orbit App.html`, 171 artboards across 23 sections)
- **Token spec**: `.tmp/render/colors_and_type.css`

This plan adds operational detail on top of the PRD: file-level inventories, parity matrix entries, validation gates, mirror snippets, and risks not already in PRD §13.

## User Story

As Thomas (sole user), I want Orbit to feel like Linear-tactical software with Astra as the headline AI assistant and Saturn-ring celebrations as the distinctive visual signature, so that the app has its own identity instead of looking like a generic AI-template habit tracker — without losing any existing feature, route, or data behavior.

## Metadata

| Field | Value |
|-------|-------|
| Type | REFACTOR (big-bang visual migration) |
| Complexity | HIGH |
| Repos | frontend only (`orbit-ui-mobile`); `orbit-api` untouched |
| Parity Required | yes (every change touches both `apps/web` and `apps/mobile`) |
| GitHub Issue | #103 |
| Label | `repo:frontend` |
| Branch | `redesign/v2` (already created) |
| Web Affected | yes |
| Mobile Affected | yes (Android only — no iOS app exists) |

## Resolved open questions (PRD §14)

All five defaults are locked:

1. **Delete `apps/mobile/lib/theme.ts` v1 entirely.** Git preserves history; no `theme-v1.ts` keep-around.
2. **Code-level identifiers stay as `chat`.** Route stays `/chat`. Only user-facing strings rename to Astra.
3. **Defer the 1024px+ two-pane Today layout.** Single column at all widths, just centered with `--app-max-w`.
4. **Astra rename is user-facing only.** Code comments and commit messages can keep "Claude".
5. **Playwright snapshot tests: delete and recreate.** Visual diff would be unreviewable. Functional E2E (the 22 specs at `apps/web/e2e/tests/*`) stay; selectors get updated where DOM shape changes.

## Architecture observations (from /prime + /plan exploration)

**The v8 spec uses inline JSX styles referencing CSS variables** (`style={{ background: "var(--bg)", color: "var(--fg-1)" }}`). This is the spec format, not the implementation. Translation rules:
- **Web**: CSS variables in `globals.css` `@theme` + Tailwind utility classes that map to those variables. Inline `style` only when a value is runtime-computed (e.g., scheme primary color).
- **Mobile**: NativeWind class names where possible; `StyleSheet.create` with theme tokens for precise styling. OKLCH not natively supported in React Native — neutrals are precomputed at scheme-switch time and stored as hex/rgb on the runtime theme.

**Component placement** — web colocates lower-level components in `apps/web/components/{feature}/` (~80 files) and route-specific ones in `apps/web/app/(app)/{route}/_components/`. Mobile mirrors this: `apps/mobile/components/` (top-level, 8 files) + `apps/mobile/components/ui/` (~19 files) + `apps/mobile/app/(tabs)/{route}/_components/`. Both `today-shell.tsx` files already exist (web at `apps/web/app/(app)/today-shell.tsx`, mobile at `apps/mobile/app/(tabs)/today-shell.tsx`) — these are the entry points for Phase 3.

**Hook layer is parity-stable**: web has 38 hooks, mobile has 41, nearly identical names. The PRD explicitly says no new hooks — none of these change unless a screen rewrite drops a feature (which it shouldn't).

**Test surface is substantial**:
- Vitest unit tests: ~80 files under `apps/web/__tests__/` (components, hooks, pages, lib, stores, actions, app routes)
- Playwright E2E: 22 specs at `apps/web/e2e/tests/01-auth.spec.ts` … `21-streak-display.spec.ts` + `20-mega-audit-smoke.spec.ts`
- Mobile: no jest setup detected — Phase 7 validation falls back to smoke-boot

**Critical breaking-change vector**: `apps/mobile/lib/theme.ts` exports `AppColors` with ~50 named fields (`primaryTintBg`, `shadowGlow*`, `primary_10/15/20/30/80`, `red500_30`, etc., lines 14-85). Every screen and component imports specific field names off this. Collapsing to ~12 semantic tokens cannot ship without simultaneous rewrites of every consumer. **The plan strategy for this is in Phase 1 risks** below.

**Web has no `tailwind.config.ts`** — uses Tailwind v4 CSS-first config via `@theme {}` block in `apps/web/app/globals.css` (lines 1-64). Token edits happen there, not in a separate config file.

**`@gorhom/bottom-sheet` Reanimated stabilizer**: per recent commit `4d27a77` and memory, providers + HabitCard need a bare `Animated.View` wrapper to keep modals' `present()` working on Android. New components replacing HabitCard must preserve this pattern; the plan flags it in Phase 2.

## High-level strategy

1. **Build the new system underneath the old screens first** (Phases 1-2). Tokens + fonts + primitives ready, but screens still reference old code paths. App boots throughout.
2. **Migrate screens top-down by usage frequency** (Phases 3-5). Today + Chat + Calendar + Profile first (Phase 3 — 80% of time spent), then drawers/sheets (Phase 4), then settings/sub-screens (Phase 5).
3. **Migrate flows and overlays last** (Phase 6) because they have the most one-off variant work.
4. **Cleanup audit + tests + ship** (Phase 7) — explicit grep gates from PRD §15.

Each phase ends with a commit. The branch is the recovery surface.

## Cross-platform parity matrix

Every change in this PR touches both apps. Below is a representative sample (full inventory lives in each phase). When a web file changes, its mobile equivalent changes in the same commit.

| Web | Mobile | Notes |
|-----|--------|-------|
| `apps/web/app/globals.css` (tokens) | `apps/mobile/lib/theme.ts` + `apps/mobile/tailwind.config.js` | shared shape derives from `packages/shared/src/theme/color-schemes.ts` |
| `apps/web/app/(app)/today-shell.tsx` | `apps/mobile/app/(tabs)/today-shell.tsx` | Today header + tabs primitive |
| `apps/web/app/(app)/page.tsx` | `apps/mobile/app/(tabs)/index.tsx` | Today body |
| `apps/web/app/(chat)/chat/page.tsx` | `apps/mobile/app/chat.tsx` | Astra chat screen + all 10 variants |
| `apps/web/app/(app)/calendar/page.tsx` + `_components/calendar-shell.tsx` | `apps/mobile/app/(tabs)/calendar.tsx` + `_components/calendar-shell.tsx` | Calendar |
| `apps/web/app/(app)/profile/page.tsx` + `_components/profile-nav-card.tsx` | `apps/mobile/app/(tabs)/profile.tsx` + `_components/profile-nav-card.tsx` | Profile + 7 nav items |
| `apps/web/components/habits/habit-card.tsx` + `habit-list.tsx` + `habit-list-sections.tsx` | `apps/mobile/components/habit-card.tsx` + `habit-list.tsx` + `habit-list-sections.tsx` | Replaced by new HabitRow primitive |
| `apps/web/components/navigation/bottom-nav.tsx` | (mobile uses `apps/mobile/app/(tabs)/_layout.tsx` for tabs) | New BottomTabBar primitive with centered FAB |
| `apps/web/components/habits/habit-detail-drawer.tsx` + `habit-detail-sections.tsx` | `apps/mobile/app/...` (Habit Detail equivalent — find in Phase 4) | 7 variants |
| `apps/web/components/goals/goal-detail-drawer.tsx` + `goal-detail-sections.tsx` | mobile equivalent | 7 variants |
| `apps/web/components/habits/create-habit-modal.tsx` + `edit-habit-modal.tsx` | mobile equivalents (bottom-sheet pattern) | 9 variants + emoji sheet |
| `apps/web/components/onboarding/*` (8 files) | mobile equivalents | Step 2 retitle "Meet Astra" |
| `apps/web/components/gamification/all-done-celebration.tsx` + `goal-completed-celebration.tsx` + `level-up-overlay.tsx` + `streak-celebration.tsx` + `streak-freeze-celebration.tsx` + `achievement-toast.tsx` + `welcome-back-toast.tsx` | mobile equivalents | Rebuilt with RingMotif primitive |
| `apps/web/components/ui/confirm-dialog.tsx` | `apps/mobile/components/ui/confirm-dialog.tsx` | 3 variants, italic destructive label |
| `apps/web/components/ui/fresh-start-animation.tsx` | `apps/mobile/components/ui/fresh-start-animation.tsx` | Saturn-ring style |
| `packages/shared/src/i18n/en.json` + `pt-BR.json` | (shared, both apps consume) | Astra strings + drop editorial copy |

This is a starter. Each phase below adds its specific files to this matrix.

---

## Tasks — 7 Phases

The phase boundaries mirror PRD §12. Within each phase, tasks are listed with IDs `T<phase>.<n>` so `/implement` can mark progress. Each phase ends with a validation gate and a commit.

---

### Phase 1 — Tokens & fonts

**Goal**: Both apps render with the new design system tokens. No component changes yet (those land in Phase 2). Old screens may look slightly off (token shifts), but everything boots and is interactive.

**Pre-state to read first** (`/implement` must consult these before editing):
- `.tmp/render/colors_and_type.css` — the new token spec (OKLCH neutrals, scheme system, semantic type classes)
- `packages/shared/src/theme/color-schemes.ts` — current shape (6 schemes × dark+light × ~15 fields each + scale 50→950 + shadowGlow* + navGlass*)
- `apps/mobile/lib/theme.ts` — current `AppColors` interface (~50 fields, lines 14-85) and the helpers (`createColors`, `createSurfaces`, `shadows`, `gradients`)
- `apps/web/app/globals.css` lines 1-200 — current `@theme` block and `:root` token wiring

**Tasks**

- **T1.1 — Rewrite `packages/shared/src/theme/color-schemes.ts`** to the v2 shape from PRD §9:
  ```ts
  export interface ColorSchemeV2 {
    primary: string
    primaryPressed: string
    hue: number          // OKLCH hue
    chromaBg: number     // ~0.012-0.015
    chromaFg: number     // ~0.018-0.024
  }
  export const schemes: Record<ColorScheme, { dark: ColorSchemeV2; light: ColorSchemeV2 }>
  ```
  Six schemes (purple/blue/green/rose/orange/cyan) × 2 modes. Values come straight from `.tmp/render/colors_and_type.css` lines 100-122. Keep `colorSchemeOptions` export.

- **T1.2 — Decide and apply the mobile theme.ts breaking-change strategy.** See Phase 1 risks below. Prefer **single mechanical rewrite** of `apps/mobile/lib/theme.ts` to the ~12-semantic-token shape (`bg`, `bgElev`, `bgSunk`, `hairline`, `hairlineStrong`, `fg1`, `fg2`, `fg3`, `fg4`, `fgOnPrimary`, `primary`, `primaryPressed`) + statuses (`statusDone/Empty/Skip/Overdue/Bad/Frozen`) + 3 shadow tiers (`shadow1/2/3` matching `--shadow-1/2/3` from spec). The OKLCH→hex conversion happens at scheme-switch time using `culori` (add as dep) or a hand-rolled converter — PRD §10.

- **T1.3 — Rewrite `apps/web/app/globals.css` `@theme` and `:root` blocks** (lines 1-160 or so) to mirror the v2 tokens. Keep the file's existing structure for keyframes / utility classes — those get pruned in Phases 2 and 7. Add the `.scheme-{name}.dark/.light` class blocks from `colors_and_type.css`. Add semantic type classes (`.t-eyebrow`, `.t-h1`, `.t-row`, `.t-meta`, `.t-num`, etc.).

- **T1.4 — Add Geist fonts on web** via `next/font` in `apps/web/app/layout.tsx`:
  ```ts
  import { Geist, Geist_Mono } from 'next/font/google'
  const geistSans = Geist({ subsets: ['latin'], variable: '--font-sans', display: 'swap' })
  const geistMono = Geist_Mono({ subsets: ['latin'], variable: '--font-mono', display: 'swap' })
  ```
  Remove the existing Manrope wiring. Update `globals.css` `--font-family-sans` to `var(--font-sans)`.

- **T1.5 — Add Geist fonts on mobile** via `@expo-google-fonts/geist` + `@expo-google-fonts/geist-mono`. Install (`npm install --workspace apps/mobile @expo-google-fonts/geist @expo-google-fonts/geist-mono`) and wire in the existing font loader (currently likely loading Manrope from `expo-font` or `@expo-google-fonts/manrope`). Verify with `grep -r "Manrope" apps/mobile/` returns zero references.

- **T1.6 — Update `apps/mobile/tailwind.config.js`** to mirror v2 tokens:
  - Remove Manrope fontFamily; add Geist + GeistMono
  - Replace the primary scale (50→950) with v2 token names matching mobile theme exports
  - Add semantic color names that map to the `bg`/`fg-*`/`hairline`/`primary` runtime values
  - Add status colors (`status-done`, `status-overdue`, etc.)

- **T1.7 — No `apps/web/tailwind.config.ts` to update** — v4 CSS-first config lives in `globals.css` from T1.3. Skip.

- **T1.8 — Migration code for existing scheme persistence**. PRD §13 risk: a user who upgrades shouldn't lose their scheme preference. Confirm the storage key in `apps/web/hooks/use-color-scheme.ts` and the mobile equivalent (likely in `apps/mobile/lib/use-app-theme.ts`) — same scheme name strings (`purple`/`blue`/etc.) are preserved, so this should just work, but `/implement` must verify by reading `getRuntimeTheme()` defaults and the persistence layer before committing.

- **T1.9 — Smoke-boot both apps**. Mobile: `npm run android` or `npm run mobile` from monorepo root. Web: `npm run web` or `cd apps/web && npm run dev`. Confirm: no JS errors at boot, navigation works between tabs, theme toggle works, scheme swatch (if exposed in preferences) retints. Screens will look weird — that's expected. Tasks are NOT marked complete unless app boots.

**Phase 1 validation gate** (cannot move to Phase 2 until all pass):
```bash
# From repo root
npm run lint                # both apps
npm run type-check          # WILL fail if mobile theme.ts breaking changes aren't fully propagated
# If type-check fails: Phase 1 isn't done. Finish T1.2 propagation across all mobile consumers.
npx vitest run              # web unit tests (some will fail in later phases — Phase 1 should still pass most)
# Manual: boot mobile + web, all tabs render, no console errors
```

**Phase 1 commit** (single commit):
```
feat(redesign-v2): phase 1 — OKLCH tokens, Geist fonts, scheme rewrite

- Rewrite packages/shared/src/theme/color-schemes.ts to OKLCH-based v2 shape
- Collapse apps/mobile/lib/theme.ts to ~12 semantic tokens + 3 shadow tiers
- Rewrite apps/web/app/globals.css @theme to v2 tokens
- Replace Manrope with Geist Sans + Geist Mono on both apps
- Update apps/mobile/tailwind.config.js to mirror v2 tokens
- Preserve scheme persistence (storage keys unchanged)

Refs #103
```

**Phase 1 risks** (project-specific, not already in PRD §13):
- **R1.A — Mobile theme.ts breaking changes ripple to every component.** `AppColors` has ~50 named exports referenced across all screens (`colors.primaryTintBg`, `colors.shadowGlowSm`, `colors.red500_30`, etc.). PRD §15 forbids shim/back-compat tokens. Strategy: **single mechanical rename pass in this phase**. `/implement` runs `grep -rn "colors\.\(primaryTintBg\|primary_10\|shadowGlow\|red500_30\|emerald400_10\|primary400\|primary_15\|primary_20\|primary_30\|primary_80\|primaryShadow\|primaryRing\|textFaded40\|border50\|borderFaded30\|borderDivider\|emeraldBg\|emeraldBorder\|red400_10\|red500_10\|amber400\|amber500\|green400\|green500bg\|green500_60\|blue400\|orange500_30\|orange400_10\|handle\|purple\)" apps/mobile/` and updates each call site to the new v2 token names. Phase 1 doesn't complete until that grep returns zero hits. This makes Phase 1 large but unavoidable.
- **R1.B — `apps/mobile/lib/theme.ts` also exports `gradients`, `easings`, `durations`, `radius`, `spacing`, `shadows`, `primaryRgba`, `lightenHex`**. The PRD's "3 shadow tiers" applies only to shadows; the rest stay or are pruned by need. Keep helpers used by current screens; delete `shadowGlow*` and the gradient helpers that reference glow language (`gradients.proShimmer`, `gradients.statusDue` if redundant with status tokens). Pruning unused helpers is Phase 7 work — Phase 1 just rewires the shape.
- **R1.C — OKLCH→hex conversion on mobile**. `culori` is ~9kb gzipped. If `/implement` prefers no new dep, hand-roll OKLCH→OKLab→linear-sRGB→sRGB-hex. The math is straightforward; reference: https://www.w3.org/TR/css-color-4/#color-conversion-code. Either way, precompute once per scheme-switch and cache on the runtime theme.

---

### Phase 2 — Shared primitives

**Goal**: New primitive components exist on both apps. Old components untouched. Screens still call old components. App still looks like the post-Phase-1 state (new tokens, old layouts).

**Pre-state to read first**:
- `.tmp/render/orbit-app-components.jsx` — BottomNav, TabBtn, StreakBadge, UtilityCluster, SettingsRow, MonoToggle, SchemeSwatches, ConfirmDialog, ToastBanner, etc. (561 lines)
- `.tmp/render/orbit-components.jsx` — AppBar, SectionLabel, HabitRow, StatusRing, Chip, PullQuote, RingMotif (610 lines)
- `apps/mobile/components/habit-card.tsx` — current primitive being replaced (read fully to understand actions/state shape that HabitRow must preserve)
- `apps/web/components/habits/habit-card.tsx` — same on web
- `apps/web/components/navigation/bottom-nav.tsx` — current web bottom nav

**Tasks**

For each primitive below, `/implement` creates **two parallel files** (web + mobile), commits as a single unit. Naming follows existing convention: `apps/web/components/{folder}/<name>.tsx` and `apps/mobile/components/{folder}/<name>.tsx` (or `components/ui/`).

- **T2.1 — `AppBar`** (52px tall, leading icon + title + subtitle + trailing cluster). Web: `apps/web/components/ui/app-bar.tsx`. Mobile: `apps/mobile/components/ui/app-bar.tsx`. Spec: `.tmp/render/orbit-components.jsx` (search "function AppBar" or "AppBar").
- **T2.2 — `SectionLabel`** (13px weight 600 muted, with optional `t-eyebrow` mono variant for caps eyebrow labels). Both apps under `components/ui/section-label.tsx`.
- **T2.3 — `HabitRow`** (Linear-tight row: emoji left → name + meta → spacer → optional streak number → status dot right). Replaces `habit-card.tsx`. Includes tree-line connector for children (sub-habits). Preserves all actions from `HabitCardActions` interface (`onLog`, `onUnlog`, `onSkip`, `onDelete`, `onDuplicate`, `onEdit`, `onMoveParent`, `onDetail`, `onDrillInto`, `onToggleSelection`). Web: `apps/web/components/habits/habit-row.tsx`. Mobile: `apps/mobile/components/habits/habit-row.tsx` (new subfolder). **Mobile constraint**: must wrap root in bare `Animated.View` for `@gorhom/bottom-sheet` Reanimated stabilizer (see Phase 2 risks).
- **T2.4 — `StatusRing` and `StatusDot`** (8px desaturated color tokens). Both apps under `components/ui/status-dot.tsx` + `status-ring.tsx`. Status tokens come from theme (`status-done`, `status-overdue`, `status-bad`, `status-frozen`, `status-skip`, `status-empty`).
- **T2.5 — `Chip`** (text chip with active background fill, **not** underline). Both apps under `components/ui/chip.tsx`. Spec note: PRD §6 emphasizes "Chip (text-chip with active background fill, NOT underline)" — call out this difference if reviewing PRs against the current underline-based tab pattern.
- **T2.6 — `BottomTabBar` (mobile only)**. 4 tabs (Home, Astra/Sparkles, Calendar, You) + centered Plus FAB with U-notch. Mobile: `apps/mobile/components/navigation/bottom-tab-bar.tsx`. Replaces or wraps the current `apps/mobile/app/(tabs)/_layout.tsx` Tabs config. The FAB is hidden on Astra and Profile tabs (PRD §8). Astra tab uses Sparkles icon and is visually emphasized (the AI prominence signal).
- **T2.7 — `WebNav` (web only)**. Web equivalent: sidebar at ≥768px or bottom nav at <768px. Web: `apps/web/components/navigation/web-nav.tsx`. The current `bottom-nav.tsx` may serve as the <768px variant; restructure rather than fork.
- **T2.8 — `PullQuote`** (Astra/Claude messages with primary left-rule). Both apps under `components/chat/pull-quote.tsx`. Used inside detail drawers for "Ask Astra about this" affordances and inside chat for Astra prose responses.
- **T2.9 — `ConfirmDialog`** (3 variants per PRD §15: standard, destructive italic, info). Both apps under `components/ui/confirm-dialog.tsx` — file already exists; **rewrite** rather than create. No red — PRD §6 calls it out explicitly. Italic destructive label.
- **T2.10 — `RingMotif`** (the Saturn-ring celebration primitive, used by all 7 celebration types in Phase 6). Both apps under `components/gamification/ring-motif.tsx`. Spec: `.tmp/render/orbit-screens-overlays.jsx` and `.tmp/render/celebrations.png`, `celebration-streak.png`, `celebration-tall.png` PNGs.

**Phase 2 validation gate**:
```bash
npm run lint
npm run type-check          # primitives are isolated — no consumers yet, so this should pass cleanly
npx vitest run              # no new tests in this phase; existing tests still reference old primitives
```
- Manual: render each primitive in isolation on both apps. Web can use a dev route; mobile can use a temporary screen. Visual check against `.tmp/render/` PNGs.

**Phase 2 commit**:
```
feat(redesign-v2): phase 2 — new primitive components (AppBar, HabitRow, etc.)

Adds parallel web + mobile primitives that screens will consume in Phase 3:
AppBar, SectionLabel, HabitRow, StatusRing, StatusDot, Chip, BottomTabBar
(mobile), WebNav (web), PullQuote, ConfirmDialog (rewrite), RingMotif.

Old components remain in place; nothing wired up yet.

Refs #103
```

**Phase 2 risks**:
- **R2.A — `HabitRow` must preserve all `HabitCardActions` props** (see `apps/mobile/components/habit-card.tsx:70-80`). If a screen passes `onMoveParent` and HabitRow drops it, drag-to-parent stops working silently. Validation: type-check on a temporary call site that passes every action.
- **R2.B — `Animated.View` stabilizer wrapper on mobile HabitRow** (from memory + commit `4d27a77`). The root must be a bare `Animated.View` so `@gorhom/bottom-sheet`'s Reanimated host stays mounted. **Do not** swap for `View` even if the new design doesn't need an animated transform — this is a known Android-only bug.
- **R2.C — `BottomTabBar` FAB visibility logic**. PRD §8 says hidden on Astra/Profile; visible on Home/Calendar with contextual create flow (CreateHabitSheet on Home, CreateGoalSheet on Goals view). Confirm there's no Goals tab in the 4-tab v8 spec (the spec says Home/Astra/Calendar/You) — Goals lives as a view under Home per current `TodayTabView = 'today' | 'all' | 'general' | 'goals'`. So FAB on Home + Calendar, hidden on Astra + Profile.

---

### Phase 3 — Core screens (Today, Astra/Chat, Calendar, Profile)

**Goal**: The four screens used 80% of the time are migrated to v8. Drawers/sheets they open still look old until Phase 4 — that's OK.

**Pre-state to read first**:
- `.tmp/render/orbit-screens-today.jsx` (483 lines) — Today layout, including Languages parent + Spanish/French children, AI Summary block, progress strip
- `.tmp/render/orbit-screens-chat.jsx` (446 lines) — all 10 Astra chat variants
- `.tmp/render/orbit-screens-cal-profile.jsx` (554 lines) — Calendar and Profile

**Tasks**

- **T3.1 — Today screen, web**: rewrite `apps/web/app/(app)/today-shell.tsx`, `apps/web/app/(app)/page.tsx`, and the habit list rendering in `apps/web/components/habits/habit-list-sections.tsx` to use new primitives. Wire AI Summary block (Astra-attributed daily summary) above the habit list. Wire progress strip. Sub-habits visible by default in the Today view.
- **T3.2 — Today screen, mobile**: same for `apps/mobile/app/(tabs)/today-shell.tsx`, `apps/mobile/app/(tabs)/index.tsx`, `apps/mobile/components/habit-list-sections.tsx`.
- **T3.3 — Astra chat screen, web**: rewrite `apps/web/app/(chat)/chat/page.tsx` + `apps/web/components/chat/*` to v8. All 10 variants: active conversation, empty, pending op, breakdown, clarification, conflict, action chips, voice, message limit, offline. Add Astra branding (user-facing).
- **T3.4 — Astra chat screen, mobile**: same for `apps/mobile/app/chat.tsx` + `apps/mobile/components/message-bubble.tsx` and any chat-specific subcomponents.
- **T3.5 — Calendar screen, web**: rewrite `apps/web/app/(app)/calendar/page.tsx` + `_components/calendar-shell.tsx`. Month grid with primary dot on today.
- **T3.6 — Calendar screen, mobile**: rewrite `apps/mobile/app/(tabs)/calendar.tsx` + `_components/calendar-shell.tsx` + `_components/calendar-day-entry.tsx`.
- **T3.7 — Profile screen, web**: rewrite `apps/web/app/(app)/profile/page.tsx` + `_components/profile-nav-card.tsx` + `_components/profile-action-button.tsx` + `_components/profile-nav-icon.tsx` + `_components/subscription-card.tsx` + `_components/tour-replay-card.tsx`. 7 nav items + subscription card + account actions.
- **T3.8 — Profile screen, mobile**: same for `apps/mobile/app/(tabs)/profile.tsx` + `_components/*.tsx`.
- **T3.9 — Wire `BottomTabBar` and `WebNav`** from Phase 2 into actual app shells. Mobile: update `apps/mobile/app/(tabs)/_layout.tsx`. Web: update `apps/web/app/(app)/layout.tsx`.

**Phase 3 validation gate**:
```bash
npm run lint
npm run type-check
npx vitest run              # several tests will start failing — that's expected; defer fixes to Phase 7
                            # but type-check must still pass
# Manual: open each tab on both apps, smoke-test primary actions:
#   - Today: log a habit, swipe to previous/next day, switch view (today/all/general/goals)
#   - Astra: open chat, send a message, see typing indicator
#   - Calendar: navigate to a date, tap a day
#   - Profile: open each of the 7 nav items (their target screens are pre-Phase-5 layouts — that's fine)
# Dark + light mode toggle. Scheme retint (cycle through all 6).
```

**Phase 3 commit** (consider 2 commits: one for Today + Astra, one for Calendar + Profile, if Phase 3 grows too large):
```
feat(redesign-v2): phase 3 — Today, Astra, Calendar, Profile migrated to v8

Refs #103
```

**Phase 3 risks**:
- **R3.A — Astra rename touches user-facing strings only**. Audit every chat-related i18n key + every `t('chat.*')` usage. Comments and code identifiers stay. PRD §15 cleanup audit at Phase 7 catches misses.
- **R3.B — Chat variants are state-driven, not separate screens**. The 10 variants are states of the same chat page; don't create separate routes. Use the existing `chat-store` (`apps/web/__tests__/stores/chat-store.test.ts` confirms it exists).
- **R3.C — Calendar grid rendering on Android**. From memory: elevated cards inside `overflow: hidden` parents disappear on Android. Calendar day cells with status indicators need testing on real device.

---

### Phase 4 — Detail drawers & sheets

**Goal**: Every drawer/sheet from the v8 bundle is implemented.

**Pre-state to read first**:
- `.tmp/render/orbit-screens-detail-create.jsx` (795 lines) — Habit Detail (7 variants), Goal Detail (7 variants), Create/Edit Habit sheet (9 variants), Create/Edit Goal sheet (6 variants), emoji sheet
- `.tmp/render/orbit-screens-subhabits.jsx` (272 lines) — sub-habit affordances inside Habit Detail
- Reference PNGs: `.tmp/render/detail-parent.png`, `.tmp/render/create-pro-subhabits.png`, `.tmp/render/all-tab-subhabits.png`

**Tasks**

- **T4.1 — Habit Detail drawer** (7 variants: active, parent+children, skipped, checklist, bad, slip alert, linked goal). Web: rewrite `apps/web/components/habits/habit-detail-drawer.tsx` + `habit-detail-sections.tsx`. Mobile: find or create equivalent. Add Children section (sub-habits visible). Add "Ask Astra about this" PullQuote (from Phase 2).
- **T4.2 — Goal Detail drawer** (7 variants). Web: rewrite `apps/web/components/goals/goal-detail-drawer.tsx` + `goal-detail-sections.tsx` + `goal-metrics-panel.tsx`. Mobile: equivalent.
- **T4.3 — Create / Edit Habit sheet** (9 variants + emoji sheet). Web: rewrite `apps/web/components/habits/create-habit-modal.tsx` + `edit-habit-modal.tsx` + `habit-form-fields.tsx` + `goal-linking-field.tsx`. Mobile: equivalents. Sub-habit inputs are active (not locked behind Pro gate visually — gate is on submit only, per PRD §2 "Sub-habits are first-class").
- **T4.4 — Create / Edit Goal sheet** (6 variants). Web: rewrite `apps/web/components/goals/create-goal-modal.tsx` + `edit-goal-modal.tsx`. Mobile: equivalents.
- **T4.5 — Notifications inbox sheet**. Web: rewrite `apps/web/components/navigation/notification-detail-modal.tsx`. Mobile: equivalent.
- **T4.6 — Referral drawer**. Web: rewrite `apps/web/components/referral/referral-drawer.tsx` + `referral-card.tsx`. Mobile: equivalent.
- **T4.7 — Feature guide drawer**. Web: rewrite `apps/web/components/onboarding/feature-guide-drawer.tsx`. Mobile: equivalent.
- **T4.8 — Quick action sheets** (3-dot habit row menu). Web: rewrite `apps/web/components/habits/controls-menu.tsx`. Mobile: rewrite the AnchoredMenu wiring inside `habit-card.tsx` (or move to `habit-row.tsx` from Phase 2).

**Phase 4 validation gate**:
```bash
npm run lint
npm run type-check
npx vitest run              # drawer/sheet unit tests will need updates — defer
# Manual: open each drawer/sheet on both apps, verify all variants render.
# Specifically test:
#   - "+ Add sub-habit" affordance in Habit Detail (per PRD §6)
#   - Emoji sheet from Create Habit
#   - Notifications inbox swipe-to-delete (or web equivalent)
```

**Phase 4 commit**:
```
feat(redesign-v2): phase 4 — drawers and sheets migrated to v8

Refs #103
```

---

### Phase 5 — Sub-screens

**Goal**: All settings, gamification, and informational sub-screens.

**Pre-state to read first**:
- `.tmp/render/orbit-screens-extras.jsx` (712 lines) — Streak (5 variants), Achievements (5 variants), Retrospective (3 variants), Preferences, Advanced, AI Settings (incl. paginated + select + empty facts states), About, Privacy, Support, Calendar Sync (6 states)
- `.tmp/render/orbit-screens-subs.jsx` (406 lines) — Upgrade (3 variants: yearly, in-trial, expired)

**Tasks**

- **T5.1 — Streak detail** (5 variants: 47/strong, low/3 days, frozen, monthly limit, legendary). Web: `apps/web/app/(app)/streak/page.tsx` + `_components/streak-sections.tsx`. Mobile: `apps/mobile/app/streak.tsx` + `streak-sections.tsx`. 80px hero number + week timeline + freeze section.
- **T5.2 — Achievements** (5 variants: level card, getting started, locked detail, earned detail, rarity legend). Web: `apps/web/app/(app)/achievements/page.tsx` + `_components/achievement-category-section.tsx` + `apps/web/components/gamification/achievement-card.tsx`. Mobile: `apps/mobile/app/achievements.tsx` + `achievements-sections.tsx`.
- **T5.3 — Retrospective** (3 variants: content, generate, loading). Web: `apps/web/app/(app)/retrospective/page.tsx`. Mobile: `apps/mobile/app/retrospective.tsx`.
- **T5.4 — Upgrade** (3 variants: yearly, in-trial, expired). Web: `apps/web/app/(app)/upgrade/page.tsx`. Mobile: `apps/mobile/app/upgrade.tsx`.
- **T5.5 — Preferences**. Web: `apps/web/app/(app)/preferences/page.tsx`. Mobile: `apps/mobile/app/preferences.tsx`. Includes scheme swatches (T2.x SchemeSwatches), dark/light toggle.
- **T5.6 — Advanced** (free + Pro with API keys). Web: `apps/web/app/(app)/advanced/page.tsx`. Mobile: `apps/mobile/app/advanced.tsx`.
- **T5.7 — AI Settings** (free + Pro + facts paginated + facts select + facts empty). Web: `apps/web/app/(app)/ai-settings/page.tsx`. Mobile: `apps/mobile/app/ai-settings.tsx`. Section renamed "What Astra knows" per PRD §8.
- **T5.8 — Calendar Sync** (6 states). Web: `apps/web/app/(app)/calendar-sync/page.tsx`. Mobile: `apps/mobile/app/calendar-sync.tsx`.
- **T5.9 — About / Privacy / Support**. Web: 3 routes under `(app)/` or `(public)/`. Mobile: 3 routes at top level.

**Phase 5 validation gate**:
```bash
npm run lint
npm run type-check
npx vitest run
# Manual: navigate to each sub-screen from Profile on both apps. Verify content + actions.
```

**Phase 5 commit**:
```
feat(redesign-v2): phase 5 — sub-screens migrated to v8

Refs #103
```

---

### Phase 6 — Flows, overlays, parity

**Goal**: Auth, onboarding, modals, banners, toasts, celebrations.

**Pre-state to read first**:
- `.tmp/render/orbit-screens-flows.jsx` (355 lines) — Login (4 variants), Onboarding (7 steps)
- `.tmp/render/orbit-screens-overlays.jsx` (741 lines) — Confirm dialogs (7 variants), Fresh start modal (2 steps), Delete account modal (3 steps), Trial expired, Push prompt, Version update drawer, API key modal, Toasts (4 types), Celebrations (7 types), Edge banners (5 types)

**Tasks**

- **T6.1 — Login** (4 variants: step 1, step 1 + referral, step 2 code, step 2 error). Web: `apps/web/app/(auth)/login/page.tsx`. Mobile: `apps/mobile/app/login.tsx`. Email + 6-digit code flow preserved exactly.
- **T6.2 — Onboarding** (7 steps: Welcome, Meet Astra, Tell Astra what to track, Complete habit, Add goal, Features, You're set). Web: `apps/web/components/onboarding/onboarding-flow.tsx` + each step component. Mobile: equivalents. Step 2 retitled "Meet Astra" per PRD §8.
- **T6.3 — Confirm dialogs** (7 variants — italic destructive label, no red). Web: `apps/web/components/ui/confirm-dialog.tsx` (rewrite from Phase 2 if not yet covering all 7 variants). Mobile: equivalent.
- **T6.4 — Fresh start modal** (2 steps). Web: `apps/web/app/(app)/profile/_components/fresh-start-modal.tsx`. Mobile: equivalent.
- **T6.5 — Delete account modal** (3 steps). Web: `apps/web/app/(app)/profile/_components/delete-account-modal.tsx`. Mobile: equivalent.
- **T6.6 — Trial expired modal**. Web: `apps/web/components/ui/trial-expired-modal.tsx`. Mobile: `apps/mobile/components/ui/trial-expired-modal.tsx`.
- **T6.7 — Push prompt**. Web: `apps/web/components/ui/push-prompt.tsx`. Mobile: `apps/mobile/components/ui/push-prompt.tsx`.
- **T6.8 — Version update drawer**. Mobile: `apps/mobile/components/version-update-drawer.tsx`. Web: `apps/web/components/ui/update-prompt.tsx`.
- **T6.9 — API key modal** (new + reveal). Web: `apps/web/components/ui/create-api-key-modal.tsx`. Mobile: `apps/mobile/components/ui/create-api-key-modal.tsx`.
- **T6.10 — Toasts** (success, error, info, queued · undo). Web: relies on `apps/web/hooks/use-app-toast.ts` + a toast component. Mobile: `apps/mobile/components/ui/app-toast.tsx` + `apps/mobile/hooks/use-app-toast.ts`. Queued · undo variant must support the existing notification-delete undo flow (per existing `pending-notification-deletes.test.ts`).
- **T6.11 — Celebrations** (7 types — Saturn-ring motif from T2.10). All in `apps/web/components/gamification/` + `apps/mobile/components/` (or equivalent):
  - `all-done-celebration.tsx` (web only currently — add mobile)
  - `goal-completed-celebration.tsx`
  - `level-up-overlay.tsx`
  - `streak-celebration.tsx`
  - `streak-freeze-celebration.tsx`
  - `achievement-toast.tsx`
  - `welcome-back-toast.tsx`
- **T6.12 — Edge banners** (trial, trial last day, review reminder, session expiring, referral applied). Web: `apps/web/components/ui/trial-banner.tsx` + `expiry-warning.tsx`. Mobile: `apps/mobile/components/ui/trial-banner.tsx` + `expiry-warning.tsx` + `apps/mobile/components/review-reminder-card.tsx`.
- **T6.13 — i18n updates** in `packages/shared/src/i18n/en.json` and `pt-BR.json` per PRD §8:
  - Astra-attributed prose: "How did the day land?", "ASTRA · HH:MM" attribution
  - Onboarding step 2 title: "Meet Astra"
  - AI Settings section: "What Astra knows"
  - Empty state: "Tell Astra what to track" (replaces "+ New habit" link)
  - **Drop**: "A quiet record of small commitments.", "Vol. 1 · Issue 47", "ORBIT · A DAILY JOURNAL"
  - Run `grep -rn "Claude" packages/shared/src/i18n/` — confirm zero hits after this task.

**Phase 6 validation gate**:
```bash
npm run lint
npm run type-check
npx vitest run
# Manual triggers:
#   - Trigger each overlay (push prompt, trial expired, etc.)
#   - Trigger each celebration (log a habit to completion, hit a streak milestone, finish a goal)
#   - Verify queued-delete undo works for notifications
#   - Run through onboarding from step 1 to step 7
# i18n: switch app language to pt-BR; spot-check Astra strings
```

**Phase 6 commit**:
```
feat(redesign-v2): phase 6 — flows, overlays, celebrations migrated to v8

Refs #103
```

---

### Phase 7 — Cleanup + tests + ship

**Goal**: Remove obsolete code, fix tests, run the cleanup audit, open the PR.

**Tasks**

- **T7.1 — Cleanup audit grep gates from PRD §15**, each must return zero (with the listed exceptions):
  ```bash
  grep -rn "EditionMasthead\|SectionEyebrow\|HabitCard\|primaryTintBg\|shadowGlow\|Manrope" apps/ packages/
  # ↑ must be empty. If HabitCard component name is the new HabitRow but a file still imports HabitCard, rename.

  grep -rn "Claude" apps/web/app apps/web/components apps/web/lib apps/mobile/app apps/mobile/components apps/mobile/lib
  # ↑ user-facing must be empty. Code comments allowed (per PRD §14 q.4). If a `t('chat.claude_*')` key exists, rename.

  npm ls manrope                           # must be empty
  npm ls @expo-google-fonts/manrope        # must be empty
  ```
- **T7.2 — Delete obsolete files** (anything no longer imported by any caller):
  - Old shadow/glow utility classes in `globals.css`
  - `habit-card.tsx` (web + mobile) if `habit-row.tsx` fully replaced it. Run `grep -rn "from.*habit-card" apps/` first.
  - `EditionMasthead` / `SectionEyebrow` components if any still exist (audit `apps/web/components/` and `apps/mobile/components/`)
  - `.habit-card-parent`, `.habit-card-child`, `.fresh-start-orb`, `.habit-emoji-orb` CSS rules in `globals.css` if no JSX selector references them
  - Dropped i18n keys from `en.json` and `pt-BR.json` (the editorial strings, Manrope-era empty states)
- **T7.3 — Update Vitest unit tests** for new component shapes. Files most at risk (from `apps/web/__tests__/`):
  - `app/today-page.test.tsx`
  - `components/habits/today-filters.test.tsx`, `habit-checklist.test.tsx`, `habit-summary-card.test.tsx`, `create-habit-modal.test.tsx`, `edit-habit-modal.test.tsx`
  - `components/goals/*.test.tsx`
  - `components/chat/*.test.tsx`
  - `components/onboarding/*.test.tsx`
  - `components/ui/confirm-dialog.test.tsx` (if exists), `theme-toggle.test.tsx`, `app-overlay.test.tsx`
  - `pages/*.test.tsx`
- **T7.4 — Update Playwright E2E selectors** in `apps/web/e2e/tests/*` where DOM shape changed. Per resolved question 5, delete and recreate snapshot tests. Functional tests (22 specs) update selectors only.
- **T7.5 — Delete Playwright snapshots** (the recorded `.png` files) — they'll regenerate on first re-run.
- **T7.6 — Run full validation** end-to-end (see Validation Commands section below).
- **T7.7 — Manual responsive QA on web** at 360 / 768 / 1024 / 1440px. Per resolved question 3, 1024+ uses centered single column with `--app-max-w` — no two-pane.
- **T7.8 — Manual smoke test on Android device** — every tab, scheme retint, dark/light toggle, one habit log, one chat message, one goal create.
- **T7.9 — Update `AGENTS.md`** if file paths in the Key Files table changed (e.g., `apps/mobile/lib/theme.ts` token shape note, or moved components).
- **T7.10 — Open the PR**:
  ```
  gh pr create --title "feat: migrate Orbit to v2 Linear-tactical design (closes #103)" \
    --body-file .agents/PRDs/redesign-v2.prd.md \
    --base main --head redesign/v2
  ```

**Phase 7 validation gate** (final, blocks PR):
```bash
# All of these MUST pass:
npm run lint
npm run type-check
npx vitest run
npm run test:e2e            # web Playwright

# All cleanup grep checks return zero:
grep -rn "EditionMasthead\|SectionEyebrow\|HabitCard\|primaryTintBg\|shadowGlow\|Manrope" apps/ packages/
grep -rn "Claude" apps/web/app apps/web/components apps/web/lib apps/mobile/app apps/mobile/components apps/mobile/lib
grep -rn "// TODO\|// FIXME\|// HACK" apps/ packages/ 2>/dev/null | grep -v node_modules
# ↑ Any TODO/FIXME/HACK comments ADDED by this migration must be removed before PR (PRD §15)
```

**Phase 7 commits** (likely 2-3 small ones):
```
chore(redesign-v2): phase 7 — delete obsolete components and tokens
test(redesign-v2): phase 7 — update unit tests for new component shapes
test(redesign-v2): phase 7 — update Playwright selectors, regenerate snapshots
docs(redesign-v2): phase 7 — update AGENTS.md key files table
```

---

## Validation Commands

### orbit-ui-mobile (run from repo root)

```bash
npm run lint
npm run type-check
npx vitest run                    # web unit tests
npm run test:e2e                  # web Playwright
# mobile: no automated test suite; smoke-boot via npm run android
```

### orbit-api (no changes — skip)

### End-to-End checklist (run before PR)

- [ ] Cold-start web (`npm run web` from `apps/web/`) — landing page renders in dark mode by default
- [ ] Cold-start mobile (`npm run android`) — Today tab renders in dark mode
- [ ] Toggle theme → light mode flips on both apps with smooth transition
- [ ] Cycle through all 6 schemes in Preferences → neutrals retint correctly
- [ ] Log a habit → status ring flips to filled with Saturn-ring celebration animation
- [ ] Create a habit with sub-habits + checklist + tags + reminder + end date
- [ ] Drill from parent habit into a child's detail
- [ ] Open Astra chat → send a message → embedded cards (pending op, breakdown, clarification) render
- [ ] Streak detail: 80px hero number visible, week timeline visible, freeze section visible
- [ ] Goal detail: metrics panel + linked habits + progress history
- [ ] Swipe between days on Today (mobile) / arrow keys (web)
- [ ] Select-mode bulk action bar: log/skip/delete + queued-delete undo
- [ ] Retrospective generate (Pro yearly)
- [ ] 7-step onboarding including "Meet Astra"
- [ ] Web responsive at 360 / 768 / 1024 / 1440px (no horizontal scroll, no overflow, FAB/nav visible)
- [ ] No "Claude" in any user-facing string on both apps
- [ ] No console errors on either app during the above

---

## Risks & Mitigations (consolidated)

| # | Risk | Mitigation |
|---|------|------------|
| 1 | Scope too large for one session | Branch + per-phase commits; resume across sessions; PRD §13 |
| 2 | Mobile `theme.ts` ~50 → ~12 token collapse breaks every screen | Phase 1 mechanical rename pass; grep gate; no shim allowed |
| 3 | OKLCH not native to React Native | Precompute neutrals at scheme-switch time; `culori` or hand-rolled (PRD §10) |
| 4 | Some v8 JSX patterns don't map cleanly to RN (CSS-only effects) | Flag in-line; no silent substitutions (PRD §15) |
| 5 | Test suite breakage masks regressions | Phase 7 explicitly updates tests; Playwright snapshots deleted+recreated |
| 6 | User color scheme persistence breaks at first post-migration load | Same scheme name strings preserved (T1.8) |
| 7 | `@gorhom/bottom-sheet` Reanimated wrapper missing on new HabitRow | Phase 2 risk R2.B — bare `Animated.View` root required on mobile |
| 8 | Android `overflow: hidden` + elevation hides content | Memory-known bug; verify Calendar day cells, drawer surfaces |
| 9 | Astra rename leaking into code identifiers | PRD §14 q.4 — code stays `chat`; user-facing only; grep at Phase 7 |
| 10 | Phase 1 commit too large to review | Acceptable for solo dev; PRD §6 says direct replacement |
| 11 | Mobile font loader still pulling Manrope after T1.5 | Phase 7 grep `Manrope` and `npm ls @expo-google-fonts/manrope` |

---

## Acceptance Criteria

PR is mergeable when ALL of these are true:

- [ ] All 7 phases committed on `redesign/v2`
- [ ] All cleanup grep gates return zero (Phase 7 list above)
- [ ] `npm run lint` passes (both apps)
- [ ] `npm run type-check` passes (both apps + shared)
- [ ] `npx vitest run` passes (web unit tests)
- [ ] `npm run test:e2e` passes (Playwright)
- [ ] Manual responsive QA on web (360 / 768 / 1024 / 1440) — no visual regressions
- [ ] Manual smoke test on Android device — all tabs, scheme retint, dark/light toggle, one full flow per area
- [ ] Both apps render dark mode by default for a fresh install
- [ ] Astra branding consistent — no "Claude" in user-facing strings
- [ ] Every screen in v8 bundle has a code path on both apps
- [ ] Every feature from the Repo Touch Matrix (PRD §4) still works
- [ ] `AGENTS.md` Key Files table updated if any paths changed
- [ ] PR opened against `main` with PRD body, references #103

---

## Notes for /implement

- The PRD (`#103` body + `.agents/PRDs/redesign-v2.prd.md`) is the authoritative spec. When this plan and the PRD disagree, the PRD wins — flag the discrepancy and ask before resolving.
- The v8 bundle at `.tmp/render/` is the visual spec. When this plan says "see v8 spec" or references a `.jsx` file there, read it directly rather than inferring from the description here.
- Phase boundaries are recovery points. If a phase produces too large a change to follow, commit what works and pause for review.
- This plan does NOT inline every primitive's spec — that would duplicate the v8 bundle. Read the bundle files when implementing.
- The 5 resolved open questions (PRD §14) are locked. Don't reopen them.
- PRD §15 mandates are non-negotiable: zero legacy, no workarounds, no half-implementations, no `as any`, no `// TODO` comments added by this migration left in code.
