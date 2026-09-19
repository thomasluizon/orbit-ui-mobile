'use server'

import { API } from '@orbit/shared/api'
import type {
  AchievementEventKey,
  ReportEventResponse,
  StreakInfo,
} from '@orbit/shared/types/gamification'
import { reportEventResponseSchema, streakInfoSchema } from '@orbit/shared/types/gamification'
import { serverAuthMutate } from '@/lib/server-fetch'
import { wrapServerAction, type ServerActionResult } from './action-result'

export async function reportAchievementEvent(
  eventKey: AchievementEventKey,
  intendedAccountId: string | null,
): Promise<ServerActionResult<ReportEventResponse>> {
  return wrapServerAction(() => serverAuthMutate(
    API.gamification.reportEvent,
    {
      method: 'POST',
      body: JSON.stringify({ eventKey }),
    },
    intendedAccountId,
    reportEventResponseSchema,
  ))
}

export async function repairStreakGap(
  dates: string[],
  intendedAccountId: string | null,
): Promise<ServerActionResult<StreakInfo>> {
  return wrapServerAction(() =>
    serverAuthMutate(
      API.gamification.repairStreakGap,
      { method: 'POST', body: JSON.stringify({ dates }) },
      intendedAccountId,
      streakInfoSchema,
    ),
  )
}
