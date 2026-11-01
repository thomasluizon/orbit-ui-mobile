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
    if (parentId) scroller.scrollTop = 0
    let offset = scroller.scrollTop
    let viewport = scroller.clientHeight
    let retainedHeight = 0
    const reserve = (allowShrink: boolean) => {
      const currentHeight = content.clientHeight
      viewport = scroller.clientHeight
      content.style.minHeight = '0px'
      const contentHeight = content.clientHeight
      const contentTop = content.offsetTop - Number.parseFloat(getComputedStyle(scroller).paddingTop)
      retainedHeight = allowShrink ? Math.max(contentHeight, Math.min(retainedHeight, currentHeight)) : Math.max(retainedHeight, contentHeight)
      content.style.minHeight = `min(${retainedHeight}px, calc(100% + ${Math.ceil(offset) - contentTop}px))`
      scroller.scrollTop = offset
    }
    const onScroll = () => {
      const sameViewport = viewport === scroller.clientHeight
      if (sameViewport && offset === scroller.scrollTop) return
      const maximumOffset = scroller.scrollHeight - scroller.clientHeight
      if (sameViewport || offset <= maximumOffset || maximumOffset - scroller.scrollTop > 1) offset = scroller.scrollTop
      reserve(sameViewport)
    }
    reserve(false)
    const stopObservingScroll = scroll(onScroll, { container: scroller, target: list })
    const observer = new ResizeObserver(onScroll)
    observer.observe(scroller)
    return () => { stopObservingScroll(); observer.disconnect(); content.style.minHeight = initialMinimumHeight }
  }, [parentId])
}
