'use client'

import { Fragment, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import { revealFocusedControl } from '@/lib/focus-scroll'

const VIRTUAL_ROW_HEIGHT = 120
const VIRTUAL_VIEWPORT_HEIGHT = 320
const VIRTUAL_OVERSCAN = 2

interface PickerListProps<Item> {
  items: Item[]
  getName: (item: Item) => string
  getKey: (item: Item) => string
  renderRow: (item: Item) => ReactNode
  searchLabel: string
  empty?: ReactNode
  children?: ReactNode
}

export function PickerList<Item>({ items, getName, getKey, renderRow, searchLabel, empty, children }: Readonly<PickerListProps<Item>>) {
  const t = useTranslations()
  const [query, setQuery] = useState('')
  const [scrollTop, setScrollTop] = useState(0)
  const scrollRef = useRef<HTMLDivElement>(null)
  const [rowHeight, setRowHeight] = useState(VIRTUAL_ROW_HEIGHT)
  useLayoutEffect(() => {
    const element = scrollRef.current
    if (!element) return
    const measure = () => {
      const height = element.querySelector('[data-picker-row]')?.getBoundingClientRect().height
      if (height) setRowHeight(height)
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    const row = element.querySelector('[data-picker-row]')
    if (row) observer.observe(row)
    return () => observer.disconnect()
  }, [])
  const filtered = items.filter((item) => getName(item).toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
  const virtualized = items.length >= 21
  const start = virtualized ? Math.max(0, Math.floor(scrollTop / rowHeight) - VIRTUAL_OVERSCAN) : 0
  const size = Math.ceil(VIRTUAL_VIEWPORT_HEIGHT / rowHeight) + VIRTUAL_OVERSCAN * 2
  const visible = virtualized ? filtered.slice(start, start + size) : filtered
  const end = Math.min(filtered.length, start + visible.length)

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-1 p-2">
      {items.length >= 8 ? <p className="px-3 py-1 text-xs text-[var(--fg-3)]">{t('habits.form.availableCount', { count: items.length })}</p> : null}
      {virtualized ? <input value={query} onChange={(event) => { setQuery(event.target.value); setScrollTop(0); if (scrollRef.current) scrollRef.current.scrollTop = 0 }} className="form-input mb-2" aria-label={searchLabel} placeholder={searchLabel} /> : null}
      {items.length === 0 ? empty : null}
      <div ref={scrollRef} data-focus-inset="" onFocusCapture={revealFocusedControl} className={virtualized ? 'min-h-0 max-h-80 overflow-y-auto' : undefined} onScroll={virtualized ? (event) => setScrollTop(event.currentTarget.scrollTop) : undefined}>
        {start > 0 ? <div aria-hidden="true" style={{ height: start * rowHeight }} /> : null}
        {visible.map((item) => <Fragment key={getKey(item)}>{renderRow(item)}</Fragment>)}
        {end < filtered.length ? <div aria-hidden="true" style={{ height: (filtered.length - end) * rowHeight }} /> : null}
      </div>
      {children}
    </div>
  )
}
