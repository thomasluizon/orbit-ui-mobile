'use client'

import type { TabBarItem, TabBarProps } from '@orbit/shared/contracts/navigation'
import { TAB_BAR_MIN_HEIGHT } from '@orbit/shared/theme'

export function BottomTabBar({ items, activeId, onSelect, label }: Readonly<Omit<TabBarProps, 'items'> & { items: readonly (TabBarItem & { href: string })[] }>) {
  const activeIndex = items.findIndex((item) => item.id === activeId)
  return (
    <nav aria-label={label} style={{ minHeight: TAB_BAR_MIN_HEIGHT }} className="w-full border-t border-[var(--hairline)] bg-[var(--bg)]">
      <div data-tab-items="" className="mx-auto flex w-full max-w-[740px] flex-wrap">
      {items.map((item, index) => {
        const active = index === activeIndex
        return (
          <a key={item.id} href={item.href} data-habit-create-navigation="" aria-label={item.label} onClick={(event) => {
            if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
            event.preventDefault()
            onSelect(item.id)
          }} aria-current={active ? 'page' : undefined}
            data-active={active || undefined} className="orbit-tab relative group rounded-full touch-manipulation flex min-h-[48px] min-w-20 basis-0 grow flex-col items-center justify-center gap-[4px] py-3 text-xs">
            {item.icon ? <span data-tab-indicator="" className="flex h-[32px] w-[56px] shrink-0 items-center justify-center overflow-hidden rounded-full transition-none group-hover:bg-[var(--bg-hover)] group-active:bg-[var(--bg-hover)]">{item.icon({ active })}</span> : null}
            <span className={`whitespace-nowrap font-medium leading-[calc(4/3)] ${active ? 'text-[var(--primary-soft)]' : 'text-[var(--fg-3)]'}`}>{item.label}</span>
          </a>
        )
      })}
      </div>
    </nav>
  )
}
