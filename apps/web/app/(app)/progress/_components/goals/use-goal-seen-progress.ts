'use client'

import { useEffect, useState } from 'react'
import type { Goal } from '@orbit/shared/types/goal'
import {
  GOAL_SEEN_PROGRESS_STORAGE_KEY,
  goalProgressSweepStart,
  parseGoalSeenProgress,
  recordGoalSeenProgress,
  type GoalSeenProgress,
} from '@orbit/shared/utils/goal-seen-progress'
import { accountStorageKey } from '@/lib/account-storage-key'

function readSeen(): GoalSeenProgress | null {
  if (typeof localStorage === 'undefined') return null
  return parseGoalSeenProgress(localStorage.getItem(accountStorageKey(GOAL_SEEN_PROGRESS_STORAGE_KEY)))
}

function writeSeen(goals: readonly Goal[]) {
  localStorage.setItem(accountStorageKey(GOAL_SEEN_PROGRESS_STORAGE_KEY), JSON.stringify(recordGoalSeenProgress(goals)))
}

/**
 * The progress each goal showed on the last visit, read once when the list mounts, for this account on this device.
 * `sweepFrom` gives the value a card's ring sweeps from. The list records what it shows now after each change.
 */
export function useGoalSeenProgress(goals: readonly Goal[], enabled: boolean, sweep: boolean) {
  const [seen] = useState(() => (enabled ? readSeen() : null))
  const loaded = goals.length > 0
  useEffect(() => {
    if (enabled && loaded) writeSeen(goals)
  }, [enabled, goals, loaded])
  return {
    sweepFrom: (goal: Goal) => (enabled && sweep ? goalProgressSweepStart(seen, goal.id, goal.progressPercentage) : null),
  }
}
