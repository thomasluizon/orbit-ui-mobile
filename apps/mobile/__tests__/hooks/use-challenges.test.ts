import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { API } from '@orbit/shared/api'
import { challengeKeys } from '@orbit/shared/query'
import { createApiClientError } from '@orbit/shared/utils'
import {
  createMockChallengeDetail,
  createMockChallengeListItem,
} from '@orbit/shared/__tests__/factories'

import {
  useChallengeDetail,
  useChallenges,
  useCreateChallenge,
  useJoinChallenge,
  useLeaveChallenge,
  useSetChallengeHabits,
} from '@/hooks/use-challenges'
import { getChallengeErrorKey } from '@/app/social/challenges/_components/challenge-errors'

const TestRenderer = require('react-test-renderer')

const mocks = vi.hoisted(() => ({
  queries: [] as Array<{
    queryKey: readonly unknown[]
    queryFn: (context?: { pageParam?: unknown }) => unknown
    enabled?: boolean
  }>,
  mutations: [] as Array<{ mutationFn: (variables: unknown) => unknown }>,
  apiClient: vi.fn(),
  invalidateQueries: vi.fn(),
}))

vi.mock('@tanstack/react-query', () => ({
  useQuery: (options: {
    queryKey: readonly unknown[]
    queryFn: () => unknown
    enabled?: boolean
  }) => {
    mocks.queries.push(options)
    return { data: undefined, isLoading: false }
  },
  useMutation: (options: { mutationFn: (variables: unknown) => unknown }) => {
    mocks.mutations.push(options)
    return { mutateAsync: vi.fn(), isPending: false }
  },
  useQueryClient: () => ({ invalidateQueries: mocks.invalidateQueries }),
}))

vi.mock('@/lib/api-client', () => ({
  apiClient: (...args: unknown[]) => mocks.apiClient(...args),
}))

function renderHook(hook: () => unknown) {
  function Probe() {
    hook()
    return null
  }
  TestRenderer.act(() => {
    TestRenderer.create(React.createElement(Probe))
  })
}

beforeEach(() => {
  mocks.queries = []
  mocks.mutations = []
  mocks.apiClient.mockReset()
})

describe('useChallenges hooks (mobile)', () => {
  it('keys the list query and fetches + parses the challenges endpoint', async () => {
    renderHook(() => useChallenges())
    const query = mocks.queries.at(-1)!
    expect(query.queryKey).toEqual(challengeKeys.list())

    mocks.apiClient.mockResolvedValue([createMockChallengeListItem({ id: 'c-1' })])
    const parsed = (await query.queryFn()) as Array<{ id: string }>
    expect(mocks.apiClient).toHaveBeenCalledWith(API.challenges.list)
    expect(parsed[0]?.id).toBe('c-1')
  })

  it('gates the list query on enabled', () => {
    renderHook(() => useChallenges({ enabled: false }))
    expect(mocks.queries.at(-1)!.enabled).toBe(false)
  })

  it('keys the detail query by id and fetches the detail endpoint', async () => {
    renderHook(() => useChallengeDetail('c-9'))
    const query = mocks.queries.at(-1)!
    expect(query.queryKey).toEqual(challengeKeys.detail('c-9'))

    mocks.apiClient.mockResolvedValue(createMockChallengeDetail({ id: 'c-9' }))
    const parsed = (await query.queryFn()) as { id: string }
    expect(mocks.apiClient).toHaveBeenCalledWith(API.challenges.detail('c-9'))
    expect(parsed.id).toBe('c-9')
  })

  it('creates a challenge via a POST', async () => {
    renderHook(() => useCreateChallenge())
    const mutation = mocks.mutations.at(-1)!

    mocks.apiClient.mockResolvedValue({ id: 'new-1' })
    await mutation.mutationFn({
      type: 'CoopGoal',
      title: 'Read',
      targetCount: 30,
      periodStartUtc: '2026-03-01',
      periodEndUtc: '2026-03-31',
      linkedHabitIds: [],
    })

    expect(mocks.apiClient).toHaveBeenCalledWith(
      API.challenges.create,
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('joins with {code, linkedHabitIds}', async () => {
    renderHook(() => useJoinChallenge())
    const mutation = mocks.mutations.at(-1)!

    mocks.apiClient.mockResolvedValue(undefined)
    await mutation.mutationFn({ code: 'ABCD', linkedHabitIds: ['h-1'] })

    expect(mocks.apiClient).toHaveBeenCalledWith(
      API.challenges.join,
      expect.objectContaining({ method: 'POST' }),
    )
    const body = JSON.parse((mocks.apiClient.mock.calls.at(-1)![1] as { body: string }).body)
    expect(body).toEqual({ code: 'ABCD', linkedHabitIds: ['h-1'] })
  })

  it('sets challenge habits with a PUT of {habitIds}', async () => {
    renderHook(() => useSetChallengeHabits())
    const mutation = mocks.mutations.at(-1)!

    mocks.apiClient.mockResolvedValue(undefined)
    await mutation.mutationFn({ challengeId: 'c-1', habitIds: ['h-1', 'h-2'] })

    expect(mocks.apiClient).toHaveBeenCalledWith(
      API.challenges.setHabits('c-1'),
      expect.objectContaining({ method: 'PUT' }),
    )
    const body = JSON.parse((mocks.apiClient.mock.calls.at(-1)![1] as { body: string }).body)
    expect(body).toEqual({ habitIds: ['h-1', 'h-2'] })
  })

  it('leaves via a DELETE on the challenge', async () => {
    renderHook(() => useLeaveChallenge())
    const mutation = mocks.mutations.at(-1)!

    mocks.apiClient.mockResolvedValue(undefined)
    await mutation.mutationFn('c-1')

    expect(mocks.apiClient).toHaveBeenCalledWith(
      API.challenges.leave('c-1'),
      expect.objectContaining({ method: 'DELETE' }),
    )
  })
})

describe('getChallengeErrorKey (mobile)', () => {
  it('maps known backend codes and falls back to generic', () => {
    expect(getChallengeErrorKey(createApiClientError(409, { errorCode: 'CHALLENGE_FULL' }, 'x'))).toBe(
      'challenges.errors.challengeFull',
    )
    expect(getChallengeErrorKey(createApiClientError(400, { errorCode: 'INVALID_JOIN_CODE' }, 'x'))).toBe(
      'challenges.errors.invalidCode',
    )
    expect(getChallengeErrorKey(createApiClientError(429, null, 'x'))).toBe(
      'challenges.errors.rateLimited',
    )
    expect(getChallengeErrorKey(createApiClientError(500, null, 'x'))).toBe(
      'challenges.errors.generic',
    )
  })
})
