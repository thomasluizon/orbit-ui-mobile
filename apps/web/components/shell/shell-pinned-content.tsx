'use client'

import { createContext, useRef, type ReactNode } from 'react'
import { WIDE_DESKTOP_BREAKPOINT } from '@orbit/shared/theme'
import { useIsWideDesktop } from '@/hooks/use-is-desktop'

export const CompactComposerMenuContext = createContext<{
  hidden: boolean
  returnFocus: () => HTMLElement | null
} | null>(null)

export function ShellPinnedContent({ children, compactOnly }: Readonly<{ children: ReactNode; compactOnly: boolean }>) {
  const wide = useIsWideDesktop()
  const hostRef = useRef<HTMLDivElement>(null)

  return <CompactComposerMenuContext.Provider value={compactOnly ? {
    hidden: wide,
    returnFocus: () => window.matchMedia(`(min-width: ${WIDE_DESKTOP_BREAKPOINT}px)`).matches
      ? hostRef.current?.closest('[data-shell]')?.querySelector<HTMLElement>('[data-shell-astra-row]') ?? null
      : null,
  } : null}>
    <div ref={hostRef} className="pointer-events-auto">{children}</div>
  </CompactComposerMenuContext.Provider>
}
