'use client'

import { useSyncExternalStore } from 'react'

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
