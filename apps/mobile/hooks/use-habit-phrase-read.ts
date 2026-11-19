import { useMutation } from '@tanstack/react-query'
import { API } from '@orbit/shared/api'
import {
  habitPhraseReadSchema,
  type HabitPhraseReadRequest,
  type HabitPhraseReadResponse,
} from '@orbit/shared/types/habit'
import { apiClient } from '@/lib/api-client'

/**
 * Asks the free phrase reader about the words the device left unread. The call spends no message, so
 * it invalidates no allowance query, and it never goes through the offline queue. The server answers a
 * cap, a kill switch or a provider failure with `read: false`, which this hook turns into `null`.
 */
export function useHabitPhraseRead() {
  return useMutation<HabitPhraseReadResponse | null, Error, HabitPhraseReadRequest>({
    mutationFn: async (data) => {
      const response = await apiClient<HabitPhraseReadResponse>(
        API.habits.readPhrase,
        { method: 'POST', body: JSON.stringify(data) },
        habitPhraseReadSchema,
      )
      return response.read ? response : null
    },
  })
}
