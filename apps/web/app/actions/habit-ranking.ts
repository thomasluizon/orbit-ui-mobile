'use server'

import { API } from '@orbit/shared/api'
import { habitRankingResponseSchema } from '@orbit/shared/types/chat'
import { serverAuthFetch } from '@/lib/server-fetch'
import { wrapServerAction } from './action-result'

export async function loadHabitRanking(queryToken: string, cursor: string | null, refresh: boolean) {
  const parameters = new URLSearchParams({ queryToken, refresh: String(refresh) })
  if (cursor) parameters.set('cursor', cursor)
  return wrapServerAction(() => serverAuthFetch(`${API.chat.habitRanking}?${parameters.toString()}`, undefined, habitRankingResponseSchema))
}

export async function checkRankingHabit(habitId: string) {
  return wrapServerAction(async () => {
    await serverAuthFetch(API.habits.get(habitId))
    return true
  })
}
