# SHELL-FIX → HABITS-TODAY-FIX

These keyboard-13 findings live in YOUR exclusive today-page-local files. SHELL-FIX owns the overlay primitives; these two are page-local.

## F8 (keyboard 13, MED) — Today controls menu: focus-in / arrows / Home/End / restore
File: `apps/web/components/habits/controls-menu.tsx:45-62` (ESC handler is at `apps/web/app/(app)/page.tsx:198-199`).
Current: hand-rolled portal `role="menu"` with only an inline `onKeyDown` Escape + a non-stack-gated document ESC. Focus never enters the panel, no roving Arrow/Home/End, nothing restores focus.

Recommended fix: rebuild on the existing `Popover` primitive (`apps/web/components/ui/popover.tsx` — render-prop close, already does focus-in + roving Arrow/Home/End + restore + stack-gated ESC; see how the habit-row context menu and frequency-filter menu use it). Delete the bespoke positioning/ESC plumbing in controls-menu.tsx AND the document-ESC at page.tsx:198-199 (Popover owns it).
Mobile twin (`apps/mobile/components/ui/anchored-menu.tsx`) already PASSES (Modal onRequestClose); no change needed beyond the backdrop a11y SHELL already applied.

## F9 / D26 (keyboard 13, MED) — dnd-kit keyboard reorder (habit list half)
File: `apps/web/components/habits/habit-list.tsx:496,499` — sensors are `PointerSensor` + `TouchSensor` only.
Fix: add `useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })` to the sensor set.
```ts
import { KeyboardSensor } from '@dnd-kit/core'
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable'
// ...
const sensors = useSensors(
  useSensor(PointerSensor, ...),
  useSensor(TouchSensor, ...),
  useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
)
```
(The checklist-reorder half — `apps/web/components/habits/habit-checklist.tsx:55,56` — is HABITS-FORMS-FIX's file; that half is handed off to them separately. Coordinate so the same import lands once if both touch shared sensor config — they don't, the two files have independent sensor sets.)

No i18n. No mobile equivalent (dnd-kit is web-only; mobile reorder is RNGH).
