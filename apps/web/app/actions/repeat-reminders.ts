'use server'

import { API } from '@orbit/shared/api'
import { correctHabitDoseRequestSchema } from '@orbit/shared/types/habit'
import { serverAuthMutate } from '@/lib/server-fetch'
import { wrapServerAction } from './action-result'

export async function correctHabitDose(habitId: string, logId: string, takenAtUtc: string, intendedAccountId: string | null) {
  return wrapServerAction(() => serverAuthMutate<void>(API.habits.correctDose(habitId, logId), {
    method: 'PATCH', body: JSON.stringify(correctHabitDoseRequestSchema.parse({ takenAtUtc })),
  }, intendedAccountId))
}
