import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { API } from '@orbit/shared/api'
import { accountabilityKeys } from '@orbit/shared/query'

import {
  useAccountabilityCheckIns,
  useAccountabilityPairs,
  useAcceptAccountabilityPair,
  useCheckInAccountability,
  useEndAccountabilityPair,
  useInviteAccountabilityBuddy,
  useSetAccountabilityHabits,
} from '@/hooks/use-accountability'

const TestRenderer = require('react-test-renderer')

const mocks = vi.hoisted(() => ({
  queries: [] as Array<{
    queryKey: readonly unknown[]
    queryFn: () => unknown
    enabled?: boolean
  }>,
  mutations: [] as Array<{
    mutationFn: (variables: unknown) => unknown
    onSuccess?: (data: unknown, variables: unknown) => void
  }>,
  apiClient: vi.fn(),
  invalidateQueries: vi.fn(),
}))

vi.mock('@tanstack/react-query', () => ({
  useQuery: (options: { queryKey: readonly unknown[]; queryFn: () => unknown; enabled?: boolean }) => {
    mocks.queries.push(options)
    return { data: undefined, isLoading: false }
  },
  useMutation: (options: {
    mutationFn: (variables: unknown) => unknown
    onSuccess?: (data: unknown, variables: unknown) => void
  }) => {
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

function lastBody(): unknown {
  const lastCall = mocks.apiClient.mock.calls.at(-1)!
  return JSON.parse((lastCall[1] as { body: string }).body)
}

beforeEach(() => {
  mocks.queries = []
  mocks.mutations = []
  mocks.apiClient.mockReset()
  mocks.invalidateQueries.mockReset()
})

describe('useAccountability hooks (mobile)', () => {
  it('keys the pairs query and fetches the pairs endpoint', async () => {
    renderHook(() => useAccountabilityPairs())
    const query = mocks.queries.at(-1)!
    expect(query.queryKey).toEqual(accountabilityKeys.pairs())

    mocks.apiClient.mockResolvedValue({ activePairs: [], incomingInvites: [], outgoingInvites: [] })
    await query.queryFn()
    expect(mocks.apiClient).toHaveBeenCalledWith(API.accountability.pairs)
  })

  it('keys the check-ins query by pair id and fetches the endpoint', async () => {
    renderHook(() => useAccountabilityCheckIns('pair-1'))
    const query = mocks.queries.at(-1)!
    expect(query.queryKey).toEqual(accountabilityKeys.checkIns('pair-1'))
    expect(query.enabled).toBe(true)

    mocks.apiClient.mockResolvedValue({ items: [] })
    await query.queryFn()
    expect(mocks.apiClient).toHaveBeenCalledWith(API.accountability.checkIns('pair-1'))
  })

  it('disables the check-ins query without a pair id', () => {
    renderHook(() => useAccountabilityCheckIns(null))
    expect(mocks.queries.at(-1)!.enabled).toBe(false)
  })

  it('invites a buddy with the request body and invalidates pairs', async () => {
    renderHook(() => useInviteAccountabilityBuddy())
    const mutation = mocks.mutations.at(-1)!

    mocks.apiClient.mockResolvedValue({ id: 'pair-1' })
    await mutation.mutationFn({ buddyUserId: 'user-1', cadence: 'Daily', habitIds: ['h1'] })

    expect(mocks.apiClient).toHaveBeenCalledWith(
      API.accountability.pairs,
      expect.objectContaining({ method: 'POST' }),
    )
    expect(lastBody()).toEqual({ buddyUserId: 'user-1', cadence: 'Daily', habitIds: ['h1'] })

    mutation.onSuccess?.({ id: 'pair-1' }, { buddyUserId: 'user-1', cadence: 'Daily', habitIds: ['h1'] })
    expect(mocks.invalidateQueries).toHaveBeenCalledWith({ queryKey: accountabilityKeys.pairs() })
  })

  it('accepts a pair with the chosen habit ids', async () => {
    renderHook(() => useAcceptAccountabilityPair())
    const mutation = mocks.mutations.at(-1)!

    mocks.apiClient.mockResolvedValue(undefined)
    await mutation.mutationFn({ pairId: 'pair-1', habitIds: ['h1', 'h2'] })

    expect(mocks.apiClient).toHaveBeenCalledWith(
      API.accountability.accept('pair-1'),
      expect.objectContaining({ method: 'POST' }),
    )
    expect(lastBody()).toEqual({ habitIds: ['h1', 'h2'] })
  })

  it('ends a pair by id', async () => {
    renderHook(() => useEndAccountabilityPair())
    const mutation = mocks.mutations.at(-1)!

    mocks.apiClient.mockResolvedValue(undefined)
    await mutation.mutationFn('pair-1')

    expect(mocks.apiClient).toHaveBeenCalledWith(
      API.accountability.end('pair-1'),
      expect.objectContaining({ method: 'DELETE' }),
    )
  })

  it('sets the tracked habits for a pair', async () => {
    renderHook(() => useSetAccountabilityHabits())
    const mutation = mocks.mutations.at(-1)!

    mocks.apiClient.mockResolvedValue(undefined)
    await mutation.mutationFn({ pairId: 'pair-1', habitIds: ['h3'] })

    expect(mocks.apiClient).toHaveBeenCalledWith(
      API.accountability.habits('pair-1'),
      expect.objectContaining({ method: 'PUT' }),
    )
    expect(lastBody()).toEqual({ habitIds: ['h3'] })
  })

  it('checks in with a note and invalidates pairs and that pair check-ins', async () => {
    renderHook(() => useCheckInAccountability())
    const mutation = mocks.mutations.at(-1)!

    mocks.apiClient.mockResolvedValue({ id: 'checkin-1' })
    await mutation.mutationFn({ pairId: 'pair-1', note: 'done' })

    expect(mocks.apiClient).toHaveBeenCalledWith(
      API.accountability.checkIns('pair-1'),
      expect.objectContaining({ method: 'POST' }),
    )
    expect(lastBody()).toEqual({ note: 'done' })

    mutation.onSuccess?.({ id: 'checkin-1' }, { pairId: 'pair-1', note: 'done' })
    expect(mocks.invalidateQueries).toHaveBeenCalledWith({ queryKey: accountabilityKeys.pairs() })
    expect(mocks.invalidateQueries).toHaveBeenCalledWith({
      queryKey: accountabilityKeys.checkIns('pair-1'),
    })
  })
})
