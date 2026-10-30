import { useMutation, useQueryClient } from '@tanstack/react-query'
import { API } from '@orbit/shared/api'
import { habitKeys } from '@orbit/shared/query'
import { correctHabitDoseRequestSchema } from '@orbit/shared/types/habit'
import { apiClient } from '@/lib/api-client'
import { getSessionEpoch } from '@/lib/session-epoch'

export function useCorrectHabitDose(habitId: string) {
  const queryClient = useQueryClient()
  const mutation = useMutation({
    mutationFn: ({ logId, takenAtUtc, epoch }: { logId: string; takenAtUtc: string; epoch: number }) => apiClient<void>(API.habits.correctDose(habitId, logId), {
      method: 'PATCH', body: JSON.stringify(correctHabitDoseRequestSchema.parse({ takenAtUtc })), isCurrent: () => epoch === getSessionEpoch(),
    }),
    onSuccess: (_result, { epoch }) => epoch === getSessionEpoch() ? queryClient.invalidateQueries({ queryKey: habitKeys.all }) : undefined,
  })
  return { ...mutation, mutateAsync: (input: { logId: string; takenAtUtc: string }) => mutation.mutateAsync({ ...input, epoch: getSessionEpoch() }) }
}
