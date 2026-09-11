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
  ReportEventResponse,
  StreakInfo,
} from '@orbit/shared/types/gamification'
import {
  gamificationProfileSchema,
  reportEventResponseSchema,
  streakInfoSchema,
} from '@orbit/shared/types/gamification'
import {
  deriveGamificationProfileState,
  detectCrossedStreakMilestones,
  detectGamificationMilestones,
  deriveStreakFreezeState,
  extractBackendStatus,
} from '@orbit/shared/utils'
import { STREAK_CROSSING_MILESTONES } from '@orbit/shared/stores'
import { apiClient } from '@/lib/api-client'

export function useGamificationProfile(enabled = true) {
  const queryClient = useQueryClient()
  const previousLevelRef = useRef<number | null>(null)
  const previousStreakRef = useRef<number | null>(null)
  const previousAchievementIdsRef = useRef<Set<string>>(new Set())
  const [acknowledgedLevel, setAcknowledgedLevel] = useState<number | null>(null)

  const query = useQuery({
    queryKey: gamificationKeys.profile(),
    queryFn: () => apiClient<GamificationProfile>(API.gamification.profile, undefined, gamificationProfileSchema),
    staleTime: QUERY_STALE_TIMES.gamification,
    enabled,
  })

  const profile = query.data ?? null
  const {
    xpProgress,
    earnedAchievements,
    lockedAchievements,
    achievementsByCategory,
  } = useMemo(() => deriveGamificationProfileState(query.data ?? null), [query.data])

  const [milestones, setMilestones] = useState(() => ({
    ...detectGamificationMilestones(profile, null, new Set<string>(), acknowledgedLevel),
    crossedStreakMilestones: [] as number[],
  }))

  useEffect(() => {
    const currentProfile = query.data ?? null
    const next = detectGamificationMilestones(
      currentProfile,
      previousLevelRef.current,
      previousAchievementIdsRef.current,
      acknowledgedLevel,
    )
    const crossedStreakMilestones = detectCrossedStreakMilestones(
      previousStreakRef.current,
      currentProfile?.currentStreak ?? null,
      STREAK_CROSSING_MILESTONES,
    )
    previousLevelRef.current = currentProfile?.level ?? null
    previousStreakRef.current = currentProfile?.currentStreak ?? null
    previousAchievementIdsRef.current = next.currentEarnedAchievementIds
    setMilestones({ ...next, crossedStreakMilestones })
  }, [query.data, acknowledgedLevel])

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

export function useStreakInfo(timeZone: string | null, enabled = true) {
  return useQuery({
    queryKey: gamificationKeys.streak(timeZone),
    queryFn: () => apiClient<StreakInfo>(API.gamification.streak, undefined, streakInfoSchema),
    staleTime: QUERY_STALE_TIMES.gamification,
    enabled,
  })
}

export function useStreakFreeze(
  profile: { streakFreezesAvailable?: number; currentStreak?: number } | null | undefined,
  timeZone: string | null,
  enabled = true,
) {
  const streakQuery = useStreakInfo(timeZone, enabled)
  const streakInfo = streakQuery.data ?? null

  const state = useMemo(
    () => deriveStreakFreezeState(streakQuery.data ?? null, profile),
    [streakQuery.data, profile],
  )

  return {
    streakQuery,
    streakInfo,
    ...state,
  }
}

export function useRepairStreak(timeZone: string | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (dates: string[]) =>
      apiClient<StreakInfo>(
        API.gamification.repairStreakGap,
        { method: 'POST', body: JSON.stringify({ dates }) },
        streakInfoSchema,
      ),
    onSuccess: (streakInfo) => {
      queryClient.setQueryData(gamificationKeys.streak(timeZone), streakInfo)
      void queryClient.invalidateQueries({ queryKey: gamificationKeys.profile() })
    },
    onError: async (error) => {
      if (extractBackendStatus(error) !== 409) return
      await queryClient.fetchQuery({
        queryKey: gamificationKeys.streak(timeZone),
        queryFn: () => apiClient<StreakInfo>(API.gamification.streak, undefined, streakInfoSchema),
      })
      void queryClient.invalidateQueries({ queryKey: gamificationKeys.profile() })
    },
  })
}

/**
 * Reports a whitelisted client gamification event (a shared card or a viewed Wrapped) to the backend,
 * which idempotently grants the mapped achievement and refreshes the gamification profile.
 */
export function useReportEvent() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (eventKey: AchievementEventKey) =>
      apiClient<ReportEventResponse>(
        API.gamification.reportEvent,
        {
          method: 'POST',
          body: JSON.stringify({ eventKey }),
        },
        reportEventResponseSchema,
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: gamificationKeys.all })
    },
  })
}
