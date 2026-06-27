import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { useHabitSuggestion } from '@/hooks/use-habit-suggestion'
import { createApiClientError } from '@orbit/shared'
import { extractBackendErrorCode } from '@orbit/shared/utils'
import type { HabitSetupSuggestion } from '@orbit/shared/types/habit'

const mockSuggestHabitSetup = vi.fn()
vi.mock('@/app/actions/habits', () => ({
  suggestHabitSetup: (data: unknown) => mockSuggestHabitSetup(data),
}))

function createClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
}

function createWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children)
  }
}

function makeSuggestion(overrides: Partial<HabitSetupSuggestion> = {}): HabitSetupSuggestion {
  return {
    emoji: '🏃',
    frequencyUnit: 'Day',
    frequencyQuantity: 1,
    days: ['Monday'],
    isFlexible: false,
    flexibleTarget: null,
    dueTime: null,
    subHabits: ['Warm up'],
    checklistItems: [],
    ...overrides,
  }
}

describe('useHabitSuggestion', () => {
  beforeEach(() => {
    mockSuggestHabitSetup.mockReset()
  })

  it('returns the parsed suggestion and refreshes allowance queries on success', async () => {
    mockSuggestHabitSetup.mockResolvedValue(makeSuggestion())
    const queryClient = createClient()
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

    const { result } = renderHook(() => useHabitSuggestion(), {
      wrapper: createWrapper(queryClient),
    })

    const suggestion = await result.current.mutateAsync({ title: 'Run', language: 'en' })

    expect(mockSuggestHabitSetup).toHaveBeenCalledWith({ title: 'Run', language: 'en' })
    expect(suggestion.emoji).toBe('🏃')
    expect(suggestion.frequencyUnit).toBe('Day')
    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['subscriptions', 'status'] })
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['profile', 'detail'] })
    })
  })

  it('propagates a pay-gate error so the caller can show the limit message', async () => {
    mockSuggestHabitSetup.mockRejectedValue(
      createApiClientError(403, { error: 'limit', errorCode: 'PAY_GATE' }, 'limit'),
    )
    const queryClient = createClient()

    const { result } = renderHook(() => useHabitSuggestion(), {
      wrapper: createWrapper(queryClient),
    })

    let caught: unknown
    try {
      await result.current.mutateAsync({ title: 'Run', language: 'en' })
    } catch (error) {
      caught = error
    }

    expect(caught).toBeTruthy()
    expect(extractBackendErrorCode(caught)).toBe('PAY_GATE')
  })

  it('rejects when the response fails schema validation', async () => {
    mockSuggestHabitSetup.mockResolvedValue({ emoji: 123 })
    const queryClient = createClient()

    const { result } = renderHook(() => useHabitSuggestion(), {
      wrapper: createWrapper(queryClient),
    })

    await expect(
      result.current.mutateAsync({ title: 'Run', language: 'en' }),
    ).rejects.toBeTruthy()
  })
})
