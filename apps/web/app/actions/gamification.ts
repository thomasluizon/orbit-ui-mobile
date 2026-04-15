'use server'

import { API } from '@orbit/shared/api'
import type { StreakFreezeResponse } from '@orbit/shared/types/gamification'
import { serverAuthFetch } from '@/lib/server-fetch'

export async function activateStreakFreeze(): Promise<StreakFreezeResponse> {
  return serverAuthFetch(API.gamification.streakFreeze, { method: 'POST' })
}
