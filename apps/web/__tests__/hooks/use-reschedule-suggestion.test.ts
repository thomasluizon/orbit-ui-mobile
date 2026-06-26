import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { useRescheduleSuggestion } from '@/hooks/use-reschedule-suggestion'
import { createMockRescheduleSuggestion } from '@orbit/shared/__tests__/factories'

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

  it('surfaces fetch errors', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ error: 'AI reschedule temporarily unavailable' }),
    })

    const { result } = renderHook(
      () => useRescheduleSuggestion({ habitId: 'habit-1', locale: 'en', enabled: true }),
      { wrapper: createWrapper() },
    )

    await waitFor(() => expect(result.current.error).toBeTruthy())
    expect(result.current.suggestion).toBeNull()
  })

  it('passes the habit id and language to the URL', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ suggestion: createMockRescheduleSuggestion(), fromCache: true }),
    })

    renderHook(
      () => useRescheduleSuggestion({ habitId: 'habit-42', locale: 'pt-BR', enabled: true }),
      { wrapper: createWrapper() },
    )

    await waitFor(() => expect(mockFetch).toHaveBeenCalled())
    const calledUrl = mockFetch.mock.calls[0]![0] as string
    expect(calledUrl).toContain('/api/habits/habit-42/reschedule-suggestion')
    expect(calledUrl).toContain('language=pt-BR')
  })
})
