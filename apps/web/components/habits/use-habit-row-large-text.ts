'use client'

import { useSyncExternalStore } from 'react'

function hasLargeText() {
  return Number.parseFloat(getComputedStyle(document.documentElement).fontSize) > 16 * 1.3
}

function subscribe(onChange: () => void) {
  let frame: number | undefined
  let active = true
  const scheduleChange = () => {
    if (!active || frame !== undefined) return
    frame = requestAnimationFrame(() => {
      frame = undefined
      if (active) onChange()
    })
  }
  const observer = new MutationObserver(scheduleChange)
  observer.observe(document.documentElement, { attributes: true })
  window.addEventListener('resize', scheduleChange)
  return () => {
    active = false
    observer.disconnect()
    window.removeEventListener('resize', scheduleChange)
    if (frame !== undefined) cancelAnimationFrame(frame)
  }
}

export function useHabitRowLargeText() {
  return useSyncExternalStore(subscribe, hasLargeText, () => false)
}
