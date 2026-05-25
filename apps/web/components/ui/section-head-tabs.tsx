'use client'

import { Lock } from 'lucide-react'
import { Chip } from './chip'

/** Strip of inline-chip tabs sitting directly under AppBar (Today/All/General/Goals).
 *  Locked tabs render a small lock glyph instead of being hidden. */
export interface SectionHeadTabItem<TId extends string> {
  id: TId
  label: string
  locked?: boolean
}

interface SectionHeadTabsProps<TId extends string> {
  tabs: ReadonlyArray<SectionHeadTabItem<TId>>
  active: TId
  onChange: (id: TId) => void
  ariaLabel?: string
  onKeyDown?: (event: React.KeyboardEvent<HTMLDivElement>) => void
}

export function SectionHeadTabs<TId extends string>({
  tabs,
  active,
  onChange,
  ariaLabel,
  onKeyDown,
}: Readonly<SectionHeadTabsProps<TId>>) {
  return (
    <div
      role="tablist"
      tabIndex={0}
      aria-label={ariaLabel}
      onKeyDown={onKeyDown}
      className="flex items-center shrink-0"
      style={{
        padding: '8px 20px 10px',
        gap: 6,
        outline: 'none',
      }}
    >
      {tabs.map((tab) => (
        <Chip
          key={tab.id}
          active={tab.id === active}
          onClick={() => onChange(tab.id)}
          ariaLabel={tab.label}
          leading={
            tab.locked ? (
              <Lock size={11} strokeWidth={1.6} color="currentColor" />
            ) : undefined
          }
        >
          {tab.label}
        </Chip>
      ))}
    </div>
  )
}
