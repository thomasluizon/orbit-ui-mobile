import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
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
import {
  acceptAccountabilityPair,
  checkInAccountability,
  endAccountabilityPair,
  inviteAccountabilityBuddy,
  setAccountabilityHabits,
} from '@/app/actions/accountability'

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

vi.mock('@/app/actions/accountability', () => ({
  inviteAccountabilityBuddy: vi.fn(),
  acceptAccountabilityPair: vi.fn(),
  endAccountabilityPair: vi.fn(),
  setAccountabilityHabits: vi.fn(),
  checkInAccountability: vi.fn(),
}))

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

beforeEach(() => {
  mocks.queries = []
  mocks.mutations = []
  mocks.invalidateQueries.mockReset()
  mockFetch.mockReset()
})

describe('useAccountability hooks (web)', () => {
  it('keys the pairs query and fetches the pairs endpoint', async () => {
    renderHook(() => useAccountabilityPairs())
    const query = mocks.queries.at(-1)!
    expect(query.queryKey).toEqual(accountabilityKeys.pairs())

    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ activePairs: [], incomingInvites: [], outgoingInvites: [] }),
    })
    await query.queryFn()
    expect(mockFetch).toHaveBeenCalledWith(API.accountability.pairs)
  })

  it('keys the check-ins query by pair id and fetches the endpoint', async () => {
    renderHook(() => useAccountabilityCheckIns('pair-1'))
    const query = mocks.queries.at(-1)!
    expect(query.queryKey).toEqual(accountabilityKeys.checkIns('pair-1'))
    expect(query.enabled).toBe(true)

    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ items: [] }) })
    await query.queryFn()
    expect(mockFetch).toHaveBeenCalledWith(API.accountability.checkIns('pair-1'))
  })

  it('disables the check-ins query without a pair id', () => {
    renderHook(() => useAccountabilityCheckIns(null))
    expect(mocks.queries.at(-1)!.enabled).toBe(false)
  })

  it('invites a buddy with the request body and invalidates pairs', async () => {
    renderHook(() => useInviteAccountabilityBuddy())
    const mutation = mocks.mutations.at(-1)!
    vi.mocked(inviteAccountabilityBuddy).mockResolvedValue({ ok: true, data: { id: 'pair-1' } })

    await mutation.mutationFn({ buddyUserId: 'user-1', cadence: 'Daily', habitIds: ['h1'] })
    expect(inviteAccountabilityBuddy).toHaveBeenCalledWith({
      buddyUserId: 'user-1',
      cadence: 'Daily',
      habitIds: ['h1'],
    })

    mutation.onSuccess?.({ id: 'pair-1' }, { buddyUserId: 'user-1', cadence: 'Daily', habitIds: ['h1'] })
    expect(mocks.invalidateQueries).toHaveBeenCalledWith({ queryKey: accountabilityKeys.pairs() })
  })

  it('accepts a pair with the chosen habit ids', async () => {
    renderHook(() => useAcceptAccountabilityPair())
    const mutation = mocks.mutations.at(-1)!
    vi.mocked(acceptAccountabilityPair).mockResolvedValue({ ok: true, data: null })

    await mutation.mutationFn({ pairId: 'pair-1', habitIds: ['h1', 'h2'] })
    expect(acceptAccountabilityPair).toHaveBeenCalledWith('pair-1', { habitIds: ['h1', 'h2'] })
  })

  it('ends a pair by id', async () => {
    renderHook(() => useEndAccountabilityPair())
    const mutation = mocks.mutations.at(-1)!
    vi.mocked(endAccountabilityPair).mockResolvedValue({ ok: true, data: null })

    await mutation.mutationFn('pair-1')
    expect(endAccountabilityPair).toHaveBeenCalledWith('pair-1')
  })

  it('sets the tracked habits for a pair', async () => {
    renderHook(() => useSetAccountabilityHabits())
    const mutation = mocks.mutations.at(-1)!
    vi.mocked(setAccountabilityHabits).mockResolvedValue({ ok: true, data: null })

    await mutation.mutationFn({ pairId: 'pair-1', habitIds: ['h3'] })
    expect(setAccountabilityHabits).toHaveBeenCalledWith('pair-1', { habitIds: ['h3'] })
  })

  it('checks in with a note and invalidates pairs and that pair check-ins', async () => {
    renderHook(() => useCheckInAccountability())
    const mutation = mocks.mutations.at(-1)!
    vi.mocked(checkInAccountability).mockResolvedValue({ ok: true, data: { id: 'checkin-1' } })

    await mutation.mutationFn({ pairId: 'pair-1', note: 'done' })
    expect(checkInAccountability).toHaveBeenCalledWith('pair-1', { note: 'done' })

    mutation.onSuccess?.({ id: 'checkin-1' }, { pairId: 'pair-1', note: 'done' })
    expect(mocks.invalidateQueries).toHaveBeenCalledWith({ queryKey: accountabilityKeys.pairs() })
    expect(mocks.invalidateQueries).toHaveBeenCalledWith({
      queryKey: accountabilityKeys.checkIns('pair-1'),
    })
  })
})
