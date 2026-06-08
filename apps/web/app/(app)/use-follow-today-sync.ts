'use client'

import { useEffect } from 'react'

function getMillisecondsUntilNextLocalMidnight(): number {
  const now = new Date()
  const nextMidnight = new Date(now)
  nextMidnight.setHours(24, 0, 0, 0)
  return Math.max(nextMidnight.getTime() - now.getTime(), 1_000)
}

/**
 * Drives a "today tick": invokes `onRollover` at the next local midnight
 * (rescheduling itself afterwards) and whenever the tab regains visibility or
 * focus. Callers refresh their notion of today from it; pages following the
 * real current day re-render, pinned dates stay put.
 */
export function useTodayTick(onRollover: () => void): void {
  useEffect(() => {
    let rolloverTimer: ReturnType<typeof globalThis.setTimeout> | null = null

    const resetRolloverTimer = () => {
      if (rolloverTimer) {
        globalThis.clearTimeout(rolloverTimer)
      }

      rolloverTimer = globalThis.setTimeout(() => {
        onRollover()
        resetRolloverTimer()
      }, getMillisecondsUntilNextLocalMidnight())
    }

    const handleVisible = () => {
      if (document.visibilityState !== 'visible') return
      onRollover()
      resetRolloverTimer()
    }

    const handleFocus = () => {
      onRollover()
      resetRolloverTimer()
    }

    resetRolloverTimer()
    document.addEventListener('visibilitychange', handleVisible)
    globalThis.addEventListener('focus', handleFocus)

    return () => {
      if (rolloverTimer) {
        globalThis.clearTimeout(rolloverTimer)
      }
      document.removeEventListener('visibilitychange', handleVisible)
      globalThis.removeEventListener('focus', handleFocus)
    }
  }, [onRollover])
}
