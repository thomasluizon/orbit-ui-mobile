'use client'

import { useCallback, useRef, useState } from 'react'
import type { Goal } from '@orbit/shared/types/goal'
import { useAccountScopedState } from '@/hooks/use-session-reset'
import type { GoalStatusResult } from './goal-status-result-dialog'

/**
 * What the goal detail shows after a change on the Orbit logic: the result dialog of a reactivate, an abandon or a
 * delete, and one ring sweep after the progress sheet closes. Off (`guided` false), it records nothing.
 */
export function useGoalDetailOutcomes(goal: Goal | null, reducedMotion: boolean) {
  const [result, setResult] = useAccountScopedState<GoalStatusResult | null>(null)
  const [progressSweep, setProgressSweep] = useState<{ from: number; key: number } | null>(null)
  const progressBefore = useRef<number | null>(null)
  const deletedTitle = useRef('')
  const progressValue = goal?.progressPercentage ?? null
  const progressFormOpened = useCallback(() => { progressBefore.current = progressValue }, [progressValue])
  return {
    result,
    progressSweep,
    clearResult: () => setResult(null),
    rememberDeletedTitle: () => { deletedTitle.current = goal?.title ?? '' },
    onDeleted: (undo: () => void) => setResult({ outcome: 'deleted', title: deletedTitle.current, undo }),
    onStatusSaved: (status: 'Abandoned' | 'Active') => setResult({ outcome: status === 'Active' ? 'reactivated' : 'abandoned', title: goal?.title ?? '' }),
    progressFormOpened,
    progressFormClosed: () => {
      const before = progressBefore.current
      progressBefore.current = null
      if (reducedMotion || before === null) return
      setProgressSweep((current) => ({ from: before, key: (current?.key ?? 0) + 1 }))
    },
  }
}
