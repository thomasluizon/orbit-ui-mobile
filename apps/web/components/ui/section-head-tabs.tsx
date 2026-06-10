'use client'

import { Lock } from 'lucide-react'

/** Tab bar that spreads its children proportionally across the row.
 *  Used for the Today / All / General / Goals view switcher. */
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
        padding: '12px 20px 16px',
        gap: 6,
        outline: 'none',
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
            className={
              'flex-1 appearance-none border-0 cursor-pointer inline-flex items-center justify-center gap-1.5 whitespace-nowrap transition-[background-color,color,box-shadow] duration-150 ease-out ' +
              (isActive
                ? 'bg-[var(--bg-elev)] text-[var(--fg-1)]'
                : 'bg-transparent text-[var(--fg-2)] hover:bg-[var(--bg-elev)] hover:text-[var(--fg-1)]')
            }
            style={{
              height: 38,
              padding: '0 10px',
              borderRadius: 8,
              boxShadow: isActive
                ? 'inset 0 0 0 1px var(--fg-3)'
                : 'inset 0 0 0 1px var(--hairline-strong)',
              fontFamily: 'var(--font-sans)',
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
