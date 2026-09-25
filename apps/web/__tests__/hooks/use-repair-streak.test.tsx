import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))
import { act, renderHook, waitFor } from '@testing-library/react'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { useRepairStreak } from '@/hooks/use-gamification'
import { useAuthStore } from '@/stores/auth-store'
import { holdAccount, replaceAccountWith } from '@/__tests__/support/account-change'
import { gamificationKeys } from '@orbit/shared/query'
import { createApiClientError } from '@orbit/shared'

const PINNED_TEST_TIME = new Date('2026-09-12T09:00:00.000Z')
vi.setSystemTime(PINNED_TEST_TIME)
beforeEach(() => vi.setSystemTime(PINNED_TEST_TIME))
afterEach(() => vi.useRealTimers())

const repairStreakGapAction = vi.fn()

vi.mock('@/app/actions/gamification', () => ({
  repairStreakGap: (dates: string[]) => repairStreakGapAction(dates),
  reportAchievementEvent: vi.fn(),
}))

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

function createWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children)
  }
}

function createQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
}

describe('useRepairStreak', () => {
  beforeEach(() => {
    repairStreakGapAction.mockReset()
    mockFetch.mockReset()
    useAuthStore.getState().setAuth({ userId: 'user-1', name: 'Thomas', email: 'thomas@example.com' })
    useAuthStore.setState({
      isAuthenticated: true,
      user: { userId: 'user-1', name: 'Thomas', email: 'thomas@example.com' },
      expiresAt: Date.now() + 60_000,
      sessionRefreshFailed: false,
    })
  })

  it('signs the user out when the repair reports a definitive session refresh failure', async () => {
    repairStreakGapAction.mockResolvedValue({
      ok: false,
      error: 'Unauthorized',
      status: 401,
      sessionRefreshFailed: true,
    })
    mockFetch.mockResolvedValue(Response.json(
      { expiresAt: null, refreshFailed: true },
      { status: 401 },
    ))

    const { result } = renderHook(() => useRepairStreak('America/Sao_Paulo'), {
      wrapper: createWrapper(createQueryClient()),
    })

    result.current.mutate(['2026-09-14'])

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error).toMatchObject({ message: 'Unauthorized' })
    await waitFor(() => expect(useAuthStore.getState()).toMatchObject({
      isAuthenticated: false,
      sessionRefreshFailed: true,
    }))
    expect(mockFetch).toHaveBeenCalledWith('/api/auth/session')
  })

  it('clears a stale refresh failure and caches the streak when the repair succeeds', async () => {
    const streakInfo = {
      currentStreak: 4,
      longestStreak: 9,
      lastCompletedDate: '2026-09-15',
      freezesRemaining: 1,
      repairableDates: [],
    }
    repairStreakGapAction.mockResolvedValue({ ok: true, data: streakInfo })
    useAuthStore.setState({ sessionRefreshFailed: true })
    const expiresAt = Date.now() + 3_600_000
    mockFetch.mockResolvedValue(Response.json({ expiresAt, refreshFailed: false }))

    const queryClient = createQueryClient()
    const { result } = renderHook(() => useRepairStreak('America/Sao_Paulo'), {
      wrapper: createWrapper(queryClient),
    })

    result.current.mutate(['2026-09-14'])

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(repairStreakGapAction).toHaveBeenCalledWith(['2026-09-14'])
    await waitFor(() => expect(useAuthStore.getState()).toMatchObject({
      isAuthenticated: true,
      sessionRefreshFailed: false,
    }))
  })

  it('does not cache an old repair result under the next account', async () => {
    holdAccount('user-1')
    let finishRepair!: (value: object) => void
    repairStreakGapAction.mockImplementationOnce(() => new Promise((resolve) => { finishRepair = resolve }))
    const queryClient = createQueryClient()
    const { result } = renderHook(() => useRepairStreak('America/Sao_Paulo'), {
      wrapper: createWrapper(queryClient),
    })
    act(() => { result.current.mutate(['2026-09-14']) })
    await waitFor(() => expect(repairStreakGapAction).toHaveBeenCalledOnce())

    await replaceAccountWith('user-2')
    await act(async () => { finishRepair({ ok: true, data: { currentStreak: 7 } }) })

    expect(queryClient.getQueryData(gamificationKeys.streak('America/Sao_Paulo'))).toBeUndefined()
  })

  it('does not refetch an old repair conflict under the next account', async () => {
    holdAccount('user-1')
    let failRepair!: (error: Error) => void
    repairStreakGapAction.mockImplementationOnce(() => new Promise((_resolve, reject) => { failRepair = reject }))
    const queryClient = createQueryClient()
    const { result } = renderHook(() => useRepairStreak('America/Sao_Paulo'), {
      wrapper: createWrapper(queryClient),
    })
    act(() => { result.current.mutate(['2026-09-14']) })
    await waitFor(() => expect(repairStreakGapAction).toHaveBeenCalledOnce())

    await replaceAccountWith('user-2')
    await act(async () => { failRepair(createApiClientError(409, null, 'Conflict')) })

    expect(mockFetch).toHaveBeenCalledTimes(1)
    expect(mockFetch).toHaveBeenCalledWith('/api/auth/session')
    expect(queryClient.getQueryData(gamificationKeys.streak('America/Sao_Paulo'))).toBeUndefined()
  })
})
