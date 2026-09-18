'use client'

import type { TabBarProps } from '@orbit/shared/contracts/navigation'

export function BottomTabBar({ items, activeId, onSelect, label }: Readonly<TabBarProps>) {
  const activeIndex = items.findIndex((item) => item.id === activeId)
  return (
    <nav aria-label={label} className="flex h-14 border-t border-[var(--hairline)] bg-[var(--bg)]">
      {items.map((item, index) => {
        const active = index === activeIndex
        return (
          <button key={item.id} type="button" aria-label={item.label} onClick={() => onSelect(item.id)} aria-current={active ? 'page' : undefined}
            data-active={active || undefined} className="group relative flex h-11 min-w-0 flex-1 flex-col items-center justify-center gap-1 self-center focus-visible:outline-2 focus-visible:outline-offset-2">
            <span aria-hidden="true" className="pointer-events-none absolute inset-0 transition-colors duration-[var(--dur-hover)] ease-[var(--ease-standard)] group-hover:bg-[var(--bg-hover)]" />
            {item.icon ? <span className="relative">{item.icon({ active })}</span> : null}
            <span className={`relative max-w-full truncate text-[12px] font-medium transition-colors duration-[var(--dur-hover-control)] ease-[var(--ease-standard)] ${active ? 'text-[var(--primary-soft)] group-hover:text-[var(--primary-text)]' : 'text-[var(--fg-3)]'}`}>{item.label}</span>
          </button>
        )
      })}
    </nav>
  )
}
