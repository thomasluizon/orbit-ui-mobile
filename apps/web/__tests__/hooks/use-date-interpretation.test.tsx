import { useAuthStore } from '@/stores/auth-store'
import { it, expect, vi, beforeEach, afterEach } from 'vitest'
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))
import { renderHook, waitFor } from '@testing-library/react'
import { onlineManager, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { getFriendlyErrorKey } from '@orbit/shared/utils'
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

function observeExecution(client: QueryClient) {
  return new Promise<{ status: string; isPaused: boolean }>((resolve) => {
    const unsubscribe = client.getMutationCache().subscribe((event) => {
      if (event.type !== 'updated' || !['pause', 'error', 'success'].includes(event.action.type)) return
      unsubscribe()
      resolve({ status: event.mutation.state.status, isPaused: event.mutation.state.isPaused })
    })
  })
}

const reply = { date: '2026-10-26', referenceDate: '2026-10-20' }
beforeEach(() => {
  onlineManager.setOnline(true)
  mockInterpretHabitDate.mockReset()
  useAuthStore.getState().setAuth({ userId: 'account-a', name: 'Alex', email: 'alex@example.com' })
})
afterEach(() => { onlineManager.setOnline(true) })

it.each([true, false])('settles offline without replay and requires a fresh consultation: initially online %s', async (initiallyOnline) => {
  mockInterpretHabitDate.mockResolvedValue(reply)
  const client = createClient()
  const invalidate = vi.spyOn(client, 'invalidateQueries')
  const { result, unmount } = renderHook(() => useDateInterpretation(), { wrapper: createWrapper(client) })
  const execution = observeExecution(client)
  onlineManager.setOnline(initiallyOnline)
  const input = { phrase: 'after vacation', language: 'en' }
  const attempt = result.current.mutateAsync(input).catch((error: unknown) => error)
  onlineManager.setOnline(false)
  const offline = { ...await execution, transportCalls: mockInterpretHabitDate.mock.calls.length }
  onlineManager.setOnline(true)
  await client.resumePausedMutations()
  const outcome = await attempt
  try {
    expect({ offline, callsAfterReconnect: mockInterpretHabitDate.mock.calls.length }).toEqual({
      offline: { status: 'error', isPaused: false, transportCalls: 0 }, callsAfterReconnect: 0,
    })
    expect(outcome).toBeInstanceOf(TypeError)
    expect(getFriendlyErrorKey(outcome, 'habits.form.aiSuggestError', 'habit')).toBe('habits.form.aiSuggestError')
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['profile', 'detail'] })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['subscriptions', 'status'] })
    expect(await result.current.mutateAsync(input)).toEqual(reply)
    expect(mockInterpretHabitDate).toHaveBeenCalledOnce()
  } finally {
    unmount()
    client.clear()
  }
})

it('does not send an aborted consultation', async () => {
  const client = createClient()
  const { result, unmount } = renderHook(() => useDateInterpretation(), { wrapper: createWrapper(client) })
  const abort = new AbortController()
  abort.abort()
  try {
    await expect(result.current.mutateAsync({ phrase: 'after vacation', language: 'en', signal: abort.signal })).rejects.toThrow('Date consultation cancelled')
    expect(mockInterpretHabitDate).not.toHaveBeenCalled()
  } finally {
    unmount()
    client.clear()
  }
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
