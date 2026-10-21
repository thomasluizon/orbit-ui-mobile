'use client'

import { useEffect, useRef, useState, useSyncExternalStore } from 'react'

function hasLargeText() {
  return Number.parseFloat(getComputedStyle(document.documentElement).fontSize) > 16 * 1.3
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

export function useHabitRowLargeText() {
  return useSyncExternalStore(subscribe, hasLargeText, () => false)
}

export function useHabitRowMetadataFit(signature: string, largeText: boolean) {
  const rowRef = useRef<HTMLDivElement>(null)
  const [narrow, setNarrow] = useState(false)
  useEffect(() => {
    const row = rowRef.current
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
  }, [signature, largeText, narrow])
  return { rowRef, narrow }
}
