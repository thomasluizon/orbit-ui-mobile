'use client'

import { useCallback } from 'react'
import { scroll } from 'motion/react'

export function useHabitListScrollAnchor() {
  return useCallback((list: HTMLDivElement | null) => {
    const scroller = list?.closest<HTMLElement>('[data-shell-scroller]')
    if (!list || !scroller) return
    const reserve = () => {
      const contentTop = list.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop
      list.style.minHeight = `${Math.max(0, scroller.scrollTop + scroller.clientHeight - contentTop)}px`
    }
    reserve()
    const stopObservingScroll = scroll(reserve, { container: scroller, target: list })
    const observer = new ResizeObserver(reserve)
    observer.observe(scroller)
    return () => { stopObservingScroll(); observer.disconnect() }
  }, [])
}
