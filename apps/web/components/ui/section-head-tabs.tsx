'use client'

import { Lock } from 'lucide-react'

/** Tab bar that spreads its children proportionally across the row.
 *  Used for the Today / All / General / Goals view switcher. */
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
      className="flex items-stretch shrink-0"
      style={{
        padding: '8px 20px 10px',
        gap: 6,
        outline: 'none',
      }}
    >
      {tabs.map((tab) => {
        const isActive = tab.id === active
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            aria-label={tab.label}
            onClick={() => onChange(tab.id)}
            className="flex-1 appearance-none border-0 cursor-pointer inline-flex items-center justify-center gap-1.5 whitespace-nowrap"
            style={{
              height: 38,
              padding: '0 10px',
              borderRadius: 8,
              background: isActive ? 'var(--bg-elev)' : 'transparent',
              boxShadow: isActive
                ? 'inset 0 0 0 1px var(--fg-3)'
                : 'inset 0 0 0 1px var(--hairline-strong)',
              color: isActive ? 'var(--fg-1)' : 'var(--fg-2)',
              fontFamily: 'var(--font-family-sans)',
              fontSize: 13,
              fontWeight: isActive ? 600 : 500,
            }}
          >
            {tab.locked ? (
              <Lock size={11} strokeWidth={1.6} color="currentColor" />
            ) : null}
            {tab.label}
          </button>
        )
      })}
    </div>
  )
}
