import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'

const mockGetTags = vi.fn()
vi.mock('@/app/actions/tags', () => ({
  getTags: () => mockGetTags(),
}))

import { useTags } from '@/hooks/use-tags'

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children)
  }
}

describe('useTags', () => {
  beforeEach(() => {
    mockGetTags.mockReset()
  })

  it('returns empty tags array initially', () => {
    mockGetTags.mockResolvedValue([])
    const { result } = renderHook(() => useTags(), { wrapper: createWrapper() })
    expect(result.current.tags).toEqual([])
    expect(result.current.isLoading).toBe(true)
  })

  it('fetches and returns tags', async () => {
    const tags = [
      { id: 't1', name: 'Health', color: '#ff0000' },
      { id: 't2', name: 'Work', color: '#0000ff' },
    ]
    mockGetTags.mockResolvedValue(tags)

    const { result } = renderHook(() => useTags(), { wrapper: createWrapper() })

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.tags).toEqual(tags)
  })
})
