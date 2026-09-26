import type { ReactNode } from 'react'

interface RightRailProps {
  children: ReactNode
  ariaLabel: string
}

export function RightRail({ children, ariaLabel }: Readonly<RightRailProps>) {
  return (
    <aside
      data-right-rail=""
      aria-label={ariaLabel}
      className="hidden shrink-0 self-stretch xl:block"
      style={{
        width: 'var(--rail-w)',
      }}
    >
      <div
        className="thin-scrollbar sticky top-0 flex max-h-dvh flex-col gap-5 overflow-y-auto"
        style={{
          height: '100dvh',
          paddingTop: 'calc(var(--safe-top) + 22px)',
          paddingBottom: 'calc(var(--safe-bottom) + 22px)',
          paddingInline: 20,
          boxShadow: 'inset 1px 0 0 var(--hairline)',
        }}
      >
        {children}
      </div>
    </aside>
  )
}
