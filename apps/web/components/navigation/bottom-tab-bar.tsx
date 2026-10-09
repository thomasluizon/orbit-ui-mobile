'use client'

import type { TabBarProps } from '@orbit/shared/contracts/navigation'

export function BottomTabBar({ items, activeId, onSelect, label }: Readonly<TabBarProps>) {
  const activeIndex = items.findIndex((item) => item.id === activeId)
  return (
    <nav aria-label={label} className="mx-auto flex min-h-[80px] flex-wrap w-full max-w-[740px] border-t border-[var(--hairline)] bg-[var(--bg)]">
      {items.map((item, index) => {
        const active = index === activeIndex
        return (
          <button key={item.id} type="button" aria-label={item.label} onClick={() => onSelect(item.id)} aria-current={active ? 'page' : undefined}
            data-active={active || undefined} className="group rounded-full touch-manipulation flex min-h-[48px] min-w-20 basis-0 grow flex-col items-center justify-center gap-[4px] py-[12px] text-xs focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--primary)]">
            {item.icon ? <span data-tab-indicator="" className="flex h-[32px] w-[56px] shrink-0 items-center justify-center overflow-hidden rounded-full transition-none group-hover:bg-[var(--bg-hover)] group-active:bg-[var(--bg-hover)]">{item.icon({ active })}</span> : null}
            <span className={`whitespace-nowrap font-medium leading-4 ${active ? 'text-[var(--primary-soft)]' : 'text-[var(--fg-3)]'}`}>{item.label}</span>
          </button>
        )
      })}
    </nav>
  )
}
