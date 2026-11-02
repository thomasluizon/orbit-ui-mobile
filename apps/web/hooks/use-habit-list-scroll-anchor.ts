'use client'

import { useCallback } from 'react'
import { scroll } from 'motion/react'

export function useHabitListScrollAnchor(parentId: string | null = null) {
  return useCallback((list: HTMLDivElement | null) => {
    const scroller = list?.closest<HTMLElement>('[data-shell-scroller]')
    if (!list || !scroller) return
    let content: HTMLElement = list
    while (content.parentElement !== scroller) content = content.parentElement!
    const initialMinimumHeight = content.style.minHeight
    const initialOverflowAnchor = scroller.style.overflowAnchor
    scroller.style.overflowAnchor = 'none'
    if (parentId) scroller.scrollTop = 0
    let offset = scroller.scrollTop
    let viewport = scroller.clientHeight
    const reserve = () => {
      viewport = scroller.clientHeight
      const contentTop = content.offsetTop - Number.parseFloat(getComputedStyle(scroller).paddingTop)
      content.style.minHeight = `calc(100% + ${Math.ceil(offset) - contentTop}px)`
      scroller.scrollTop = offset
    }
    const onScroll = () => {
      const sameViewport = viewport === scroller.clientHeight
      if (sameViewport && offset === scroller.scrollTop) return
      if (sameViewport) offset = scroller.scrollTop
      reserve()
    }
    reserve()
    const stopObservingScroll = scroll(onScroll, { container: scroller, target: list })
    const observer = new ResizeObserver(reserve)
    observer.observe(scroller)
    return () => {
      stopObservingScroll()
      observer.disconnect()
      content.style.minHeight = initialMinimumHeight
      scroller.style.overflowAnchor = initialOverflowAnchor
    }
  }, [parentId])
}
