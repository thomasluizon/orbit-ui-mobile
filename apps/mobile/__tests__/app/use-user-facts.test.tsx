import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { API } from '@orbit/shared/api'
import { userFactKeys } from '@orbit/shared/query'

import { useUserFacts, type UserFact } from '@/app/use-user-facts'

const TestRenderer = require('react-test-renderer')

interface CapturedQuery {
  queryKey: readonly unknown[]
  queryFn: () => unknown
}

const mocks = vi.hoisted(() => {
  const store = new Map<string, unknown>()
  const queryClient = {
    cancelQueries: vi.fn(async () => {}),
    invalidateQueries: vi.fn(async () => {}),
    getQueryData: vi.fn((key: readonly unknown[]) => store.get(JSON.stringify(key))),
    setQueryData: vi.fn((key: readonly unknown[], updater: unknown) => {
      const serialized = JSON.stringify(key)
      const next =
        typeof updater === 'function'
          ? (updater as (old: unknown) => unknown)(store.get(serialized))
          : updater
      store.set(serialized, next)
      return next
    }),
  }
  return {
    store,
    queryClient,
    queryConfigs: [] as CapturedQuery[],
    isOnline: true,
    factsData: undefined as UserFact[] | undefined,
    performQueuedApiMutation: vi.fn(async () => undefined),
    apiClient: vi.fn(),
  }
})

vi.mock('@tanstack/react-query', () => ({
  useQuery: vi.fn((config: CapturedQuery) => {
    mocks.queryConfigs.push(config)
    return { data: mocks.factsData }
  }),
  useMutation: vi.fn((config: unknown) => config),
  useQueryClient: vi.fn(() => mocks.queryClient),
}))

vi.mock('@/hooks/use-offline', () => ({
  useOffline: () => ({ isOnline: mocks.isOnline }),
}))

vi.mock('@/lib/queued-api-mutation', () => ({
  performQueuedApiMutation: mocks.performQueuedApiMutation,
}))

vi.mock('@/lib/api-client', () => ({
  apiClient: mocks.apiClient,
}))

type UserFactsApi = ReturnType<typeof useUserFacts>

function fact(id: string): UserFact {
  return { id, factText: `fact ${id}`, category: null }
}

function seedLists(facts: UserFact[]): void {
  mocks.store.set(JSON.stringify(userFactKeys.lists()), facts)
  mocks.factsData = facts
}

function renderUserFacts(hasProAccess = true): { current: UserFactsApi } {
  const ref: { current: UserFactsApi | null } = { current: null }
  function Harness() {
    ref.current = useUserFacts(hasProAccess)
    return null
  }
  TestRenderer.act(() => {
    TestRenderer.create(React.createElement(Harness))
  })
  if (!ref.current) throw new Error('useUserFacts did not render')
  return ref as { current: UserFactsApi }
}

function currentList(): UserFact[] {
  return (mocks.store.get(JSON.stringify(userFactKeys.lists())) as UserFact[]) ?? []
}

interface CapturedMutation {
  mutationFn: (variables: unknown) => Promise<unknown>
  onMutate?: (variables: unknown) => Promise<unknown> | unknown
  onError?: (error: unknown, variables: unknown, context: unknown) => void
  onSuccess?: (data: unknown, variables: unknown, context: unknown) => void
}

function asMutation(mutation: unknown): CapturedMutation {
  return mutation as CapturedMutation
}

describe('useUserFacts', () => {
  beforeEach(() => {
    mocks.store.clear()
    mocks.queryConfigs = []
    mocks.isOnline = true
    mocks.factsData = undefined
    mocks.queryClient.cancelQueries.mockClear()
    mocks.queryClient.invalidateQueries.mockClear()
    mocks.queryClient.getQueryData.mockClear()
    mocks.queryClient.setQueryData.mockClear()
    mocks.performQueuedApiMutation.mockClear()
  })

  it('loads the facts list from the user-facts endpoint', async () => {
    mocks.apiClient.mockResolvedValue([fact('a')])
    renderUserFacts()

    await mocks.queryConfigs.at(-1)?.queryFn()

    expect(mocks.apiClient).toHaveBeenCalledWith(API.userFacts.list)
  })

  it('wires the delete and bulk-delete mutations to their queued endpoints', async () => {
    const hook = renderUserFacts()

    await asMutation(hook.current.deleteMutation).mutationFn('a')
    expect(mocks.performQueuedApiMutation).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'deleteUserFact',
        endpoint: API.userFacts.delete('a'),
        method: 'DELETE',
        dedupeKey: 'user-fact-delete-a',
      }),
    )

    await asMutation(hook.current.bulkDeleteMutation).mutationFn(['a', 'b'])
    expect(mocks.performQueuedApiMutation).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'bulkDeleteUserFacts',
        endpoint: API.userFacts.bulk,
        method: 'DELETE',
        payload: { ids: ['a', 'b'] },
      }),
    )
  })

  it('gates facts behind pro access', () => {
    seedLists([fact('a')])
    const nonPro = renderUserFacts(false)
    expect(nonPro.current.facts).toEqual([])
    expect(nonPro.current.totalFactsPages).toBe(1)

    const pro = renderUserFacts(true)
    expect(pro.current.facts).toHaveLength(1)
  })

  it('paginates facts five per page', () => {
    seedLists(Array.from({ length: 7 }, (_unused, index) => fact(String(index))))
    const hook = renderUserFacts()

    expect(hook.current.totalFactsPages).toBe(2)
    expect(hook.current.pagedFacts).toHaveLength(5)

    TestRenderer.act(() => {
      hook.current.setFactsPage(2)
    })
    expect(hook.current.pagedFacts).toHaveLength(2)
  })

  it('clamps the page number when it exceeds the available pages', () => {
    seedLists([fact('a'), fact('b')])
    const hook = renderUserFacts()

    TestRenderer.act(() => {
      hook.current.setFactsPage(9)
    })

    expect(hook.current.factsPage).toBe(1)
  })

  it('optimistically removes a fact and rolls back on error', async () => {
    seedLists([fact('a'), fact('b'), fact('c')])
    const hook = renderUserFacts()

    const deleteMutation = asMutation(hook.current.deleteMutation)
    let context: unknown
    await TestRenderer.act(async () => {
      context = await deleteMutation.onMutate?.('b')
    })

    expect(currentList().map((entry) => entry.id)).toEqual(['a', 'c'])
    expect(mocks.queryClient.cancelQueries).toHaveBeenCalledWith({
      queryKey: userFactKeys.lists(),
    })

    TestRenderer.act(() => {
      deleteMutation.onError?.(new Error('boom'), 'b', context)
    })

    expect(currentList().map((entry) => entry.id)).toEqual(['a', 'b', 'c'])
  })

  it('invalidates queries after a successful delete only when online', () => {
    seedLists([fact('a')])
    const hook = renderUserFacts()

    asMutation(hook.current.deleteMutation).onSuccess?.(undefined, 'a', undefined)
    expect(mocks.queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: userFactKeys.all,
    })

    mocks.queryClient.invalidateQueries.mockClear()
    mocks.isOnline = false
    const offlineHook = renderUserFacts()
    asMutation(offlineHook.current.deleteMutation).onSuccess?.(undefined, 'a', undefined)
    expect(mocks.queryClient.invalidateQueries).not.toHaveBeenCalled()
  })

  it('optimistically bulk-deletes and rolls back on error', async () => {
    seedLists([fact('a'), fact('b'), fact('c')])
    const hook = renderUserFacts()

    const bulkDeleteMutation = asMutation(hook.current.bulkDeleteMutation)
    let context: unknown
    await TestRenderer.act(async () => {
      context = await bulkDeleteMutation.onMutate?.(['a', 'c'])
    })

    expect(currentList().map((entry) => entry.id)).toEqual(['b'])

    TestRenderer.act(() => {
      bulkDeleteMutation.onError?.(new Error('boom'), ['a', 'c'], context)
    })

    expect(currentList().map((entry) => entry.id)).toEqual(['a', 'b', 'c'])
  })

  it('exits select mode after a bulk delete empties the list', async () => {
    seedLists([fact('a'), fact('b')])
    const hook = renderUserFacts()

    TestRenderer.act(() => {
      hook.current.toggleSelectMode()
    })
    TestRenderer.act(() => {
      hook.current.toggleSelectAll()
    })
    expect(hook.current.selectMode).toBe(true)
    expect(hook.current.selectedFactIds.size).toBe(2)

    const bulkDeleteMutation = asMutation(hook.current.bulkDeleteMutation)
    await TestRenderer.act(async () => {
      await bulkDeleteMutation.onMutate?.(['a', 'b'])
    })
    TestRenderer.act(() => {
      bulkDeleteMutation.onSuccess?.(undefined, ['a', 'b'], undefined)
    })

    expect(hook.current.selectedFactIds.size).toBe(0)
    expect(hook.current.selectMode).toBe(false)
  })

  it('toggles individual and all-fact selection', () => {
    seedLists([fact('a'), fact('b'), fact('c')])
    const hook = renderUserFacts()

    TestRenderer.act(() => {
      hook.current.toggleFactSelection('b')
    })
    expect([...hook.current.selectedFactIds]).toEqual(['b'])

    TestRenderer.act(() => {
      hook.current.toggleFactSelection('b')
    })
    expect(hook.current.selectedFactIds.size).toBe(0)

    TestRenderer.act(() => {
      hook.current.toggleSelectAll()
    })
    expect(hook.current.selectedFactIds.size).toBe(3)

    TestRenderer.act(() => {
      hook.current.toggleSelectAll()
    })
    expect(hook.current.selectedFactIds.size).toBe(0)
  })
})
