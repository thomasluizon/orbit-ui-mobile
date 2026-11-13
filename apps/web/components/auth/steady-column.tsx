'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { steadyColumnInset } from '@orbit/shared/utils'

function pageViewportHeight(page: HTMLElement) {
  const style = getComputedStyle(page)
  return Number.parseFloat(style.minHeight) - Number.parseFloat(style.paddingTop) - Number.parseFloat(style.paddingBottom)
}

export function SteadyColumn({ blockSpace, children }: Readonly<{ blockSpace: number; children: ReactNode }>) {
  const columnRef = useRef<HTMLDivElement>(null)
  const [heights, setHeights] = useState({ viewport: 0, column: 0 })
  useEffect(() => {
    const column = columnRef.current
    const page = column?.closest('main')
    if (!column || !page) return
    const measure = () => setHeights({ viewport: pageViewportHeight(page), column: column.getBoundingClientRect().height })
    const observer = new ResizeObserver(measure)
    observer.observe(column)
    window.addEventListener('resize', measure)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [])
  const inset = steadyColumnInset({ viewport: heights.viewport, column: heights.column, block: blockSpace })
  return (
    <div className="w-full" style={{ paddingTop: inset }}>
      <div ref={columnRef} data-testid="login-column" className="flex w-full flex-col items-center">{children}</div>
    </div>
  )
}
