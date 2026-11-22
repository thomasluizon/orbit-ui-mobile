import { useCallback, useRef, useState } from 'react'
import type { Goal } from '@orbit/shared/types/goal'
import { useAccountScopedState } from '@/hooks/use-session-reset'
import type { GoalStatusResult } from './goal-status-result-dialog'

interface AfterSheetClosesInput {
  inline: boolean
  closeSheet: (exitAction?: () => void, onRejected?: () => void) => void
}

/**
 * Runs `show` once the detail sheet is gone. A guided surface that is a `Modal` presents from the root controller on iOS,
 * which still presents the sheet until its native dismissal ends. Off or inline, `show` runs at once.
 */
export function useAfterSheetCloses({ inline, closeSheet }: Readonly<AfterSheetClosesInput>) {
  return useCallback((show: () => void) => {
    if (!inline) closeSheet(show, show)
    else show()
  }, [inline, closeSheet])
}

/** Whether the detail sheet is mounted: not while the progress form or a guided `Modal` has the screen. */
export function goalDetailSheetShows({ open, inline, editingProgress, guidedModalOpen }: Readonly<{ open: boolean; inline: boolean; editingProgress: boolean; guidedModalOpen: boolean }>): boolean {
  if (!open) return false
  return inline || !(editingProgress || guidedModalOpen)
}

/**
 * What the goal detail shows after a change on the Orbit logic: the result dialog of a reactivate, an abandon or a
 * delete, and one ring sweep after the progress sheet closes. Off (`guided` false), it records nothing.
 */
export function useGoalDetailOutcomes(goal: Goal | null, reducedMotion: boolean, afterSheetCloses: (show: () => void) => void) {
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
    onDeleted: ({ undo, release }: { undo: () => void; release?: () => void }) => afterSheetCloses(() => setResult({ outcome: 'deleted', title: deletedTitle.current, undo, release })),
    onStatusSaved: (status: 'Abandoned' | 'Active') => afterSheetCloses(() => setResult({ outcome: status === 'Active' ? 'reactivated' : 'abandoned', title: goal?.title ?? '' })),
    progressFormOpened,
    progressFormClosed: () => {
      const before = progressBefore.current
      progressBefore.current = null
      if (reducedMotion || before === null) return
      setProgressSweep((current) => ({ from: before, key: (current?.key ?? 0) + 1 }))
    },
  }
}
