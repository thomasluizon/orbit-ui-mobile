# Plan: #539 b5 — Apply the frozen design in code + drive every `local/*` warn to zero (web + mobile)

## Summary

b5 is the "nothing left" bundle: it takes the owner-approved Today freeze (desktop `KQMPM`, mobile `N8aEDF`) and the enforcement gates shipped in #557/#558, and lands them in real code on **both** `apps/web` and `apps/mobile`, driving **every** `local/*` warning to **zero** and then flipping the staged gates from `warn` to `error` so CI proves nothing was skipped. It runs as a **phased hybrid**: (0) a serial token foundation that re-anchors the whole system to the frozen bytes and lands the 6-tier z-index scale; (1) a serial, parity-locked design core (habit-list tonal panels + drill-in, desktop right rail, Astra card, 740px cap, Criar h38); (2) blast-radius-batched mechanical de-decoration + z-index remap + the deferred warn backlogs, batched so lint/build/test stay green batch-to-batch; (3) the three gate-found bugs + the four Ask-Astra copy fixes; (4) the serial contract flip (glow/gradient → `error`, land `local/no-arbitrary-zindex`); and (5) a later read-only ultracode verify fan-out (not planned here). One branch `feature/539-b5-apply-design`, one PR with staged commit groups; splittable only if the design-core diff becomes unreviewable.

The scope is dominated by a **token recompute** (DESIGN.md's own "Recompute note for bundle 5": canvas, fg ramp, hairline alphas, and accent all moved) and by **two net-new desktop rail modules** the freeze added that do not exist in code yet. Both are called out as the highest-attention items below.

## Metadata

| Field | Value |
|---|---|
| Type | DESIGN_APPLICATION + gate hardening |
| Complexity | HIGH (largest #539 bundle) |
| Repos | orbit-ui-mobile only (UI). No orbit-api change expected — flag if a data source is missing. |
| Parity Required | YES, mandatory — every web change mirrors on mobile in the same batch; i18n keys land in both locales |
| Branch / PR | `feature/539-b5-apply-design`, one PR, staged commits |
| Verify | separate later read-only ultracode fan-out (Phase 5, not planned here) |

## Verified real lint inventory (measured this session, authoritative)

- **Web (`npm run lint`, from the worklist — do NOT re-run):** `no-raw-gradient` 27 · `no-decorative-glow` 19 · `no-space-x-y` 63 · `react19-api` 18 · `require-focus-replacement` 17 (real WCAG 2.4.7) · `no-scroll-listener-motion` 4 · `no-dynamic-tailwind-class` 1 · `animate-presence-exit` 1. Plus `jsx-a11y/no-noninteractive-element-interactions` 1 (the `goal-list.tsx` draggable section).
- **Mobile (`npx expo lint`, re-verified live this session — the worklist's direct-eslint numbers were wrong):** **exactly 36 warnings, 0 errors** = `no-raw-gradient` **26** + `no-decorative-glow` **10**. The worklist's `no-comments` 94, the 2 `theme.test.ts` glow warns, and `no-gorhom-sheet` 1 are **direct-eslint artifacts** — `expo lint` ignores `__tests__`, so they are **out of scope** for the mobile warn-clear. (They still matter for the contract flip: see Risk R4.)
- **z-index owners are NOT currently lint-flagged** — `local/no-arbitrary-zindex` does not exist yet. The remap is driven by the *new* rule this bundle creates, grounded on the inventory in Phase 2 batch Z.

## Phases & batches

Ordering is strict. Foundation unblocks everything; the contract flip is second-to-last; verify is last.

---

### Phase 0 — Token foundation (SERIAL, do first; everything depends on it)

The freeze moved the anchors. Re-derive to the frozen bytes and land the z-scale. This is the highest-risk phase (a wrong byte cascades everywhere) and the one place OKLCH must be recomputed by hand and asserted by test.

**Batch 0a — accent + neutral re-anchor (shared source of truth)**
- `packages/shared/src/theme/color-schemes.ts`: purple accent dark `#7f46f7`/`#631df2` → **`#8659EA`/`#6E44D2`** (primaryRgb `134, 89, 234`); move purple `neutralHue` off `265.1322` to the neutral/faint-cool hue that resolves the canvas to `#070910`; delete every `gradientHeaderFrom` field (no gradient wash) and `colorSchemeOptions` purple `#7f46f7` → `#8659EA`.
- `packages/shared/src/theme/neutral-ramp.ts`: recompute `neutralRamp.dark` L/C/hueOffset so purple/dark resolves **byte-exact** to `#070910` bg, `#F6F7F9`/`#C7CBD2`/`#888E99`/`#565C67` fg-1..4 (targets from DESIGN.md Tokens); re-verify light targets hold; **delete `primaryTintAlphas.glow: 0.45`** and the `gradientHeaderFrom`/gradient-stop exports.
- **DESIGN.md "Recompute note for b5" applies:** the 5 non-purple schemes' bytes and every AA measurement other than purple/dark must be recomputed against the new anchors, and the hand-tune log re-verified line by line.
- **Green-check:** `packages/shared` `npm test` green after re-baselining `packages/shared/src/__tests__/theme.test.ts` (it currently asserts the PRE-freeze bytes: `#7f46f7`, bg `#020618`, fg1 `#f8fafc`, and the gradient-header stops — all must change; the gradient-header assertions at lines 59-63/133-136 are deleted).

**Batch 0b — web token layer (mirror of 0a)** — `apps/web/app/globals.css`
- Replace the default + `.scheme-purple.*` accent literals (`--primary`, `--primary-pressed`, `--primary-rgb`, `--hue`) with the frozen values; move the fg-ramp OKLCH formulas (lines 188-191) to the new fg targets; set `--primary-soft` to resolve `#B69BF8` on purple/dark.
- **Delete** `--primary-glow` + `--primary-glow-hover` (lines 61-62), `--gradient-header` (lines 205, 252) and `--gradient-header-from` per scheme, and remove `box-shadow: var(--primary-glow)` from `.pill-link` (887) and the `0 0 16px` glow on `.ai-spark-btn:hover` (932-934). Add `--z-*` scale vars (see 0c).
- **Green-check:** `apps/web` `npm run lint` shows no *new* errors; build compiles.

**Batch 0c — the 6-tier z-index scale in theme tokens (both platforms)**
- Shared names: `dropdown < sticky < modal-backdrop < modal < toast < tooltip`, plus the two Orbit carve-outs — **celebrations just-below-`toast`**, **tour-spotlight above-`modal`** (it points AT modals; the exact thing a generic scale gets wrong).
- Web: `--z-dropdown/--z-sticky/--z-modal-backdrop/--z-modal/--z-celebration/--z-toast/--z-tooltip/--z-tour-spotlight` in `globals.css` `@theme`, exposed to Tailwind as `z-*` utilities.
- Mobile: a `zLayers` const exported from `apps/mobile/lib/theme.ts` (or `packages/shared/src/theme/` if kept platform-neutral) with the same tier names/order.
- DESIGN.md already documents these tiers in `### Stacking`; conform to it, do not re-decide.
- **Green-check:** tokens resolve; a tiny shared unit test asserts the tier ordering is strictly monotonic with the two carve-outs placed correctly.

**Batch 0d — accent-AA three-floor gate (build/verify — see Risk R1)**
- DESIGN.md `## Enforcement` attributes the three-floor accent-AA gate (per scheme × mode: white-on-`--primary` ≥ 4.5; `--primary`-on-canvas ≥ 3.0; `--primary-soft`-on-canvas ≥ 4.5) to b4, but it does **not** appear to exist — only the older `fgOnPrimary` ≥ 4.5 check in `theme.test.ts` does. Build it in `packages/shared/src/__tests__/theme.test.ts` (or a sibling) if absent; the new tokens are chosen to satisfy it.
- **Green-check:** the three-floor assertions pass for all 6 schemes × 2 modes.

Parity pairs (Phase 0): `globals.css` ↔ `apps/mobile/lib/theme.ts` ↔ `packages/shared/{color-schemes,neutral-ramp}.ts` (mobile consumes the shared re-anchor automatically via `createTokensV2`; verify `apps/mobile` `npm test` `theme.test.ts` re-baselined too).

---

### Phase 1 — Design core (SERIAL, parity-locked; mockups open alongside)

Structural UI. Do web and its mobile mirror in the same step. Reviewer-heavy — keep as its own commit group.

**Batch 1a — habit-list tonal panels + drill-in (web + mobile)**
- Introduce a per-top-level-habit **tonal panel** wrapping a simple habit (single row) or a family (parent + inline sub-habits) on ONE panel: `--bg-elev` fill + inset `--hairline-ghost` ring, radius 18, panel row height matching parent-row height (web ~70px via zeroed panel v-padding; mobile ~66px). Today both platforms render a flat, depth-indexed sibling list with **no family container** — the panel is net-new grouping.
  - Web: `apps/web/components/habits/habit-list.tsx` (`renderHabitCard` ~L831-900, the flat map at ~L1068-1099) + `apps/web/components/habits/habit-row.tsx` (currently each row carries its own `bg-card` + inset ring + `marginBottom` — moves into the panel).
  - Mobile: `apps/mobile/components/habit-list.tsx` (`buildFlatHabitItems` ~L532, `renderHabitCard` ~L1081-1210) + `apps/mobile/components/habits/habit-row.tsx` + `apps/mobile/components/habits/habit-row-styles.ts` (row radius 18 already correct).
- **Two levels inline, then drill-in past level 2**: violet `›` = open-in-focus (reuses existing `onDrillInto`/`useDrillNavigation` — web `HabitListDrillContent`, mobile `HabitListDrillView`), grey `⌄` = expand-in-place, grey `›` = collapsed family. **Zero connector/tree lines** (remove any indent guide). Preserve the **per-row `⋮` kebab** and swipe/context actions (the mockup omits the kebab; the code keeps it — DESIGN.md is explicit).
- Habit emoji stay **full-color**; remove the orange **Sparkles ✨** default/AI habit marker.
- **Green-check:** lint/build/test green; habit-row behavior tests (below) pass; `parity-checker` clean.

**Batch 1b — desktop right rail redesign (web-only layout adapter)**
- `apps/web/components/shell/today-rail.tsx`: switch the module stack to `justify-content: space-between` (gap 20, trim redundant per-section top-padding); order top→bottom: progress ring · stats (Restantes/Sequência/Nível+bar/Conquistas) · **Consistência** 7-day mini bar chart · **Próxima conquista** progress module · **Astra pill** pinned bottom.
- `apps/web/components/shell/progress-orbit.tsx`: thin the ring to `innerRadius` 0.94 (~6px band) — today it is `r = size/2 - 12`, strokeWidth 4; re-derive to the frozen band.
- **NET-NEW (see Risk R2):** the **Consistência 7-day bar chart** and **Próxima conquista** modules do not exist — build them in `today-rail.tsx` (or sibling components under `components/shell/`), wiring existing data (7-day consistency from streak/retrospective hooks; next-achievement progress from the achievements hook). Astra pill reuses `astra-avatar.tsx`.
- Parity note: the rail is a **desktop-only layout adapter** (DESIGN.md "Right rail (desktop)"); mobile keeps its single-column Today (`N8aEDF`) — this is an allowed platform difference, not a parity gap. Mobile progress stays the horizontal `ProgressBar` in `apps/mobile/components/today/today-habits-header.tsx` (no ring on mobile).
- **Green-check:** lint/build green; visual-regression `visual.yml` Today surface re-baselined if it screenshots the rail.

**Batch 1c — Astra card + 740px cap + Criar h38 (web + mobile)**
- Astra card: swap the `Sparkles` glyph for the orbital `AstraMark` (`apps/web/components/ui/astra-avatar.tsx`) and **drop the "IA" badge** — web `apps/web/components/habits/today-ai-summary.tsx:121-141`, mobile `apps/mobile/components/habits/today-ai-summary.tsx:110-112`. (The `aiDisclosure.isAiLabel` key stays for legal disclosure elsewhere; only the Today card badge is removed.) Calm copy, no em-dash/exclamation.
- 740px cap: change `--app-max-w` (`globals.css:393` clamp 640→920) or the `max-w-[var(--app-max-w)]` at `apps/web/components/shell/app-shell.tsx:259` to the frozen ~740px centered main column.
- Criar height 38: `apps/web/components/navigation/app-sidebar.tsx:141-169` `PillButton` — set height to 38 (currently `size="md"` = h50). Prefer a sanctioned size token over a hand-tuned height (DESIGN.md bans hand-tuned button heights) — confirm whether this is a new `size` or a documented one-off (Risk R5).
- **Green-check:** lint/build green.

---

### Phase 2 — Mechanical de-decoration + z-remap + warn backlogs (BATCHED by blast radius)

Each batch is self-contained and closes with a green lint/build/test so CI stays green batch-to-batch. Batches touch a file exactly once (families that carry glow AND gradient AND z-index are handled together). i18n untouched here.

**Batch G — delete `GradientTop` primitive + all consumers (web + mobile)**
- Delete `apps/web/components/ui/gradient-top.tsx` + `apps/mobile/components/ui/gradient-top.tsx` (DESIGN.md: `GradientTop` is deleted). Remove every `<GradientTop>` usage and `expo-linear-gradient` import: web `today-page-view.tsx:40`, and the shared consumers; mobile `app/(tabs)/index.tsx:462`, `app/upgrade.tsx:192`, `app/wrapped-player.tsx:67`, `components/onboarding/onboarding-flow.tsx:405`, `components/share/share-card.tsx:4,50`, `components/milestone-share/milestone-share-card.tsx:4,38`. Replace with a flat `--bg`/token surface.
- **Green-check:** both apps lint (gradient warns drop), build green.

**Batch B-cel — gamification celebrations (glow + gradient + z-index, web + mobile, 5×2 files)**
- Web `components/gamification/{all-done,goal-completed,level-up,streak,streak-freeze}-celebration.tsx`: strip glow (worklist lines) + gradient (worklist lines) + remap the overlay `z-[10001..10003]` (agent3) to `--z-celebration`; the two toasts `achievement-toast.tsx:114` / `welcome-back-toast.tsx:21` `zIndex:10000` → `--z-toast`.
- Mobile mirrors: `components/gamification/*` glow + gradient (expo-lint lines) + `zIndex 10001..10003` (celebrations) and `10000` (achievement/welcome-back/`app-toast.tsx`) → `zLayers`.
- **Green-check:** lint/build/test green (celebration tests assert behavior, not z).

**Batch B-onb — onboarding (glow + gradient + z)** — web `components/onboarding/{onboarding-flow,onboarding-create-goal,onboarding-create-habit}.tsx` (flow `z-[60]`→`--z-modal`); mobile mirrors (`onboarding-flow.tsx:405` gradient, `onboarding-create-goal/habit.tsx` glow). Green-check: lint/build/test green.

**Batch B-tour — tour (glow + z + spotlight carve-out)** — web `tour-spotlight.tsx:46 z-[9998]` → `--z-tour-spotlight`, `tour-tooltip.tsx:263-265,361` glow+z, `tour-provider.tsx:268` scroll-listener; mobile `tour-tooltip.tsx:191,266,273` + `tour-spotlight.tsx:75`. Green-check: lint/build/test green.

**Batch B-share — share / milestone-share cards (gradient)** — web `share/share-card.tsx:77`, `milestone-share/milestone-share-card.tsx:55`; mobile mirrors. Note these render exported images; flat surface per DESIGN.md. Green-check: lint/build/test green (share-card snapshot re-baselined if any).

**Batch B-overlay — overlay primitive z-index + globals.css literals (web)** — `command/command-palette.tsx:52`, `shell/rail-drawer.tsx:60`, `ui/context-menu.tsx:158`, `ui/popover.tsx:179`, `ui/confirm-dialog.tsx:147`, `ui/centered-overlay.tsx:50`, `ui/app-overlay.tsx:235`, `ui/expiry-warning.tsx:63` → correct scale tiers; `globals.css` `.fresh-start-overlay` `z-index:99999`→`--z-modal`, the `40`/`50`/`-1` local contexts left as documented low local stacking. Mobile: `components/ui/{app-toast,expiry-warning}.tsx`, `upgrade-required-screen.tsx:62`, `scroll-to-top-button.tsx:96`, `habit-row-check-circle.tsx:99` (`elevation:3`). Green-check: overlay tests green.

**Batch B-glow-rest — remaining single glow sites** — web `achievements-locked-state.tsx:17`, `next-reward-carrot.tsx:16`, `retrospective/locked-block.tsx:2`, `streak-sections.tsx:563`, `chat-composer-bar.tsx:428,433`, `chat-empty-state.tsx:22`, `insights-locked-state.tsx:29`, `bottom-tab-bar.tsx:72`, `astra-copilot-rail.tsx:52`, `pill-button.tsx:71`, `plan-card.tsx:31`; mobile `streak-sections-freeze.tsx:254`, `bottom-tab-bar.tsx:79`, `app-error-boundary.tsx:41`, `pill-button.tsx:98`, `next-reward-carrot.tsx:70`, `chat.styles.ts:36,290` (the 3 the original list missed). Delete `primaryGlow()` from `apps/mobile/lib/theme.ts:287-295` once its last caller is gone. Green-check: `primaryGlow` unreferenced; lint/build green.

**Batch B-grad-rest — remaining single gradient sites (web)** — `calendar/page.tsx:308`, `profile-header-bar.tsx:33`, `social/challenges/[id]/page.tsx:20`, `social/challenges/page.tsx:57`, `social/page.tsx:96`, `upgrade/page.tsx:143`, `wrapped-player.tsx:61`, `(auth)/layout.tsx:22`, `chat/page.tsx:124`, `calendar-agenda-view.tsx:51,588`, `calendar-day-detail.tsx:263`, `calendar-time-grid.tsx:37,488`, `public-profile-view.tsx:46`, `app-shell.tsx:257`, `astra-copilot-rail.tsx:76`; mobile `calendar.tsx:403`, `calendar-loading-bar.tsx:12,74`, `profile.tsx:151`, `accountability-pair.tsx:107`, `auth-callback.tsx:174`, `chat.tsx:193`, `login.tsx:60`, `social.tsx:82`, `social/challenges.tsx:85`, `social/challenges/[id].tsx:24`. Green-check: gradient warns → 0 both apps.

**Batch S — `no-space-x-y` (63 web, mostly `habit-form-fields`)** — convert `space-x/y-*` to `flex`+`gap-*` per the worklist file:line list (heavy in `components/habits/habit-form-fields.tsx` + sub-editors, `advanced-sections.tsx`, `message-bubble.tsx`). Mechanical; own commit. Green-check: `no-space-x-y` → 0.

**Batch R19 — `react19-api` (18 web)** — migrate the flagged `forwardRef`/`use(Context)`/`propTypes`-era API to the React 19 pattern (worklist list; ~9 are `__tests__`, ~9 components incl. `today-provider.tsx:50`, `habit-list.tsx:114`, `topbar-slot.tsx:54,64`). Green-check: `react19-api` → 0; build (React Compiler) green.

**Batch F — `require-focus-replacement` (17 web, REAL WCAG 2.4.7 — root-cause, no suppression)** — each `outline-none`/`outline:none` gets a real visible `:focus-visible` replacement painted from the accent token, per the worklist list (`habit-multi-select`, `new-pair-flow`, `support-field`, `today-shell:275`, `chat-composer-bar:370`, `pending-operation-card:220`, `command-menu:181`, `field-well:50`, `checklist-templates:132`, `sub-habit-editor:85`, `reminder-section:134`, `tag-editor-row:36`, `app-date-picker:155`, `app-select:29`, `app-time-picker:159`, `context-menu:222`, `create-api-key-modal:344`). Green-check: `require-focus-replacement` → 0; keyboard-focus visible on each (manual/axe spot-check).

**Batch M — `no-scroll-listener-motion` (4 web)** — `tour-provider.tsx:268` (in B-tour if adjacent), `back-to-top.tsx:46`, `context-menu.tsx:114`, `use-popover-menu.ts:150` — remove scroll-driven motion per DESIGN.md motion-frequency gate (delete > tune). Green-check: rule → 0.

Parity note (Phase 2): every web glow/gradient/z file has a mobile mirror in the same batch where one exists; `no-space-x-y`/`react19-api`/`require-focus-replacement`/`no-scroll-listener-motion` are **web-only** rules (Tailwind/RSC/DOM-focus/DOM-scroll) with no mobile counterpart — no mirror needed, but `parity-checker` should confirm no behavioral drift was introduced.

---

### Phase 3 — Gate-found bugs + copy (SERIAL)

**Batch 3a — the 3 gate-found bugs**
- `apps/web/app/(auth)/login/login-atoms.tsx:3`: `size-${size}` is a dynamic Tailwind class purged in prod → make static (map `size` to literal `size-4`/`size-5` classes, or set width/height via inline style). Behavior test: spinner renders with dimensions.
- `apps/web/components/share/share-card-sheet.tsx:110`: `m.div` under `AnimatePresence` has `initial`+`animate` but no `exit` → add `exit` mirroring `initial` (`{ opacity: 0, y: cardEnterMotion.shift }`) per DESIGN.md "mirror exit against initial". This clears the `animate-presence-exit` warn.

**Batch 3b — the 4 Ask-Astra eyebrow copy fixes (i18n, both locales)** — DESIGN.md: eyebrows label, never enumerate; store copy in **natural case** and control caps with `text-transform`; ration eyebrows (≤1 per 3 sections); Astra register calm.
- `apps/web/components/habits/today-ai-summary.tsx:137`: hardcoded literal `Astra` rendered uppercase → move to an i18n key in `en.json`+`pt-BR.json` (natural case), keep the CSS `text-transform`.
- `goals/goal-ask-astra-row.tsx` (`goals.detail.askAstraEyebrow` = `"ASK ASTRA"`/`"PERGUNTE À ASTRA"`) and `habits/habit-detail-drawer/habit-ask-astra-button.tsx` (`habits.detail.askAstraEyebrow`, same values): change the stored values to **natural case** (`"Ask Astra"`/`"Pergunte à Astra"`) — the baked-in UPPERCASE violates the copy gate; presentation stays uppercase via `text-transform`.
- `retrospective.astraEyebrow` (`"Astra"` both locales; used in `retrospective-dashboard.tsx:261`, `-empty-state.tsx:19`, `-no-data-state.tsx:19`) — already natural case; confirm it is not enumerating and that eyebrow rationing holds on the surface.
- **Green-check:** the AI-cliché/UPPERCASE copy hook passes over `en.json`+`pt-BR.json`; `i18n-syncer` clean (keys in both locales).

---

### Phase 4 — Contract flip (SERIAL, second-to-last; the "nothing left" gate)

Only after Phases 0-3 make the warns zero.
- **Flip `warn` → `error`** in `apps/web/eslint.config.mjs:111-112` and `apps/mobile/eslint.config.js:112-113`: `local/no-decorative-glow`, `local/no-raw-gradient`.
- **Land `local/no-arbitrary-zindex`**: new `eslint-rules/no-arbitrary-zindex.cjs` (bans `z-[n]`, off-scale `z-*`, raw `zIndex`/`elevation` numeric literals, and any z on a shadcn overlay primitive; allowlist the `--z-*`/`zLayers` scale), 100% RuleTester coverage (b4 pattern), registered in **both** eslint configs at `error`.
- **Also flip the other cleared backlogs to `error`** (scope = ALL to zero + gates-over-prose): `animate-presence-exit`, `no-dynamic-tailwind-class`, `no-scroll-listener-motion`, `no-space-x-y`, `react19-api`, `require-focus-replacement`, and `jsx-a11y/no-noninteractive-element-interactions` — each only after its batch is verified zero. (See Risk R4 for the mobile test-file glow/gorhom references that the flip must not trip.)
- Update `test-hooks` / eslint-rules RuleTester suites for the new rule; run them green.
- **Green-check:** `npm run lint` (web) + `npx expo lint` (mobile) both exit clean with these at `error`; `packages/shared` + both apps `npm test` green; `tools/rollup.sh` GREEN.

---

### Phase 5 — Verify (LAST; NOT planned here)

A separate read-only ultracode fan-out: `design-reviewer` per surface vs the frozen mockups + a skeptic glow/parity/motion sweep + `accesslint-scan` on the changed surfaces. Its job is to prove the freeze landed and nothing regressed; do not plan its agents here.

## Files (grouped by phase)

**Phase 0 (foundation):**
- `packages/shared/src/theme/color-schemes.ts`, `packages/shared/src/theme/neutral-ramp.ts`, `packages/shared/src/__tests__/theme.test.ts`
- `apps/web/app/globals.css`
- `apps/mobile/lib/theme.ts` (z-scale export; glow removal lands in Phase 2 B-glow-rest)
- `apps/mobile/__tests__/lib/theme.test.ts` (re-baseline)

**Phase 1 (design core):**
- Web: `components/habits/habit-list.tsx`, `components/habits/habit-row.tsx` (+ `habit-row-leading/-content/-trailing`, `habit-list/*` drill), `app/(app)/today-sections.tsx`, `app/(app)/today-page-view.tsx`, `components/shell/today-rail.tsx`, `components/shell/right-rail.tsx`, `components/shell/progress-orbit.tsx`, `components/shell/app-shell.tsx`, `components/habits/today-ai-summary.tsx`, `components/ui/astra-avatar.tsx`, `components/navigation/app-sidebar.tsx`, + net-new Consistência/Próxima-conquista modules
- Mobile: `components/habit-list.tsx`, `components/habits/habit-row.tsx`, `components/habits/habit-row-styles.ts`, `components/habits/habit-row-leading.tsx`, `components/habit-list/drill-view.tsx`, `components/habits/today-ai-summary.tsx`, `components/today/today-habits-header.tsx`, `app/(tabs)/index.tsx`

**Phase 2 (mechanical):** all worklist file:line targets (web 19 glow / 27 gradient / 63 space-x-y / 18 react19 / 17 focus / 4 scroll; mobile 10 glow / 26 gradient) + the z-index owners inventory (web: command-palette, rail-drawer, 5 celebrations, 2 toasts, tour-spotlight/tooltip, context-menu, popover, confirm-dialog, centered-overlay, app-overlay, expiry-warning, onboarding-flow, `globals.css`; mobile: 13 high-tier overlay/tour/toast files + chat.styles/tab-bar/ring-motif/scroll-to-top/create-api-key-modal/habit-row-check-circle) + delete `apps/{web,mobile}/components/ui/gradient-top.tsx`.

**Phase 3 (bugs/copy):** `apps/web/app/(auth)/login/login-atoms.tsx`, `apps/web/components/share/share-card-sheet.tsx`, `apps/web/components/habits/today-ai-summary.tsx`, `apps/web/components/goals/goal-ask-astra-row.tsx`, `apps/web/components/habits/habit-detail-drawer/habit-ask-astra-button.tsx`, `packages/shared/src/i18n/en.json`, `packages/shared/src/i18n/pt-BR.json`

**Phase 4 (contract flip):** `apps/web/eslint.config.mjs`, `apps/mobile/eslint.config.js`, `eslint-rules/no-arbitrary-zindex.cjs` (new) + its RuleTester spec, `.claude/hooks/test-hooks.mjs` (if the new rule needs a fixture)

**Tests to add/update (Vitest, behavior):**
- `theme.test.ts` (shared + mobile) re-baselined to frozen bytes + z-scale ordering + accent-AA three-floor.
- Habit-row/habit-list: panel grouping renders, kebab preserved, drill-in still fires, no connector lines, Sparkles marker gone.
- login spinner renders with dimensions (bug 1); share-card-sheet exit transition present (bug 2).
- `no-arbitrary-zindex` RuleTester (valid: `--z-*`/`zLayers`; invalid: `z-[9999]`, raw `zIndex: 999`, `elevation` literal, z on overlay primitive).

## Risks & sequencing notes

- **R1 (open question — needs a call before Phase 0 closes):** the three-floor **accent-AA gate** DESIGN.md credits to b4 does not appear to exist (only the older `fgOnPrimary` ≥4.5 check). Plan builds it in 0d. Confirm it was genuinely not shipped (vs. living in a file this session's greps missed) so we don't duplicate it.
- **R2 (scope flag — Thomas may want to confirm):** the desktop rail's **Consistência 7-day chart** and **Próxima conquista** modules are **net-new UI**, not de-decoration — they do not exist in `today-rail.tsx` today. They are part of the frozen desktop spec so they are in b5 scope, but they add build + data-wiring (7-day consistency + next-achievement progress from existing hooks) and their own tests. If the intent was "de-decorate what exists, defer new modules," this is the one place b5 grows beyond a restraint pass.
- **R3 (highest technical risk):** the Phase 0 OKLCH recompute must be **byte-exact** and is asserted by `theme.test.ts` across 6 schemes × 2 modes. A wrong purple/dark byte cascades into every surface and both platforms. Do 0a first, prove the byte-exact + accent-AA tests green, before any component work.
- **R4 (contract-flip trap):** `expo lint` ignores `__tests__`, but `theme.test.ts:82-83` references the deleted `primaryGlow` token and `use-review-reminder.test.tsx:102` references gorhom — if the *web/CI* lint path or a future config lints tests, flipping glow/gorhom to `error` could trip on them. Before the flip, confirm those test references are removed or the test-file override keeps them exempt.
- **R5:** Criar h38 must not become a hand-tuned button height (DESIGN.md bans it). Decide whether 38 is a new sanctioned `PillButton` size or a documented one-off before implementing 1c.
- **R6 (parity):** `no-space-x-y`, `react19-api`, `require-focus-replacement`, `no-scroll-listener-motion` are web-only rules; the desktop right rail is a web-only layout adapter. These are legitimate platform-adapter exemptions, not parity violations — `parity-checker` should be told so it does not flag them.
- **R7 (PR size):** one branch, staged commits, one PR is the target. If the design-core diff (Phase 1) makes the PR unreviewable, split Phase 1 into its own PR and land Phases 0/2/3/4 as the "warn-to-zero + tokens" PR — but the contract flip (Phase 4) must merge in whichever PR also carries the last warn-clear, so CI proves zero.
- **Sequencing invariant:** never flip a rule to `error` before its batch is verified zero; keep lint/build/test green at every batch boundary (the batches are sized to guarantee it).
- **No orbit-api change expected.** If a rail module needs a data field the API doesn't return, stop and flag — do not invent a field.

## Verification

- **Batch-to-batch:** each batch closes green (`npm run lint` / `npx expo lint` / `npm test` / build) — CI never red mid-bundle.
- **The "nothing left" gate (Phase 4 result):** with glow/gradient/zindex/space-x-y/react19/focus/scroll all at `error`, `npm run lint` (web) and `npx expo lint` (mobile) exit clean, and `no-arbitrary-zindex` RuleTester is 100%. A green CI is the proof that no warn was left behind — that is the whole point of flipping.
- **Byte + AA proof:** `theme.test.ts` (shared + mobile) asserts frozen bytes (`#070910`, `#F6F7F9..#565C67`, `#8659EA`/`#B69BF8`) and the three accent-AA floors per scheme × mode.
- **Design proof (Phase 5, separate):** ultracode read-only fan-out — `design-reviewer` per surface vs `KQMPM`/`N8aEDF`, skeptic glow/parity/motion sweep, `accesslint-scan` on changed surfaces. Confirms tonal panels + drill-in + no connector lines + kebab preserved + no glow/gradient anywhere + z-scale adopted + Astra card de-badged.
- **Rollup:** `tools/rollup.sh` GREEN across all three repos before marking b5 done.
