import type { ReactNode } from 'react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { QueryClientProvider } from '@tanstack/react-query'
import { cleanup, renderHook, waitFor } from '@testing-library/react'
import type { GamificationProfile } from '@orbit/shared/types/gamification'
import { createMockAchievement, createMockGamificationProfile } from '@orbit/shared/__tests__/factories'
import { getQueryClient } from '@/lib/query-client'
import { useGamificationProfile } from '@/hooks/use-gamification'
import { holdAccount, replaceAccountWith } from '@/__tests__/support/account-change'

const mocks = vi.hoisted(() => ({ fetchJson: vi.fn() }))

vi.mock('@/lib/api-fetch', () => ({
  fetchJson: (...args: unknown[]) => mocks.fetchJson(...args),
}))

/**
 * The real query client, the one `startAccountScopedSession` clears. The milestone refs in
 * `useGamificationProfile` carry the previous account's level, streak and earned achievements, and
 * nothing resets them by name. They reset because the clear empties `query.data`, so the effect
 * runs once with a null profile and rewrites all three. That is the whole claim, and a mocked
 * `useQuery` would hide it.
 */
function wrapper({ children }: Readonly<{ children: ReactNode }>) {
  return <QueryClientProvider client={getQueryClient()}>{children}</QueryClientProvider>
}

function serve(profile: GamificationProfile): void {
  mocks.fetchJson.mockResolvedValue(profile)
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn())
  getQueryClient().clear()
  holdAccount('user-1')
})

afterEach(() => {
  cleanup()
  getQueryClient().clear()
  mocks.fetchJson.mockReset()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

it('reports no milestone for the next account against the numbers the previous one left', async () => {
  serve(createMockGamificationProfile({ level: 5, currentStreak: 3 }))
  const rendered = renderHook(() => useGamificationProfile(), { wrapper })
  await waitFor(() => expect(rendered.result.current.profile?.level).toBe(5))

  serve(createMockGamificationProfile({
    level: 8,
    currentStreak: 30,
    achievements: [
      createMockAchievement({ id: 'a-1', isEarned: true, earnedAtUtc: '2025-01-05T00:00:00Z' }),
      createMockAchievement({ id: 'a-9', name: 'Marathon', isEarned: true, earnedAtUtc: '2025-02-01T00:00:00Z' }),
    ],
    userAchievements: [
      { achievementId: 'a-1', earnedAtUtc: '2025-01-05T00:00:00Z' },
      { achievementId: 'a-9', earnedAtUtc: '2025-02-01T00:00:00Z' },
    ],
  }))
  await replaceAccountWith('user-2')
  await waitFor(() => expect(rendered.result.current.profile?.level).toBe(8))

  expect(rendered.result.current.leveledUp).toBe(false)
  expect(rendered.result.current.newLevel).toBeNull()
  expect(rendered.result.current.crossedStreakMilestones).toEqual([])
  expect(rendered.result.current.newAchievements).toEqual([])
})
