import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import type { UserFact } from '@orbit/shared/types/user-fact'
import { useUserFacts } from '@/app/(app)/ai-settings/_components/use-user-facts'

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

vi.mock('@/app/actions/user-facts', () => ({
  deleteUserFact: vi.fn(),
  bulkDeleteUserFacts: vi.fn(),
}))

function makeFact(id: string): UserFact {
  return {
    id,
    factText: `Fact ${id}`,
    category: null,
    extractedAtUtc: '2026-01-01T00:00:00Z',
    updatedAtUtc: null,
  }
}

function makeFacts(count: number): UserFact[] {
  return Array.from({ length: count }, (_, index) => makeFact(`f-${index + 1}`))
}

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children)
  }
}

describe('useUserFacts', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  it('does not fetch and reports no facts without pro access', () => {
    const { result } = renderHook(() => useUserFacts(false), { wrapper: createWrapper() })
    expect(result.current.facts).toEqual([])
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('loads facts once pro access is granted', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve(makeFacts(3)) })
    const { result } = renderHook(() => useUserFacts(true), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.facts).toHaveLength(3))
    expect(result.current.totalFactsPages).toBe(1)
  })

  it('throws when the facts request fails', async () => {
    mockFetch.mockResolvedValue({ ok: false, json: () => Promise.resolve({}) })
    const { result } = renderHook(() => useUserFacts(true), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.factsQuery.isError).toBe(true))
  })

  it('toggles individual selections on and off', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve(makeFacts(3)) })
    const { result } = renderHook(() => useUserFacts(true), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.facts).toHaveLength(3))

    act(() => result.current.toggleFactSelection('f-1'))
    expect(result.current.selectedFactIds.has('f-1')).toBe(true)
    act(() => result.current.toggleFactSelection('f-1'))
    expect(result.current.selectedFactIds.has('f-1')).toBe(false)
  })

  it('selects all then clears when toggled again', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve(makeFacts(3)) })
    const { result } = renderHook(() => useUserFacts(true), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.facts).toHaveLength(3))

    act(() => result.current.toggleSelectAll())
    expect(result.current.selectedFactIds.size).toBe(3)
    act(() => result.current.toggleSelectAll())
    expect(result.current.selectedFactIds.size).toBe(0)
  })

  it('clears the selection when leaving select mode', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve(makeFacts(3)) })
    const { result } = renderHook(() => useUserFacts(true), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.facts).toHaveLength(3))

    act(() => result.current.toggleFactSelection('f-2'))
    act(() => result.current.toggleSelectMode())
    expect(result.current.selectMode).toBe(true)
    expect(result.current.selectedFactIds.size).toBe(0)
  })

  it('paginates in pages of five and clamps an out-of-range page', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve(makeFacts(7)) })
    const { result } = renderHook(() => useUserFacts(true), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.facts).toHaveLength(7))

    expect(result.current.totalFactsPages).toBe(2)
    expect(result.current.pagedFacts).toHaveLength(5)

    act(() => result.current.setFactsPage(2))
    await waitFor(() => expect(result.current.pagedFacts).toHaveLength(2))

    act(() => result.current.setFactsPage(9))
    await waitFor(() => expect(result.current.factsPage).toBe(2))
  })

  it('bulk-deletes and resets the selection', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve(makeFacts(3)) })
    const { bulkDeleteUserFacts } = await import('@/app/actions/user-facts')
    vi.mocked(bulkDeleteUserFacts).mockResolvedValue(undefined)

    const { result } = renderHook(() => useUserFacts(true), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.facts).toHaveLength(3))

    act(() => result.current.toggleSelectAll())
    await act(async () => {
      await result.current.bulkDeleteMutation.mutateAsync(['f-1', 'f-2', 'f-3'])
    })

    expect(vi.mocked(bulkDeleteUserFacts).mock.calls[0]![0]).toEqual(['f-1', 'f-2', 'f-3'])
    await waitFor(() => expect(result.current.selectedFactIds.size).toBe(0))
  })
})
