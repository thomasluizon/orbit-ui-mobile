'use server'

import { API } from '@orbit/shared/api'
import type {
  AchievementEventKey,
  ReportEventResponse,
  StreakInfo,
} from '@orbit/shared/types/gamification'
import { reportEventResponseSchema, streakInfoSchema } from '@orbit/shared/types/gamification'
import { serverAuthFetch } from '@/lib/server-fetch'

export async function reportAchievementEvent(
  eventKey: AchievementEventKey,
): Promise<ReportEventResponse> {
  return serverAuthFetch(
    API.gamification.reportEvent,
    {
      method: 'POST',
      body: JSON.stringify({ eventKey }),
    },
    reportEventResponseSchema,
  )
}

export async function repairStreak(): Promise<StreakInfo> {
  return serverAuthFetch(
    API.gamification.repairStreak,
    { method: 'POST', body: '{}' },
    streakInfoSchema,
  )
}
