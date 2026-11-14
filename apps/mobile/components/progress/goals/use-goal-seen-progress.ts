import { useEffect, useState } from 'react'
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

/**
 * The progress each goal showed on the last visit, for this account on this device. The read is async, so the list
 * waits for it (`ready`) before it mounts the rings: a ring that mounted first would never sweep. The list records
 * what it shows now after each change, and only after the read, so it never overwrites the last visit first.
 */
export function useGoalSeenProgress(goals: readonly Goal[], enabled: boolean, sweep: boolean) {
  const [read, setRead] = useState<{ enabled: boolean; seen: GoalSeenProgress | null | undefined }>(() => ({ enabled, seen: enabled ? undefined : null }))
  if (read.enabled !== enabled) setRead({ enabled, seen: enabled ? undefined : null })
  const seen = read.enabled === enabled ? read.seen : undefined
  useEffect(() => {
    if (!enabled) return
    let current = true
    void AsyncStorage.getItem(accountStorageKey(GOAL_SEEN_PROGRESS_STORAGE_KEY)).then((raw) => {
      if (current) setRead({ enabled: true, seen: parseGoalSeenProgress(raw) })
    })
    return () => { current = false }
  }, [enabled])
  const loaded = seen !== undefined
  useEffect(() => {
    if (!enabled || !loaded || goals.length === 0) return
    void AsyncStorage.setItem(accountStorageKey(GOAL_SEEN_PROGRESS_STORAGE_KEY), JSON.stringify(recordGoalSeenProgress(goals)))
  }, [enabled, goals, loaded])
  return {
    ready: loaded,
    sweepFrom: (goal: Goal) => (enabled && sweep && seen ? goalProgressSweepStart(seen, goal.id, goal.progressPercentage) : null),
  }
}
