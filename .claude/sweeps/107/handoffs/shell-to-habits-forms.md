# SHELL-FIX → HABITS-FORMS-FIX

Shell built the overlay-stack ESC infrastructure; the emoji-picker code lives in YOUR exclusive files, so the wiring is yours.

## F2 (keyboard 13, HIGH) — emoji picker ESC defeats parent overlay

New shared hook (already landed by SHELL-FIX): `apps/web/hooks/use-overlay-escape.ts` — `useOverlayEscape({ open, onDismiss, initialFocusRef?, restoreFocus? })`. It registers the layer in `@/lib/overlay-stack`, runs a stack-gated `document` keydown so ESC only fires for the TOP-MOST layer (LIFO), and restores focus to the previously focused element on close. Study `apps/web/components/ui/app-date-picker.tsx` / `description-viewer.tsx` for live usage.

### Web — `apps/web/components/habits/habit-form-fields.tsx` (`HabitEmojiSelector`, ~lines 206-232)
Current bug: the ESC listener is on `window` (line ~230) and the picker is NOT in the overlay stack, so the parent AppOverlay's `document` handler wins and ESC closes/dirty-confirms the habit form underneath while the picker stays open. No focus restore.

Fix:
1. Add a ref for the emoji trigger button: `const triggerRef = useRef<HTMLButtonElement>(null)` and attach to the open button (line ~245). (Optional — `useOverlayEscape` already restores to `document.activeElement`, which is the trigger at open time, so a ref is not strictly required. Default `restoreFocus: true` covers it.)
2. Delete the bespoke `useEffect` window-keydown block (lines ~225-232) entirely.
3. Call the hook instead:
   ```ts
   useOverlayEscape({ open: pickerOpen, onDismiss: closePicker })
   ```
   Import: `import { useOverlayEscape } from '@/hooks/use-overlay-escape'`.
4. Move initial focus into the picker on open: the search `<input autoFocus>` (line ~306) already grabs focus — keep it. `restoreFocus` (default true) returns focus to the trigger on close. Done.

### Mobile — `apps/mobile/components/habits/habit-form-fields/habit-emoji-selector.tsx`
Table says it PASSES (RN `Modal` `onRequestClose={...}` at ~line 87 already dismisses on hardware back). No overlay-stack wiring needed on mobile (RN Modal owns its own back). Leave as-is UNLESS you also migrate the placeholder fg-4 (audit Domain 7 lists `habit-emoji-selector.tsx:119` `?? tokens.fg4` → `tokens.fg3`).

## F9 / D26 (keyboard 13, MED) — checklist dnd-kit keyboard reorder (your half)
File: `apps/web/components/habits/habit-checklist.tsx:55,56` — sensors are `PointerSensor` + `TouchSensor` only.
Fix (same as the habit-list half HABITS-TODAY is doing):
```ts
import { KeyboardSensor } from '@dnd-kit/core'
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable'
useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
```

## Parity note
Name both files per your fix even though only web changes behavior here (mobile already compliant).
