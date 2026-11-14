'use client'

import { useCallback, useEffect, useState } from 'react'
import type { Goal } from '@orbit/shared/types/goal'
import {
  GOAL_SEEN_PROGRESS_STORAGE_KEY,
  goalProgressSweepStart,
  parseGoalSeenProgress,
  recordGoalSeenProgress,
  type GoalSeenProgress,
} from '@orbit/shared/utils/goal-seen-progress'
import { accountStorageKey } from '@/lib/account-storage-key'

/** Storage the browser refuses (private mode, quota) reads as no last visit, so every ring draws at rest. */
function readSeen(): GoalSeenProgress | null {
  try {
    return parseGoalSeenProgress(localStorage.getItem(accountStorageKey(GOAL_SEEN_PROGRESS_STORAGE_KEY)))
  } catch {
    return null
  }
}

/** A refused write only means the next visit draws every ring at rest. */
function writeSeen(seen: GoalSeenProgress) {
  try {
    localStorage.setItem(accountStorageKey(GOAL_SEEN_PROGRESS_STORAGE_KEY), JSON.stringify(seen))
  } catch {
    return
  }
}

/**
 * The progress each goal showed on the last visit, for this account on this device. It is read once when the list
 * mounts, or when the flag arrives after the first render, and always before the list records what it shows now.
 * `sweepFrom` gives the value a card's ring sweeps from, once in a visit. The list records what it shows now after each change.
 */
export function useGoalSeenProgress(goals: readonly Goal[], enabled: boolean, sweep: boolean) {
  const [snapshot, setSnapshot] = useState(() => ({ enabled, seen: enabled ? readSeen() : null }))
  if (snapshot.enabled !== enabled) setSnapshot({ enabled, seen: enabled ? readSeen() : null })
  const seen = snapshot.enabled === enabled ? snapshot.seen : null
  const [swept, setSwept] = useState<ReadonlySet<string>>(() => new Set())
  const markSwept = useCallback((goalId: string) => setSwept((current) => new Set(current).add(goalId)), [])
  const loaded = goals.length > 0
  useEffect(() => {
    if (!enabled || !loaded) return
    writeSeen(recordGoalSeenProgress(goals))
  }, [enabled, goals, loaded])
  return {
    sweepFrom: (goal: Goal) => (enabled && sweep && !swept.has(goal.id) ? goalProgressSweepStart(seen, goal.id, goal.progressPercentage) : null),
    markSwept,
  }
}
