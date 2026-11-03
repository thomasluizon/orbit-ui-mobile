import { type RestoreHabitInput } from './use-habit-mutation-shared'
import { useQueryClient } from '@tanstack/react-query'
import { useHabitMutation } from './use-habit-mutation'
import { restoreDeletedHabitQueries,habitKeys } from '@orbit/shared/query'
import { API } from '@orbit/shared/api'
import { extractBackendErrorCode } from '@orbit/shared'
import { type QueuedMarker,isQueuedResult } from '@/lib/offline-mutations'
import { performQueuedApiMutation } from '@/lib/queued-api-mutation'
import { finalizeHabitMutation } from '@/lib/habit-mutation-helpers'
import { useTranslation } from 'react-i18next'
import { useAppToast } from '@/hooks/use-app-toast'

export function useRestoreHabit() {
  const queryClient = useQueryClient()
  const { t } = useTranslation()
  const { showSuccess, showError } = useAppToast()

  return useHabitMutation<void | QueuedMarker, Error, RestoreHabitInput>({
    mutationFn: (input) =>
      performQueuedApiMutation<void>({
        type: 'restoreHabit',
        scope: 'habits',
        endpoint: API.habits.restore(typeof input === 'string' ? input : input.habitId),
        method: 'POST',
        payload: null,
        entityType: 'habit',
        targetEntityId: typeof input === 'string' ? input : input.habitId,
      }),

    onSuccess: (result, input) => {
      if (!isQueuedResult(result)) {
        restoreDeletedHabitQueries(queryClient, typeof input === 'string' ? input : input.habitId)
        void queryClient.invalidateQueries({ queryKey: habitKeys.all })
      }
      showSuccess(t('undo.restored'))
    },

    onError: (error, input) => {
      if (typeof input !== 'string' && extractBackendErrorCode(error) === 'HABIT_NOT_FOUND') return
      showError(t('undo.restoreFailed'))
    },

    onSettled: (data, error) =>
      finalizeHabitMutation(queryClient, data, error, {
        includeGoals: true,
        includeCount: true,
        includeProfile: true,
      }),
  })
}
