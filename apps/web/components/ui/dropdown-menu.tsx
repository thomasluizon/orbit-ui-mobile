'use client'

import { useContext, useEffect, useId, useMemo, useRef, useState, type ComponentProps, type ReactNode, type RefObject } from 'react'
import { useComposedRefs } from '@radix-ui/react-compose-refs'
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
  const triggerId = useId()
  const contentId = useId()
  const context = useMemo(() => ({ ...state, triggerRef, triggerId, contentId }), [state, triggerId, contentId])
  return <MenuContext.Provider value={context}><Primitive.Root open={state.open} onOpenChange={state.changeOpen} modal={false}>{children}</Primitive.Root></MenuContext.Provider>
}

type TriggerProps = ComponentProps<typeof Primitive.Trigger>

export function Trigger({ ref, onPointerEnter, onFocus, ...props }: TriggerProps) {
  const { triggerRef, triggerId, contentId, open } = useMenu()
  const composedRef = useComposedRefs(triggerRef, ref)
  return <Primitive.Trigger ref={composedRef} id={triggerId} aria-controls={open ? contentId : undefined} {...props}
    onPointerEnter={(event) => { void loadContent().catch(captureException); onPointerEnter?.(event) }}
    onFocus={(event) => { void loadContent().catch(captureException); onFocus?.(event) }} />
}

export const Portal = Primitive.Portal

export function Content(props: Readonly<ContentProps>) {
  const { open, canRestoreFocus, triggerRef, contentId } = useMenu()
  const firstItemRef = useRef<HTMLButtonElement>(null)
  const MenuContent = useContentModule(open)?.Content
  const items = props.items ?? []
  const rows = [...items.filter((item) => !item.destructive), ...items.filter((item) => item.destructive)]
  if (MenuContent) return <MenuContent id={contentId} {...props} firstItemRef={firstItemRef}>{props.header}<MenuItems items={rows} firstItemRef={firstItemRef} /></MenuContent>
  return <Primitive.Portal><Primitive.Content id={props.id ?? contentId} aria-label={props.title} style={{ visibility: 'hidden' }}
    onFocusOutside={(event) => event.preventDefault()}
    onCloseAutoFocus={(event) => {
      event.preventDefault()
      if (!open && canRestoreFocus()) (props.returnFocus?.() ?? triggerRef.current)?.focus()
    }} /></Primitive.Portal>
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
