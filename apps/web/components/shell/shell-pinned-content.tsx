'use client'

import { createContext, useLayoutEffect, useRef, type ReactNode, type RefObject } from 'react'
import { WIDE_DESKTOP_BREAKPOINT } from '@orbit/shared/theme'
import { useIsWideDesktop } from '@/hooks/use-is-desktop'

export const CompactComposerMenuContext = createContext<{
  hidden: boolean
  returnFocus: () => HTMLElement | null
} | null>(null)

export function ShellPinnedContent({ children, compactOnly, retainedComposerRef }: Readonly<{ children: ReactNode; compactOnly: boolean; retainedComposerRef?: RefObject<HTMLDivElement | null> }>) {
  const wide = useIsWideDesktop()
  const hostRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const host = hostRef.current
    const parent = host?.parentElement
    const retained = retainedComposerRef?.current
    if (!compactOnly || !wide || !host || !parent || !retained) return
    retained.appendChild(host)
    return () => { parent.appendChild(host) }
  }, [compactOnly, wide, retainedComposerRef])

  return <CompactComposerMenuContext.Provider value={compactOnly ? {
    hidden: wide,
    returnFocus: () => window.matchMedia(`(min-width: ${WIDE_DESKTOP_BREAKPOINT}px)`).matches
      ? hostRef.current?.closest('[data-shell]')?.querySelector<HTMLElement>('[data-shell-astra-row]') ?? null
      : null,
  } : null}>
    <div ref={hostRef} className="pointer-events-auto">{children}</div>
  </CompactComposerMenuContext.Provider>
}
