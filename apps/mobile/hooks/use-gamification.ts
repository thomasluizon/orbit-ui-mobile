import { useState, useMemo, useRef, useCallback, useEffect } from 'react'
import {
  useQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query'
import { gamificationKeys, profileKeys } from '@orbit/shared/query'
import { QUERY_STALE_TIMES } from '@orbit/shared/query'
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
import { apiClient } from '@/lib/api-client'

// ---------------------------------------------------------------------------
// Gamification profile query
// ---------------------------------------------------------------------------

export function useGamificationProfile(enabled = true) {
  const queryClient = useQueryClient()
  const previousLevelRef = useRef<number | null>(null)
  const previousAchievementIdsRef = useRef<Set<string>>(new Set())
  const [acknowledgedLevel, setAcknowledgedLevel] = useState<number | null>(null)

  const query = useQuery({
    queryKey: gamificationKeys.profile(),
    queryFn: () => apiClient<GamificationProfile>(API.gamification.profile),
    staleTime: QUERY_STALE_TIMES.gamification,
    enabled,
  })

  const profile = query.data ?? null
  const {
    xpProgress,
    earnedAchievements,
    lockedAchievements,
    achievementsByCategory,
  } = useMemo(() => deriveGamificationProfileState(profile), [profile])

  // Detect level-ups + new achievements. Refs hold the previous-render snapshot
  // and are mutated inside an effect — React 19 forbids reading or writing refs
  // during render. We keep the milestone output in state so consumers see a
  // stable value across renders until the next effect tick advances it.
  const [milestones, setMilestones] = useState(() =>
    detectGamificationMilestones(profile, null, new Set<string>(), acknowledgedLevel),
  )

  useEffect(() => {
    const next = detectGamificationMilestones(
      profile,
      previousLevelRef.current,
      previousAchievementIdsRef.current,
      acknowledgedLevel,
    )
    previousLevelRef.current = profile?.level ?? null
    previousAchievementIdsRef.current = next.currentEarnedAchievementIds
    setMilestones(next)
  }, [profile, acknowledgedLevel])

  const { leveledUp, newLevel, newAchievements } = milestones

  // Clear level-up after overlay dismisses
  const clearLevelUp = useCallback(() => {
    setAcknowledgedLevel(profile?.level ?? null)
  }, [profile?.level])

  // Invalidation helper
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

// ---------------------------------------------------------------------------
// Streak info query
// ---------------------------------------------------------------------------

export function useStreakInfo() {
  return useQuery({
    queryKey: gamificationKeys.streak(),
    queryFn: () => apiClient<StreakInfo>(API.gamification.streak),
    staleTime: QUERY_STALE_TIMES.gamification,
  })
}

// ---------------------------------------------------------------------------
// Streak freeze mutation
// ---------------------------------------------------------------------------

export function useActivateStreakFreeze() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: () =>
      apiClient<StreakFreezeResponse>(API.gamification.streakFreeze, {
        method: 'POST',
      }),

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

// ---------------------------------------------------------------------------
// Derived selectors
// ---------------------------------------------------------------------------

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
