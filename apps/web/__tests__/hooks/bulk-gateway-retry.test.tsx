import React from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { habitKeys, profileKeys } from '@orbit/shared/query'
import { createMockHabitScheduleItem, createMockProfile } from '@orbit/shared/__tests__/factories'
import { normalizeHabits } from '@orbit/shared/utils'
import type { HabitScheduleItem } from '@orbit/shared/types/habit'
import en from '@orbit/shared/i18n/en.json'
import { useBulkActions } from '@/hooks/use-bulk-actions'

const mocks = vi.hoisted(() => ({ fetch: vi.fn<typeof fetch>(), toast: vi.fn() }))
vi.mock('@/lib/posthog', () => ({ captureHabitLogged: vi.fn(), identifyPostHogUser: vi.fn(), resetPostHogUser: vi.fn() }))
import { ACCOUNT_A_ACCESS_TOKEN } from '@/__tests__/helpers/auth-token'
import { useAuthStore } from '@/stores/auth-store'
vi.mock('@/lib/auth-api', async original => ({
  ...(await original<typeof import('@/lib/auth-api')>()),
  resolveServerSession: async () => ({ token: ACCOUNT_A_ACCESS_TOKEN, refreshFailed: false }),
}))
vi.mock('next/headers', () => ({ headers: async () => new Headers(), cookies: async () => ({ get: vi.fn() }) }))
vi.mock('next-intl', async original => {
  const actual = await original<typeof import('next-intl')>()
  return { ...actual, useTranslations: () => actual.createTranslator({ locale: 'en', messages: en }) }
})
vi.mock('next-intl/server', () => ({ getLocale: async () => 'en' }))
vi.mock('@/hooks/use-app-toast', () => ({ useAppToast: () => ({
  showToast: mocks.toast, showQueued: (message: string, label: string, onAction: () => void) => mocks.toast({ message, label, onAction }),
}) }))

let client: QueryClient
let tree: ReactTestRenderer
let actions: ReturnType<typeof useBulkActions>
let selected: Set<string>
let clearedAt: number | null
const settle = vi.fn()
const ids = Array.from({ length: 10 }, (_, index) => `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`)
const date = '2026-09-12'
function Owner() {
  const bulkActions = useBulkActions({
    selectedHabitIds: selected, selectedDateStr: date, completionReadOnly: false,
    habitsById: normalizeHabits(ids.map(id => createMockHabitScheduleItem({ id }))),
    habitListRef: { current: { settleBulkHabitResolutions: settle } },
    onSuccess: () => { selected = new Set(); clearedAt = Date.now() },
    onPartialFailure: failed => { selected = new Set(failed) },
  })
  React.useLayoutEffect(() => { actions = bulkActions })
  return null
}
beforeEach(async () => {
  vi.setSystemTime(new Date('2026-09-12T12:00:00Z'))
  clearedAt = null
  mocks.fetch.mockReset()
  mocks.toast.mockReset()
  settle.mockReset()
  vi.stubGlobal('fetch', mocks.fetch)
  useAuthStore.getState().setAuth({ userId: 'account-a', name: 'Test', email: 'test@example.com' })
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  client.setQueryData(habitKeys.list({}), ids.map(id => createMockHabitScheduleItem({ id })))
  client.setQueryData(profileKeys.detail(), createMockProfile())
  selected = new Set(ids)
  await act(() => { tree = create(<QueryClientProvider client={client}><Owner /></QueryClientProvider>) })
})
afterEach(async () => {
  await act(() => tree.unmount())
  client.clear()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('bulk gateway recovery', () => {
  it.each(['log', 'skip'].flatMap(mode => [502, 503, 504, 'network'].map(failure => ({ mode, failure }))))('retains selection and replays the same $mode chunk after $failure', async ({ mode, failure }) => {
    const replay = new Map<string, object>()
    let committed = 0
    let unavailable = true
    const requests: { key: string | null; body: string }[] = []
    mocks.fetch.mockImplementation(async (_url, init) => {
      const key = new Headers(init?.headers).get('Idempotency-Key')
      if (typeof init?.body !== 'string') throw new Error('Missing bulk body')
      const body = init.body
      requests.push({ key, body })
      const identity = key ?? `unkeyed-${requests.length}`
      if (!replay.has(identity)) {
        committed += ids.length
        replay.set(identity, { results: ids.map((habitId, index) => ({
          index, status: 'Success', habitId, error: null, errorCode: null,
          ...(mode === 'log' ? { logId: habitId } : {}),
        })), ...(mode === 'log' ? { previousStreak: 0, currentStreak: 1 } : {}) })
      }
      if (unavailable && failure === 'network') throw new TypeError('Failed to fetch')
      return unavailable ? new Response(null, { status: Number(failure) }) : Response.json(replay.get(identity))
    })
    await act(async () => { await (mode === 'log' ? actions.confirmBulkLog() : actions.confirmBulkSkip()) })
    expect(selected).toEqual(new Set(ids))
    expect(settle).not.toHaveBeenCalled()
    expect(client.getQueryData<HabitScheduleItem[]>(habitKeys.list({}))?.every(habit => !habit.isCompleted)).toBe(true)
    const retry = mocks.toast.mock.calls.at(-1)?.[0]?.onAction as () => Promise<void>
    expect(retry).toBeTypeOf('function')
    expect(mocks.toast.mock.calls.at(-1)?.[0]?.message).toBe('The connection was interrupted. Try again to finish updating your selection.')
    expect(requests[0]?.key).toBeTruthy()
    unavailable = false
    await act(async () => { await retry() })
    expect(requests.every(request => request.key === requests[0]?.key && request.body === requests[0].body)).toBe(true)
    expect(committed).toBe(10)
    expect(selected.size).toBe(0)
    expect(settle).toHaveBeenCalledOnce()
  })
})


