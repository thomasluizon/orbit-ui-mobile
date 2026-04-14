import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import {
  useGamificationProfile,
  useStreakInfo,
  useActivateStreakFreeze,
  useStreakFreeze,
} from '@/hooks/use-gamification'
import type { GamificationProfile, StreakInfo } from '@orbit/shared/types/gamification'

// Mock fetch
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

// Mock fetchJson (used by useGamificationProfile and useStreakInfo)
vi.mock('@/lib/api-fetch', () => ({
  fetchJson: vi.fn((url: string) =>
    fetch(url).then((res: Response) => {
      if (!res.ok) throw new Error('Fetch failed')
      return res.json()
    }),
  ),
}))

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children)
  }
}

function makeGamificationProfile(overrides: Partial<GamificationProfile> = {}): GamificationProfile {
  return {
    totalXp: 500,
    level: 5,
    levelTitle: 'Adept',
    xpForCurrentLevel: 400,
    xpForNextLevel: 600,
    xpToNextLevel: 100,
    achievementsEarned: 3,
    achievementsTotal: 20,
    achievements: [
      {
        id: 'a-1',
        name: 'First Steps',
        description: 'Create your first habit',
        category: 'GettingStarted',
        rarity: 'Common',
        xpReward: 50,
        iconKey: 'star',
        isEarned: true,
        earnedAtUtc: '2025-01-01T00:00:00Z',
      },
      {
        id: 'a-2',
        name: '7-Day Streak',
        description: 'Complete 7 days in a row',
        category: 'Consistency',
        rarity: 'Uncommon',
        xpReward: 100,
        iconKey: 'flame',
        isEarned: true,
        earnedAtUtc: '2025-01-10T00:00:00Z',
      },
      {
        id: 'a-3',
        name: 'Goal Setter',
        description: 'Create your first goal',
        category: 'Goals',
        rarity: 'Common',
        xpReward: 50,
        iconKey: 'target',
        isEarned: false,
        earnedAtUtc: null,
      },
    ],
    userAchievements: [
      { achievementId: 'a-1', earnedAtUtc: '2025-01-01T00:00:00Z' },
      { achievementId: 'a-2', earnedAtUtc: '2025-01-10T00:00:00Z' },
    ],
    currentStreak: 7,
    longestStreak: 14,
    lastActiveDate: '2025-01-15',
    ...overrides,
  }
}

function makeStreakInfo(overrides: Partial<StreakInfo> = {}): StreakInfo {
  return {
    currentStreak: 7,
    longestStreak: 14,
    lastActiveDate: '2025-01-15',
    freezesUsedThisMonth: 1,
    freezesAvailable: 2,
    maxFreezesPerMonth: 3,
    isFrozenToday: false,
    recentFreezeDates: ['2025-01-05'],
    ...overrides,
  }
}

describe('useGamificationProfile', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  it('fetches and returns gamification profile', async () => {
    const profile = makeGamificationProfile()
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(profile),
    })

    const { result } = renderHook(() => useGamificationProfile(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.profile).toBeDefined()
    expect(result.current.profile!.level).toBe(5)
  })

  it('computes xpProgress percentage', async () => {
    const profile = makeGamificationProfile({
      totalXp: 500,
      xpForCurrentLevel: 400,
      xpForNextLevel: 600,
    })
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(profile),
    })

    const { result } = renderHook(() => useGamificationProfile(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    // (500 - 400) / (600 - 400) * 100 = 50%
    expect(result.current.xpProgress).toBe(50)
  })

  it('returns 0 xpProgress when no profile', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ error: 'Fail' }),
    })

    const { result } = renderHook(() => useGamificationProfile(), {
      wrapper: createWrapper(),
    })

    // Before data loads, should be 0
    expect(result.current.xpProgress).toBe(0)
  })

  it('does not fetch the gamification profile when disabled', () => {
    const { result } = renderHook(() => useGamificationProfile(false), {
      wrapper: createWrapper(),
    })

    expect(mockFetch).not.toHaveBeenCalled()
    expect(result.current.profile).toBeNull()
  })

  it('returns 100 xpProgress when range is zero', async () => {
    const profile = makeGamificationProfile({
      totalXp: 1000,
      xpForCurrentLevel: 1000,
      xpForNextLevel: 1000,
    })
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(profile),
    })

    const { result } = renderHook(() => useGamificationProfile(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.xpProgress).toBe(100)
  })

  it('computes earned achievements sorted by most recent', async () => {
    const profile = makeGamificationProfile()
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(profile),
    })

    const { result } = renderHook(() => useGamificationProfile(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.earnedAchievements).toHaveLength(2)
    // Most recent first
    expect(result.current.earnedAchievements[0]!.id).toBe('a-2')
    expect(result.current.earnedAchievements[1]!.id).toBe('a-1')
  })

  it('computes locked achievements', async () => {
    const profile = makeGamificationProfile()
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(profile),
    })

    const { result } = renderHook(() => useGamificationProfile(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.lockedAchievements).toHaveLength(1)
    expect(result.current.lockedAchievements[0]!.id).toBe('a-3')
  })

  it('computes achievements by category', async () => {
    const profile = makeGamificationProfile()
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(profile),
    })

    const { result } = renderHook(() => useGamificationProfile(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    const categories = result.current.achievementsByCategory.map((c) => c.key)
    expect(categories).toContain('GettingStarted')
    expect(categories).toContain('Consistency')
    expect(categories).toContain('Goals')
    // Empty categories should not appear
    expect(categories).not.toContain('Volume')
  })
})

describe('useStreakInfo', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  it('fetches streak info', async () => {
    const streakInfo = makeStreakInfo()
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(streakInfo),
    })

    const { result } = renderHook(() => useStreakInfo(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data!.currentStreak).toBe(7)
    expect(result.current.data!.freezesAvailable).toBe(2)
    expect(result.current.data!.isFrozenToday).toBe(false)
  })
})

describe('useStreakFreeze', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  it('derives freeze state from streak info when available', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(makeStreakInfo({ lastActiveDate: '2025-01-14' })),
    })

    const { result } = renderHook(() => useStreakFreeze(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.streakQuery.isSuccess).toBe(true))
    expect(result.current.freezesAvailable).toBe(2)
    expect(result.current.currentStreak).toBe(7)
    expect(result.current.canFreeze).toBe(true)
  })

  it('falls back to the provided profile when streak info has not loaded', () => {
    mockFetch.mockReturnValue(new Promise(() => {}))

    const { result } = renderHook(
      () => useStreakFreeze({ streakFreezesAvailable: 1, currentStreak: 4 }),
      { wrapper: createWrapper() },
    )

    expect(result.current.freezesAvailable).toBe(1)
    expect(result.current.currentStreak).toBe(4)
    expect(result.current.canFreeze).toBe(true)
  })
})

describe('useActivateStreakFreeze', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  it('posts to streak freeze endpoint', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          freezesRemainingThisMonth: 1,
          frozenDate: '2025-01-15',
          currentStreak: 7,
        }),
    })

    const { result } = renderHook(() => useActivateStreakFreeze(), {
      wrapper: createWrapper(),
    })

    await act(async () => {
      await result.current.mutateAsync()
    })

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('streak/freeze'),
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('throws on error response', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 400,
      json: () => Promise.resolve({ error: 'No freezes available' }),
    })

    const { result } = renderHook(() => useActivateStreakFreeze(), {
      wrapper: createWrapper(),
    })

    await expect(
      act(async () => {
        await result.current.mutateAsync()
      }),
    ).rejects.toThrow('No freezes available')
  })
})
