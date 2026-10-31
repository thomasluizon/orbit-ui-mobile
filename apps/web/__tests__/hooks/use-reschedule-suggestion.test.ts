import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { useRescheduleSuggestion } from '@/hooks/use-reschedule-suggestion'
import { createMockRescheduleSuggestion } from '@orbit/shared/__tests__/factories'
import { extractBackendErrorCode } from '@orbit/shared/utils'

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

describe('useRescheduleSuggestion', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  it('fetches the suggestion when enabled', async () => {
    const suggestion = createMockRescheduleSuggestion({ rationale: 'Ease back in with two days a week.' })
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ suggestion, fromCache: false }),
    })

    const { result } = renderHook(
      () => useRescheduleSuggestion({ habitId: 'habit-1', locale: 'en', enabled: true }),
      { wrapper: createWrapper() },
    )

    expect(result.current.isLoading).toBe(true)
    await act(async () => { await result.current.refetch({ cancelRefetch: false, throwOnError: true }) })
    await waitFor(() => expect(result.current.suggestion).toBeTruthy())
    expect(result.current.suggestion?.rationale).toBe('Ease back in with two days a week.')
  })

  it('does not fetch when disabled', () => {
    renderHook(
      () => useRescheduleSuggestion({ habitId: 'habit-1', locale: 'en', enabled: false }),
      { wrapper: createWrapper() },
    )

    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('does not fetch when habitId is empty', () => {
    renderHook(
      () => useRescheduleSuggestion({ habitId: '', locale: 'en', enabled: true }),
      { wrapper: createWrapper() },
    )

    expect(mockFetch).not.toHaveBeenCalled()
  })

  it.each([{ status: 400, errorCode: 'HABIT_NOT_OVERDUE' }, { status: 424, errorCode: 'AI_PROVIDER_QUOTA_EXHAUSTED' }, { status: 500, errorCode: 'AI_PROVIDER_QUOTA_EXHAUSTED' }])('does not retry a final $errorCode response with status $status', async ({ status, errorCode }) => {
    mockFetch.mockResolvedValue({
      ok: false,
      status,
      json: () => Promise.resolve({ error: 'This is not overdue.', errorCode }),
    })

    const { result } = renderHook(
      () => useRescheduleSuggestion({ habitId: 'habit-1', locale: 'en', enabled: true }),
      { wrapper: createWrapper() },
    )

    expect(result.current.isLoading).toBe(true)
    await act(async () => {
      await expect(result.current.refetch({ cancelRefetch: false, throwOnError: true })).rejects.toMatchObject({ status })
    })
    await waitFor(() => expect(result.current.error).toBeTruthy())
    expect(result.current.suggestion).toBeNull()
    expect(extractBackendErrorCode(result.current.error)).toBe(errorCode)
    expect(mockFetch).toHaveBeenCalledOnce()
  })

  it('retries a transient server error', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500, json: () => Promise.resolve({ error: 'Unavailable' }) })
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ suggestion: createMockRescheduleSuggestion() }) })
    const { result } = renderHook(
      () => useRescheduleSuggestion({ habitId: 'habit-1', locale: 'en', enabled: true }),
      { wrapper: createWrapper() },
    )
    expect(result.current.isLoading).toBe(true)
    await act(async () => { await result.current.refetch({ cancelRefetch: false, throwOnError: true }) })
    await waitFor(() => expect(result.current.suggestion).toBeTruthy())
    expect(mockFetch).toHaveBeenCalledTimes(2)
  })

  it('passes the habit id and language to the URL', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ suggestion: createMockRescheduleSuggestion(), fromCache: true }),
    })

    const { result } = renderHook(
      () => useRescheduleSuggestion({ habitId: 'habit-42', locale: 'pt-BR', enabled: true }),
      { wrapper: createWrapper() },
    )

    expect(result.current.isLoading).toBe(true)
    await act(async () => { await result.current.refetch({ cancelRefetch: false, throwOnError: true }) })
    await waitFor(() => expect(result.current.suggestion).toBeTruthy())
    const calledUrl = mockFetch.mock.calls[0]![0] as string
    expect(calledUrl).toContain('/api/habits/habit-42/reschedule-suggestion')
    expect(calledUrl).toContain('language=pt-BR')
  })
})
