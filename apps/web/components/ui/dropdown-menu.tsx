'use client'

import { useCallback, useEffect, useRef, useState, type ComponentProps, type ReactNode } from 'react'
import * as Primitive from '@radix-ui/react-dropdown-menu'
import { useMenuState } from '@/hooks/use-menu-state'
import { captureException } from '@sentry/nextjs'
import { MenuContext, useMenu } from './dropdown-menu-context'
import type { ContentProps } from './dropdown-menu-content'

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
  const { open } = useMenu()
  const MenuContent = useContentModule(open)?.Content
  return MenuContent ? <MenuContent {...props} /> : null
}

export function Item(props: ComponentProps<ContentModule['Item']>) {
  const MenuItem = useContentModule(true)?.Item
  return MenuItem ? <MenuItem {...props} /> : null
}
