import React from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { habitKeys, profileKeys } from '@orbit/shared/query'
import { createMockHabitScheduleItem, createMockProfile } from '@orbit/shared/__tests__/factories'
import { normalizeHabits } from '@orbit/shared/utils'
import type { HabitScheduleItem } from '@orbit/shared/types/habit'
import { useBulkActions } from '@/hooks/use-bulk-actions'

const mocks = vi.hoisted(() => ({ fetch: vi.fn<typeof fetch>(), toast: vi.fn() }))
vi.mock('@/lib/posthog', () => ({ captureHabitLogged: vi.fn() }))
vi.mock('@/stores/auth-store', () => ({
  useAuthStore: { getState: () => ({ isAuthenticated: true, user: { userId: 'account-a' } }) },
  getSessionGeneration: () => ({ epoch: 0, credentialVersion: 0 }),
}))
vi.mock('@/lib/account-scope', () => ({ getAccountId: () => 'account-a' }))
vi.mock('@/lib/secure-store', () => ({ getToken: () => Promise.resolve('access-token') }))
vi.mock('@/lib/app-version', () => ({ buildAppVersionHeaders: () => ({}) }))
vi.mock('@/lib/offline-runtime', () => ({ getCurrentConnectivity: () => Promise.resolve(true) }))
vi.mock('@/lib/query-client', async () => {
  const { QueryClient } = await import('@tanstack/react-query')
  return { queryClient: new QueryClient(), persistQueryCache: vi.fn(async () => {}) }
})
vi.mock('@/lib/orbit-widget', () => ({ syncWidgetData: async () => {} }))
vi.mock('@/hooks/use-app-toast', () => ({ useAppToast: () => ({ showToast: mocks.toast }) }))

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
    mocks.fetch.mockImplementation((_url, init) => {
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
      if (unavailable && failure === 'network') return Promise.reject(new TypeError('Failed to fetch'))
      return Promise.resolve(unavailable ? new Response(null, { status: Number(failure) }) : Response.json(replay.get(identity)))
    })
    await act(async () => { await (mode === 'log' ? actions.confirmBulkLog() : actions.confirmBulkSkip()) })
    expect(selected).toEqual(new Set(ids))
    expect(settle).not.toHaveBeenCalled()
    expect(client.getQueryData<HabitScheduleItem[]>(habitKeys.list({}))?.every(habit => !habit.isCompleted)).toBe(true)
    const retry = mocks.toast.mock.calls.at(-1)?.[0]?.onAction as () => Promise<void>
    expect(retry).toBeTypeOf('function')
    expect(mocks.toast.mock.calls.at(-1)?.[0]?.message).toBe('habits.bulkBar.connectionRetry')
    expect(requests[0]?.key).toBeTruthy()
    unavailable = false
    await act(async () => { await retry() })
    expect(requests.every(request => request.key === requests[0]?.key && request.body === requests[0].body)).toBe(true)
    expect(committed).toBe(10)
    expect(selected.size).toBe(0)
    expect(settle).toHaveBeenCalledOnce()
  })
})


