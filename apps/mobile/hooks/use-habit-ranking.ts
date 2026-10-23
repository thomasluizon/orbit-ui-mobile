import { useEffect, useMemo, useSyncExternalStore } from 'react'
import { API } from '@orbit/shared/api'
import { habitRankingResponseSchema, type HabitRankingCard } from '@orbit/shared/types/chat'
import { createHabitRankingController } from '@orbit/shared/chat'
import { apiClient } from '@/lib/api-client'
import { getAccountGeneration, subscribeToAccountGeneration } from '@/lib/session-epoch'
import { useChatNavigation } from './use-chat-navigation'

export function useHabitRanking(card: HabitRankingCard) {
  const navigate = useChatNavigation()
  const controller = useMemo(() => {
    const generation = getAccountGeneration()
    const isCurrent = () => generation === getAccountGeneration()
    return createHabitRankingController(card.ranking, {
      accountGeneration: generation,
      isCurrent,
      load: async (queryToken, cursor, refresh) => {
        const parameters = new URLSearchParams({ queryToken, refresh: String(refresh) })
        if (cursor) parameters.set('cursor', cursor)
        return apiClient(`${API.chat.habitRanking}?${parameters.toString()}`, { silent: true }, habitRankingResponseSchema)
      },
      open: async habitId => {
        await apiClient(API.habits.get(habitId), { silent: true })
        if (isCurrent()) navigate({ pathname: '/habits/[id]', params: { id: habitId } })
      },
    })
  }, [card, navigate])
  useEffect(() => {
    const unsubscribe = subscribeToAccountGeneration(controller.invalidate)
    return () => { unsubscribe(); controller.cancel() }
  }, [controller])
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot)
  return { ...state, showMore: controller.showMore, refresh: controller.refresh, open: controller.open }
}
