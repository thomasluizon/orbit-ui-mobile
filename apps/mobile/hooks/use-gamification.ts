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
  deriveGamificationProfileState,
  detectGamificationMilestones,
  deriveStreakFreezeState,
} from '@orbit/shared/utils'
import { apiClient } from '@/lib/api-client'
import { useUIStore } from '@/stores/ui-store'

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

export function useStreakInfo(enabled = true) {
  return useQuery({
    queryKey: gamificationKeys.streak(),
    queryFn: () => apiClient<StreakInfo>(API.gamification.streak),
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
    mutationFn: (eventKey: AchievementEventKey) =>
      apiClient<ReportEventResponse>(API.gamification.reportEvent, {
        method: 'POST',
        body: JSON.stringify({ eventKey }),
      }),
    onSuccess: (response) => {
      for (const achievement of response.granted) {
        enqueueCelebration('achievement', {
          achievementId: achievement.id,
          xpReward: achievement.xpReward,
        })
      }
      queryClient.invalidateQueries({ queryKey: gamificationKeys.all })
    },
  })
}
