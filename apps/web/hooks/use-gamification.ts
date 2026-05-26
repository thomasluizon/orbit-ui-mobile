'use client'

import { useState, useMemo, useRef, useCallback, useEffect } from 'react'
import {
  useQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query'
import { gamificationKeys, profileKeys, QUERY_STALE_TIMES } from '@orbit/shared/query'
import { API } from '@orbit/shared/api'
import type {
  GamificationProfile,
  StreakInfo,
  StreakFreezeResponse,
} from '@orbit/shared/types/gamification'
import {
  deriveGamificationProfileState,
  detectGamificationMilestones,
  deriveStreakFreezeState,
} from '@orbit/shared/utils'
import { fetchJson } from '@/lib/api-fetch'
import { activateStreakFreeze as activateStreakFreezeAction } from '@/app/actions/gamification'

export function useGamificationProfile(enabled = true) {
  const queryClient = useQueryClient()
  const previousLevelRef = useRef<number | null>(null)
  const previousAchievementIdsRef = useRef<Set<string>>(new Set())
  const [acknowledgedLevel, setAcknowledgedLevel] = useState<number | null>(null)

  const query = useQuery({
    queryKey: gamificationKeys.profile(),
    queryFn: () => fetchJson<GamificationProfile>(API.gamification.profile),
    staleTime: QUERY_STALE_TIMES.gamification,
    refetchOnWindowFocus: true,
    enabled,
  })

  const profile = query.data ?? null
  const {
    xpProgress,
    earnedAchievements,
    lockedAchievements,
    achievementsByCategory,
  } = useMemo(() => deriveGamificationProfileState(profile), [profile])

  // Detect level-ups and new achievements by comparing against the previous
  // render's snapshot. Reading and writing refs is forbidden during render,
  // so we perform the comparison and ref update inside an effect and surface
  // the result via state.
  const [milestones, setMilestones] = useState<{
    leveledUp: boolean
    newLevel: number | null
    newAchievements: ReturnType<typeof detectGamificationMilestones>['newAchievements']
  }>({ leveledUp: false, newLevel: null, newAchievements: [] })

  useEffect(() => {
    const result = detectGamificationMilestones(
      profile,
      previousLevelRef.current,
      previousAchievementIdsRef.current,
      acknowledgedLevel,
    )
    previousLevelRef.current = profile?.level ?? null
    previousAchievementIdsRef.current = result.currentEarnedAchievementIds
    setMilestones({
      leveledUp: result.leveledUp,
      newLevel: result.newLevel,
      newAchievements: result.newAchievements,
    })
  }, [profile, acknowledgedLevel])

  const { leveledUp, newLevel, newAchievements } = milestones

  const clearLevelUp = useCallback(() => {
    setAcknowledgedLevel(profile?.level ?? null)
  }, [profile?.level])

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: gamificationKeys.all })
  }, [queryClient])

  return {
    ...query,
    profile,
    xpProgress,
    earnedAchievements,
    lockedAchievements,
    achievementsByCategory,
    leveledUp,
    newLevel,
    newAchievements,
    clearLevelUp,
    invalidate,
  }
}

export function useStreakInfo() {
  return useQuery({
    queryKey: gamificationKeys.streak(),
    queryFn: () => fetchJson<StreakInfo>(API.gamification.streak),
    staleTime: QUERY_STALE_TIMES.gamification,
  })
}

export function useActivateStreakFreeze() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (): Promise<StreakFreezeResponse> => activateStreakFreezeAction(),

    onSuccess: (data) => {
      queryClient.setQueryData<StreakInfo>(gamificationKeys.streak(), (old) => {
        if (!old) return old
        const nextAccumulated = Math.max(0, data.streakFreezesAccumulated ?? Math.max(0, old.streakFreezesAccumulated - 1))
        const nextUsedThisMonth = old.maxFreezesPerMonth - data.freezesRemainingThisMonth
        return {
          ...old,
          isFrozenToday: true,
          freezesAvailable: data.freezesRemainingThisMonth,
          freezesUsedThisMonth: nextUsedThisMonth,
          currentStreak: data.currentStreak,
          recentFreezeDates: [...old.recentFreezeDates, data.frozenDate],
          streakFreezesAccumulated: nextAccumulated,
          freezesAvailableToUse: Math.min(nextAccumulated, Math.max(0, old.maxFreezesPerMonth - nextUsedThisMonth)),
          canEarnMore: nextAccumulated < old.maxStreakFreezesAccumulated,
        }
      })
    },

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: gamificationKeys.streak() })
      queryClient.invalidateQueries({ queryKey: profileKeys.all })
    },
  })
}

export function useStreakFreeze(profile?: { streakFreezesAvailable?: number; currentStreak?: number } | null) {
  const streakQuery = useStreakInfo()
  const streakInfo = streakQuery.data ?? null

  const state = useMemo(
    () => deriveStreakFreezeState(streakInfo, profile),
    [streakInfo, profile],
  )

  return {
    streakQuery,
    streakInfo,
    ...state,
  }
}
