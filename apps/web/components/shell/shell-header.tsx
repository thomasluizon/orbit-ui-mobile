'use client'

import { createContext, useContext, useLayoutEffect, useRef, type ReactNode, type RefObject } from 'react'

export const ShellHeaderHostContext = createContext<RefObject<HTMLDivElement | null> | null>(null)

export function useHasShellHeaderHost() {
  return useContext(ShellHeaderHostContext) !== null
}

export function getShellHeading(root: ParentNode) {
  return Array.from(root.querySelectorAll<HTMLElement>('[data-shell-header] h1, [data-shell-scroller] h1'))
    .find((heading) => !heading.closest('[hidden], [inert]'))
}

export function ShellHeader({ children }: Readonly<{ children: ReactNode }>) {
  const host = useContext(ShellHeaderHostContext)
  const headerRef = useRef<HTMLDivElement>(null)
  const originRef = useRef<HTMLSpanElement>(null)

  useLayoutEffect(() => {
    const target = host?.current
    const header = headerRef.current
    const origin = originRef.current
    if (!target || !header || !origin) return
    const focused = document.activeElement
    for (const previous of target.children) previous.setAttribute('hidden', '')
    target.appendChild(header)
    if (focused instanceof HTMLElement && header.contains(focused)) focused.focus({ preventScroll: true })
    return () => {
      const focused = document.activeElement
      origin.before(header)
      if (focused instanceof HTMLElement && header.contains(focused)) focused.focus({ preventScroll: true })
      target.lastElementChild?.removeAttribute('hidden')
    }
  }, [host])

  return <><div ref={headerRef}>{children}</div><span ref={originRef} hidden /></>
}
