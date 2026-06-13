# Sweep 13 — Keyboard interaction & focus parity (ESC == Android back) — ROUND 3 (verification)

Issue #107 agent-13 · round 3 · read-only static verification of the committed-green tree (HEAD `6399d00`, 2026-06-13). Scope: confirm the round-2 overlay-stack LIFO fixes (F1–F15) landed; rebuild the web-ESC vs mobile-back parity table; flag any still-open or NEW dismissable layer lacking parity.

NOTE: round-2 reports were written against the recovery commit `ae5c150`, which had reverted the wave-2 keyboard work. HEAD `6399d00` (wave-3 + central-merge) re-landed the entire D26/D27 batch. Verified against current code, not the round-2 baseline.

## Headline

**The overlay-stack LIFO batch LANDED in full.** A new shared hook `apps/web/hooks/use-overlay-escape.ts` (stack-gated ESC + focus-in + focus-restore) now backs every bespoke web layer; a new `apps/mobile/hooks/use-overlay-back.ts` registers the two non-Modal blocking layers (tour, level-up) as the first real producers of the mobile overlay stack. 13 of 15 round-2 findings are RESOLVED. Only the two LOW items survive: F12 (5 web focus-ring suppressions) and F13 (2 transient mobile Modals without `onRequestClose`) — both explicitly the lowest-stakes items in round 2.

## Parity table (current code, HEAD 6399d00)

| # | Surface | Web ESC | Mobile hardware back | Focus in/restore (web) | Status |
|---|---------|---------|----------------------|------------------------|--------|
| 1 | Create/Edit habit modal | AppOverlay ESC, stack-gated | TrueSheet `onBackPress` + dirty guard | trap/in/restore | PASS |
| 2 | Create/Edit goal modal | same | same | same | PASS |
| 3 | Habit/Goal detail drawer | same | same | same | PASS |
| 4 | Description viewer | **`useOverlayEscape` stack-gated** — `description-viewer.tsx:28-32`, ESC→`onOpenChange(false)`, focus→back btn, restore | BottomSheetModal back — `apps/mobile/.../description-viewer.tsx:32` | in (backButtonRef) + restore | **F3 PASS** |
| 5 | Move parent | AppOverlay | Modal `onRequestClose` | inherited | PASS |
| 6 | Confirm dialogs (delete/discard/skip/complete-parent) | ConfirmDialog ESC, stack-gated — `confirm-dialog.tsx:79-101` | Modal `onRequestClose` | in 74-77 + **restore 107-110** | **F10 PASS** |
| 7 | Notification panel / detail | Popover ESC / AppOverlay | BottomSheetModal back | in/restore | PASS |
| 8 | Habit row context menu | Popover + arrows/Home/End | AnchoredMenu Modal `onRequestClose` | in/restore + roving | PASS |
| 9 | Today list controls menu | **rebuilt on Popover** — `controls-menu.tsx:42` (render-prop close); bespoke ESC plumbing in `(app)/page.tsx` deleted | AnchoredMenu | **focus-in + roving + restore via Popover** | **F8 PASS** |
| 10 | Frequency / Goals view menu | Popover | AnchoredMenu | inherited | PASS |
| 11 | Chat / agent panel | ESC→back nav, input-guarded | route back: native pop + root fallback | route (n/a) | PASS |
| 12 | Emoji picker (in habit form) | **`useOverlayEscape`** — `habit-form-fields.tsx:233`, registered in stack, restore | Modal `onRequestClose` — `habit-emoji-selector.tsx:87` | in/restore | **F2 PASS** |
| 13 | Date picker dialog (habit due / reminder / goal deadline) | **`useOverlayEscape`** — `app-date-picker.tsx:113-116`; focus→roving day 118-123; grid arrows 151-165 | Modal `onRequestClose` — `apps/mobile/.../app-date-picker.tsx:145` | in (roving day) + restore | **F1, F11 PASS** |
| 14 | Time picker / Select | native input/select | Modal `onRequestClose` | native | PASS |
| 15 | Drill-down (sub-habit level) | **doc-level ESC→`drillBack`** — `use-drill-navigation.ts:142-156`, guarded by `hasOpenOverlay()` + text-entry + open-layer | BackHandler pops one level, cleanup OK | n/a | **F4 PASS** |
| 16 | Trial expired modal | AppOverlay | Modal `onRequestClose` | inherited | PASS |
| 17 | Push prompt | **`useOverlayEscape`** — `push-prompt.tsx:68` (`restoreFocus:false`), ESC→`dismiss` | Modal `onRequestClose={dismiss}` — `apps/mobile/.../push-prompt.tsx:132` | n/a (transient) | **F5 PASS** |
| 18 | Onboarding flow (gate) | no ESC by design; trap + initial focus | Modal without `onRequestClose` (back inert by design) | in yes | PASS (non-dismissable) |
| 19 | Calendar import / Feature guide / Referral / API-key / Preferences / Advanced / Edit-name / Fresh-start / Delete-account / Tour-replay drawers+modals | AppOverlay / ConfirmDialog | BottomSheetModal / Modal `onRequestClose` | inherited | PASS |
| 20 | Tour overlay (spotlight + tooltip) | **`useOverlayEscape`** — `tour/tour-overlay.tsx:73-77` (`restoreFocus:false`), ESC→`handleSkip` | **`useOverlayBack`** — `apps/mobile/.../tour-overlay.tsx:76`, registers in stack→`dismissTopOverlay` returns true | n/a | **F6 PASS** |
| 21 | Level-up overlay (blocking) | **`useOverlayEscape`** — `level-up-overlay.tsx:86-90`, ESC→`dismiss(id)` | **`useOverlayBack`** — `apps/mobile/.../level-up-overlay.tsx:122` (plain `Animated.View` zIndex 10001 now stack-registered) | n/a | **F7 PASS** |
| 22 | Celebrations/toasts | auto-dismiss + click | auto-dismiss | n/a | PASS (transient) |
| 23 | Fresh-start animation (transient) | non-dismissable portal | Modal **without** `onRequestClose` — `fresh-start-animation.tsx:151` | n/a | **F13 OPEN (LOW)** |
| 24 | Theme transition overlay (mobile only) | n/a | Modal **without** `onRequestClose` — `lib/theme-provider.tsx:250-255` (`pointerEvents:none`) | n/a | **F13 OPEN (LOW)** |
| 25 | Version update drawer (mobile only) | n/a | BottomSheetModal | n/a | PASS |

### Family checks (ACTIVATE / MOVE / FOCUS)

| Check | Result |
|---|---|
| dnd-kit keyboard reorder (habit list + checklist) | **PASS both** — `KeyboardSensor` + `sortableKeyboardCoordinates` now in both sensor sets: `habit-list.tsx:504-507`, `habit-checklist.tsx:59` → **F9 PASS** |
| Date grid arrows | **PASS** — `app-date-picker.tsx:151-165` ArrowL/R/U/D + Home/End + PageUp/Down, roving tabIndex 258 → **F11 PASS** |
| Home/End on long habit list | **PASS** — `habit-list.tsx:921-936` list-level keydown jumps to first/last focusable row → **F14 PASS** |
| ControlsMenu arrows/Home/End/restore | **PASS** — delegated to Popover → **F8 PASS** |
| Focus-ring suppressions (web) | **5 sites STILL suppressed → F12 OPEN (LOW)** (a–e below) |
| Mobile overlay-stack producers | **PASS** — `useOverlayBack` wired into tour + level-up; `dismissTopOverlay('system-back')` in root BackHandler (`_layout.tsx:248`) is now a live branch → **F15 RESOLVED** |
| Mobile BackHandler cleanup | PASS — `_layout.tsx:259`, `use-drill-navigation.ts` web, `use-overlay-back.ts:29` all remove/unregister on cleanup |
| Positive tabIndex | PASS — none |

## Findings (STILL OPEN)

**F12 — LOW** · web only · agent-13 bullet F12 · FOCUS · 5 focus suppressions WITHOUT a visible replacement remain (verified line-exact at HEAD):
  - a. `apps/web/components/ui/section-head-tabs.tsx:33,40` — focusable tablist (`tabIndex={0}`) with inline `outline: 'none'`, no `focus-visible` replacement.
  - b. `apps/web/app/(chat)/chat/page.tsx:421` — chat composer textarea `outline: 'none'`; container has no `focus-within:` ring/shadow.
  - c. `apps/web/components/habits/habit-checklist.tsx:283` — add-item input `focus:outline-none`, static inset hairline only (line 284).
  - d. `apps/web/components/habits/habit-checklist.tsx:213-241` — `sr-only` checkbox (219) focusable but visual glyph span (222-240) has no `peer-focus-visible` styling.
  - e. `apps/web/components/chat/breakdown-suggestion.tsx:161,175,200` — `outline-none` on title input, frequency select, target-count input; none has a replacement.
  Fix: add `focus-visible` ring/inset-shadow replacements (pattern `habit-form-fields.tsx:248`).

**F13 — LOW** · mobile only — `apps/mobile/components/ui/fresh-start-animation.tsx:151` and `apps/mobile/lib/theme-provider.tsx:250-255` · agent-13 bullet F13 · DISMISS · Two transient RN Modals STILL render without `onRequestClose`, so hardware back is silently swallowed while visible (celebration ~seconds; theme cross-fade ~ms, `pointerEvents:none`). Non-interactive overlays — impact is a dead back press, not a stuck state. Fix: pass an intentful `onRequestClose` that ends/fast-forwards, or render as non-Modal absolute overlays.

## Resolved since round 2 (do not re-report) — 13 findings

- **F1/F11 (web date picker)** — now `useOverlayEscape` stack registration + grid arrow/Home/End/PageUp-Down + roving tabIndex. `app-date-picker.tsx:113-165,258`.
- **F2 (emoji picker)** — `useOverlayEscape` at `habit-form-fields.tsx:233`; registered in stack; restores focus.
- **F3 (description viewer)** — `useOverlayEscape` with `initialFocusRef` + restore. `description-viewer.tsx:28-32`.
- **F4 (web drill ESC)** — doc-level ESC→`drillBack` guarded by `hasOpenOverlay()`/text-entry/open-layer. `use-drill-navigation.ts:142-156`.
- **F5 (push prompt)** — `useOverlayEscape` (`restoreFocus:false`) → `dismiss`. `push-prompt.tsx:68`.
- **F6 (tour)** — web `useOverlayEscape`→`handleSkip` (`tour-overlay.tsx:73`); mobile `useOverlayBack`→stack (`tour-overlay.tsx:76`). Both platforms.
- **F7 (level-up)** — web `useOverlayEscape`→`dismiss(id)` (`level-up-overlay.tsx:86`); mobile `useOverlayBack` (`level-up-overlay.tsx:122`). Both platforms.
- **F8 (controls menu)** — rebuilt on Popover (focus-in, roving, restore, stack-gated ESC); bespoke positioning/ESC plumbing deleted from `(app)/page.tsx`.
- **F9 (dnd KeyboardSensor)** — added to habit-list (`:504`) + habit-checklist (`:59`).
- **F10 (ConfirmDialog focus restore)** — captures `previouslyFocusedElement` on open (`confirm-dialog.tsx:67`), restores in cleanup (107-110).
- **F14 (Home/End habit list)** — `handleListKeyDown` wired (`habit-list.tsx:921-936`).
- **F15 (dead mobile stack)** — `useOverlayBack` is the first real producer (tour + level-up); `dismissTopOverlay('system-back')` in root BackHandler now a live LIFO branch.

The shared infrastructure is sound: web `overlay-stack.ts` (LIFO `isTopOverlay`/`dismissTopOverlay`) backs AppOverlay + ConfirmDialog + the new `useOverlayEscape`; mobile `overlay-stack.ts` backs the root BackHandler via `useOverlayBack`. Both BackHandler/keydown subscribers clean up.

## New dismissable layers (parity check)

No NEW dismissable layer was introduced at HEAD lacking parity. The habit-list refactor cluster (`move-parent-overlay`, `confirm-dialogs`, `drill-content`/`drill-panel`) continues to delegate to AppOverlay/ConfirmDialog/RN Modal and preserves parity. The two new hooks (`use-overlay-escape`, `use-overlay-back`) are dismiss infrastructure, not new layers.

## Verdict

**2 findings STILL OPEN: 0 HIGH · 0 MED · 2 LOW (F12 web focus rings, F13 mobile transient Modals).**
13 of 15 round-2 findings RESOLVED (3 HIGH + 6 MED + 4 LOW all closed): the full D26/D27 overlay-stack LIFO batch landed on both platforms via `useOverlayEscape` (web) and `useOverlayBack` (mobile). The two survivors are the lowest-stakes round-2 items — both LOW, both non-blocking (a missing visible focus ring; a dead back-press during a sub-second transient animation). No new parity-breaking layers.
