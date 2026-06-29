import type { ReactNode } from 'react'

interface RightRailProps {
  children: ReactNode
  ariaLabel: string
}

/**
 * Contextual right rail, fixed at ≥1280px (xl). Below xl the layout surfaces the
 * same content through a toggle drawer, so this panel stays presentational: it owns
 * width and the inset hairline seam. The outer column stretches to the full content
 * height so the seam runs the entire page, while an inner `sticky` viewport-tall
 * wrapper owns the internal scroll and keeps the rail content pinned in view.
 */
export function RightRail({ children, ariaLabel }: Readonly<RightRailProps>) {
  return (
    <aside
      data-right-rail=""
      aria-label={ariaLabel}
      className="hidden shrink-0 self-stretch xl:block"
      style={{
        width: 'var(--rail-w)',
        boxShadow: 'inset 1px 0 0 var(--hairline)',
      }}
    >
      <div
        className="thin-scrollbar sticky top-0 flex max-h-dvh flex-col gap-5 overflow-y-auto"
        style={{
          height: '100dvh',
          paddingTop: 'calc(var(--safe-top) + 22px)',
          paddingBottom: 'calc(var(--safe-bottom) + 22px)',
          paddingInline: 20,
        }}
      >
        {children}
      </div>
    </aside>
  )
}
