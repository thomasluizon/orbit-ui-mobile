# Sweep 13 — Keyboard interaction & focus parity (ESC == Android back) — ROUND 2

Issue #107 agent-13 · round 2 · read-only static re-audit of the working tree (2026-06-12, baseline ui-mobile ae5c150).
Scope: re-verify whether round-1 HIGH/MED/LOW findings (F1–F15) LANDED; rebuild the per-surface web-ESC vs mobile-back parity table for current code; flag any NEW dismissable layer round-1 fixes added that lacks ESC/back parity.

## Headline

**The platform-shell agent that owned D26/D27 (and most of these findings) died mid-work and landed NOTHING.** `.claude/sweeps/107/handoffs/` is empty; `.claude/sweeps/107/round-2/` contains only scaffolding (`parity-diff.mjs`). Every round-1 finding F1–F15 is verified STILL OPEN against current code. The only changes that landed in this area are the **habit-list refactor cluster** (move-parent-overlay, confirm-dialogs cluster wrapper, drill-content/drill-panel split) which correctly delegate to AppOverlay/ConfirmDialog/RN Modal and **preserve** parity — no new parity-breaking layers. D28 (mobile global ErrorBoundary, `(chat)` web `error.tsx`) was also not implemented, but that is the error-boundary sweep's scope, not a keyboard/back regression — noted, not claimed here.

## Parity table (current code)

| # | Surface | Web ESC | Mobile hardware back | Focus in/restore (web) | Status |
|---|---------|---------|----------------------|------------------------|--------|
| 1 | Create habit modal | AppOverlay ESC, stack-gated | TrueSheet `onBackPress` + dirty guard | trap/in/restore | PASS |
| 2 | Edit habit modal | same | same | same | PASS |
| 3 | Create goal modal | same | same | same | PASS |
| 4 | Edit goal modal | same | same | same | PASS |
| 5 | Habit detail drawer | same | same | same | PASS |
| 6 | Goal detail drawer | same | same | same | PASS |
| 7 | Description viewer | **MISSING** — `description-viewer.tsx:27-69` (zero keydown, not in stack) | BottomSheetModal back OK — `apps/mobile/.../description-viewer.tsx:32` | none | **F3 OPEN** |
| 8 | Move parent | AppOverlay — `habit-list/move-parent-overlay.tsx` | Modal `onRequestClose` — `habit-list/move-parent-dialog.tsx:59` | inherited | PASS (refactored, parity intact) |
| 9 | Confirm dialogs (delete/discard/skip/complete-parent) | ConfirmDialog ESC, stack-gated — `confirm-dialog.tsx:76-83` | Modal `onRequestClose` — `apps/mobile/.../confirm-dialog.tsx:116` | in 71-74; **no restore** | **F10 OPEN** |
| 10 | Notification panel (bell) | Popover ESC — `use-popover-menu.ts:133-138` | BottomSheetModal back | in/restore (popover.tsx) | PASS |
| 11 | Notification detail | AppOverlay | BottomSheetModal | inherited | PASS |
| 12 | Habit row context menu | Popover + arrows/Home/End | AnchoredMenu Modal `onRequestClose` | in/restore + roving | PASS |
| 13 | Today list controls menu | doc-level ESC (closes only) — `app/(app)/page.tsx:198-199` | AnchoredMenu — `app/(tabs)/index.tsx` | **no focus-in, no arrows, no restore** — `controls-menu.tsx:45-62` | **F8 OPEN** |
| 14 | Frequency filter menu | Popover | AnchoredMenu | inherited | PASS |
| 15 | Goals view menu | Popover | AnchoredMenu | inherited | PASS |
| 16 | Chat / agent panel | ESC -> back nav, input-guarded | route back: native pop + root fallback | route (n/a) | PASS |
| 17 | Emoji picker (inside habit form) | **window listener, wrong layer + not in stack** — `habit-form-fields.tsx:225-232` | Modal `onRequestClose` — `habit-emoji-selector.tsx:87` | in / **no restore, no trap** | **F2 OPEN** |
| 18 | Date picker dialog (habit due, reminder, goal deadline) | **MISSING** — `app-date-picker.tsx:96-110,134` (backdrop/outside click only; `aria-modal` w/o trap) | Modal `onRequestClose` — `apps/mobile/.../app-date-picker.tsx:145` | none | **F1, F11 OPEN** |
| 19 | Time picker | native `<input type="time">` | Modal `onRequestClose` | native | PASS |
| 20 | Select | native `<select>` | Modal `onRequestClose` | native | PASS |
| 21 | Drill-down (sub-habit level) | **MISSING ESC** — `habit-list.tsx:1046` (`onClick={drill.drillBack}` only) | BackHandler pops one level, cleanup OK — `use-drill-navigation.ts:127-136` | n/a | **F4 OPEN** |
| 22 | Trial expired modal | AppOverlay | Modal `onRequestClose` | inherited | PASS |
| 23 | Push prompt | **MISSING** — `push-prompt.tsx:104-191` (buttons only, not in stack) | Modal `onRequestClose={dismiss}` — `apps/mobile/.../push-prompt.tsx:132` | none | **F5 OPEN** |
| 24 | Onboarding flow (gate) | no ESC by design; trap + initial focus | Modal without `onRequestClose` (back inert by design) | in yes | PASS (both non-dismissable) |
| 25 | Calendar import prompt | AppOverlay | BottomSheetModal | inherited | PASS |
| 26 | Feature guide drawer | AppOverlay | BottomSheetModal | inherited; roving dots | PASS |
| 27 | Referral drawer | AppOverlay | BottomSheetModal | inherited | PASS |
| 28 | Create API key modal | AppOverlay | BottomSheetModal | inherited | PASS |
| 29 | Preferences sheets | AppOverlay | BottomSheetModal | inherited | PASS |
| 30 | Advanced page modal | AppOverlay | BottomSheetModal | inherited | PASS |
| 31 | Edit name sheet | AppOverlay + Enter submit | BottomSheetModal | inherited | PASS |
| 32 | Fresh start (reset) modal | AppOverlay | Modal `onRequestClose` | inherited | PASS |
| 33 | Delete account modal | AppOverlay | Modal `onRequestClose` | inherited | PASS |
| 34 | Tour replay modal | AppOverlay | Modal `onRequestClose` | inherited | PASS |
| 35 | Tour overlay (spotlight + tooltip) | **MISSING** — `tour/tour-overlay.tsx:68-70` (handleSkip, no keydown) | **MISSING** — `tour/tour-overlay.tsx:71-73` (handleSkip, no BackHandler); back falls through to nav | n/a | **F6 OPEN** |
| 36 | Level-up overlay (blocking) | **MISSING ESC** — `level-up-overlay.tsx:205` (button + 3s timer only) | **not back-interceptable** — `level-up-overlay.tsx:129,195-198` (plain `Animated.View` zIndex 10001, no Modal/BackHandler) | n/a | **F7 OPEN** |
| 37 | Celebrations/toasts | auto-dismiss + click (transient) | auto-dismiss (transient) | n/a | PASS (not dismiss-contract) |
| 38 | Fresh-start animation (transient) | non-dismissable portal (parity) | Modal **without** `onRequestClose` — `fresh-start-animation.tsx:151` | n/a | **F13 OPEN (LOW)** |
| 39 | Theme transition overlay (mobile only) | n/a | Modal **without** `onRequestClose` — `lib/theme-provider.tsx:250-255` | n/a | **F13 OPEN (LOW)** |
| 40 | Version update drawer (mobile only) | n/a | BottomSheetModal | n/a | PASS (platform-only) |

### Family checks (ACTIVATE / MOVE / FOCUS) — deltas vs round 1

| Check | Result |
|---|---|
| dnd-kit keyboard reorder (habit list + checklist) | **FAIL both** — only `PointerSensor`+`TouchSensor`: `habit-list.tsx:496,499`; `habit-checklist.tsx:55,56` (no `KeyboardSensor`/`sortableKeyboardCoordinates`) → **F9 OPEN** |
| Date grid arrows | **FAIL** — `app-date-picker.tsx:184-226` Tab-only → **F11 OPEN** |
| Home/End on long habit list | **FAIL** — `habit-list.tsx` rows are individual tab stops, no list-level handler → **F14 OPEN** |
| ControlsMenu arrows/Home/End/restore | **FAIL** — `controls-menu.tsx:45-62` → **F8 OPEN** |
| Focus-ring suppressions (web) | **5 sites STILL suppressed → F12 OPEN** (a–e below) |
| Mobile overlay-stack producers | **ZERO producers → F15 OPEN** (`registerOverlay` never called outside tests) |
| Mobile BackHandler cleanup | PASS — `_layout.tsx`, `use-drill-navigation.ts:135` both remove on cleanup |
| Positive tabIndex | PASS — none on web |

## Findings (all STILL OPEN — round-1 fixes did not land)

**F1 — HIGH** · web `apps/web/components/ui/app-date-picker.tsx:96-110,126-139` + mobile `apps/mobile/components/ui/app-date-picker.tsx:141-145` · agent-13 bullet F1 · DISMISS · Web date-picker `<dialog>` (used inside create/edit habit + goal AppOverlays) still has NO ESC handler, only `handleClickOutside` mousedown (96-110) + backdrop onClick (131). Never registers in `overlay-stack`, so the parent AppOverlay believes it is top-most: ESC dismisses/dirty-confirms the whole form while the calendar stays up. Still claims `aria-modal="true"` (line 136) with no trap/in/restore. Mobile back closes the picker alone (Modal `onRequestClose`, 145). Fix: register in `overlay-stack` with stack-gated ESC (pattern `confirm-dialog.tsx:63-105`), move focus into grid on open, restore to trigger on close.

**F2 — HIGH** · web `apps/web/components/habits/habit-form-fields.tsx:225-232` (+ `app-overlay.tsx` document handler) + mobile `apps/mobile/components/habits/habit-form-fields/habit-emoji-selector.tsx:83-88` · agent-13 bullet F2 · DISMISS · Emoji picker ESC listener is STILL on `window` (line 230), not stack-gated, and the picker is NOT registered in `overlay-stack` (no `registerOverlay` import). The parent AppOverlay's `document` handler runs first in the bubble and `stopPropagation()`s; `isTopOverlay` resolves to the parent modal, so ESC closes/dirty-confirms the habit form underneath while the picker stays open. No focus restore. Mobile back closes only the picker. Fix: register the picker in `overlay-stack`, use a stack-gated `document` listener, restore focus to the emoji button on close.

**F3 — HIGH** · web `apps/web/components/habits/description-viewer.tsx:27-69` (opened from `habit-detail-drawer.tsx`) + mobile `apps/mobile/components/habits/description-viewer.tsx:32-52` · agent-13 bullet F3 · DISMISS + FOCUS · Web full-screen description viewer (z-10000, above the habit-detail AppOverlay) STILL has zero keyboard handling and no stack registration: ESC while open dismisses the habit-detail drawer underneath (AppOverlay still top of stack), orphaning the viewer over the list. No focus move-in/restore. Mobile twin is a BottomSheetModal (back closes top sheet correctly). Fix: register in `overlay-stack` with ESC -> `onOpenChange(false)`, focus the back button on open, restore on close.

**F4 — MED** · web `apps/web/components/habits/habit-list.tsx:1046` + mobile `apps/mobile/hooks/use-drill-navigation.ts:127-136` · agent-13 bullet F4 · DISMISS · Mobile intercepts hardware back to pop exactly one drill level (proper cleanup, 135); web drill back-out is STILL the pointer/Tab button only (`onClick={drill.drillBack}`), no ESC equivalent. Fix: when drill stack is non-empty and no overlay is open, ESC -> `drill.drillBack()` (guard against focus in text inputs, mirroring `chat/page.tsx`).

**F5 — MED** · web `apps/web/components/ui/push-prompt.tsx:104-191` + mobile `apps/mobile/components/ui/push-prompt.tsx:127-133` · agent-13 bullet F5 · DISMISS · Push prompt is a `role="dialog"` layer (104) dismissable by X/Later only; STILL no ESC path on web, not in `overlay-stack`. Mobile back dismisses it (`onRequestClose={dismiss}`, 132). Fix: register in `overlay-stack` (or add a keydown listener) mapping ESC -> `dismiss`.

**F6 — MED** · web `apps/web/components/tour/tour-overlay.tsx:68-70` + mobile `apps/mobile/components/tour/tour-overlay.tsx:71-73` · agent-13 bullet F6 · DISMISS · Product tour is a dismissable layer (Skip affordance, `handleSkip`) that closes on NEITHER ESC (web — no keydown anywhere in `apps/web/components/tour/`) NOR hardware back (mobile — no `BackHandler` in `apps/mobile/components/tour/`). Mobile back falls through the spotlight to underlying nav (root fallback `_layout.tsx` or system exit), acting on a non-top layer mid-tour. Fix: web keydown ESC -> `handleSkip`; mobile `BackHandler` while `isActive` -> skip/end + `return true`, removed on cleanup.

**F7 — MED** · web `apps/web/components/gamification/level-up-overlay.tsx:205` + mobile `apps/mobile/components/gamification/level-up-overlay.tsx:129,195-198` · agent-13 bullet F7 · DISMISS · Blocking level-up celebration dismisses on NEITHER ESC (web — `role="alert"` portal, button + 3s auto-timer only, no keydown) NOR back (mobile — plain `Animated.View` at zIndex 10001, NOT a Modal, no `BackHandler`, so back acts on the app beneath). Fix: web ESC -> `dismiss(activeLevelUp?.id)`; mobile BackHandler (or Modal + `onRequestClose`) -> same dismiss.

**F8 — MED** · web `apps/web/components/habits/controls-menu.tsx:45-62` (ESC at `app/(app)/page.tsx:198-199`) + mobile `apps/mobile/components/ui/anchored-menu.tsx` (back OK) · agent-13 bullet F8 · MOVE + FOCUS · Today controls menu is STILL a hand-rolled portal `role="menu"` (`tabIndex={0}`, 49) with only an inline `onKeyDown` Escape (61) plus a non-stack-gated document ESC (page.tsx:199): ESC closes, but focus never moves into the panel, no ArrowUp/Down/Home/End roving, nothing restores focus. Not rebuilt on `Popover`. Fix: rebuild on `Popover` (render-prop close), deleting the bespoke positioning/ESC plumbing.

**F9 — MED** · web `apps/web/components/habits/habit-list.tsx:496,499` and `apps/web/components/habits/habit-checklist.tsx:55,56` + mobile n/a · agent-13 bullet F9 (D26) · MOVE + ACTIVATE · Both dnd-kit contexts STILL configure only `PointerSensor` + `TouchSensor`; habit reorder and checklist reorder are pointer-only on web. No `KeyboardSensor` import. Fix: add `useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })` to both sensor sets.

**F10 — LOW** · web `apps/web/components/ui/confirm-dialog.tsx:63-105` + mobile n/a · agent-13 bullet F10 · FOCUS · ConfirmDialog moves focus to its first button on open (71-74) and registers in the stack, but its cleanup (101-104) STILL only `unregisterOverlay` + remove-listener — it never captures `document.activeElement` on open nor restores it on close (AppOverlay does, `app-overlay.tsx:206-209`). After cancelling a delete confirm, keyboard focus drops to `<body>`. Fix: capture `document.activeElement` on open and refocus it in cleanup.

**F11 — LOW** · web `apps/web/components/ui/app-date-picker.tsx:184-226` + mobile n/a · agent-13 bullet F11 · MOVE · Web date-picker day grid is STILL Tab-only — no ArrowLeft/Right/Up/Down between days. Fix: roving tabIndex over day buttons + arrow/Home/End handling (fold into the F1 rework).

**F12 — LOW** · web only · agent-13 bullet F12 · FOCUS · 5 focus suppressions WITHOUT a visible replacement remain (verified line-exact):
  - a. `apps/web/components/ui/section-head-tabs.tsx:33,40` — focusable tablist (`tabIndex={0}`) with inline `outline: 'none'`, no replacement.
  - b. `apps/web/app/(chat)/chat/page.tsx:421` — chat composer textarea `outline: 'none'`; container has no `focus-within:` ring/shadow.
  - c. `apps/web/components/habits/habit-checklist.tsx:280` — add-item input `focus:outline-none`, static inset hairline only.
  - d. `apps/web/components/habits/habit-checklist.tsx:212-237` — `sr-only` checkbox focusable but visual glyph span has no `peer-focus-visible` styling.
  - e. `apps/web/components/chat/breakdown-suggestion.tsx:209,223,248` — `outline-none` on title input, frequency select, target-count input; none has a replacement.
  Fix: add `focus-visible` ring/inset-shadow replacements (pattern `habit-form-fields.tsx:247`).

**F13 — LOW** · mobile only — `apps/mobile/components/ui/fresh-start-animation.tsx:151` and `apps/mobile/lib/theme-provider.tsx:250-255` · agent-13 bullet F13 · DISMISS · Two transient RN Modals STILL render without `onRequestClose`, so hardware back is silently swallowed while visible (celebration ~seconds; theme cross-fade ~ms). Non-interactive overlays — impact is a dead back press, not a stuck state. Fix: pass an intentful `onRequestClose` that ends/fast-forwards, or render as non-Modal absolute overlays.

**F14 — LOW** · web `apps/web/components/habits/habit-list.tsx` + mobile n/a · agent-13 bullet F14 · MOVE · The Today/All habit list (the app's long list) STILL has no Home/End jump; rows are individual tab stops with no list-level key handling (precedent exists: `popover.tsx:131-139`). Fix: list-level keydown moving focus to first/last row when focus is on a row.

**F15 — LOW** · mobile `apps/mobile/lib/overlay-stack.ts:18-43` + consumers `app/_layout.tsx:197`, `hooks/use-go-back-or-fallback.ts:18` · agent-13 bullet F15 · DISMISS · The mobile overlay stack STILL has consumers but ZERO producers — no component calls `registerOverlay` (only `__tests__/lib/overlay-stack.test.ts`), so `dismissTopOverlay('system-back')` in the root BackHandler is a dead branch (always returns false). Tour (F6) and level-up (F7), the proposed first producers, were not wired. Fix: either wire `registerOverlay` into the surfaces that bypass native back interception (tour, level-up) or delete the stack + its dead consumers.

## New dismissable layers added by round-1 (parity check)

The habit-list refactor landed these NEW components; all delegate to existing dismiss infrastructure and PRESERVE parity (NOT findings):
- `apps/web/components/habits/habit-list/move-parent-overlay.tsx` -> AppOverlay (stack-gated ESC) ; mobile `move-parent-dialog.tsx:59` Modal `onRequestClose`.
- `apps/web/components/habits/habit-list/confirm-dialogs.tsx` (cluster wrapper) -> ConfirmDialog ; mobile twin -> Modal `onRequestClose`.
- `drill-content.tsx` / `drill-panel.tsx` -> presentational, no dismissable layer.

No new error boundaries / modals lacking ESC-back parity were introduced. Note (out of this sweep's scope, do not double-report): D28's mobile global `ErrorBoundary` export in `apps/mobile/app/_layout.tsx` and `(chat)` web `error.tsx` were NOT implemented — that belongs to the error-boundary sweep, and existing route-level `error.tsx` files (`(app)`, `(auth)`) are Next.js route boundaries (no ESC contract).

## Verdict

**15 findings STILL OPEN: 3 HIGH · 6 MED · 6 LOW. Zero round-1 fixes landed in this domain; zero new parity-breaking layers.**
DISMISS: 9 (F1–F7, F13, F15) · MOVE: 4 (F8 partial, F9, F11, F14) · FOCUS: 3 (F8, F10, F12) · ACTIVATE: 0 standalone.
Core modal/sheet/popover/menu families remain in strong parity (overlay-stack + AppOverlay/ConfirmDialog/Popover on web; TrueSheet `onBackPress` + Modal `onRequestClose` on mobile; both BackHandler subscribers clean up). Breakage is unchanged from round 1 and concentrated in the bespoke layers that bypass both dismiss infrastructures: web date picker, emoji picker, description viewer, tour, level-up, push prompt, drill ESC — plus the un-restored ConfirmDialog focus, pointer-only reorder, suppressed focus rings, and the dead mobile stack. The owning platform-shell agent died before landing D26/D27; this entire domain is unstarted.
