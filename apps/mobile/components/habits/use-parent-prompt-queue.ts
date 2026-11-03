import { useEffect,useLayoutEffect,useRef,useState } from 'react'
import { createUseParentPromptQueue } from '@orbit/shared/hooks'
import { useResetOnAccountChange } from '@/hooks/use-session-reset'
import { useUIStore } from '@/stores/ui-store'
import { subscribeBulkReplaySuccesses } from '@/lib/bulk-replay-events'
import type { useHabitListAccount,useHabitListQueries,useHabitListVisibility,useHabitRecentCompletions } from './use-habit-list-state'
import type { HabitListProps } from '../habit-list'
export { createParentPromptQueue, transitionParentPromptQueue } from '@orbit/shared/hooks'

const useSharedParentPromptQueue = createUseParentPromptQueue({ useState, useEffect, useLayoutEffect, useRef, useResetOnAccountChange })

type ParentPromptQueueInputs = Pick<ReturnType<typeof useHabitListAccount>, 'selectedDateStr' | 'settlementDateIsReadOnly' | 't' | 'profile' | 'accountTimeZone' | 'selectedDate'> & Pick<ReturnType<typeof useHabitListQueries>, 'getChildren' | 'habitsById' | 'habitsQuery' | 'skipMutation' | 'logMutateAsync' | 'bulkLog' | 'bulkSkip' | 'showError' | 'refetch'> & Pick<ReturnType<typeof useHabitListVisibility>, 'visibility'> & { view: NonNullable<HabitListProps['view']> } & Pick<ReturnType<typeof useHabitRecentCompletions>, 'markRecentlyCompleted' | 'clearRecentlyCompleted'>

export function useParentPromptQueue(inputs: ParentPromptQueueInputs) {
  const { habitsById, selectedDateStr } = inputs
  const queue = useSharedParentPromptQueue({ ...inputs, updatedAt: inputs.habitsQuery.dataUpdatedAt,
    logHabit: inputs.logMutateAsync, skipHabit: inputs.skipMutation.mutateAsync,
    bulkLog: (items, parentPromptContinuation) => inputs.bulkLog.mutateAsync(parentPromptContinuation.length > 0 ? { items, parentPromptContinuation } : items),
    bulkSkip: (items, parentPromptContinuation) => inputs.bulkSkip.mutateAsync(parentPromptContinuation.length > 0 ? { items, parentPromptContinuation } : items),
    toggleKey: (id, date) => `${id}:${date}`,
  })
  const { settleBulkHabitResolutions } = queue
  useEffect(() => subscribeBulkReplaySuccesses((success) => {
    const matched = success.items.filter((item) => item.date === selectedDateStr && habitsById.has(item.habitId))
    const remaining = success.items.filter((item) => item.date !== selectedDateStr || !habitsById.has(item.habitId))
    if (matched.length > 0) {
      const mode = success.type === 'bulkLogHabits' ? 'log' : 'skip'
      settleBulkHabitResolutions(matched.map((item) => ({ habitId: item.habitId, mode })), selectedDateStr, !success.suppressParentSettlement)
      const selection = useUIStore.getState()
      if (selection.isSelectMode) {
        const resolvedIds = new Set(matched.map((item) => item.habitId))
        const stillSelected = [...selection.selectedHabitIds].filter((id) => !resolvedIds.has(id))
        if (stillSelected.length < selection.selectedHabitIds.size) {
          if (stillSelected.length > 0) selection.selectAllHabits(stillSelected)
          else selection.clearSelection()
        }
      }
    }
    return remaining.length === success.items.length ? false : remaining
  }), [habitsById, selectedDateStr, settleBulkHabitResolutions])
  return { ...queue, skipHabit: queue.skipFromRow }
}
