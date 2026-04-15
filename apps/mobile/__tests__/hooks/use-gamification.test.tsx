import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
const TestRenderer = require('react-test-renderer')
import { API } from '@orbit/shared/api'
import { createMockGamificationProfile } from '@orbit/shared/__tests__/factories'
import { gamificationKeys, profileKeys } from '@orbit/shared/query'
import type { StreakInfo, StreakFreezeResponse } from '@orbit/shared/types/gamification'

const mocks = vi.hoisted(() => {
  const state = {
    gamificationProfile: null as ReturnType<typeof createMockGamificationProfile> | null,
    streakInfo: {
      currentStreak: 7,
      longestStreak: 14,
      lastActiveDate: '2025-01-15',
      freezesUsedThisMonth: 1,
      freezesAvailable: 2,
      maxFreezesPerMonth: 3,
      isFrozenToday: false,
      recentFreezeDates: ['2025-01-05'],
    } as StreakInfo,
  }

  const queryClient = {
    invalidateQueries: vi.fn(async () => {}),
    setQueryData: vi.fn((queryKey: readonly unknown[], updater: StreakInfo | ((old: StreakInfo | undefined) => StreakInfo | undefined)) => {
      if (JSON.stringify(queryKey) !== JSON.stringify(gamificationKeys.streak())) {
        return
      }

      state.streakInfo = typeof updater === 'function'
        ? (updater(state.streakInfo) ?? state.streakInfo)
        : updater
    }),
  }

  return {
    state,
    queryClient,
    useQuery: vi.fn(({ queryKey }: { queryKey: readonly unknown[] }) => {
      const keyText = JSON.stringify(queryKey)
      if (keyText.includes('streak')) {
        return {
          data: state.streakInfo,
          isLoading: false,
          isError: false,
          error: null,
        }
      }

      return {
        data: state.gamificationProfile,
        isLoading: false,
        isError: false,
        error: null,
      }
    }),
    useQueryClient: vi.fn(() => queryClient),
    useMutation: vi.fn((options: {
      mutationFn: () => Promise<StreakFreezeResponse>
      onSuccess?: (data: StreakFreezeResponse) => void
      onSettled?: () => void
    }) => ({
      mutateAsync: async () => {
        const data = await options.mutationFn()
        options.onSuccess?.(data)
        options.onSettled?.()
        return data
      },
    })),
    apiClient: vi.fn(),
  }
})

vi.mock('@tanstack/react-query', () => ({
  useQuery: mocks.useQuery,
  useQueryClient: mocks.useQueryClient,
  useMutation: mocks.useMutation,
}))

vi.mock('@/lib/api-client', () => ({
  apiClient: mocks.apiClient,
}))

import {
  useActivateStreakFreeze,
  useGamificationProfile,
  useStreakFreeze,
  useStreakInfo,
} from '@/hooks/use-gamification'

async function renderHookValue<T>(hook: () => T): Promise<{
  readonly value: T
  rerender: () => Promise<void>
}> {
  let latestValue: T | null = null

  function Harness() {
    latestValue = hook()
    return null
  }

  let root: { update: (node: React.ReactElement) => void } | null = null
  await TestRenderer.act(async () => {
    root = TestRenderer.create(<Harness />)
    await Promise.resolve()
  })

  if (!latestValue) {
    throw new Error('hook did not render')
  }

  return {
    get value() {
      if (!latestValue) {
        throw new Error('hook did not render')
      }
      return latestValue
    },
    rerender: async () => {
      if (!root) {
        throw new Error('hook did not render')
      }
      const renderer = root
      await TestRenderer.act(async () => {
        renderer.update(<Harness />)
        await Promise.resolve()
      })
      if (!latestValue) {
        throw new Error('hook did not render')
      }
    },
  }
}

describe('mobile useGamificationProfile', () => {
  beforeEach(() => {
    mocks.state.gamificationProfile = createMockGamificationProfile()
    mocks.queryClient.invalidateQueries.mockClear()
    mocks.queryClient.setQueryData.mockClear()
    mocks.useQuery.mockClear()
    mocks.useQueryClient.mockClear()
    mocks.useMutation.mockClear()
    mocks.apiClient.mockClear()
  })

  it('returns gamification summary data and detects level-up changes', async () => {
    const profile = createMockGamificationProfile()
    mocks.state.gamificationProfile = profile

    const hook = await renderHookValue(() => useGamificationProfile())

    expect(hook.value.profile?.level).toBe(3)
    expect(hook.value.xpProgress).toBeGreaterThan(0)
    expect(hook.value.earnedAchievements).toHaveLength(2)
    expect(hook.value.lockedAchievements).toHaveLength(0)
    expect(hook.value.leveledUp).toBe(false)

    mocks.state.gamificationProfile = createMockGamificationProfile({
      level: 4,
      achievementsEarned: 3,
      achievements: [
        ...profile.achievements,
        {
          id: 'a-3',
          name: 'Goal Setter',
          description: 'Create your first goal',
          category: 'Goals',
          rarity: 'Common',
          xpReward: 50,
          iconKey: 'target',
          isEarned: true,
          earnedAtUtc: '2025-01-20T00:00:00Z',
        },
      ],
      userAchievements: [
        ...profile.userAchievements,
        { achievementId: 'a-3', earnedAtUtc: '2025-01-20T00:00:00Z' },
      ],
    })

    await hook.rerender()

    expect(hook.value.leveledUp).toBe(true)
    expect(hook.value.newLevel).toBe(4)
    expect(hook.value.newAchievements.map((achievement) => achievement.id)).toContain('a-3')
  })

  it('passes enabled false to the query when disabled', async () => {
    await renderHookValue(() => useGamificationProfile(false))

    expect(mocks.useQuery).toHaveBeenCalledWith(
      expect.objectContaining({ enabled: false }),
    )
  })
})

describe('mobile useStreakInfo and streak freeze', () => {
  beforeEach(() => {
    mocks.state.streakInfo = {
      currentStreak: 7,
      longestStreak: 14,
      lastActiveDate: '2025-01-15',
      freezesUsedThisMonth: 1,
      freezesAvailable: 2,
      maxFreezesPerMonth: 3,
      isFrozenToday: false,
      recentFreezeDates: ['2025-01-05'],
      streakFreezesAccumulated: 2,
      maxStreakFreezesAccumulated: 3,
      daysUntilNextFreeze: 0,
      freezesAvailableToUse: 2,
      canEarnMore: true,
    }
    mocks.queryClient.invalidateQueries.mockClear()
    mocks.queryClient.setQueryData.mockClear()
    mocks.useQuery.mockClear()
    mocks.useQueryClient.mockClear()
    mocks.useMutation.mockClear()
    mocks.apiClient.mockClear()
  })

  it('returns streak data from the cache', async () => {
    const hook = await renderHookValue(() => useStreakInfo())

    expect(hook.value.data?.currentStreak).toBe(7)
    expect(hook.value.data?.freezesAvailable).toBe(2)
  })

  it('derives freeze state from provided profile data while streak loads', async () => {
    const hook = await renderHookValue(() =>
      useStreakFreeze({ streakFreezesAvailable: 1, currentStreak: 4 }),
    )

    expect(hook.value.freezesAvailable).toBe(2)
    expect(hook.value.currentStreak).toBe(7)
    expect(hook.value.canFreeze).toBe(true)
  })

  it('syncs the streak cache after activating a freeze', async () => {
    mocks.apiClient.mockResolvedValue({
      freezesRemainingThisMonth: 1,
      frozenDate: '2025-01-15',
      currentStreak: 7,
    })

    const hook = await renderHookValue(() => useActivateStreakFreeze())

    await hook.value.mutateAsync()

    expect(mocks.apiClient).toHaveBeenCalledWith(
      API.gamification.streakFreeze,
      expect.objectContaining({ method: 'POST' }),
    )
    expect(mocks.queryClient.setQueryData).toHaveBeenCalledWith(
      gamificationKeys.streak(),
      expect.any(Function),
    )
    expect(mocks.queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: gamificationKeys.streak(),
    })
    expect(mocks.queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: profileKeys.all,
    })
  })
})
