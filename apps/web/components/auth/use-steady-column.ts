'use client'

import { useLayoutEffect, useRef } from 'react'
import { steadyColumnInset } from '@orbit/shared/utils'

function pageViewportHeight(page: HTMLElement) {
  const style = getComputedStyle(page)
  return Number.parseFloat(style.minHeight) - Number.parseFloat(style.paddingTop) - Number.parseFloat(style.paddingBottom)
}

function flowSpace(block: HTMLElement | null) {
  const flow = block?.parentElement
  if (!block || !flow || getComputedStyle(block).position === 'absolute') return 0
  return block.getBoundingClientRect().height + (Number.parseFloat(getComputedStyle(flow).rowGap) || 0)
}

export function useSteadyColumn() {
  const columnRef = useRef<HTMLDivElement>(null)
  const blockRef = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const column = columnRef.current
    const page = column?.closest('main')
    if (!column || !page) return
    // WHY: transition-property starts as all, so the reduced-motion duration in globals.css would paint the old margin for a frame. https://drafts.csswg.org/css-transitions/#transition-property-property
    column.style.transitionProperty = 'none'
    const place = () => {
      const inset = steadyColumnInset({ viewport: pageViewportHeight(page), column: column.getBoundingClientRect().height, block: flowSpace(blockRef.current) })
      column.style.marginTop = `${inset}px`
    }
    // WHY: resize observations run after layout and before paint, so the inset lands in the frame that moved the block. https://html.spec.whatwg.org/multipage/webappapis.html#event-loop-processing-model
    const observer = new ResizeObserver(place)
    observer.observe(column)
    window.addEventListener('resize', place)
    place()
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', place)
    }
  }, [])
  return { columnRef, blockRef }
}
