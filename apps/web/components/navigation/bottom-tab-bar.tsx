'use client'

import { TAB_BAR_LABEL_MAX_FONT_SCALE, type TabBarItem, type TabBarProps } from '@orbit/shared/contracts/navigation'
import { useEffect, useRef, useState, type CSSProperties, type FocusEvent, type PointerEvent } from 'react'
import { createPortal } from 'react-dom'
import { TAB_BAR_MIN_HEIGHT } from '@orbit/shared/theme'

export function BottomTabBar({ items, activeId, onSelect, label }: Readonly<Omit<TabBarProps, 'items'> & { items: readonly (TabBarItem & { href: string })[] }>) {
  const [heldPreview, setHeldPreview] = useState<{ item: TabBarItem; container: HTMLElement } | null>(null)
  const [focusedPreview, setFocusedPreview] = useState<typeof heldPreview>(null)
  const preview = heldPreview ?? focusedPreview
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const suppressClick = useRef(false)
  useEffect(() => () => clearTimeout(timer.current), [])
  const cancelPreview = () => { clearTimeout(timer.current); setHeldPreview(null) }
  const dismissPreview = () => { cancelPreview(); setFocusedPreview(null) }
  const showFocusedPreview = (event: FocusEvent<HTMLAnchorElement>, item: TabBarItem) => {
    if (!event.currentTarget.matches(':focus-visible')) return
    const container = event.currentTarget.ownerDocument.body
    const textScale = parseFloat(getComputedStyle(container.ownerDocument.documentElement).fontSize) / 16
    if (textScale > TAB_BAR_LABEL_MAX_FONT_SCALE) setFocusedPreview({ item, container })
  }
  const startPreview = (event: PointerEvent<HTMLAnchorElement>, item: TabBarItem) => {
    cancelPreview()
    suppressClick.current = false
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    const container = event.currentTarget.ownerDocument.body
    const textScale = parseFloat(getComputedStyle(container.ownerDocument.documentElement).fontSize) / 16
    if (textScale <= TAB_BAR_LABEL_MAX_FONT_SCALE) return
    timer.current = setTimeout(() => { suppressClick.current = true; setHeldPreview({ item, container }) }, 500)
  }
  const activeIndex = items.findIndex((item) => item.id === activeId)
  return (<>
    <nav aria-label={label} style={{ minHeight: TAB_BAR_MIN_HEIGHT }} className="mx-auto flex flex-nowrap w-full max-w-[740px] border-t border-[var(--hairline)] bg-[var(--bg)]">
      {items.map((item, index) => {
        const active = index === activeIndex
        return (
          <a key={item.id} href={item.href} data-habit-create-navigation="" aria-label={item.label}
            onPointerDown={(event) => startPreview(event, item)} onPointerUp={cancelPreview}
            onPointerCancel={cancelPreview} onPointerLeave={cancelPreview}
            onFocus={(event) => showFocusedPreview(event, item)} onBlur={dismissPreview}
            onKeyDown={(event) => { if (event.key === 'Escape') dismissPreview() }}
            onContextMenu={(event) => { if (suppressClick.current) event.preventDefault() }}
            onClick={(event) => {
            if (event.detail > 0 && suppressClick.current) { event.preventDefault(); suppressClick.current = false; return }
            if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
            event.preventDefault()
            onSelect(item.id)
          }} aria-current={active ? 'page' : undefined}
            data-active={active || undefined} className="orbit-tab relative group rounded-full touch-manipulation flex min-h-[48px] min-w-0 basis-0 grow flex-col items-center justify-start gap-[4px] py-3 text-xs">
            {item.icon ? <span data-tab-indicator="" className="flex h-[32px] w-[56px] shrink-0 items-center justify-center overflow-hidden rounded-full transition-none group-hover:bg-[var(--bg-hover)] group-active:bg-[var(--bg-hover)]">{item.icon({ active })}</span> : null}
            <span style={{ '--tab-label-cap': `${12 * TAB_BAR_LABEL_MAX_FONT_SCALE}px`, '--tab-label-line-cap': `${16 * TAB_BAR_LABEL_MAX_FONT_SCALE}px` } as CSSProperties} className={`max-w-full whitespace-nowrap text-[length:min(0.75rem,var(--tab-label-cap))] text-center font-medium leading-[min(1rem,var(--tab-label-line-cap))] ${active ? 'text-[var(--primary-soft)]' : 'text-[var(--fg-3)]'}`}>{item.label}</span>
          </a>
        )
      })}
    </nav>
    {preview ? createPortal(<div className="pointer-events-none fixed inset-0 z-tooltip flex items-center justify-center p-4">
      <div role="tooltip" aria-label={preview.item.label} className="flex max-w-full flex-col items-center gap-3 rounded-[var(--r-card)] border border-[var(--hairline)] bg-[var(--bg)] p-6">
        {preview.item.icon ? <span className="flex size-[1.5rem] items-center justify-center [&_svg]:size-full">{preview.item.icon({ active: preview.item.id === activeId })}</span> : null}
        <span data-tab-viewer-label="" className="whitespace-nowrap text-center text-xs font-medium leading-[calc(4/3)] text-[var(--fg-1)]">{preview.item.label}</span>
      </div>
    </div>, preview.container) : null}
  </>)
}
