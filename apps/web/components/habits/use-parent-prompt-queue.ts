'use client'

import { useEffect,useLayoutEffect,useRef } from 'react'
import { createUseParentPromptQueue, type ParentPromptInputs } from '@orbit/shared/hooks'
import { useAccountScopedState,useResetOnAccountChange } from '@/hooks/use-session-reset'
import type { useHabitListQueries,useHabitListVisibility,useHabitRecentCompletions } from './use-habit-list-state'
import type { HabitView } from './habit-list/tree-helpers'
export { createParentPromptQueue, transitionParentPromptQueue } from '@orbit/shared/hooks'

const useSharedParentPromptQueue = createUseParentPromptQueue({ useState: useAccountScopedState, useEffect, useLayoutEffect, useRef, useResetOnAccountChange })

type ParentPromptQueueInputs = Pick<ParentPromptInputs, 'additionalHabitsById'> & Pick<ReturnType<typeof useHabitListQueries>, 'selectedDateStr' | 'getChildren' | 'habitsById' | 'habitsQuery' | 'profile' | 'skipHabit' | 'logHabit' | 'bulkLog' | 'bulkSkip' | 'showError' | 't' | 'selectedDate'> & Pick<ReturnType<typeof useHabitListVisibility>, 'visibility'> & { view: HabitView } & Pick<ReturnType<typeof useHabitRecentCompletions>, 'markRecentlyCompleted' | 'clearRecentlyCompleted'>

export function useParentPromptQueue(inputs: ParentPromptQueueInputs) {
  return useSharedParentPromptQueue({ ...inputs, updatedAt: inputs.habitsQuery.dataUpdatedAt,
    logHabit: inputs.logHabit.mutateAsync, skipHabit: inputs.skipHabit.mutateAsync,
    bulkLog: (items) => inputs.bulkLog.mutateAsync(items), bulkSkip: (items) => inputs.bulkSkip.mutateAsync(items),
    refetch: inputs.habitsQuery.refetch, toggleKey: (id) => id,
  })
}
