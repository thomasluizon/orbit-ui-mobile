'use client'

import { useEffect, useRef, useState, type RefObject } from 'react'
import * as Primitive from '@radix-ui/react-dropdown-menu'
import type { MenuItem, MenuProps } from '@orbit/shared/contracts/overlay'
import { Check } from '@/components/ui/icons'
import { Badge } from '@/components/ui/badge'
import { Icon } from '@/components/ui/icon'
import { Sheet, useSheetHost } from '@/components/ui/sheet'
import { useMenu } from './dropdown-menu-context'

const Portal = Primitive.Portal

export type ContentProps = Omit<MenuProps, 'open' | 'onClose' | 'anchorRef'> & {
  returnFocus?: () => HTMLElement | null
  restoreFocusOnSelect?: boolean
}

function useWidePresentation(wideFrom: number) {
  const [wide, setWide] = useState(() => globalThis.matchMedia(`(min-width: ${wideFrom}px)`).matches)
  useEffect(() => {
    const query = globalThis.matchMedia(`(min-width: ${wideFrom}px)`)
    const update = () => setWide(query.matches)
    update()
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [wideFrom])
  return wide
}

function visibleTabStop(element: HTMLElement) {
  for (let current: HTMLElement | null = element; current; current = current.parentElement) {
    const style = getComputedStyle(current)
    if (current.hidden || style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse') return false
  }
  return true
}

export function Content({ id, items = [], onSelect, title, shortTitle, titleMode, presentation = 'auto', wideFrom = 900, align = 'end', returnFocus, restoreFocusOnSelect = true }: Readonly<ContentProps>) {
  const { open, close, triggerRef, canRestoreFocus } = useMenu()
  const wide = useWidePresentation(wideFrom)
  const firstItemRef = useRef<HTMLButtonElement>(null)
  const selected = useRef(false)
  const restoreFocus = useRef(true)
  useEffect(() => { if (open) { restoreFocus.current = true; selected.current = false } }, [open])
  const onClose = close
  const rows = [...items.filter((item) => !item.destructive), ...items.filter((item) => item.destructive)]
  const activate = (id: string) => { selected.current = true; restoreFocus.current = restoreFocusOnSelect; onClose(); onSelect?.(id) }
  const focusDestination = () => {
    const target = returnFocus?.() ?? triggerRef.current
    const active = target?.ownerDocument.activeElement
    const actionMovedFocus = selected.current && active != null && !active.isSameNode(target?.ownerDocument.body ?? null)
      && !active.isSameNode(target ?? null) && !firstItemRef.current?.closest('[role="menu"]')?.contains(active)
    return canRestoreFocus() && restoreFocus.current && !actionMovedFocus && (target ?? true)
  }
  if (!open || items.length === 0) return null
  if (presentation === 'sheet' || (presentation === 'auto' && !wide)) {
    return <MenuSheet id={id} items={rows} onSelect={activate} onClose={onClose} title={title} shortTitle={shortTitle} titleMode={titleMode} firstItemRef={firstItemRef} onSelectStart={() => { selected.current = true; restoreFocus.current = restoreFocusOnSelect }} finalFocus={focusDestination} />
  }
  return <Portal><div>
    <div className="orbit-menu-catcher" aria-hidden="true" />
    <Primitive.Content {...(id ? { id } : {})} aria-label={title} aria-labelledby={undefined} align={align} sideOffset={8} collisionPadding={8} loop className="orbit-menu-panel" data-positioned="" onFocus={(event) => { if (event.target === event.currentTarget) firstItemRef.current?.focus() }} onKeyDown={(event) => {
      if (event.key !== 'Tab') return
      event.preventDefault()
      const trigger = triggerRef.current
      const candidates = Array.from(document.querySelectorAll<HTMLElement>('a[href], button, input, select, textarea, [tabindex]'))
        .filter((element) => element.tabIndex >= 0 && !element.hasAttribute('disabled') && !element.closest('[role="menu"], [aria-hidden="true"], [inert]') && visibleTabStop(element))
      const index = trigger ? candidates.indexOf(trigger) : -1
      restoreFocus.current = false
      onClose()
      candidates[index + (event.shiftKey ? -1 : 1)]?.focus()
    }} onCloseAutoFocus={(event) => {
      event.preventDefault()
      const target = focusDestination()
      if (typeof target !== 'boolean' && !target.ownerDocument.querySelector('[role="menu"]')) target.focus()
    }}>
      <div className="orbit-menu-items">{rows.map((item) => <Item key={item.id} item={item} buttonRef={item === rows.find((row) => !row.disabled || row.badge) ? firstItemRef : undefined} onActivate={activate} />)}</div>
    </Primitive.Content>
  </div></Portal>
}

function MenuSheet({ id, items, onSelect, onClose, title, shortTitle, titleMode, finalFocus, onSelectStart, firstItemRef }: Readonly<ContentProps & { firstItemRef: RefObject<HTMLButtonElement | null>; onSelectStart: () => void; onClose: () => void; finalFocus: () => boolean | HTMLElement }>) {
  const { sheetRef, closeSheet } = useSheetHost()
  return <div className="contents" onKeyDownCapture={(event) => {
    if (event.key === 'Tab') event.stopPropagation()
  }}><Sheet ref={sheetRef} initialFocus={firstItemRef} open title={titleMode === 'typed' ? title : shortTitle ?? title} titleMode={titleMode} accessibleTitle={title} onClose={() => { const target = finalFocus(); if (typeof target !== 'boolean') target.focus(); onClose() }} finalFocus={finalFocus}>
    <Primitive.Content {...(id ? { id } : {})} aria-label={title} aria-labelledby={undefined} loop className="orbit-menu-items" onFocus={(event) => { if (event.target === event.currentTarget) firstItemRef.current?.focus() }} onEscapeKeyDown={(event) => { event.preventDefault(); closeSheet() }} onInteractOutside={(event) => event.preventDefault()} onCloseAutoFocus={(event) => event.preventDefault()}>
      {items?.map((item) => <Item key={item.id} item={item} buttonRef={item === items.find((row) => !row.disabled || row.badge) ? firstItemRef : undefined} onActivate={(id) => { onSelectStart(); closeSheet(() => onSelect?.(id)) }} />)}
    </Primitive.Content>
  </Sheet></div>
}

export function Item({ item, onActivate, buttonRef }: Readonly<{ buttonRef?: RefObject<HTMLButtonElement | null>; item: MenuItem; onActivate: (id: string) => void }>) {
  const disabled = Boolean(item.disabled && !item.badge)
  const props = { disabled, textValue: item.label, onSelect: (event: Event) => { event.preventDefault(); onActivate(item.id) }, 'data-destructive': item.destructive || undefined, className: 'orbit-menu-item' }
  const content = <span className="orbit-menu-content">
    {item.icon ? <Icon name={item.icon} size={20} strokeWidth={2} /> : null}
    <span className="orbit-menu-label">{item.label}</span>
    {item.checked ? <span className="orbit-menu-check" aria-hidden="true"><Check size={20} strokeWidth={2} /></span> : null}
    {item.badge ? <Badge>{item.badge}</Badge> : null}
  </span>
  return item.checked === undefined
    ? <Primitive.Item {...props} asChild><button ref={buttonRef} type="button" disabled={disabled}>{content}</button></Primitive.Item>
    : <Primitive.CheckboxItem {...props} checked={item.checked} asChild><button ref={buttonRef} type="button" disabled={disabled}>{content}</button></Primitive.CheckboxItem>
}
