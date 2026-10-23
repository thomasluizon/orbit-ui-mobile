'use client'

import { isValidElement, useContext, useEffect, useId, useMemo, useRef, useState, type ComponentProps, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { useComposedRefs } from '@radix-ui/react-compose-refs'
import type * as Primitive from '@radix-ui/react-dropdown-menu'
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
  const triggerId = useId()
  const contentId = useId()
  const context = useMemo(() => ({ ...state, triggerRef, triggerId, contentId }), [state, triggerId, contentId])
  return <MenuContext.Provider value={context}>{children}</MenuContext.Provider>
}

type TriggerProps = ComponentProps<typeof Primitive.Trigger>

export function Trigger({ ref, asChild, children, ...props }: TriggerProps) {
  const { triggerRef, triggerId, contentId, open, changeOpen } = useMenu()
  const child = asChild && isValidElement<TriggerProps>(children) ? children : null
  const composedRef = useComposedRefs(triggerRef, ref, child?.props.ref)
  const disabled = props.disabled || child?.props.disabled
  const pointerActivation = useRef(false)
  const releaseOpeningGesture = useRef<() => void>(() => {})
  useEffect(() => () => releaseOpeningGesture.current(), [])
  const triggerProps: ComponentProps<'button'> & { 'data-state': 'open' | 'closed' } = {
    type: 'button', id: triggerId, 'aria-haspopup': 'menu', 'aria-expanded': open,
    'aria-controls': open ? contentId : undefined, 'data-state': open ? 'open' : 'closed',
    ...props, ...child?.props, ref: composedRef,
    onPointerEnter: (event) => { void loadContent().catch(captureException); child?.props.onPointerEnter?.(event); props.onPointerEnter?.(event) },
    onFocus: (event) => { void loadContent().catch(captureException); child?.props.onFocus?.(event); props.onFocus?.(event) },
    onPointerDown: (event) => {
      void loadContent().catch(captureException)
      releaseOpeningGesture.current()
      pointerActivation.current = event.button === 0 && !event.ctrlKey
      child?.props.onPointerDown?.(event)
      props.onPointerDown?.(event)
      if (!disabled && pointerActivation.current && !event.defaultPrevented) {
        if (!open) {
          releaseOpeningGesture.current = preserveOpeningGesture(event.currentTarget.ownerDocument, () => { pointerActivation.current = false })
          event.preventDefault()
        }
        changeOpen(!open)
      }
    },
    onKeyDown: (event) => {
      child?.props.onKeyDown?.(event)
      props.onKeyDown?.(event)
      if (disabled || event.defaultPrevented || !['Enter', ' ', 'ArrowDown'].includes(event.key)) return
      changeOpen(event.key === 'ArrowDown' || !open)
      event.preventDefault()
    },
    onClick: (event) => {
      child?.props.onClick?.(event)
      props.onClick?.(event)
      if (!disabled && event.detail === 0 && !pointerActivation.current && !event.defaultPrevented) changeOpen(!open)
      pointerActivation.current = false
    },
  }
  const TriggerButton = child?.type ?? 'button'
  return <TriggerButton {...triggerProps} key={child?.key}>{child ? child.props.children : children}</TriggerButton>
}

function preserveOpeningGesture(ownerDocument: Document, onComplete: () => void) {
  function release() {
    ownerDocument.removeEventListener('click', consumeClick, true)
    ownerDocument.removeEventListener('pointerdown', release, true)
    ownerDocument.removeEventListener('pointercancel', release, true)
    ownerDocument.removeEventListener('keydown', release, true)
    onComplete()
  }
  function consumeClick(event: MouseEvent) {
    event.preventDefault()
    event.stopImmediatePropagation()
    if (event.detail !== 0) release()
  }
  ownerDocument.addEventListener('click', consumeClick, true)
  ownerDocument.addEventListener('pointerdown', release, true)
  ownerDocument.addEventListener('pointercancel', release, true)
  ownerDocument.addEventListener('keydown', release, true)
  return release
}

export function Portal({ children, container, forceMount }: ComponentProps<typeof Primitive.Portal>) {
  const { open } = useMenu()
  return (open || forceMount) && typeof document !== 'undefined' ? createPortal(children, container ?? document.body) : null
}

export function Content(props: Readonly<ContentProps>) {
  const { open, close, canRestoreFocus, triggerRef, contentId } = useMenu()
  const firstItemRef = useRef<HTMLButtonElement>(null)
  const MenuContent = useContentModule(open)?.Content
  const { returnFocus } = props
  useEffect(() => {
    if (!open || MenuContent) return
    function dismiss() {
      if (canRestoreFocus()) (returnFocus?.() ?? triggerRef.current)?.focus()
      close()
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopImmediatePropagation()
      dismiss()
    }
    function onPointerDown(event: PointerEvent) {
      if (event.target instanceof Node && triggerRef.current?.contains(event.target)) return
      event.preventDefault()
      dismiss()
    }
    document.addEventListener('keydown', onKeyDown, true)
    document.addEventListener('pointerdown', onPointerDown, true)
    return () => {
      document.removeEventListener('keydown', onKeyDown, true)
      document.removeEventListener('pointerdown', onPointerDown, true)
    }
  }, [open, MenuContent, close, canRestoreFocus, returnFocus, triggerRef])
  const items = props.items ?? []
  const rows = [...items.filter((item) => !item.destructive), ...items.filter((item) => item.destructive)]
  return MenuContent ? <MenuContent id={contentId} {...props} firstItemRef={firstItemRef}>{props.header}<MenuItems items={rows} firstItemRef={firstItemRef} /></MenuContent> : null
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
