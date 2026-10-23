'use client'

import { useCallback, createContext, useContext, useEffect, useRef, useState, type ComponentProps, type ReactNode, type RefObject } from 'react'
import * as Primitive from '@radix-ui/react-dropdown-menu'
import { useMenuState } from '@/hooks/use-menu-state'
import type { MenuItem, MenuProps } from '@orbit/shared/contracts/overlay'
import { Check } from '@/components/ui/icons'
import { Badge } from '@/components/ui/badge'
import { Icon } from '@/components/ui/icon'
import { Sheet, useSheetHost } from '@/components/ui/sheet'

const MenuContext = createContext<(ReturnType<typeof useMenuState> & { triggerRef: React.RefObject<HTMLButtonElement | null> }) | null>(null)

function useMenu() {
  const context = useContext(MenuContext)
  if (!context) throw new Error('Menu parts require a Root')
  return context
}

export function Root({ open, onOpenChange, children }: Readonly<{ open?: boolean; onOpenChange?: (open: boolean) => void; children: ReactNode }>) {
  const state = useMenuState(open, onOpenChange)
  const triggerRef = useRef<HTMLButtonElement>(null)
  return <MenuContext.Provider value={{ ...state, triggerRef }}>
    <Primitive.Root open={state.open} onOpenChange={state.changeOpen} modal={false}>{children}</Primitive.Root>
  </MenuContext.Provider>
}

export function Trigger({ ref, onClick, onPointerDown, ...props }: ComponentProps<typeof Primitive.Trigger>) {
  const { triggerRef, open, changeOpen } = useMenu()
  const pointerActivation = useRef(false)
  const composedRef = useCallback((element: HTMLButtonElement | null) => {
    triggerRef.current = element
    if (typeof ref === 'function') return ref(element)
    if (ref) ref.current = element
  }, [ref, triggerRef])
  return <Primitive.Trigger {...props} ref={composedRef}
    onPointerDown={(event) => {
      pointerActivation.current = event.button === 0 && event.ctrlKey === false
      onPointerDown?.(event)
    }}
    onClick={(event) => {
      onClick?.(event)
      if (event.detail === 0 && !pointerActivation.current && !event.defaultPrevented) changeOpen(!open)
      pointerActivation.current = false
    }} />
}

export const Portal = Primitive.Portal

type ContentProps = Omit<MenuProps, 'open' | 'onClose' | 'anchorRef'> & {
  returnFocus?: () => HTMLElement | null
  restoreFocusOnSelect?: boolean
}

function useWidePresentation(wideFrom: number) {
  const [wide, setWide] = useState(false)
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
  const restoreFocus = useRef(true)
  useEffect(() => { if (open) restoreFocus.current = true }, [open])
  const onClose = close
  const rows = [...items.filter((item) => !item.destructive), ...items.filter((item) => item.destructive)]
  const activate = (id: string) => { restoreFocus.current = restoreFocusOnSelect; onClose(); onSelect?.(id) }
  if (!open || items.length === 0) return null
  if (presentation === 'sheet' || (presentation === 'auto' && !wide)) {
    return <MenuSheet id={id} items={rows} onSelect={activate} onClose={onClose} title={title} shortTitle={shortTitle} titleMode={titleMode} firstItemRef={firstItemRef} onSelectStart={() => { restoreFocus.current = restoreFocusOnSelect }} finalFocus={() => canRestoreFocus() && restoreFocus.current && (returnFocus?.() ?? triggerRef.current ?? true)} />
  }
  return <Portal><div>
    <div className="orbit-menu-catcher" aria-hidden="true" />
    <Primitive.Content {...(id ? { id } : {})} aria-label={title} aria-labelledby={undefined} align={align} sideOffset={8} collisionPadding={8} loop className="orbit-menu-panel" data-positioned="" {...{ onOpenAutoFocus: (event: Event) => { event.preventDefault(); firstItemRef.current?.focus() } }} onKeyDown={(event) => {
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
      const target = returnFocus?.() ?? triggerRef.current
      if (target && canRestoreFocus() && restoreFocus.current && !target.ownerDocument.querySelector('[role="menu"]')) target.focus()
    }}>
      <div className="orbit-menu-items">{rows.map((item) => <Item key={item.id} item={item} buttonRef={item === rows.find((row) => !row.disabled || row.badge) ? firstItemRef : undefined} onActivate={activate} />)}</div>
    </Primitive.Content>
  </div></Portal>
}

function MenuSheet({ id, items, onSelect, onClose, title, shortTitle, titleMode, finalFocus, onSelectStart, firstItemRef }: Readonly<ContentProps & { firstItemRef: RefObject<HTMLButtonElement | null>; onSelectStart: () => void; onClose: () => void; finalFocus: () => boolean | HTMLElement }>) {
  const { sheetRef, closeSheet } = useSheetHost()
  return <div className="contents" onKeyDownCapture={(event) => {
    if (event.key === 'Tab') event.stopPropagation()
  }}><Sheet ref={sheetRef} initialFocus={firstItemRef} open title={titleMode === 'typed' ? title : shortTitle ?? title} titleMode={titleMode} accessibleTitle={title} onClose={() => { const target = finalFocus(); if (target instanceof HTMLElement) target.focus(); onClose() }} finalFocus={finalFocus}>
    <Primitive.Content {...(id ? { id } : {})} aria-label={title} aria-labelledby={undefined} loop className="orbit-menu-items" {...{ onOpenAutoFocus: (event: Event) => { event.preventDefault(); firstItemRef.current?.focus() } }} onEscapeKeyDown={(event) => { event.preventDefault(); closeSheet() }} onInteractOutside={(event) => event.preventDefault()} onCloseAutoFocus={(event) => event.preventDefault()}>
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
