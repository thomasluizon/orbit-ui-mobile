'use client'

import { useSyncExternalStore } from 'react'
import { getHabitInlineDepthLimit } from '@orbit/shared/utils'

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

function inlineDepthLimit() {
  return getHabitInlineDepthLimit(window.innerWidth)
}

export function useHabitInlineDepthLimit() {
  return useSyncExternalStore(subscribe, inlineDepthLimit, () => getHabitInlineDepthLimit(320))
}

export function useHabitRowSupportingMeta(depth: number) {
  return useSyncExternalStore(subscribe, () => hasLargeText() || depth > 0 && depth >= inlineDepthLimit(), () => depth > 0 && depth >= getHabitInlineDepthLimit(320))
}
