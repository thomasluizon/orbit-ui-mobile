import type { ReactNode } from 'react'

interface RightRailProps {
  children: ReactNode
  ariaLabel: string
}

/**
 * Contextual right rail, fixed at ≥1280px (xl). Below xl the layout surfaces the
 * same content through a toggle drawer, so this panel stays presentational: it owns
 * width, the inset hairline seam, and internal scroll only.
 */
export function RightRail({ children, ariaLabel }: Readonly<RightRailProps>) {
  return (
    <aside
      data-right-rail=""
      aria-label={ariaLabel}
      className="thin-scrollbar sticky top-0 hidden h-dvh shrink-0 flex-col gap-5 overflow-y-auto xl:flex"
      style={{
        width: 'var(--rail-w)',
        paddingTop: 'calc(var(--safe-top) + 22px)',
        paddingBottom: 'calc(var(--safe-bottom) + 22px)',
        paddingInline: 20,
        boxShadow: 'inset 1px 0 0 var(--hairline)',
      }}
    >
      {children}
    </aside>
  )
}
