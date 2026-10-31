'use client'

import { useCallback } from 'react'
import { scroll } from 'motion/react'

export function useHabitListScrollAnchor() {
  return useCallback((list: HTMLDivElement | null) => {
    const scroller = list?.closest<HTMLElement>('[data-shell-scroller]')
    if (!list || !scroller) return
    let offset = scroller.scrollTop
    let viewport = scroller.clientHeight
    let minimumHeight = 0
    let retainedHeight = 0
    const reserve = (allowShrink: boolean) => {
      viewport = scroller.clientHeight
      list.style.minHeight = '0px'
      const contentHeight = list.clientHeight
      const contentTop = list.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop
      retainedHeight = allowShrink ? Math.max(contentHeight, minimumHeight) : Math.max(retainedHeight, contentHeight)
      const remainingContent = Math.max(0, contentTop + retainedHeight - offset - viewport)
      const neededHeight = Math.max(0, retainedHeight - remainingContent)
      minimumHeight = allowShrink ? neededHeight : Math.max(minimumHeight, neededHeight)
      list.style.minHeight = `${minimumHeight}px`
      scroller.scrollTop = offset
    }
    const onScroll = () => {
      const sameViewport = viewport === scroller.clientHeight
      if (sameViewport && offset === scroller.scrollTop) return
      if (sameViewport) offset = scroller.scrollTop
      reserve(sameViewport)
    }
    reserve(false)
    const stopObservingScroll = scroll(onScroll, { container: scroller, target: list })
    const observer = new ResizeObserver(() => {
      if (viewport !== scroller.clientHeight) reserve(false)
    })
    observer.observe(scroller)
    return () => { stopObservingScroll(); observer.disconnect() }
  }, [])
}
