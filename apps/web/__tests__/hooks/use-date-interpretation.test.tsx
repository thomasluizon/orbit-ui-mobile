import { useAuthStore } from '@/stores/auth-store'
import { describe, it, expect, vi, beforeEach } from 'vitest'
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { useDateInterpretation } from '@/hooks/use-date-interpretation'

const mockInterpretHabitDate = vi.fn()
vi.mock('@/lib/actions/habits', () => ({
  interpretHabitDate: (data: unknown) => mockInterpretHabitDate(data),
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


const reply = { date: '2026-10-26', referenceDate: '2026-10-20' }
beforeEach(() => {
  mockInterpretHabitDate.mockReset()
  useAuthStore.getState().setAuth({ userId: 'account-a', name: 'Alex', email: 'alex@example.com' })
})

it.each([false, true])('refreshes allowance after terminal success or failure: %s without replay', async (failure) => {
  if (failure) mockInterpretHabitDate.mockRejectedValue(new Error('provider failed'))
  else mockInterpretHabitDate.mockResolvedValue(reply)
  const client = createClient()
  const invalidate = vi.spyOn(client, 'invalidateQueries')
  const { result } = renderHook(() => useDateInterpretation(), { wrapper: createWrapper(client) })
  const attempt = result.current.mutateAsync({ phrase: 'after vacation', language: 'en' })
  if (failure) await expect(attempt).rejects.toThrow('provider failed')
  else expect(await attempt).toEqual(reply)
  expect(mockInterpretHabitDate).toHaveBeenCalledOnce()
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ['profile', 'detail'] })
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ['subscriptions', 'status'] })
})

it('does not apply an old account allowance refresh to a replacement account', async () => {
  let finish!: (value: typeof reply) => void
  mockInterpretHabitDate.mockImplementation(() => new Promise((resolve) => { finish = resolve }))
  const client = createClient()
  const invalidate = vi.spyOn(client, 'invalidateQueries')
  const { result } = renderHook(() => useDateInterpretation(), { wrapper: createWrapper(client) })
  const pending = result.current.mutateAsync({ phrase: 'after vacation', language: 'en' })
  await waitFor(() => expect(mockInterpretHabitDate).toHaveBeenCalledOnce())
  useAuthStore.getState().setAuth({ userId: 'account-b', name: 'Blair', email: 'blair@example.com' })
  invalidate.mockClear()
  finish(reply)
  await pending
  expect(invalidate).not.toHaveBeenCalledWith({ queryKey: ['profile', 'detail'] })
  expect(invalidate).not.toHaveBeenCalledWith({ queryKey: ['subscriptions', 'status'] })
})
