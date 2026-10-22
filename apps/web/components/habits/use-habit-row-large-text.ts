'use client'

import { useCallback, useEffect, useState, useSyncExternalStore, type RefCallback } from 'react'
import { getHabitInlineDepthLimit } from '@orbit/shared/utils'

function textScale() {
  const rootSize = Number.parseFloat(getComputedStyle(document.documentElement).fontSize)
  return rootSize > 16 ? rootSize / 16 : 1
}

function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange)
  observer.observe(document.documentElement, { attributes: true })
  window.addEventListener('resize', onChange)
  return () => {
    observer.disconnect()
    window.removeEventListener('resize', onChange)
  }
}

export function useHabitInlineDepthLimit() {
  const [contentWidth, setContentWidth] = useState<number>()
  const measureRef = useCallback((element: HTMLDivElement | null) => {
    if (!element) return
    const observer = new ResizeObserver(([entry]) => setContentWidth(entry!.contentRect.width))
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  const fontScale = useSyncExternalStore(subscribe, textScale, () => 1)
  const maxInlineDepth = getHabitInlineDepthLimit(320, fontScale, contentWidth)
  return { maxInlineDepth, measureRef, largeText: fontScale > 1.3 }
}

export function useHabitRowSupportingMeta(depth: number) {
  const { maxInlineDepth, measureRef, largeText } = useHabitInlineDepthLimit()
  return { supportingMeta: largeText || depth > 0 && depth >= maxInlineDepth, measureRef, largeText }
}

export function useHabitRowMetadataFit(signature: string, largeText: boolean, measureRef: RefCallback<HTMLDivElement>) {
  const [row, setRow] = useState<HTMLDivElement | null>(null)
  const rowRef = useCallback((element: HTMLDivElement | null) => {
    setRow(element)
    const cleanup = measureRef(element)
    return () => {
      cleanup?.()
      setRow(null)
    }
  }, [measureRef])
  const [narrow, setNarrow] = useState(false)
  useEffect(() => {
    if (!row) return
    const content = row.querySelector('[data-habit-row-title-block]')
    const tokens = Array.from(row.querySelectorAll('[data-habit-row-meta] > span'))
    if (!content) return
    const observer = new ResizeObserver(() => {
      const available = content.getBoundingClientRect().width
      if (available > 0) setNarrow(tokens.some((token) => token.getBoundingClientRect().width > available))
    })
    for (const element of [content, ...tokens]) observer.observe(element)
    return () => observer.disconnect()
  }, [row, signature, largeText, narrow])
  return { rowRef, narrow }
}
