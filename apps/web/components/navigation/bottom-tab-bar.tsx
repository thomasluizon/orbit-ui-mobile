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
            data-active={active || undefined} className="flex h-11 min-w-0 flex-1 flex-col items-center justify-center gap-1 self-center hover:bg-[var(--bg-hover)] focus-visible:outline-2 focus-visible:outline-offset-2">
            {item.icon?.({ active })}
            <span className="max-w-full truncate text-[12px] font-medium" style={{ color: active ? 'var(--primary-soft)' : 'var(--fg-3)' }}>{item.label}</span>
          </button>
        )
      })}
    </nav>
  )
}
