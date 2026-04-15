import { useCallback, useState } from 'react'

/**
 * Mobile parity port of `apps/web/hooks/use-popover-menu.ts`.
 *
 * The web hook computes a viewport-clamped popover position from a
 * trigger ref. On mobile the equivalent UX is a centered Modal/sheet —
 * there is no "anchor" concept — so the hook surface is intentionally
 * narrower: just an open/close/toggle state machine. Callers render
 * the menu via `<ControlsMenu open={isOpen} onClose={close} />` (or
 * `@gorhom/bottom-sheet` for richer sheets).
 *
 * The shared shape of this hook is `{ isOpen, open, close, toggle }` so
 * call sites that reach for it on either platform get the same names.
 */
export interface UsePopoverMenuReturn {
  isOpen: boolean
  open: () => void
  close: () => void
  toggle: () => void
}

export function usePopoverMenu(): UsePopoverMenuReturn {
  const [isOpen, setIsOpen] = useState(false)

  const open = useCallback(() => setIsOpen(true), [])
  const close = useCallback(() => setIsOpen(false), [])
  const toggle = useCallback(() => setIsOpen((v) => !v), [])

  return { isOpen, open, close, toggle }
}
