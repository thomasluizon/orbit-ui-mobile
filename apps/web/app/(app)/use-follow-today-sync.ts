'use client'

import { useEffect } from 'react'

function getMillisecondsUntilNextLocalMidnight(): number {
  const now = new Date()
  const nextMidnight = new Date(now)
  nextMidnight.setHours(24, 0, 0, 0)
  return Math.max(nextMidnight.getTime() - now.getTime(), 1_000)
}

/**
 * Keeps a "followed today" selection on the real current day. Syncs the
 * selected date with today on mount, schedules a re-sync at the next local
 * midnight (rescheduling itself afterwards), and re-syncs whenever the tab
 * regains visibility or focus.
 */
export function useFollowTodaySync(syncSelectedDateWithToday: () => void): void {
  useEffect(() => {
    let rolloverTimer: ReturnType<typeof globalThis.setTimeout> | null = null

    const resetRolloverTimer = () => {
      if (rolloverTimer) {
        globalThis.clearTimeout(rolloverTimer)
      }

      rolloverTimer = globalThis.setTimeout(() => {
        syncSelectedDateWithToday()
        resetRolloverTimer()
      }, getMillisecondsUntilNextLocalMidnight())
    }

    const handleVisible = () => {
      if (document.visibilityState !== 'visible') return
      syncSelectedDateWithToday()
      resetRolloverTimer()
    }

    const handleFocus = () => {
      syncSelectedDateWithToday()
      resetRolloverTimer()
    }

    syncSelectedDateWithToday()
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
  }, [syncSelectedDateWithToday])
}
