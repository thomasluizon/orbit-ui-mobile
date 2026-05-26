# PRD — Orbit Redesign v2 (Linear-tactical · Astra-first · Dark-mode default)

**Author**: Thomas (vibe-coded, solo)
**Status**: Ready to implement
**Source design**: `.tmp/render/` (the v8 Claude Design bundle, 171 artboards across 23 sections)
**Mode of execution**: One branch (`redesign/v2`), one GitHub issue, one PR.

---

## 1. Executive Summary

Orbit's current visual language is the AI-default look — neon glow shadows, primary-tinted backgrounds, cards inside cards, Manrope, light-mode forward. After nine design iterations in Claude Design we converged on a different identity: **Linear-tactical dark-mode-first chrome with Astra as the headline AI assistant and Saturn-ring celebrations as the distinctive visual signature.**

This redesign migrates both `apps/web` (Next.js 15) and `apps/mobile` (Expo / React Native) to that visual language without changing any feature, route, data model, or API contract. Every habit, goal, streak, achievement, chat affordance, modal, drawer, banner, toast, celebration, onboarding step, and setting from the codebase audit must continue to work — just under the new chrome.

**MVP goal**: When this PR merges, the user opens the app on Android or web and sees the v8 design rendered against their real data, with every feature reachable, no regressions, and full cross-platform parity.

---

## 2. Mission

Orbit becomes the **calm AI-first habit tracker** — a tool you open twice a day for ten seconds, that gets out of your way, and that lets you talk to Astra when you need to plan, reflect, or restructure habits.

**Core principles**

1. **Dark by default.** Light mode is supported but secondary. Power users live in dark.
2. **Linear-tactical, not editorial.** No mastheads, no datelines, no editorial lede sentences. Compact app bars, plain section labels, dense rows. Software chrome.
3. **Astra is the headline.** AI prominence comes through the bottom-nav Astra tab (Sparkles icon, distinct), the structural Today AI Summary block, "Ask Astra about this" pull-quotes in detail drawers, and empty states that push to Astra first.
4. **Color comes back — small and real.** Linear-tier color: real desaturated status dots (primary for done, amber for overdue, rose for bad, cyan for frozen). Never as backgrounds, only as accents.
5. **Sub-habits are first-class.** Visible on default Today, in Habit Detail with a Children section, in Create Habit with active inputs (not just locked).

---

## 3. Target Users

**Primary persona**: Thomas (sole user) — long-time habit tracking power user, builds and ships solo. Technical comfort: high. Aesthetic preference: Linear, Cron, Notion-but-dense. Pain point with current Orbit: feels generic AI-template — wants identity.

**Key needs**

- Open the app once a day, glance at today's habits, log one or two, close.
- Talk to Astra to break habits down, plan a goal, or reflect on a week.
- See sub-habits, streaks, and progress at a glance without ceremony.
- Dark mode that doesn't burn eyes at 9pm.
- Same app on phone and tablet/web — responsive, parity.

---

## 4. Scope

### In Scope

**Frontend** (`apps/web`, `apps/mobile`):
- [ ] Migrate `packages/shared/src/theme/` to the v2 token system (OKLCH neutrals, 6 schemes, ~12 semantic tokens, 3 shadow tiers)
- [ ] Replace Manrope with **Geist Sans + Geist Mono** (`next/font` on web, `expo-google-fonts` on mobile)
- [ ] Rewrite `tailwind.config.js` (mobile NativeWind) + web's Tailwind config to mirror v2 tokens
- [ ] Replace all primitive components (AppBar, SectionLabel, HabitRow, StatusRing, Chip, BottomTabBar, PullQuote, ConfirmDialog) on both apps
- [ ] Migrate every screen on both apps to match v8 artboards exactly (see §6)
- [ ] Add Astra branding everywhere the AI is mentioned (the user-facing rename — code identifiers may stay as `chat` for path stability)
- [ ] Rebuild celebrations with the unified Saturn-ring motif (`RingMotif` primitive)
- [ ] Update i18n copy for empty states, Astra references, removal of editorial phrasing
- [ ] Responsive web layout: 360 / 768 / 1024 / 1440 widths
- [ ] Update Vitest + Playwright tests for snapshot/visual changes; mobile unit tests where applicable

**Shared** (`packages/shared`):
- [ ] Rewrite `color-schemes.ts` to OKLCH-based scheme system with the v2 token names
- [ ] No changes to Zod types, API endpoints, query keys — data model is preserved

**Backend** (`orbit-api`):
- [ ] **No changes.** The .NET 10 backend is untouched.

### Out of Scope

- [ ] **Feature flag gating.** Solo dev, one PR — direct replacement. (Rationale: no review, no rollout, no need for a flag.)
- [ ] **New features.** This is a pure visual + chrome migration. No new capabilities.
- [ ] **API surface changes.** Endpoints, request/response shapes, validation — all unchanged.
- [ ] **Data migrations.** No DB changes. No backfills.
- [ ] **iOS.** Mobile is Android-only.
- [ ] **Animation tuning beyond what v8 specifies.** Use the v8 motion budget (200-280ms, transform + opacity).
- [ ] **Tests for the celebrations being "beautiful".** Visual taste isn't unit-testable; rely on rendering.

### Repo Touch Matrix

| Capability | Frontend (`orbit-ui-mobile`) | Backend (`orbit-api`) | Shared (`packages/shared`) |
|---|---|---|---|
| Design tokens (OKLCH, schemes) | yes | no | yes |
| Geist Sans / Mono fonts | yes | no | no |
| Tailwind / NativeWind config | yes | no | no |
| Primitive components | yes | no | no |
| Today screen | yes | no | no |
| Astra/Chat screen | yes | no | no |
| Calendar screen | yes | no | no |
| Profile + 7 sub-screens | yes | no | no |
| Habit / Goal detail drawers | yes | no | no |
| Create / Edit sheets | yes | no | no |
| Streak / Achievements / Retrospective / Upgrade | yes | no | no |
| Auth (Login email + 6-digit code) | yes | no | no |
| Onboarding (7 steps, Meet Astra is #2) | yes | no | no |
| Notifications / Banners / Toasts / Drawers / Modals | yes | no | no |
| Celebrations (7 types, Saturn-ring motif) | yes | no | no |
| Confirm dialogs (7 variants) | yes | no | no |
| i18n copy updates | yes | no | yes |
| Tests (Vitest + Playwright + RN unit) | yes | no | no |

---

## 5. User Stories

1. **As Thomas, I want the app dark by default** so I'm not blinded when I check it before bed. *[frontend]*
2. **As Thomas, I want to see my habits in a tight, scannable list** so the daily check-in is fast — Linear-tight rows, status dot on the right, streak number inline. *[frontend]*
3. **As Thomas, I want sub-habits visible on the default Today screen** so I can drill into "Languages → Spanish / French" without hunting for them. *[frontend]*
4. **As Thomas, I want Astra to be the visible headline of the app** — distinct bottom-nav tab, AI summary block at the top of Today, "Ask Astra about this" in detail drawers — so the AI assistant feels first-class. *[frontend]*
5. **As Thomas, I want the celebrations to feel distinctive to Orbit** — Saturn rings, not generic confetti — so finishing a goal or hitting a streak feels like Orbit, not like any habit app. *[frontend]*
6. **As Thomas, I want the web app responsive** at 360 / 768 / 1024 / 1440 so I can use it on phone-web, tablet, laptop, and external monitor. *[frontend]*
7. **As Thomas, I want every existing feature to still work** — sub-habits, checklists, bad-habit slip alerts, scheduled reminders, goal metrics, streak freezes, achievements, retrospective, calendar sync, API keys — so nothing regresses. *[frontend]*
8. **As Thomas, I want my existing color scheme preference (purple/blue/green/rose/orange/cyan) to keep working** so my theme persists across the migration. *[frontend]*

---

## 6. Architecture & Patterns

### Approach

**Direct replacement, no flag.** Solo dev + one PR means we don't need migration hedges. Old theme + old components get deleted in the same PR that introduces the new ones. Branch protection is on the PR review, not on rollback safety.

**File-by-file strategy**:

| Layer | Action |
|---|---|
| `packages/shared/src/theme/color-schemes.ts` | Replace with OKLCH-based scheme system |
| `apps/mobile/lib/theme.ts` | Rewrite — collapse ~50 tokens to ~12 semantic, 11 shadows to 3 |
| `apps/web/app/globals.css` | Rewrite CSS variables to match the shared scheme |
| `apps/mobile/tailwind.config.js` | Mirror v2 tokens via NativeWind |
| `apps/web/tailwind.config.ts` | Mirror v2 tokens |
| `apps/mobile/components/**` | Per-component rewrite; delete obsolete |
| `apps/web/components/**` | Per-component rewrite; delete obsolete |
| `apps/mobile/app/**/*.tsx` | Screen rewrites |
| `apps/web/app/**/*.tsx` | Screen rewrites |

### State / Hooks

- **No new Zustand stores.** Existing UI store stays.
- **No new TanStack Query hooks.** Existing query keys + endpoints stay.
- **No new Server Actions** on web; existing actions stay (paths unchanged).
- **No new Zod types** in shared (existing types unchanged).

### Cross-platform pattern

The v8 JSX bundle is the visual spec. Implementations split by platform:

- **Web** — JSX from the bundle translates roughly 1:1 (with `next/font` + Tailwind utilities + CSS variables).
- **Mobile** — JSX translates to React Native with NativeWind classes for the simple bits and `StyleSheet.create` for the precise per-component styling that exists in the current codebase.
- **Shared logic** stays in `packages/shared` (types, utils, query keys, theme).

---

## 7. API Contract

**No backend changes.** Every existing endpoint, request shape, and response shape stays as-is. Reference: `packages/shared/src/api/endpoints.ts`.

---

## 8. UI / UX

### Routes (unchanged paths, new visuals)

**Web** (`apps/web/app/`):
- `/` → Today, `/calendar`, `/chat`, `/profile`, `/streak`, `/achievements`, `/retrospective`, `/preferences`, `/ai-settings`, `/advanced`, `/about`, `/privacy`, `/support`, `/calendar-sync`, `/upgrade`, `/login`, `/auth-callback`, `/r/[code]`

**Mobile** (`apps/mobile/app/`):
- `(tabs)/index.tsx`, `(tabs)/calendar.tsx`, `(tabs)/profile.tsx`, plus the same set of standalone routes (`/streak`, `/achievements`, `/retrospective`, `/preferences`, `/ai-settings`, `/advanced`, `/about`, `/privacy`, `/support`, `/calendar-sync`, `/upgrade`, `/login`, `/auth-callback`, `/r/[code]`, `/chat`)

### Bottom navigation (mobile)

4 tabs + centered Plus FAB:
- Home (Today)
- **Astra** (Sparkles icon, visually distinct — this is the AI prominence signal)
- [FAB] — Plus icon, primary fill, opens contextual create flow (CreateHabitSheet on most tabs, CreateGoalSheet on Goals tab, hidden on Astra/Profile tabs)
- Calendar
- You (Profile)

### Astra branding rules

- **User-facing**: every place the AI is referenced says "Astra", never "Claude" or "AI".
- **Code identifiers**: route paths and code-level names stay as `chat` for stability (the v8 bundle is the visual spec; route stability is a code concern).
- **Anthropic** is never mentioned. Astra is a first-party character.

### i18n keys to update

- Empty states: "Nothing scheduled." (keep), "Tell Astra what to track" (new — replaces "+ New habit" link)
- Astra-attributed prose: "How did the day land?", "ASTRA · HH:MM" attribution
- Onboarding step 2 title: "Meet Astra"
- AI Settings section: "What Astra knows"
- Drop editorial copy: no "A quiet record of small commitments.", no "Vol. 1 · Issue 47", no "ORBIT · A DAILY JOURNAL"

i18n updates apply to both `en.json` and `pt-BR.json`.

### Theme / color scheme

Six schemes preserved (purple, blue, green, rose, orange, cyan). Each has dark + light mode. **Dark is the default** for new installs. Existing users keep their preference.

OKLCH-based neutrals tinted by scheme `--hue`. Status dots use real desaturated color:
- `--status-done` = `var(--primary)`
- `--status-empty` = neutral fg-4
- `--status-skip` = neutral fg-3
- `--status-overdue` = `oklch(0.74 0.10 60)` (desaturated amber)
- `--status-bad` = `oklch(0.65 0.12 20)` (desaturated rose)
- `--status-frozen` = `oklch(0.72 0.07 235)` (desaturated cyan)

### Responsive (web only)

- 360px (phone-web): single column, bottom nav visible, FAB visible
- 768px (tablet): single column, bottom nav becomes top nav OR stays bottom (decide during implementation)
- 1024px (laptop): two-pane layout for Today (list left, detail right) — defer if time-boxed
- 1440px+ (monitor): same as 1024px, just centered with max-width

---

## 9. Data Model

**No domain changes.** Existing Zod schemas in `packages/shared/src/types/` (habit, goal, gamification, chat, notification, etc.) are unchanged. Existing TanStack Query keys are unchanged.

**Theme shape** is the only thing that changes in shared:

```ts
// packages/shared/src/theme/color-schemes.ts (v2)
export interface ColorSchemeV2 {
  primary: string             // OKLCH-derived hex for primary accent
  primaryPressed: string
  hue: number                 // OKLCH hue for neutrals tinting
  chromaBg: number            // tiny chroma for backgrounds (~0.012)
  chromaFg: number            // tiny chroma for foreground neutrals (~0.018)
}

export const schemes: Record<ColorScheme, { dark: ColorSchemeV2; light: ColorSchemeV2 }> = {
  purple: { dark: { primary: '#8b5cf6', primaryPressed: '#a78bfa', hue: 286, chromaBg: 0.014, chromaFg: 0.020 }, light: {...} },
  // ...
}
```

The mobile `theme.ts` precomputes the derived neutrals at scheme-switch time (OKLCH → RGB conversion via `culori` or a hand-rolled converter).

---

## 10. Security & Configuration

**No security changes.** Auth flow (email + 6-digit code, Google OAuth) is unchanged. Cookies, SecureStore, JWT handling all preserved.

**No new env vars.** Geist fonts load from Google Fonts CDN; no API key needed.

**New dependencies**:
- `@expo-google-fonts/geist` + `@expo-google-fonts/geist-mono` (mobile)
- `next/font` already in Next.js 15 (no install)
- `culori` (~9kb gzipped, optional — for OKLCH → RGB conversion on mobile)

---

## 11. Success Criteria

### MVP success

The PR is mergeable when:

1. **Every screen in the v8 bundle has a code implementation on both apps.** Reference: 23 DCSections, 171 artboards in `.tmp/render/Orbit App.html`.
2. **Every feature from the codebase audit still works.** Reference: §4 Repo Touch Matrix.
3. **No regressions in unit / integration tests.** Vitest + Playwright (web), RN unit tests (mobile) all pass.
4. **Visual match to v8 within ~5%.** Manual screenshot diff on the 4 most-viewed screens (Today, Chat, Habit Detail, Profile).
5. **Web is responsive** at 360 / 768 / 1024 / 1440.
6. **Both apps render in dark mode by default** for new sessions.
7. **Astra branding is consistent** — no remaining "Claude" references in user-facing strings.

### Functional requirements (checkboxes)

- [ ] User can log a habit and see the status ring flip to filled
- [ ] User can create a habit with sub-habits (Pro), checklist, tags, reminders, end date
- [ ] User can drill from a parent habit into a child habit's detail
- [ ] User can open Astra chat and see embedded cards (pending op, breakdown, clarification)
- [ ] User can view streak detail with the 80px hero number + week timeline + freeze section
- [ ] User can view goal detail with metrics panel + linked habits + progress history
- [ ] User can swipe between days on Today
- [ ] User can use the bulk action bar (select mode → log/skip/delete)
- [ ] User can run a retrospective (Pro yearly)
- [ ] User can complete the 7-step onboarding including "Meet Astra"
- [ ] User can switch between the 6 color schemes
- [ ] User can toggle dark / light mode

### Quality indicators

- All Vitest unit tests pass
- All Playwright E2E tests pass (or are updated for new selectors)
- No `console.log` in production code (per `AGENTS.md`)
- Zero `any` types (per `AGENTS.md`)
- All i18n keys exist in both `en.json` and `pt-BR.json`

---

## 12. Implementation Phases

The phases are checkpoints inside the single PR. Commit at each phase boundary so we can recover if something goes sideways.

### Phase 1 — Tokens & fonts

**Goal**: Both apps render with the new design system tokens, no component changes yet. Old components may look slightly different (token shifts) but everything still works.

**Deliverables**

- [ ] `packages/shared/src/theme/color-schemes.ts` rewritten to OKLCH scheme system
- [ ] `apps/mobile/lib/theme.ts` rewritten — ~12 semantic tokens, 3 shadow tiers, dark mode default
- [ ] `apps/web/app/globals.css` CSS variables match the new scheme
- [ ] Geist Sans + Geist Mono installed and wired (web via `next/font`, mobile via `@expo-google-fonts/geist`)
- [ ] `apps/mobile/tailwind.config.js` updated to mirror new tokens
- [ ] `apps/web/tailwind.config.ts` updated to mirror new tokens
- [ ] App boots, all screens still render (likely looking weird but functional)

**Validation**: `npm run dev` on both apps, smoke-test all tabs, no JS errors.

### Phase 2 — Shared primitives

**Goal**: New primitive components exist on both apps. Old components are unchanged. Screens still use old components.

**Deliverables**

- [ ] `AppBar` (52px tall, leading icon + title + subtitle + trailing cluster) — both apps
- [ ] `SectionLabel` (13px weight 600 muted) — both apps
- [ ] `HabitRow` (the new Linear-tight one with right-side status dot, tree-line for children) — both apps
- [ ] `StatusRing` / `StatusDot` (8px desaturated color) — both apps
- [ ] `Chip` (text-chip with active background fill, NOT underline) — both apps
- [ ] `BottomTabBar` (4 tabs + centered FAB with U notch) — mobile only
- [ ] `WebNav` (sidebar / top nav equivalent) — web only
- [ ] `PullQuote` (Claude/Astra messages with primary left rule) — both apps
- [ ] `ConfirmDialog` (3 variants, italic destructive label, no red) — both apps
- [ ] `RingMotif` (the Saturn-ring celebration primitive) — both apps

**Validation**: Storybook-like ad-hoc render of each primitive in isolation passes a visual check.

### Phase 3 — Core screens

**Goal**: The four screens you use 80% of the time are migrated.

**Deliverables**

- [ ] Today screen — both apps (including the Languages parent + Spanish/French children, AI Summary block, progress strip)
- [ ] Astra chat screen — both apps (with all 10 chat variants: active conversation, empty, pending op, breakdown, clarification, conflict, action chips, voice, message limit, offline)
- [ ] Calendar screen — both apps (month grid, today's primary dot)
- [ ] Profile screen — both apps (with 7 nav items, subscription card, account actions)

**Validation**: Open each tab, smoke-test the primary actions, dark + light mode swap, scheme retint.

### Phase 4 — Detail drawers & sheets

**Goal**: Every drawer / sheet from the bundle is implemented.

**Deliverables**

- [ ] Habit Detail drawer (7 variants: active, parent+children, skipped, checklist, bad, slip alert, linked goal)
- [ ] Goal Detail drawer (7 variants)
- [ ] Create / Edit Habit sheet (9 variants + emoji sheet)
- [ ] Create / Edit Goal sheet (6 variants)
- [ ] Notifications inbox sheet
- [ ] Referral drawer
- [ ] Feature guide drawer
- [ ] Quick action sheets (3-dot habit row menu)

**Validation**: Open each drawer/sheet, verify all variants render, verify the "+ Add sub-habit" affordance works in Habit Detail.

### Phase 5 — Sub-screens

**Goal**: All settings, gamification, and informational sub-screens.

**Deliverables**

- [ ] Streak detail (5 variants: 47/strong, low/3 days, frozen, monthly limit, legendary)
- [ ] Achievements (5 variants: level card, getting started, locked detail, earned detail, rarity legend)
- [ ] Retrospective (3 variants: content, generate, loading)
- [ ] Upgrade (3 variants: yearly, in-trial, expired)
- [ ] Preferences
- [ ] Advanced (free + Pro with API keys)
- [ ] AI Settings (free + Pro + facts paginated + facts select + facts empty)
- [ ] Calendar Sync (6 states)
- [ ] About / Privacy / Support

**Validation**: Navigate to each sub-screen from Profile, verify content and actions.

### Phase 6 — Flows, overlays, and parity

**Goal**: Auth, onboarding, modals, banners, toasts, celebrations.

**Deliverables**

- [ ] Login (4 variants: step 1, step 1 + referral, step 2 code, step 2 error)
- [ ] Onboarding (7 steps: Welcome, Meet Astra, Tell Astra what to track, Complete habit, Add goal, Features, You're set)
- [ ] Confirm dialogs (7 variants)
- [ ] Fresh start modal (2 steps)
- [ ] Delete account modal (3 steps)
- [ ] Trial expired modal
- [ ] Push prompt
- [ ] Version update drawer
- [ ] API key modal (new + reveal)
- [ ] Toasts (success, error, info, queued · undo)
- [ ] Celebrations (7 types with Saturn-ring motif)
- [ ] Edge banners (trial, trial last day, review reminder, session expiring, referral applied)

**Validation**: Trigger each overlay; verify celebrations animate; verify the queued-delete undo works.

### Phase 7 — Cleanup + tests + ship

**Goal**: Remove obsolete code; update tests; ship the PR.

**Deliverables**

- [ ] Delete old `EditionMasthead`, old eyebrow components, old card components, old shadow tokens, old `theme-v1` references
- [ ] Update Vitest unit tests for new component shapes
- [ ] Update Playwright E2E selectors where they referenced old DOM
- [ ] Update i18n keys in `en.json` and `pt-BR.json`
- [ ] Run `/validate` across both apps
- [ ] Manual responsive QA on web (360 / 768 / 1024 / 1440)
- [ ] Manual smoke test on Android device
- [ ] Update `AGENTS.md` to reflect new component structure
- [ ] Open PR

**Validation**: All tests green, no console errors, manual QA passes.

---

## 13. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Scope is large, may exceed one session | Persistent `redesign/v2` branch + commit at each phase boundary. Resume across sessions. |
| OKLCH not natively supported in React Native | Precompute neutrals at scheme-switch time using `culori` or a hand-rolled converter. |
| Some v8 JSX patterns don't translate cleanly to RN (e.g., CSS-only effects) | Flag in-line; we decide together. Don't silently substitute. |
| Tests break during the transition | Update tests in the same PR. Tests are part of "merge-ready". |
| Geist font load delay on slow networks | Use `next/font` with `display: swap` on web; cache the font file on first launch on mobile. |
| Cross-platform parity drift (web has a feature mobile doesn't, or vice versa) | The Repo Touch Matrix is the source of truth. Phase 7's validation step checks parity explicitly. |
| User color scheme preference breaks on first load post-migration | Preserve the existing scheme persistence key; migration code reads old value and maps to new scheme name (same names). |

---

## 14. Open Questions

| # | Question | Default if no answer |
|---|---|---|
| 1 | Delete `apps/mobile/lib/theme.ts` v1 entirely, or keep a `theme-v1.ts` for reference? | **Delete.** Git preserves history. |
| 2 | Keep code-level identifiers as `chat` (route stays `/chat`)? | **Yes.** Code stability, user-facing only renames to Astra. |
| 3 | Web responsive: should we build the 1024px+ two-pane layout in this PR, or defer? | **Defer to a follow-up.** Single column at all widths, just centered. |
| 4 | Update copy that mentions "Claude" in code comments and commit messages? | **Only user-facing strings.** Comments can stay. |
| 5 | Migrate Playwright snapshot tests or just delete and recreate? | **Delete and recreate.** The visual diff would be too large to review. |

---

## 15. Code Quality Mandates (non-negotiable)

These are explicit and enforced. If a phase's deliverable cannot be met without violating one of these, **flag it before merging — do not silently work around it.**

### Zero legacy / dead code

- When a component is replaced, **delete the old file in the same commit.** No `_v1.tsx` suffixes. No `_old/` directories. No commented-out old implementations. Git preserves history.
- After each phase, run `grep -r "import.*<old-component>"` across both apps; if the result is empty, **delete the old component file.**
- Delete obsolete:
  - Component files (e.g., `habit-card.tsx` if `habit-row.tsx` replaces it)
  - i18n keys (audit `en.json` / `pt-BR.json` — drop any key no longer referenced)
  - Type exports (run `tsc --noUnusedLocals` on shared types)
  - Dependencies in `package.json` (Manrope font packages, replaced icon libs, etc.)
  - Test files for deleted components
  - CSS classes / token aliases that no caller uses
- Update `AGENTS.md`'s Key Files table when files move or disappear.

### No workarounds

- If a v8 JSX pattern doesn't map cleanly to React Native, **implement it properly** — build a native equivalent, don't ship a `// TODO: fix later` shim.
- If a CSS-only effect can't be achieved on mobile, **either implement it natively or document the deliberate divergence in the file's header comment.** No silent substitutions.
- If a feature requires a backend change to work right, **stop and discuss** — do not fudge the frontend. The PRD says backend is out of scope; if that turns out to be wrong, we reopen the scope, we don't paper over it.
- No `setTimeout`s to "make it work". No magic numbers to hit the visual. No `as any` to bypass types.

### Best implementation discipline

Mandatory in every file changed:

- **Zero `any` types.** Use `unknown` with narrowing per `AGENTS.md`.
- **Zero `console.log`** in production paths.
- **Named exports only.** kebab-case filenames, PascalCase component names.
- **All user-facing strings** through i18n. Never hardcode display text.
- **All sizing, spacing, color, typography** from design tokens. No magic numbers (`24px`, `#fff`, etc.) outside the theme files themselves.
- **No inline styles** when a Tailwind utility / NativeWind class can express the same. Inline styles are reserved for runtime-computed values (e.g., a scheme primary color).
- **No prop drilling.** Use existing Zustand stores + TanStack Query patterns. If state lives more than 2 components deep, lift it.
- **Composition over duplication.** Shared primitives (AppBar, Chip, HabitRow, etc.) live in one place per app and are reused. No copy-paste of styling between screens.
- **Server Components by default** on web; `"use client"` only when truly needed.
- **No silent fallbacks.** Throw typed errors at boundaries. Render explicit error / empty / loading states.

### No half-implementations

- If a screen has N variants in the v8 bundle, all N must be reachable in code (most as states of the same component).
- Don't ship "the chevron / animation / freeze ring will be added later." If it's in the design, it ships. If it can't ship, it gets cut from scope explicitly in this PRD.
- Every artboard the user can navigate to in the v8 canvas has a corresponding code path.

### Validation gate at each phase boundary

Before committing the end of each phase:

```bash
npm run lint           # both apps
npm run typecheck      # both apps + shared
npx vitest run         # web unit tests
npm run test:e2e       # web E2E (Playwright)
# mobile: jest if applicable; otherwise smoke-boot the app
```

A phase is **not complete** until all the above pass. If a phase introduces a test failure that's accurate (the test was checking the old behavior), update the test in the same commit — don't skip it.

### Cleanup audit (Phase 7)

The final phase explicitly includes:

- [ ] `grep -r "EditionMasthead\|SectionEyebrow\|HabitCard\|primaryTintBg\|shadowGlow\|Manrope" apps/ packages/` returns **zero** results
- [ ] `grep -r "Claude" apps/*/app apps/*/components apps/*/lib` user-facing strings returns **zero** results (comments / code identifiers are allowed)
- [ ] `npm ls manrope` and `npm ls @expo-google-fonts/manrope` return empty
- [ ] All deleted route files have their old screens removed from `_layout.tsx` registries
- [ ] No `// TODO` / `// FIXME` / `// HACK` comments added by this migration remain in code

---

## Recommended Next Steps

1. **Resolve the 5 open questions** (defaults above are fine — just confirm).
2. **Create the single GitHub issue** referencing this PRD:
   ```
   gh issue create --title "Migrate Orbit (web + mobile) to v2 Linear-tactical design" \
     --body-file .agents/PRDs/redesign-v2.prd.md \
     --label "repo:both"
   ```
3. **Create the branch**: `git checkout -b redesign/v2`
4. **Start Phase 1** (tokens & fonts) — `/prime <issue#>` → `/plan <issue#>` → `/implement <plan>`.

Note: we deliberately **skip `/create-stories`** since this is one issue, one PR by design.
