# Sweep 13 — Keyboard interaction & focus parity (ESC == Android back)

Issue #107 agent-13 · round 1 · read-only static audit of the working tree (2026-06-12).
Scope: DISMISS (ESC/back parity, LIFO, one level per press), ACTIVATE (Enter/Space), MOVE (focus order, arrows, Home/End, no positive tabIndex), FOCUS (move-in, restore, trap, visible ring).

Method: enumerated every overlay/dismissable surface (`AppOverlay`, `Popover`, `ControlsMenu`, web portals; `BottomSheetModal`/TrueSheet, `AnchoredMenu`, raw RN `Modal`, `BackHandler` subscribers on mobile), then per-surface web-ESC vs mobile-back parity rows, then activation/move/focus checks per component family.

Web dismiss infrastructure: `apps/web/lib/overlay-stack.ts` (LIFO registry; `AppOverlay` app-overlay.tsx:140-199 and `ConfirmDialog` confirm-dialog.tsx:66-104 register and gate ESC/backdrop on `isTopOverlay`) + `use-popover-menu.ts:133-138` (ESC for popovers). Mobile dismiss infrastructure: TrueSheet `onBackPress`/`dismissible` (bottom-sheet-modal.tsx:92,106), RN `Modal.onRequestClose`, `BackHandler` in `_layout.tsx:194-207` (root fallback) and `use-drill-navigation.ts:127-136` (drill pop; subscription removed on cleanup — no leak).

## Parity table

| # | Surface | Web ESC | Mobile hardware back | Focus in/restore (web) | Status |
|---|---------|---------|----------------------|------------------------|--------|
| 1 | Create habit modal | AppOverlay ESC, stack-gated — `apps/web/components/ui/app-overlay.tsx:190-196` (used `create-habit-modal.tsx:245`) | TrueSheet `onBackPress` + dirty guard — `apps/mobile/components/bottom-sheet-modal.tsx:106` (used `create-habit-modal.tsx:331`) | trap 172-188, in 162-170, restore 206-209 | PASS |
| 2 | Edit habit modal | same — `edit-habit-modal.tsx:144` | same — `edit-habit-modal.tsx:203` | same | PASS |
| 3 | Create goal modal | same — `create-goal-modal.tsx:223` | same — `create-goal-modal.tsx:204` | same | PASS |
| 4 | Edit goal modal | same — `edit-goal-modal.tsx:149` | same — `edit-goal-modal.tsx:172` | same | PASS |
| 5 | Habit detail drawer | same — `habit-detail-drawer.tsx:134` | same — `habit-detail-drawer.tsx:169` | same | PASS |
| 6 | Goal detail drawer | same — `goal-detail-drawer.tsx:361` | same — `goal-detail-drawer.tsx:360` | same | PASS |
| 7 | Description viewer (expanded description) | **MISSING** — `apps/web/components/habits/description-viewer.tsx` has no keyboard handling | BottomSheetModal back OK — `apps/mobile/components/habits/description-viewer.tsx:32` | none (no in/restore/trap) | **F3** |
| 8 | Move parent | AppOverlay — `move-parent-overlay.tsx:44` | Modal `onRequestClose` — `move-parent-dialog.tsx:59` | inherited | PASS |
| 9 | Confirm dialogs (delete/discard/skip/complete-parent) | ConfirmDialog ESC, stack-gated — `apps/web/components/ui/confirm-dialog.tsx:76-83` | Modal `onRequestClose` — `apps/mobile/components/ui/confirm-dialog.tsx:116` | in 71-74; **no restore** | **F10** |
| 10 | Notification panel (bell) | Popover ESC — `use-popover-menu.ts:133-138` (used `notification-bell.tsx:157`) | BottomSheetModal back — `notification-bell.tsx:229` | in 80-92, restore 94-113 (popover.tsx) | PASS |
| 11 | Notification detail | AppOverlay — `notification-detail-modal.tsx:47` | BottomSheetModal — `notification-detail-modal.tsx:54` | inherited | PASS |
| 12 | Habit row context menu | Popover — `habit-row.tsx:354` (button trigger 358) | AnchoredMenu Modal `onRequestClose` — `anchored-menu.tsx:129` (used `habit-row.tsx:439`) | in/restore + arrows/Home/End (popover.tsx:120-152) | PASS |
| 13 | Today list controls menu | doc-level ESC — `apps/web/app/(app)/page.tsx:198-200` (+ in-panel `controls-menu.tsx:61`) | AnchoredMenu — `app/(tabs)/index.tsx:1186` | **no focus-in, no arrows, no restore** | **F8** |
| 14 | Frequency filter menu | Popover — `today-shell.tsx:363` | AnchoredMenu — `app/(tabs)/index.tsx:1285` | inherited | PASS |
| 15 | Goals view menu | Popover — `goals-view.tsx:52` | AnchoredMenu — `goals-view.tsx:138` | inherited | PASS |
| 16 | Chat / agent panel | ESC -> back nav, input-guarded — `app/(chat)/chat/page.tsx:115-137` | route back: Expo native pop + root fallback `_layout.tsx:194-207` | route (n/a) | PASS |
| 17 | Emoji picker (inside habit form) | handler exists but **unreachable + wrong layer** — `habit-form-fields.tsx:225-232` | Modal `onRequestClose` — `habit-emoji-selector.tsx:87` | in (autoFocus) / **no restore, no trap** | **F2** |
| 18 | Date picker dialog (habit due date, reminder date, goal deadline) | **MISSING** — `apps/web/components/ui/app-date-picker.tsx:126-229` (backdrop/outside click only) | Modal `onRequestClose` — `apps/mobile/components/ui/app-date-picker.tsx:145` | none (aria-modal w/o trap/in/restore) | **F1, F11** |
| 19 | Time picker | native `<input type="time">` — `app-time-picker.tsx:42` (native ESC/arrows) | Modal `onRequestClose` — `app-time-picker.tsx:156` | native | PASS |
| 20 | Select | native `<select>` — `app-select.tsx:25` (native ESC/arrows) | Modal `onRequestClose` — `app-select.tsx:74` | native + focus ring 29 | PASS |
| 21 | Drill-down (sub-habit level) | **MISSING ESC** — back is pointer/Tab button only `habit-list.tsx:1037-1049` | BackHandler pops one level, cleanup OK — `use-drill-navigation.ts:127-136` | n/a | **F4** |
| 22 | Trial expired modal | AppOverlay — `trial-expired-modal.tsx:44` | Modal `onRequestClose` — `trial-expired-modal.tsx:59` | inherited | PASS |
| 23 | Push prompt | **MISSING** — `apps/web/components/ui/push-prompt.tsx:104-190` (buttons only) | Modal `onRequestClose={dismiss}` — `apps/mobile/components/ui/push-prompt.tsx:132` | none | **F5** |
| 24 | Onboarding flow (gate) | no ESC by design; focus trap + initial focus `onboarding-flow.tsx:171-200` | Modal without `onRequestClose` (back inert by design) `onboarding-flow.tsx:252` | in yes | PASS (parity: both non-dismissable) |
| 25 | Calendar import prompt | AppOverlay — `app/(app)/layout.tsx:276` | BottomSheetModal — `calendar-import-prompt.tsx:70` | inherited | PASS |
| 26 | Feature guide drawer | AppOverlay — `feature-guide-drawer.tsx:110` | BottomSheetModal — `feature-guide-drawer.tsx:130` | inherited; roving tabIndex on dots `feature-guide-drawer.tsx:129` | PASS |
| 27 | Referral drawer | AppOverlay — `referral-drawer.tsx:60` | BottomSheetModal — `referral-drawer.tsx:66` | inherited | PASS |
| 28 | Create API key modal | AppOverlay — `create-api-key-modal.tsx:172` | BottomSheetModal — `create-api-key-modal.tsx:159` | inherited | PASS |
| 29 | Preferences sheets | AppOverlay — `preferences/page.tsx:286` | BottomSheetModal — `app/preferences.tsx:381` | inherited | PASS |
| 30 | Advanced page modal | AppOverlay — `advanced/page.tsx:590` | BottomSheetModal via create-api-key-modal (app/advanced.tsx) | inherited | PASS |
| 31 | Edit name sheet | AppOverlay + Enter submit — `edit-name-sheet.tsx:74,88` | BottomSheetModal — `edit-name-sheet.tsx:83` | inherited | PASS |
| 32 | Fresh start (reset) modal | AppOverlay — `fresh-start-modal.tsx:133` | Modal `onRequestClose` — `app/(tabs)/profile.tsx:743` | inherited | PASS |
| 33 | Delete account modal | AppOverlay — `delete-account-modal.tsx:173` | Modal `onRequestClose` — `app/(tabs)/profile.tsx:907` | inherited | PASS |
| 34 | Tour replay modal | AppOverlay — `tour-replay-modal.tsx:95` | Modal `onRequestClose` — `tour-replay-modal.tsx:107` | inherited | PASS |
| 35 | Tour overlay (spotlight + tooltip) | **MISSING** — no Escape anywhere in `apps/web/components/tour/` | **MISSING** — no BackHandler in `apps/mobile/components/tour/`; back falls through to nav under the tour | n/a | **F6** |
| 36 | Level-up overlay (blocking) | **MISSING ESC** — `level-up-overlay.tsx:205` (button only) | **not back-interceptable** — absolute overlay zIndex 10001, no Modal/BackHandler `level-up-overlay.tsx:195-198` | n/a | **F7** |
| 37 | Celebrations/toasts (goal-completed, streak, all-done, welcome-back, achievement) | auto-dismiss + click — transient toasts | auto-dismiss — transient, non-blocking | n/a | PASS (not dismiss-contract layers) |
| 38 | Fresh-start animation (transient) | non-dismissable portal (parity) — `ui/fresh-start-animation.tsx:84` | Modal **without** `onRequestClose` — back swallowed during animation `ui/fresh-start-animation.tsx:151` | n/a | **F13** (LOW) |
| 39 | Theme transition overlay (mobile only) | n/a | Modal **without** `onRequestClose` — momentary back swallow `lib/theme-provider.tsx:250-255` | n/a | **F13** (LOW) |
| 40 | Version update drawer (mobile only) | n/a (no web binary updates) | BottomSheetModal — `version-update-drawer.tsx:116` | n/a | PASS (platform-only) |

### Family checks (ACTIVATE / MOVE / FOCUS)

| Check | Result |
|---|---|
| Habit rows keyboard-activatable | PASS — `role="button"` + tabIndex 0 + Enter/Space `apps/web/components/habits/habit-row.tsx:160-170` |
| Goal rows keyboard-activatable | PASS — real `<button>` `apps/web/components/goals/goal-card.tsx:103-108` |
| Calendar day cells | PASS — real buttons `calendar-grid.tsx:164-171` |
| Settings rows | PASS — `<button>` when interactive `settings-row.tsx:42-49` |
| Bulk action bar / goal linking / menus / tour tooltip | PASS — real buttons throughout |
| Enter submits forms | PASS — `<form onSubmit>` in create/edit habit (`create-habit-modal.tsx:259`, `edit-habit-modal.tsx:153`), create/edit goal (`create-goal-modal.tsx:231`, `edit-goal-modal.tsx:157`), API key (`create-api-key-modal.tsx:252`), goal progress (`goal-detail-drawer.tsx:493`); chat Enter-to-send Shift+Enter newline `use-chat-composer.ts:646-651`; mobile `onSubmitEditing` `chat-composer-input.tsx:111` |
| Space toggles checkboxes/switches | PASS mechanics — native checkbox `habit-checklist.tsx:212-218`; `role="switch"` button `mono-toggle.tsx:24-30`; `SelectCheck`/`RadioRow` real buttons `select-check.tsx:51,82` (focus-ring caveat F12d) |
| Tab strip arrow keys (Today/All/General/Goals) | PASS — ArrowLeft/Right + focus follow `today-shell.tsx:85-100` (focus-ring caveat F12a) |
| Positive tabIndex | PASS — none anywhere on web (only 0 / -1 / roving `isActive ? 0 : -1`) |
| Menus arrows/Home/End | PASS for Popover-based menus `popover.tsx:120-152`; FAIL for ControlsMenu (F8) |
| Date/time picker arrows | time native PASS; date grid FAIL (F11) |
| Drag-to-reorder via keyboard | FAIL both reorder surfaces (F9) |
| Home/End on long lists | FAIL habit list (F14) |
| Mobile BackHandler cleanup | PASS — both subscribers remove on cleanup (`_layout.tsx:206`, `use-drill-navigation.ts:135`); no return-true-without-dismiss patterns in JS handlers |

## Findings

**F1 — HIGH** · web `apps/web/components/ui/app-date-picker.tsx:126-229` + mobile `apps/mobile/components/ui/app-date-picker.tsx:141-145` · DISMISS ("every dismissable layer must close on ESC… both resolve the SAME top-most layer, one level per press, LIFO") · The web date-picker dialog (used inside create/edit habit and goal AppOverlays — `habit-form-fields.tsx:1185,1396`, `create-goal-modal.tsx:341`, `edit-goal-modal.tsx:234`) has no ESC handler and never registers in the overlay stack, so the parent AppOverlay still believes it is top-most: ESC with the calendar open dismisses (or dirty-confirms) the whole form while the calendar layer stays up. Mobile back closes the picker alone. Also claims `aria-modal="true"` with no focus trap/move-in/restore. Fix: register in `overlay-stack` with its own stack-gated ESC (pattern: `confirm-dialog.tsx:63-105`), move focus into the grid on open, restore to trigger on close.

**F2 — HIGH** · web `apps/web/components/habits/habit-form-fields.tsx:225-232` (+ `app-overlay.tsx:190-199`) + mobile `apps/mobile/components/habits/habit-form-fields/habit-emoji-selector.tsx:83-88` · DISMISS (LIFO, one level per press) · The web emoji picker's ESC listener is attached to `window`, but the parent AppOverlay's `document`-level handler runs first in the bubble path and calls `stopPropagation()` — the picker's listener can never fire. Since the picker is not in the overlay stack, `isTopOverlay` resolves to the parent modal: ESC closes/dirty-confirms the habit form underneath while the picker stays open. Mobile back closes only the picker. Fix: register the picker in `overlay-stack` and use a stack-gated `document` listener; restore focus to the emoji button on close.

**F3 — HIGH** · web `apps/web/components/habits/description-viewer.tsx:27-67` (opened from `habit-detail-drawer.tsx:126,189`) + mobile `apps/mobile/components/habits/description-viewer.tsx:32-52` · DISMISS + FOCUS · The web full-screen description viewer (z-10000, above the habit-detail AppOverlay) has zero keyboard handling and no stack registration: ESC while it is open dismisses the habit-detail drawer *underneath* it (AppOverlay still top of stack), leaving the viewer orphaned over the list. No focus move-in or restore either. Mobile twin is a BottomSheetModal where back closes the top sheet correctly. Fix: register in `overlay-stack` with ESC -> `onOpenChange(false)`, focus the back button on open, restore on close.

**F4 — MED** · web `apps/web/components/habits/habit-list.tsx:1037-1049` + mobile `apps/mobile/hooks/use-drill-navigation.ts:127-136` · DISMISS ("Both must resolve the SAME top-most layer, one level per press") · Mobile intercepts hardware back to pop exactly one drill level (with proper subscription cleanup); web drill has no ESC equivalent — back-out is the pointer/Tab button only. Fix: when the drill stack is non-empty and no overlay is open, ESC -> `drill.drillBack()` (guard against focus in text inputs, mirroring `chat/page.tsx:115-130`).

**F5 — MED** · web `apps/web/components/ui/push-prompt.tsx:104-190` + mobile `apps/mobile/components/ui/push-prompt.tsx:127-133` · DISMISS · The push-notification prompt is a `role="dialog"` layer dismissable by X/Later buttons; mobile back dismisses it (`onRequestClose={dismiss}`) but web has no ESC path. Fix: register in `overlay-stack` (or add a keydown listener) mapping ESC -> `dismiss`.

**F6 — MED** · web `apps/web/components/tour/` (no Escape anywhere; skip at `tour-overlay.tsx:68-70`) + mobile `apps/mobile/components/tour/` (no BackHandler; only the replay modal handles back) · DISMISS · The product tour is a dismissable layer (Skip affordance) that closes on neither ESC (web) nor hardware back (mobile). Worse, mobile back falls through the spotlight to the underlying navigation (root fallback `_layout.tsx:194-207` or system exit at root), so back acts on a layer that is not top-most mid-tour. Fix: web keydown ESC -> `handleSkip`; mobile `BackHandler` while `isActive` -> skip/end + `return true`, removed on cleanup.

**F7 — MED** · web `apps/web/components/gamification/level-up-overlay.tsx:205` + mobile `apps/mobile/components/gamification/level-up-overlay.tsx:186-198` · DISMISS · The blocking level-up celebration (full-screen, requires Continue) dismisses on neither ESC (web) nor back (mobile — plain absolute view at zIndex 10001, so back acts on the app beneath the celebration). Fix: web ESC -> `dismiss(activeLevelUp?.id)`; mobile BackHandler (or Modal + `onRequestClose`) -> same dismiss.

**F8 — MED** · web `apps/web/components/habits/controls-menu.tsx:45-98` (ESC at `app/(app)/page.tsx:198-200`) + mobile `apps/mobile/components/ui/anchored-menu.tsx:129` (back OK) · MOVE ("arrow keys on … menus") + FOCUS ("focus moves INTO a layer on open and RESTORES to trigger on close") · The Today controls menu is a hand-rolled portal `role="menu"`: ESC works via a document listener, but focus never moves into the panel, there is no ArrowUp/Down/Home/End roving, and nothing restores focus — every other web menu gets all of this from `Popover` (`popover.tsx:80-152`). Fix: rebuild on `Popover` (render-prop close), deleting the bespoke positioning/ESC plumbing.

**F9 — MED** · web `apps/web/components/habits/habit-list.tsx:496-502` and `apps/web/components/habits/habit-checklist.tsx:54-57` + mobile n/a (touch reorder is the platform idiom) · MOVE ("arrow keys on … drag-to-reorder lists") + ACTIVATE ("no action reachable by pointer only") · Both dnd-kit contexts configure only `PointerSensor` + `TouchSensor`; habit reorder and checklist reorder are pointer-only on web. Fix: add `useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })` to both sensor sets.

**F10 — LOW** · web `apps/web/components/ui/confirm-dialog.tsx:63-105` + mobile n/a · FOCUS ("RESTORES to trigger on close") · ConfirmDialog moves focus to its first button on open (71-74) but its cleanup (101-104) never restores focus to the previously focused element — AppOverlay does (`app-overlay.tsx:139,206-209`). After cancelling a delete confirm, keyboard focus is dropped to `<body>`. Fix: capture `document.activeElement` on open and refocus it in the cleanup, mirroring AppOverlay.

**F11 — LOW** · web `apps/web/components/ui/app-date-picker.tsx:166-226` + mobile n/a (native touch calendar) · MOVE ("arrow keys on … date/time pickers") · The web date-picker day grid is Tab-only — no ArrowLeft/Right/Up/Down between days (the time picker gets this natively from `<input type="time">`). Fix: roving tabIndex over day buttons + arrow/Home/End key handling (fold into the F1 rework).

**F12 — LOW** · web only · FOCUS ("visible focus ring on every focusable — no outline:none without a visible replacement, on dark AND light") · Focus suppression without a visible replacement (inline styles/`focus:` classes beat the global `:focus-visible` rule at `globals.css:920-923`):
  - a. `apps/web/components/ui/section-head-tabs.tsx:33,40` — tablist div is focusable (`tabIndex={0}`, hosts the arrow-key handler) with inline `outline: 'none'` and no replacement.
  - b. `apps/web/app/(chat)/chat/page.tsx:421` — chat composer textarea `outline: 'none'`; its container shadow is static (the Today search twin uses `focus-within:` at `today-shell.tsx:245`).
  - c. `apps/web/components/habits/habit-checklist.tsx:280` — add-item input `focus:outline-none` with static inset hairline only.
  - d. `apps/web/components/habits/habit-checklist.tsx:211-238` — `sr-only` checkbox: keyboard-focusable but the visual glyph shows no focus state (no peer-focus-visible styling).
  - e. `apps/web/components/chat/breakdown-suggestion.tsx:209,223,247` — `outline-none` on title input, frequency select, and target-count input with no focus replacement.
  Fix: add `focus-visible` ring/inset-shadow replacements (pattern: `habit-form-fields.tsx:247` or `pending-operation-card.tsx:200`).

**F13 — LOW** · mobile only — `apps/mobile/components/ui/fresh-start-animation.tsx:151` and `apps/mobile/lib/theme-provider.tsx:250-255` · DISMISS ("flag swallowed-back risks") · Two transient RN Modals render without `onRequestClose`, so hardware back is silently swallowed while they are visible (celebration ~seconds; theme cross-fade ~ms). Non-interactive overlays, so impact is a dead back press, not a stuck state. (`onboarding-flow.tsx:252` also omits it, but that gate is intentionally non-dismissable and matches web.) Fix: pass a no-op-with-intent `onRequestClose` that ends/fast-forwards the animation, or render these as non-Modal absolute overlays so back keeps working.

**F14 — LOW** · web `apps/web/components/habits/habit-list.tsx` (rows are individual tab stops; no list-level key handling) + mobile n/a · MOVE ("Home/End on long lists") · The Today/All habit list — the app's long list — has no Home/End jump (the codebase precedent exists: Popover panels implement Home/End at `popover.tsx:131-139`). Fix: list-level keydown moving focus to first/last row when focus is on a row.

**F15 — LOW** · mobile `apps/mobile/lib/overlay-stack.ts:18-43` + consumers `app/_layout.tsx:197`, `hooks/use-go-back-or-fallback.ts:18` · DISMISS (back-contract integrity) · The mobile overlay stack has consumers but zero producers — no component ever calls `registerOverlay`, so `dismissTopOverlay('system-back')` in the root BackHandler is a dead branch (back-dismiss works today only because RN Modal/TrueSheet intercept natively, which is correct). Risk: a future non-Modal overlay that "registers" per the web pattern will silently not exist in the mobile stack, or a reader assumes the stack is live. Fix: either wire `registerOverlay` into the surfaces that bypass native back interception (tour F6, level-up F7 would be natural first producers) or delete the stack and its dead consumers.

## Verdict

**15 findings: 3 HIGH · 6 MED · 6 LOW.**
DISMISS: 9 (F1-F7, F13, F15) · MOVE: 3 (F9, F11, F14, plus F8 partial) · FOCUS: 3 (F8, F10, F12) · ACTIVATE: 0 standalone (covered under F9; Enter/Space and row activation otherwise PASS).
Core modal/sheet/popover/menu families are in strong parity (overlay-stack + AppOverlay/ConfirmDialog/Popover on web; TrueSheet onBackPress + Modal onRequestClose on mobile; both BackHandler subscribers clean up). The breakage concentrates in bespoke layers that bypass both platforms' dismiss infrastructure: web date picker, emoji picker, description viewer (wrong-layer ESC), tour, level-up, push prompt, and drill ESC.
