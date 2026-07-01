import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import {
  useChallenges,
  useChallengeDetail,
  useCreateChallenge,
  useJoinChallenge,
  useLeaveChallenge,
  useSetChallengeHabits,
} from '@/hooks/use-challenges'
import { getChallengeErrorKey } from '@/app/(app)/social/challenges/_components/challenge-errors'
import { API } from '@orbit/shared/api'
import { createApiClientError } from '@orbit/shared/utils'
import {
  createMockChallengeDetail,
  createMockChallengeListItem,
} from '@orbit/shared/__tests__/factories'

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

const actionMocks = vi.hoisted(() => ({
  createChallenge: vi.fn(),
  joinChallenge: vi.fn(),
  leaveChallenge: vi.fn(),
  setChallengeHabits: vi.fn(),
}))

vi.mock('@/app/actions/challenges', () => ({
  createChallenge: actionMocks.createChallenge,
  joinChallenge: actionMocks.joinChallenge,
  leaveChallenge: actionMocks.leaveChallenge,
  setChallengeHabits: actionMocks.setChallengeHabits,
}))

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children)
  }
}

beforeEach(() => {
  mockFetch.mockReset()
  actionMocks.createChallenge.mockReset()
  actionMocks.joinChallenge.mockReset()
  actionMocks.leaveChallenge.mockReset()
  actionMocks.setChallengeHabits.mockReset()
})

describe('useChallenges', () => {
  it('fetches and parses the caller challenge list', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([createMockChallengeListItem({ id: 'c-1' })]),
    })

    const { result } = renderHook(() => useChallenges(), { wrapper: createWrapper() })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(mockFetch).toHaveBeenCalledWith(API.challenges.list)
    expect(result.current.data).toHaveLength(1)
    expect(result.current.data?.[0]?.id).toBe('c-1')
  })

  it('does not fetch when disabled (opted-out user)', () => {
    const { result } = renderHook(() => useChallenges({ enabled: false }), {
      wrapper: createWrapper(),
    })

    expect(result.current.fetchStatus).toBe('idle')
    expect(mockFetch).not.toHaveBeenCalled()
  })
})

describe('useChallengeDetail', () => {
  it('is idle without an id', () => {
    const { result } = renderHook(() => useChallengeDetail(null), { wrapper: createWrapper() })

    expect(result.current.fetchStatus).toBe('idle')
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('fetches the detail for an id', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(createMockChallengeDetail({ id: 'c-9' })),
    })

    const { result } = renderHook(() => useChallengeDetail('c-9'), { wrapper: createWrapper() })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(mockFetch).toHaveBeenCalledWith(API.challenges.detail('c-9'))
    expect(result.current.data?.id).toBe('c-9')
  })
})

describe('challenge mutations', () => {
  it('unwraps the created id from the action envelope', async () => {
    actionMocks.createChallenge.mockResolvedValue({ ok: true, data: { id: 'new-1' } })

    const { result } = renderHook(() => useCreateChallenge(), { wrapper: createWrapper() })
    const created = await result.current.mutateAsync({
      type: 'CoopGoal',
      title: 'Read',
      targetCount: 30,
      periodStartUtc: '2026-03-01',
      periodEndUtc: '2026-03-31',
      linkedHabitIds: [],
    })

    expect(created).toEqual({ id: 'new-1' })
    expect(actionMocks.createChallenge).toHaveBeenCalledTimes(1)
  })

  it('rebuilds a typed error when the join action fails', async () => {
    actionMocks.joinChallenge.mockResolvedValue({
      ok: false,
      status: 409,
      code: 'ALREADY_JOINED_CHALLENGE',
    })

    const { result } = renderHook(() => useJoinChallenge(), { wrapper: createWrapper() })

    await expect(
      result.current.mutateAsync({ code: 'X', linkedHabitIds: [] }),
    ).rejects.toMatchObject({ status: 409 })
  })

  it('sends {challengeId, habitIds} to the setHabits action', async () => {
    actionMocks.setChallengeHabits.mockResolvedValue({ ok: true, data: null })

    const { result } = renderHook(() => useSetChallengeHabits(), { wrapper: createWrapper() })
    await result.current.mutateAsync({ challengeId: 'c-1', habitIds: ['h-1', 'h-2'] })

    expect(actionMocks.setChallengeHabits).toHaveBeenCalledWith('c-1', {
      habitIds: ['h-1', 'h-2'],
    })
  })

  it('leaves through the action with the challenge id', async () => {
    actionMocks.leaveChallenge.mockResolvedValue({ ok: true, data: null })

    const { result } = renderHook(() => useLeaveChallenge(), { wrapper: createWrapper() })
    await result.current.mutateAsync('c-1')

    expect(actionMocks.leaveChallenge).toHaveBeenCalledWith('c-1')
  })
})

describe('getChallengeErrorKey', () => {
  it('maps known backend codes to challenge error keys', () => {
    expect(getChallengeErrorKey(createApiClientError(409, { errorCode: 'CHALLENGE_FULL' }, 'x'))).toBe(
      'challenges.errors.challengeFull',
    )
    expect(
      getChallengeErrorKey(createApiClientError(409, { errorCode: 'ALREADY_JOINED_CHALLENGE' }, 'x')),
    ).toBe('challenges.errors.alreadyJoined')
    expect(getChallengeErrorKey(createApiClientError(409, { errorCode: 'CHALLENGE_CLOSED' }, 'x'))).toBe(
      'challenges.errors.closed',
    )
    expect(getChallengeErrorKey(createApiClientError(400, { errorCode: 'INVALID_JOIN_CODE' }, 'x'))).toBe(
      'challenges.errors.invalidCode',
    )
  })

  it('maps a 429 to the rate-limited key and unknowns to generic', () => {
    expect(getChallengeErrorKey(createApiClientError(429, null, 'x'))).toBe(
      'challenges.errors.rateLimited',
    )
    expect(getChallengeErrorKey(createApiClientError(500, null, 'x'))).toBe(
      'challenges.errors.generic',
    )
  })
})
