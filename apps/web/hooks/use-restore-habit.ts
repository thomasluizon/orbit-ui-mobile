'use client'

import { useQueryClient } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { restoreDeletedHabitQueries,habitKeys } from '@orbit/shared/query'
import { getFriendlyErrorMessage } from '@orbit/shared/utils'
import { restoreHabit as restoreHabitAction } from '@/lib/actions/habits'
import { useAccountScopedMutation } from '@/hooks/use-account-scoped-mutation'
import { useAppToast } from '@/hooks/use-app-toast'
import { invalidateHabitDeleteQueries } from './use-habit-mutation-shared'

export function useRestoreHabit() {
  const queryClient = useQueryClient()
  const t = useTranslations()
  const { showSuccess, showError } = useAppToast()

  return useAccountScopedMutation({
    mutationFn: (habitId: string, intendedAccountId) =>
      restoreHabitAction(habitId, intendedAccountId),

    onSuccess: (_result, habitId) => {
      restoreDeletedHabitQueries(queryClient, habitId)
      void queryClient.invalidateQueries({ queryKey: habitKeys.all })
      invalidateHabitDeleteQueries(queryClient)
      showSuccess(t('undo.restored'))
    },

    onError: (error) => {
      showError(getFriendlyErrorMessage(error, t, 'undo.restoreFailed'))
    },
  })
}
