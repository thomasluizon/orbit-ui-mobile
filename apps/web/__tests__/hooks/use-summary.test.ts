import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { useSummary } from '@/hooks/use-summary'

// Mock fetch
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

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

describe('useSummary', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  it('fetches summary when enabled', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          summary: 'Great day! You completed 5 out of 6 habits.',
          fromCache: false,
        }),
    })

    const { result } = renderHook(
      () =>
        useSummary({
          date: '2025-01-15',
          locale: 'en',
          hasProAccess: true,
          aiSummaryEnabled: true,
        }),
      { wrapper: createWrapper() },
    )

    await waitFor(() => expect(result.current.summary).toBeTruthy())
    expect(result.current.summary).toBe('Great day! You completed 5 out of 6 habits.')
    expect(result.current.isLoading).toBe(false)
  })

  it('does not fetch when hasProAccess is false', () => {
    const { result } = renderHook(
      () =>
        useSummary({
          date: '2025-01-15',
          locale: 'en',
          hasProAccess: false,
          aiSummaryEnabled: true,
        }),
      { wrapper: createWrapper() },
    )

    expect(mockFetch).not.toHaveBeenCalled()
    expect(result.current.summary).toBeNull()
  })

  it('does not fetch when aiSummaryEnabled is false', () => {
    const { result } = renderHook(
      () =>
        useSummary({
          date: '2025-01-15',
          locale: 'en',
          hasProAccess: true,
          aiSummaryEnabled: false,
        }),
      { wrapper: createWrapper() },
    )

    expect(mockFetch).not.toHaveBeenCalled()
    expect(result.current.summary).toBeNull()
  })

  it('does not fetch when date is empty', () => {
    const { result } = renderHook(
      () =>
        useSummary({
          date: '',
          locale: 'en',
          hasProAccess: true,
          aiSummaryEnabled: true,
        }),
      { wrapper: createWrapper() },
    )

    expect(mockFetch).not.toHaveBeenCalled()
    expect(result.current.summary).toBeNull()
  })

  it('handles fetch error', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ error: 'AI service unavailable' }),
    })

    const { result } = renderHook(
      () =>
        useSummary({
          date: '2025-01-15',
          locale: 'en',
          hasProAccess: true,
          aiSummaryEnabled: true,
        }),
      { wrapper: createWrapper() },
    )

    await waitFor(() => expect(result.current.error).toBeTruthy())
    expect(result.current.summary).toBeNull()
  })

  it('passes correct query params to URL', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ summary: 'Test', fromCache: true }),
    })

    renderHook(
      () =>
        useSummary({
          date: '2025-01-15',
          locale: 'pt-BR',
          hasProAccess: true,
          aiSummaryEnabled: true,
        }),
      { wrapper: createWrapper() },
    )

    await waitFor(() => expect(mockFetch).toHaveBeenCalled())

    const calledUrl = mockFetch.mock.calls[0]![0] as string
    expect(calledUrl).toContain('dateFrom=2025-01-15')
    expect(calledUrl).toContain('dateTo=2025-01-15')
    expect(calledUrl).toContain('includeOverdue=true')
    expect(calledUrl).toContain('language=pt-BR')
  })
})
