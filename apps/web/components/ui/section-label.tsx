import type { ReactNode } from 'react'

/** Kit SectionTitle: Rubik 20/500 fg-1 with 24/20/14 padding and an optional trailing slot.
 *  `inset={false}` drops the horizontal gutter so the title left-aligns with content inside
 *  an already-padded container. */
interface SectionLabelProps {
  children: ReactNode
  top?: number
  bottom?: number
  trailing?: ReactNode
  inset?: boolean
}

export function SectionLabel({
  children,
  top = 24,
  bottom = 14,
  trailing,
  inset = true,
}: Readonly<SectionLabelProps>) {
  return (
    <div
      className={`flex items-center justify-between gap-3${inset ? ' px-5' : ''}`}
      style={{ paddingTop: top, paddingBottom: bottom }}
    >
      <span
        style={{
          fontFamily: 'var(--font-sans)',
          fontSize: 20,
          fontWeight: 500,
          letterSpacing: '-0.01em',
          color: 'var(--fg-1)',
        }}
      >
        {children}
      </span>
      {trailing}
    </div>
  )
}
