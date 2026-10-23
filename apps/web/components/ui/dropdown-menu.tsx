'use client'

import { useCallback, useContext, useEffect, useRef, useState, type ComponentProps, type ReactNode, type RefObject } from 'react'
import * as Primitive from '@radix-ui/react-dropdown-menu'
import { useMenuState } from '@/hooks/use-menu-state'
import { captureException } from '@sentry/nextjs'
import { MenuContext, MenuItemsContext, useMenu } from './dropdown-menu-context'
import type { MenuItem } from '@orbit/shared/contracts/overlay'
import type { ContentProps } from './dropdown-menu-content'
import { ItemLabel } from './dropdown-menu-item'

type ContentModule = typeof import('./dropdown-menu-content')
let loadedContent: ContentModule | undefined
let loadingContent: Promise<ContentModule> | undefined

function loadContent() {
  loadingContent ??= import('./dropdown-menu-content').then((content) => {
    loadedContent = content
    return content
  }, (error: unknown) => {
    loadingContent = undefined
    throw error
  })
  return loadingContent
}

function useContentModule(load: boolean) {
  const [content, setContent] = useState(() => loadedContent)
  const [failure, setFailure] = useState<{ error: unknown } | null>(null)
  useEffect(() => {
    if (!load || content) return
    let active = true
    void loadContent().then(
      (module) => { if (active) setContent(module) },
      (error: unknown) => { if (active) setFailure({ error }) },
    )
    return () => { active = false }
  }, [load, content])
  if (failure) throw failure.error
  return content
}

export function Root({ open, onOpenChange, children }: Readonly<{ open?: boolean; onOpenChange?: (open: boolean) => void; children: ReactNode }>) {
  const state = useMenuState(open, onOpenChange)
  const triggerRef = useRef<HTMLButtonElement>(null)
  return <MenuContext.Provider value={{ ...state, triggerRef }}>
    <Primitive.Root open={state.open} onOpenChange={state.changeOpen} modal={false}>{children}</Primitive.Root>
  </MenuContext.Provider>
}

export function Trigger({ ref, onClick, onPointerDown, onPointerEnter, onFocus, ...props }: ComponentProps<typeof Primitive.Trigger>) {
  const { triggerRef, open, changeOpen } = useMenu()
  const pointerActivation = useRef(false)
  const composedRef = useCallback((element: HTMLButtonElement | null) => {
    triggerRef.current = element
    if (typeof ref === 'function') return ref(element)
    if (ref) ref.current = element
  }, [ref, triggerRef])
  return <Primitive.Trigger {...props} ref={composedRef}
    onPointerEnter={(event) => { void loadContent().catch(captureException); onPointerEnter?.(event) }}
    onFocus={(event) => { void loadContent().catch(captureException); onFocus?.(event) }}
    onPointerDown={(event) => {
      void loadContent().catch(captureException)
      pointerActivation.current = event.button === 0 && event.ctrlKey === false
      onPointerDown?.(event)
    }}
    onClick={(event) => {
      onClick?.(event)
      if (!props.disabled && event.detail === 0 && !pointerActivation.current && !event.defaultPrevented) changeOpen(!open)
      pointerActivation.current = false
    }} />
}

export const Portal = Primitive.Portal

export function Content(props: Readonly<ContentProps>) {
  const { open, canRestoreFocus, triggerRef } = useMenu()
  const firstItemRef = useRef<HTMLButtonElement>(null)
  const MenuContent = useContentModule(open)?.Content
  const items = props.items ?? []
  const rows = [...items.filter((item) => !item.destructive), ...items.filter((item) => item.destructive)]
  return MenuContent ? <MenuContent {...props} firstItemRef={firstItemRef}>{props.header}<MenuItems items={rows} firstItemRef={firstItemRef} /></MenuContent> : <Primitive.Content hidden onPointerDownOutside={(event) => event.detail.originalEvent.preventDefault()} onCloseAutoFocus={(event) => {
      if (open || !canRestoreFocus()) { event.preventDefault(); return }
      const target = props.returnFocus?.() ?? triggerRef.current
      if (target) { event.preventDefault(); target.focus() }
    }} />
}

function MenuItems({ items, firstItemRef }: Readonly<{ items: readonly MenuItem[]; firstItemRef: RefObject<HTMLButtonElement | null> }>) {
  const activate = useContext(MenuItemsContext)
  if (!activate) throw new Error('Menu items require Content')
  return items.map((item) => <Item key={item.id} item={item} buttonRef={item === items.find((row) => !row.disabled || row.badge) ? firstItemRef : undefined} onActivate={activate} />)
}

export function Item(props: Omit<ComponentProps<ContentModule['Item']>, 'children'>) {
  const MenuItem = useContentModule(true)?.Item
  return MenuItem ? <MenuItem {...props}><ItemLabel item={props.item} /></MenuItem> : null
}
