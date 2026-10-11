'use client'

import { createContext, useEffect, useMemo, useRef, type RefObject } from 'react'
import { WIDE_DESKTOP_BREAKPOINT } from '@orbit/shared/theme'

export const CompactComposerMenuContext = createContext<{
  onOpenChange: (open: boolean) => void
  returnFocus: () => HTMLElement | null
} | null>(null)

export function useCompactComposerMenu(wide: boolean, bottomRef: RefObject<HTMLDivElement | null>) {
  const menuOpenRef = useRef(false)
  const compactMenu = useMemo(() => ({
    onOpenChange: (open: boolean) => { menuOpenRef.current = open },
    returnFocus: () => window.matchMedia(`(min-width: ${WIDE_DESKTOP_BREAKPOINT}px)`).matches
      ? bottomRef.current?.closest('[data-shell]')?.querySelector<HTMLElement>('[data-shell-astra-row]') ?? null
      : null,
  }), [bottomRef])
  useEffect(() => {
    if (!wide || !menuOpenRef.current) return
    menuOpenRef.current = false
    compactMenu.returnFocus()?.focus({ preventScroll: true })
  }, [compactMenu, wide])
  return compactMenu
}
