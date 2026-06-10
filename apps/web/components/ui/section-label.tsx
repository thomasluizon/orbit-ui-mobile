import type { ReactNode } from 'react'

/** Plain flush-left 13px/600 muted section label with optional trailing slot. */
interface SectionLabelProps {
  children: ReactNode
  top?: number
  bottom?: number
  trailing?: ReactNode
}

export function SectionLabel({
  children,
  top = 24,
  bottom = 12,
  trailing,
}: Readonly<SectionLabelProps>) {
  return (
    <div
      className="flex items-center justify-between gap-3 px-5"
      style={{ paddingTop: top, paddingBottom: bottom }}
    >
      <span
        className="text-[13px] font-semibold text-[var(--fg-3)]"
        style={{ fontFamily: 'var(--font-sans)' }}
      >
        {children}
      </span>
      {trailing}
    </div>
  )
}
