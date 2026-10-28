import allowanceRefusals from '@orbit/shared/test-support/astra-allowance-refusals.fixture.json'
import { profileKeys } from '@orbit/shared/query'
import { useAuthStore } from '@/stores/auth-store'
import { describe, it, expect, vi, beforeEach } from 'vitest'
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { useHabitSuggestion } from '@/hooks/use-habit-suggestion'
import { createApiClientError } from '@orbit/shared'
import { extractBackendErrorCode } from '@orbit/shared/utils'
import type { HabitSetupSuggestion } from '@orbit/shared/types/habit'

const mockSuggestHabitSetup = vi.fn()
vi.mock('@/lib/actions/habits', () => ({
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

beforeEach(() => {
  useAuthStore.getState().setAuth({ userId: 'account-a', name: 'Alex', email: 'alex@example.com' })
})

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

  it.each(allowanceRefusals)('refreshes the $period allowance after a producer refusal in $locale for habits and onboarding', async ({ body }) => {
    mockSuggestHabitSetup.mockRejectedValue(
      createApiClientError(403, body, 'limit'),
    )
    const queryClient = createClient()
    queryClient.setQueryData(profileKeys.detail(), { aiMessagesUsed: 0 })

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
    expect(queryClient.getQueryState(profileKeys.detail())?.isInvalidated).toBe(true)
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
