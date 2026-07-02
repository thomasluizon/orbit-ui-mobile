'use client'

import { Lock } from 'lucide-react'

/** Kit pill-chip row used as the Today / All / General / Goals view switcher:
 *  inactive chips sit on the bg-elev well, the active chip fills selection-bg
 *  with a primary ring and primary text. */
export interface SectionHeadTabItem<TId extends string> {
  id: TId
  label: string
  locked?: boolean
  dataTour?: string
}

interface SectionHeadTabsProps<TId extends string> {
  tabs: ReadonlyArray<SectionHeadTabItem<TId>>
  active: TId
  onChange: (id: TId) => void
  ariaLabel?: string
  onKeyDown?: (event: React.KeyboardEvent<HTMLDivElement>) => void
  className?: string
}

export function SectionHeadTabs<TId extends string>({
  tabs,
  active,
  onChange,
  ariaLabel,
  onKeyDown,
  className,
}: Readonly<SectionHeadTabsProps<TId>>) {
  return (
    <div
      role="tablist"
      tabIndex={0}
      aria-label={ariaLabel}
      onKeyDown={onKeyDown}
      className={['flex items-center justify-center shrink-0', className]
        .filter(Boolean)
        .join(' ')}
      style={{
        padding: '12px 20px 16px',
        gap: 8,
        borderRadius: 14,
      }}
    >
      {tabs.map((tab) => {
        const isActive = tab.id === active
        return (
          <button
            key={tab.id}
            id={`tab-${tab.id}`}
            type="button"
            role="tab"
            aria-selected={isActive}
            aria-label={tab.label}
            data-tour={tab.dataTour}
            onClick={() => onChange(tab.id)}
            className={isActive ? 'chip chip-active' : 'chip'}
          >
            {tab.locked ? (
              <Lock size={14} strokeWidth={1.8} color="currentColor" aria-hidden="true" />
            ) : null}
            {tab.label}
          </button>
        )
      })}
    </div>
  )
}
