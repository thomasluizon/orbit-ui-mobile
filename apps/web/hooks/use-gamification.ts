'use client'

import { useState, useMemo, useRef, useCallback } from 'react'
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

  // Detect level-ups and new achievements
  const { leveledUp, newLevel, newAchievements } = useMemo(() => {
    const nextMilestones = detectGamificationMilestones(
      profile,
      previousLevelRef.current,
      previousAchievementIdsRef.current,
      acknowledgedLevel,
    )

    previousLevelRef.current = profile?.level ?? null
    previousAchievementIdsRef.current = nextMilestones.currentEarnedAchievementIds

    return nextMilestones
  }, [profile, acknowledgedLevel])

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
    queryFn: () => fetchJson<StreakInfo>(API.gamification.streak),
    staleTime: QUERY_STALE_TIMES.gamification,
  })
}

// ---------------------------------------------------------------------------
// Streak freeze mutation
// ---------------------------------------------------------------------------

export function useActivateStreakFreeze() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (): Promise<StreakFreezeResponse> => {
      const res = await fetch(API.gamification.streakFreeze, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        throw new Error(body?.error ?? body?.message ?? `Request failed with status ${res.status}`)
      }
      return res.json()
    },

    onSuccess: (data) => {
      // Update streak info cache with the server-confirmed balance + usage values.
      queryClient.setQueryData<StreakInfo>(gamificationKeys.streak(), (old) => {
        if (!old) return old
        const monthlyRemaining = Math.max(0, data.maxFreezesPerMonth - data.freezesUsedThisMonth)
        return {
          ...old,
          isFrozenToday: true,
          streakFreezeBalance: data.freezesRemainingBalance,
          freezesAvailable: Math.min(data.freezesRemainingBalance, monthlyRemaining),
          freezesUsedThisMonth: data.freezesUsedThisMonth,
          maxFreezesPerMonth: data.maxFreezesPerMonth,
          maxFreezesHeld: data.maxFreezesHeld,
          isAtHeldCap: data.freezesRemainingBalance >= data.maxFreezesHeld,
          currentStreak: data.currentStreak,
          recentFreezeDates: [...old.recentFreezeDates, data.frozenDate],
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

  const derived = useMemo(
    () => deriveStreakFreezeState(streakInfo, profile),
    [streakInfo, profile],
  )

  return {
    streakQuery,
    streakInfo,
    ...derived,
  }
}
