import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { API } from '@orbit/shared/api'
import { profileKeys, subscriptionKeys } from '@orbit/shared/query'
import { habitSetupSuggestionSchema } from '@orbit/shared/types/habit'
import { useHabitSuggestion } from '@/hooks/use-habit-suggestion'

const TestRenderer = require('react-test-renderer')

const mocks = vi.hoisted(() => {
  const captured = {
    mutationArgs: null as Record<string, unknown> | null,
  }
  const queryClient = {
    invalidateQueries: vi.fn(async () => {}),
  }
  return {
    captured,
    queryClient,
    useMutation: vi.fn((args: Record<string, unknown>) => {
      captured.mutationArgs = args
      return { mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }
    }),
    useQueryClient: vi.fn(() => queryClient),
    apiClient: vi.fn(),
  }
})

vi.mock('@tanstack/react-query', () => ({
  useMutation: mocks.useMutation,
  useQueryClient: mocks.useQueryClient,
}))

vi.mock('@/lib/api-client', () => ({
  apiClient: mocks.apiClient,
}))

function renderHook(hook: () => unknown) {
  function Harness() {
    hook()
    return null
  }
  return TestRenderer.act(() => {
    TestRenderer.create(<Harness />)
    return Promise.resolve()
  })
}

const validSuggestion = {
  emoji: '🏃',
  frequencyUnit: 'Day',
  frequencyQuantity: 1,
  days: ['Monday'],
  isFlexible: false,
  flexibleTarget: null,
  dueTime: null,
  subHabits: ['Warm up'],
  checklistItems: [],
}

describe('mobile useHabitSuggestion', () => {
  beforeEach(() => {
    mocks.captured.mutationArgs = null
    mocks.useMutation.mockClear()
    mocks.useQueryClient.mockClear()
    mocks.apiClient.mockReset()
    mocks.queryClient.invalidateQueries.mockClear()
  })

  it('mutationFn POSTs to the suggest-setup endpoint and forwards the response schema for boundary validation', async () => {
    await renderHook(() => useHabitSuggestion())
    const mutationFn = mocks.captured.mutationArgs?.mutationFn as (
      data: { title: string; language?: string },
    ) => Promise<typeof validSuggestion>

    mocks.apiClient.mockResolvedValue(validSuggestion)
    const result = await mutationFn({ title: 'Run', language: 'en' })

    expect(mocks.apiClient).toHaveBeenCalledWith(
      API.habits.suggestSetup,
      {
        method: 'POST',
        body: JSON.stringify({ title: 'Run', language: 'en' }),
      },
      habitSetupSuggestionSchema,
    )
    expect(result.emoji).toBe('🏃')
    expect(result.frequencyUnit).toBe('Day')
  })

  it('invalidates the allowance queries on success', async () => {
    await renderHook(() => useHabitSuggestion())
    const onSuccess = mocks.captured.mutationArgs?.onSuccess as () => void

    onSuccess()

    expect(mocks.queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: subscriptionKeys.status(),
    })
    expect(mocks.queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: profileKeys.detail(),
    })
  })

  it('mutationFn propagates an apiClient error (e.g. a pay-gate rejection)', async () => {
    await renderHook(() => useHabitSuggestion())
    const mutationFn = mocks.captured.mutationArgs?.mutationFn as (
      data: { title: string },
    ) => Promise<unknown>

    mocks.apiClient.mockRejectedValue(new Error('limit reached'))

    await expect(mutationFn({ title: 'Run' })).rejects.toThrow('limit reached')
  })
})
