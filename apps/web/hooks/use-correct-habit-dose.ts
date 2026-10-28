'use client'

import { useQueryClient } from '@tanstack/react-query'
import { habitKeys } from '@orbit/shared/query'
import { correctHabitDose } from '@/app/actions/repeat-reminders'
import { bindServerAction } from '@/lib/client-action'
import { useAccountScopedMutation } from './use-account-scoped-mutation'

const correctDose = bindServerAction(correctHabitDose)

export function useCorrectHabitDose(habitId: string) {
  const queryClient = useQueryClient()
  return useAccountScopedMutation({
    mutationFn: ({ logId, takenAtUtc }: { logId: string; takenAtUtc: string }, intendedAccountId) => correctDose(habitId, logId, takenAtUtc, intendedAccountId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: habitKeys.all }),
  })
}
