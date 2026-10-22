'use client'

import { useEffect, useMemo, useSyncExternalStore } from 'react'
import type { HabitRankingCard } from '@orbit/shared/types/chat'
import { createHabitRankingController } from '@orbit/shared/chat'
import { ApiClientError } from '@orbit/shared/utils'
import { checkRankingHabit, loadHabitRanking } from '@/app/actions/habit-ranking'
import { getAccountGeneration, subscribeToAccountGeneration } from '@/lib/session-epoch'
import { useChatNavigation } from './use-chat-navigation'

export function useHabitRanking(card: HabitRankingCard) {
  const navigate = useChatNavigation()
  const controller = useMemo(() => {
    const generation = getAccountGeneration()
    const isCurrent = () => generation === getAccountGeneration()
    return createHabitRankingController(card.ranking, {
      isCurrent,
      load: async (queryToken, cursor, refresh) => {
        const result = await loadHabitRanking(queryToken, cursor, refresh)
        if (!result.ok) throw new ApiClientError(result.status, result.error)
        return result.data
      },
      open: async habitId => {
        const result = await checkRankingHabit(habitId)
        if (!result.ok) throw new ApiClientError(result.status, result.error)
        if (isCurrent()) navigate(`/habits/${habitId}`)
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
