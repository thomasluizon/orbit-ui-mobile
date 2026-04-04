'use client'

import { useMemo, useRef, useCallback } from 'react'
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
  Achievement,
  StreakInfo,
  StreakFreezeResponse,
} from '@orbit/shared/types/gamification'
import { formatAPIDate } from '@orbit/shared/utils'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new Error(body?.error ?? body?.message ?? `Request failed with status ${res.status}`)
  }
  return res.json() as Promise<T>
}

// ---------------------------------------------------------------------------
// Gamification profile query
// ---------------------------------------------------------------------------

export function useGamificationProfile() {
  const queryClient = useQueryClient()
  const previousLevelRef = useRef<number | null>(null)
  const previousAchievementIdsRef = useRef<Set<string>>(new Set())

  const query = useQuery({
    queryKey: gamificationKeys.profile(),
    queryFn: () => fetchJson<GamificationProfile>(API.gamification.profile),
    staleTime: QUERY_STALE_TIMES.gamification,
    refetchOnWindowFocus: true,
  })

  const profile = query.data ?? null

  // Computed: XP progress percentage
  const xpProgress = useMemo(() => {
    if (!profile) return 0
    const { totalXp, xpForCurrentLevel, xpForNextLevel } = profile
    const range = xpForNextLevel - xpForCurrentLevel
    if (range <= 0) return 100
    const progress = totalXp - xpForCurrentLevel
    return Math.min(100, Math.max(0, Math.round((progress / range) * 100)))
  }, [profile])

  // Computed: earned achievements sorted by most recent
  const earnedAchievements = useMemo(() => {
    if (!profile) return []
    const earnedMap = new Map(
      profile.userAchievements.map((ua) => [ua.achievementId, ua.earnedAtUtc])
    )
    return profile.achievements
      .filter((a) => earnedMap.has(a.id))
      .map((a) => ({
        ...a,
        earnedAtUtc: earnedMap.get(a.id) ?? '',
      }))
      .sort((a, b) => b.earnedAtUtc.localeCompare(a.earnedAtUtc))
  }, [profile])

  // Computed: locked achievements
  const lockedAchievements = useMemo(() => {
    if (!profile) return []
    const earnedIds = new Set(profile.userAchievements.map((ua) => ua.achievementId))
    return profile.achievements.filter((a) => !earnedIds.has(a.id))
  }, [profile])

  // Computed: achievements grouped by category
  const achievementsByCategory = useMemo(() => {
    if (!profile) return []
    const categories = ['GettingStarted', 'Consistency', 'Volume', 'Goals', 'Perfection', 'Special']

    return categories
      .map((category) => ({
        key: category,
        items: profile.achievements.filter((a) => a.category === category),
      }))
      .filter((c) => c.items.length > 0)
  }, [profile])

  // Detect level-ups and new achievements
  const { leveledUp, newLevel, newAchievements } = useMemo(() => {
    if (!profile) return { leveledUp: false, newLevel: null as number | null, newAchievements: [] as Achievement[] }

    let didLevelUp = false
    let levelValue: number | null = null
    let freshAchievements: Achievement[] = []

    // Detect level-up
    if (previousLevelRef.current !== null && profile.level > previousLevelRef.current) {
      didLevelUp = true
      levelValue = profile.level
    }

    // Detect new achievements
    if (previousAchievementIdsRef.current.size > 0) {
      const currentEarnedIds = new Set(profile.userAchievements.map((ua) => ua.achievementId))
      freshAchievements = profile.achievements.filter(
        (a) => currentEarnedIds.has(a.id) && !previousAchievementIdsRef.current.has(a.id)
      )
    }

    // Update tracking refs
    previousLevelRef.current = profile.level
    previousAchievementIdsRef.current = new Set(profile.userAchievements.map((ua) => ua.achievementId))

    return { leveledUp: didLevelUp, newLevel: levelValue, newAchievements: freshAchievements }
  }, [profile])

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
      // Update streak info cache optimistically
      queryClient.setQueryData<StreakInfo>(gamificationKeys.streak(), (old) => {
        if (!old) return old
        return {
          ...old,
          isFrozenToday: true,
          freezesAvailable: data.freezesRemainingThisMonth,
          freezesUsedThisMonth: old.maxFreezesPerMonth - data.freezesRemainingThisMonth,
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

export function useStreakFreeze() {
  const streakQuery = useStreakInfo()
  const streakInfo = streakQuery.data ?? null

  const freezesAvailable = streakInfo?.freezesAvailable ?? 0
  const isFrozenToday = streakInfo?.isFrozenToday ?? false
  const hasCompletedToday = useMemo(() => {
    if (!streakInfo?.lastActiveDate) return false
    return streakInfo.lastActiveDate === formatAPIDate(new Date())
  }, [streakInfo?.lastActiveDate])

  const canFreeze = freezesAvailable > 0 && !isFrozenToday && !hasCompletedToday && (streakInfo?.currentStreak ?? 0) > 0

  return {
    streakQuery,
    streakInfo,
    freezesAvailable,
    isFrozenToday,
    hasCompletedToday,
    canFreeze,
  }
}
