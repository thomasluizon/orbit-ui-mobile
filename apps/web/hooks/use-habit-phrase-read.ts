'use client'

import {
  habitPhraseReadSchema,
  type HabitPhraseReadRequest,
  type HabitPhraseReadResponse,
} from '@orbit/shared/types/habit'
import { readHabitPhrase } from '@/lib/actions/habits'
import { useAccountScopedMutation } from '@/hooks/use-account-scoped-mutation'

/**
 * Asks the free phrase reader about the words the device left unread. The call spends no message, so
 * it invalidates no allowance query. The server answers a cap, a kill switch or a provider failure with
 * `read: false`, which this hook turns into `null`.
 */
export function useHabitPhraseRead() {
  return useAccountScopedMutation<HabitPhraseReadResponse | null, Error, HabitPhraseReadRequest>({
    mutationFn: async (data, intendedAccountId) => {
      const response = habitPhraseReadSchema.parse(await readHabitPhrase(data, intendedAccountId))
      return response.read ? response : null
    },
  })
}
