import { useQueryClient } from '@tanstack/react-query'
import { useHabitMutation } from './use-habit-mutation'
import { invalidateBulkMoveParentQueries } from '@orbit/shared/query'
import { API } from '@orbit/shared/api'
import type { BulkMoveHabitParentRequest,BulkMoveHabitParentResult } from '@orbit/shared/types/habit'
import { performQueuedApiMutation } from '@/lib/queued-api-mutation'

export function useBulkMoveHabitParent() {
  const queryClient = useQueryClient()
  return useHabitMutation({
    mutationFn: (input: BulkMoveHabitParentRequest) =>
      performQueuedApiMutation<BulkMoveHabitParentResult, never>({
        type: 'bulkMoveHabitParent',
        scope: 'habits',
        endpoint: API.habits.bulkParent,
        method: 'POST',
        payload: input,
        entityType: 'habit',
        dependsOn: [...input.habitIds, ...(input.parentId ? [input.parentId] : [])],
      }),
    onSuccess: () => invalidateBulkMoveParentQueries(queryClient),
  })
}
