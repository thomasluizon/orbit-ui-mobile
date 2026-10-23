'use client'

import { useEffect, useRef, type ReactNode, type RefObject } from 'react'
import * as Primitive from '@radix-ui/react-dropdown-menu'
import type { MenuItem, MenuProps } from '@orbit/shared/contracts/overlay'
import { Sheet, useSheetHost } from '@/components/ui/sheet'
import { useViewportMatch } from '@/hooks/use-viewport-match'
import { MenuItemsContext, useMenu } from './dropdown-menu-context'
import { Check } from '@/components/ui/icons'
import { Badge } from '@/components/ui/badge'
import { Icon } from '@/components/ui/icon'

const Portal = Primitive.Portal

export type ContentProps = Omit<MenuProps, 'open' | 'onClose' | 'anchorRef'> & {
  header?: ReactNode
  returnFocus?: () => HTMLElement | null
  restoreFocusOnSelect?: boolean
}

function visibleTabStop(element: HTMLElement) {
  for (let current: HTMLElement | null = element; current; current = current.parentElement) {
    const style = getComputedStyle(current)
    if (current.hidden || style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse') return false
  }
  return true
}

export function Content({ id, items = [], onSelect, title, shortTitle, titleMode, presentation = 'auto', wideFrom = 900, align = 'end', returnFocus, restoreFocusOnSelect = true, children, firstItemRef }: Readonly<ContentProps & { children: ReactNode; firstItemRef: RefObject<HTMLButtonElement | null> }>) {
  const { open, close, triggerRef, canRestoreFocus } = useMenu()
  const wide = useViewportMatch(`(min-width: ${wideFrom}px)`)
  const selected = useRef(false)
  const restoreFocus = useRef(true)
  useEffect(() => { if (open) { restoreFocus.current = true; selected.current = false } }, [open])
  const onClose = close
  const activate = (id: string) => { selected.current = true; restoreFocus.current = restoreFocusOnSelect; onClose(); onSelect?.(id) }
  const focusDestination = () => {
    const target = returnFocus?.() ?? triggerRef.current
    const active = target?.ownerDocument.activeElement
    const actionMovedFocus = selected.current && active != null && !active.isSameNode(target?.ownerDocument.body ?? null)
      && !active.isSameNode(target ?? null) && !firstItemRef.current?.closest('[role="menu"]')?.contains(active)
    return canRestoreFocus() && restoreFocus.current && !actionMovedFocus && (target ?? true)
  }
  const restoreAnchoredFocus = () => {
    const target = focusDestination()
    if (typeof target !== 'boolean') target.focus()
  }
  if (!open || items.length === 0) return null
  if (presentation === 'sheet' || (presentation === 'auto' && !wide)) {
    return <MenuSheet id={id} onSelect={activate} onClose={onClose} title={title} shortTitle={shortTitle} titleMode={titleMode} firstItemRef={firstItemRef} onSelectStart={() => { selected.current = true; restoreFocus.current = restoreFocusOnSelect }} finalFocus={focusDestination}>{children}</MenuSheet>
  }
  return <MenuItemsContext.Provider value={activate}><Portal><div>
    <div className="orbit-menu-catcher" aria-hidden="true" onPointerDown={(event) => {
      event.preventDefault()
      restoreAnchoredFocus()
      onClose()
    }} />
    <Primitive.Content {...(id ? { id } : {})} aria-label={title} aria-labelledby={undefined} align={align} sideOffset={8} collisionPadding={8} loop className="orbit-menu-panel" data-positioned="" onFocus={(event) => { if (event.target === event.currentTarget) firstItemRef.current?.focus() }} onEscapeKeyDown={restoreAnchoredFocus} onPointerDownOutside={(event) => {
      event.detail.originalEvent.preventDefault()
      restoreAnchoredFocus()
    }} onKeyDown={(event) => {
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
      <div className="orbit-menu-items">{children}</div>
    </Primitive.Content>
  </div></Portal></MenuItemsContext.Provider>
}

function MenuSheet({ id, children, onSelect, onClose, title, shortTitle, titleMode, finalFocus, onSelectStart, firstItemRef }: Readonly<ContentProps & { children: ReactNode; firstItemRef: RefObject<HTMLButtonElement | null>; onSelectStart: () => void; onClose: () => void; finalFocus: () => boolean | HTMLElement }>) {
  const { sheetRef, closeSheet } = useSheetHost()
  return <MenuItemsContext.Provider value={(id) => { onSelectStart(); closeSheet(() => onSelect?.(id)) }}><div className="contents" onKeyDownCapture={(event) => {
    if (event.key === 'Tab') event.stopPropagation()
  }}><Sheet ref={sheetRef} initialFocus={firstItemRef} open title={titleMode === 'typed' ? title : shortTitle ?? title} titleMode={titleMode} accessibleTitle={title} onClose={() => { const target = finalFocus(); if (typeof target !== 'boolean') target.focus(); onClose() }} finalFocus={finalFocus}>
    <Primitive.Content {...(id ? { id } : {})} aria-label={title} aria-labelledby={undefined} loop className="orbit-menu-items" onFocus={(event) => { if (event.target === event.currentTarget) firstItemRef.current?.focus() }} onEscapeKeyDown={(event) => { event.preventDefault(); closeSheet() }} onInteractOutside={(event) => event.preventDefault()} onCloseAutoFocus={(event) => event.preventDefault()}>
      {children}
    </Primitive.Content>
  </Sheet></div></MenuItemsContext.Provider>
}

export function Item({ item, onActivate, buttonRef, children }: Readonly<{ children: ReactNode; buttonRef?: RefObject<HTMLButtonElement | null>; item: MenuItem; onActivate: (id: string) => void }>) {
  const disabled = Boolean(item.disabled && !item.badge)
  const props = { disabled, textValue: item.label, onSelect: (event: Event) => { event.preventDefault(); onActivate(item.id) }, 'data-destructive': item.destructive || undefined, className: 'orbit-menu-item' }
  const content = <span className="orbit-menu-content">
    {item.icon ? <Icon name={item.icon} size={20} strokeWidth={2} /> : null}
    {children}
    {item.checked ? <span className="orbit-menu-check" aria-hidden="true"><Check size={20} strokeWidth={2} /></span> : null}
    {item.badge ? <Badge>{item.badge}</Badge> : null}
  </span>
  return item.checked === undefined
    ? <Primitive.Item {...props} asChild><button ref={buttonRef} type="button" disabled={disabled}>{content}</button></Primitive.Item>
    : <Primitive.CheckboxItem {...props} checked={item.checked} asChild><button ref={buttonRef} type="button" disabled={disabled}>{content}</button></Primitive.CheckboxItem>
}
