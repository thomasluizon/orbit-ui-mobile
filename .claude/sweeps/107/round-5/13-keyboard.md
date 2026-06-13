# Round-5 sweep #13 — Keyboard interaction & focus parity (ESC == Android back) (issue #107) — FINAL VERIFICATION

Baseline: ui-mobile `3520d10` (committed green). Read-only. Verifies the two round-3 LOW survivors (F12 web focus-ring suppressions, F13 mobile transient Modals) against round-4, and that overlay-stack LIFO survived the r4 chat split.

## F12 — web focus-ring suppressions — RESOLVED (all 5 sites)

The round-3 brief named composer / checklist / breakdown / tablist; all are addressed:
- **a. `apps/web/components/ui/section-head-tabs.tsx:33`** — the inline `outline: 'none'` (round-3 lines 33,40) is **REMOVED**. The `role="tablist" tabIndex={0}` container no longer suppresses the focus ring (browser default applies); per-tab buttons are native `<button>`s. **FIXED.**
- **b. chat composer textarea** — moved in the r4 split to `apps/web/app/(chat)/chat/chat-composer-bar.tsx`. The textarea keeps `outline: 'none'` (:393) but its wrapping container (:371) now carries `focus-within:outline-2 focus-within:-outline-offset-2 focus-within:outline-[var(--primary)]` — the exact round-3-prescribed `focus-within` ring. **FIXED.**
- **c. `apps/web/components/habits/habit-checklist.tsx:283`** — add-item input now `focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--primary)]`. **FIXED.**
- **d. `apps/web/components/habits/habit-checklist.tsx:224`** — sr-only checkbox glyph span now `peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--primary)]`. **FIXED.**
- **e. `apps/web/components/chat/breakdown-suggestion.tsx:161,175,200`** — title input, frequency select, target-count input each gained `focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)]`. **FIXED.**

## F13 — mobile transient Modals `onRequestClose` — 1 of 2 RESOLVED, 1 STILL OPEN (LOW)

- **`apps/mobile/components/ui/fresh-start-animation.tsx:155`** — now `onRequestClose={onComplete}` (back press fast-forwards the celebration). **FIXED.**
- **`apps/mobile/lib/theme-provider.tsx:250-255`** — the theme cross-fade Modal STILL renders without `onRequestClose`. Exhaustive scan (every mobile `<Modal>` lacking `onRequestClose`, tests excluded) returns this file as the ONLY remaining offender (onboarding-flow's Modal is intentionally non-dismissable per round-3). **STILL OPEN.**

  **LOW · `apps/mobile/lib/theme-provider.tsx:250-255` · bullet F13 · DISMISS** — the transient theme-transition Modal swallows a hardware back press while the cross-fade is on screen (`animationType="none"`, `pointerEvents="none"`, sub-second). Impact is a single dead back-press during a non-interactive ms-scale overlay, not a stuck state. Fix: add an intentful `onRequestClose` that fast-forwards/clears `transitionSnapshot`, or render the cross-fade as a non-Modal absolute overlay.

## Overlay-stack LIFO — intact after the r4 chat split

- All four shared overlay files present: web `lib/overlay-stack.ts` + `hooks/use-overlay-escape.ts`; mobile `lib/overlay-stack.ts` + `hooks/use-overlay-back.ts`.
- `useOverlayEscape` still backs all 6 bespoke web layers (level-up, description-viewer, emoji-in-habit-form, tour, date-picker, push-prompt) — consumer grep unchanged from round 3.
- Chat ESC (`apps/web/app/(chat)/chat/page.tsx:73-95`): the input-guarded route-back handler (bails on non-empty textarea/input/contenteditable; checks `event.defaultPrevented`) survived the split intact — it does not double-fire with the composer's `onKeyDown` Enter-to-send (`chat-composer-bar.tsx:389`) nor with stack-gated layers. No new dismissable layer was introduced by the split.

## Verdict

**1 finding STILL OPEN: 0 HIGH · 0 MED · 1 LOW** (`theme-provider.tsx` transient Modal missing `onRequestClose`).

All 5 F12 web focus-ring sites resolved in round 4 (tablist suppression removed; chat composer `focus-within` ring; checklist input + sr-only glyph + breakdown inputs `focus-visible`). F13 half-resolved: fresh-start gained `onRequestClose`, the theme cross-fade did not. Overlay-stack LIFO survived the chat split. Net: round-3's 2 LOW → 1 LOW.
