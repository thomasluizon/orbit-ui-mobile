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
            data-active={active || undefined} className="group flex h-11 min-w-0 basis-0 grow flex-col items-center justify-center gap-1 self-center overflow-hidden rounded-full transition-[background-color] duration-[var(--dur-hover-control)] ease-[var(--ease-standard)] hover:bg-[var(--bg-hover)] focus-visible:outline-2 focus-visible:outline-offset-2">
            {item.icon ? <span>{item.icon({ active })}</span> : null}
            <span className={`max-w-full truncate text-[12px] font-medium transition-[color] duration-[var(--dur-hover-control)] ease-[var(--ease-standard)] ${active ? 'text-[var(--primary-soft)] group-hover:text-[var(--primary-text)]' : 'text-[var(--fg-3)]'}`}>{item.label}</span>
          </button>
        )
      })}
    </nav>
  )
}
