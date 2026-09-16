'use server'

import { API } from '@orbit/shared/api'
import type {
  AchievementEventKey,
  ReportEventResponse,
} from '@orbit/shared/types/gamification'
import { reportEventResponseSchema } from '@orbit/shared/types/gamification'
import { serverAuthFetch } from '@/lib/server-fetch'
import { wrapServerAction, type ServerActionResult } from './action-result'

export async function reportAchievementEvent(
  eventKey: AchievementEventKey,
): Promise<ServerActionResult<ReportEventResponse>> {
  return wrapServerAction(() => serverAuthFetch(
    API.gamification.reportEvent,
    {
      method: 'POST',
      body: JSON.stringify({ eventKey }),
    },
    reportEventResponseSchema,
  ))
}
