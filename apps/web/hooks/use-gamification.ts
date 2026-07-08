'use client'

import { useState, useMemo, useRef, useCallback, useEffect } from 'react'
import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { gamificationKeys, QUERY_STALE_TIMES } from '@orbit/shared/query'
import { API } from '@orbit/shared/api'
import type {
  AchievementEventKey,
  GamificationProfile,
  StreakInfo,
} from '@orbit/shared/types/gamification'
import {
  deriveGamificationProfileState,
  detectCrossedStreakMilestones,
  detectGamificationMilestones,
  deriveStreakFreezeState,
} from '@orbit/shared/utils'
import { STREAK_CROSSING_MILESTONES } from '@orbit/shared/stores'
import { fetchJson } from '@/lib/api-fetch'
import { reportAchievementEvent } from '@/app/actions/gamification'
import { useUIStore } from '@/stores/ui-store'

export function useGamificationProfile(enabled = true) {
  const queryClient = useQueryClient()
  const previousLevelRef = useRef<number | null>(null)
  const previousStreakRef = useRef<number | null>(null)
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

  const [milestones, setMilestones] = useState<{
    leveledUp: boolean
    newLevel: number | null
    newAchievements: ReturnType<typeof detectGamificationMilestones>['newAchievements']
    crossedStreakMilestones: number[]
  }>({ leveledUp: false, newLevel: null, newAchievements: [], crossedStreakMilestones: [] })

  useEffect(() => {
    const result = detectGamificationMilestones(
      profile,
      previousLevelRef.current,
      previousAchievementIdsRef.current,
      acknowledgedLevel,
    )
    const crossedStreakMilestones = detectCrossedStreakMilestones(
      previousStreakRef.current,
      profile?.currentStreak ?? null,
      STREAK_CROSSING_MILESTONES,
    )
    previousLevelRef.current = profile?.level ?? null
    previousStreakRef.current = profile?.currentStreak ?? null
    previousAchievementIdsRef.current = result.currentEarnedAchievementIds
    setMilestones({
      leveledUp: result.leveledUp,
      newLevel: result.newLevel,
      newAchievements: result.newAchievements,
      crossedStreakMilestones,
    })
  }, [profile, acknowledgedLevel])

  const { leveledUp, newLevel, newAchievements, crossedStreakMilestones } = milestones

  const clearLevelUp = useCallback(() => {
    setAcknowledgedLevel(profile?.level ?? null)
  }, [profile?.level])

  const invalidate = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: gamificationKeys.all })
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
    crossedStreakMilestones,
    clearLevelUp,
    invalidate,
  }
}

export function useStreakInfo(enabled = true) {
  return useQuery({
    queryKey: gamificationKeys.streak(),
    queryFn: () => fetchJson<StreakInfo>(API.gamification.streak),
    staleTime: QUERY_STALE_TIMES.gamification,
    enabled,
  })
}

export function useStreakFreeze(profile?: { streakFreezesAvailable?: number; currentStreak?: number } | null, enabled = true) {
  const streakQuery = useStreakInfo(enabled)
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

/**
 * Reports a whitelisted client gamification event (a shared card or a viewed Wrapped) to the backend,
 * which idempotently grants the mapped achievement. On success it celebrates each granted achievement
 * through the shared celebration queue and refreshes the gamification profile.
 */
export function useReportEvent() {
  const queryClient = useQueryClient()
  const enqueueCelebration = useUIStore((s) => s.enqueueCelebration)

  return useMutation({
    mutationFn: (eventKey: AchievementEventKey) => reportAchievementEvent(eventKey),
    onSuccess: (response) => {
      for (const achievement of response.granted) {
        enqueueCelebration('achievement', {
          achievementId: achievement.id,
          xpReward: achievement.xpReward,
        })
      }
      void queryClient.invalidateQueries({ queryKey: gamificationKeys.all })
    },
  })
}
