'use client'

import { useEffect, useRef } from 'react'

function focusNewView(): boolean {
  const main = document.querySelector<HTMLElement>('main')
  const header = document.querySelector<HTMLElement>('[data-shell-header]')
  const target = header?.querySelector<HTMLElement>('h1') ?? main?.querySelector<HTMLElement>('h1') ?? main
  if (!target) return false
  if (main?.contains(document.activeElement) || header?.contains(document.activeElement)) return true
  target.tabIndex = -1
  target.focus({ preventScroll: true })
  return true
}

export function useRouteFocus(pathname: string) {
  const previousPathname = useRef(pathname)
  useEffect(() => {
    if (previousPathname.current === pathname) return
    previousPathname.current = pathname
    let frame: number
    const observer = new MutationObserver(scheduleFocus)
    function scheduleFocus() {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        frame = requestAnimationFrame(() => {
          if (focusNewView()) observer.disconnect()
        })
      })
    }
    observer.observe(document.body, { childList: true, subtree: true })
    scheduleFocus()
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
    }
  }, [pathname])
}
