import { useCallback, useEffect, useState } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import type { Goal } from '@orbit/shared/types/goal'
import {
  GOAL_SEEN_PROGRESS_STORAGE_KEY,
  goalProgressSweepStart,
  parseGoalSeenProgress,
  recordGoalSeenProgress,
  type GoalSeenProgress,
} from '@orbit/shared/utils/goal-seen-progress'
import { accountStorageKey } from '@/lib/account-storage-key'

/** A refused write only means the next visit draws every ring at rest. */
function writeSeen(seen: GoalSeenProgress) {
  AsyncStorage.setItem(accountStorageKey(GOAL_SEEN_PROGRESS_STORAGE_KEY), JSON.stringify(seen)).catch(() => undefined)
}

/**
 * The progress each goal showed on the last visit, for this account on this device. The read is async, so the list
 * waits for it (`ready`) before it mounts the rings: a ring that mounted first would never sweep. The list records
 * what it shows now after each change, and only after the read, so it never overwrites the last visit first.
 */
export function useGoalSeenProgress(goals: readonly Goal[], enabled: boolean, sweep: boolean) {
  const [read, setRead] = useState<{ enabled: boolean; seen: GoalSeenProgress | null | undefined }>(() => ({ enabled, seen: enabled ? undefined : null }))
  if (read.enabled !== enabled) setRead({ enabled, seen: enabled ? undefined : null })
  const seen = read.enabled === enabled ? read.seen : undefined
  const [swept, setSwept] = useState<ReadonlySet<string>>(() => new Set())
  const markSwept = useCallback((goalId: string) => setSwept((current) => new Set(current).add(goalId)), [])
  useEffect(() => {
    if (!enabled) return
    let current = true
    void AsyncStorage.getItem(accountStorageKey(GOAL_SEEN_PROGRESS_STORAGE_KEY)).then(parseGoalSeenProgress, () => null).then((seen) => {
      if (current) setRead({ enabled: true, seen })
    })
    return () => { current = false }
  }, [enabled])
  const loaded = seen !== undefined
  useEffect(() => {
    if (!enabled || !loaded || goals.length === 0) return
    writeSeen(recordGoalSeenProgress(goals))
  }, [enabled, goals, loaded])
  return {
    ready: loaded,
    sweepFrom: (goal: Goal) => (enabled && sweep && seen && !swept.has(goal.id) ? goalProgressSweepStart(seen, goal.id, goal.progressPercentage) : null),
    markSwept,
  }
}
