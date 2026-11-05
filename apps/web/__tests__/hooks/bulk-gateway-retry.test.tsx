import React from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { habitKeys, profileKeys } from '@orbit/shared/query'
import { createMockHabitScheduleItem, createMockProfile } from '@orbit/shared/__tests__/factories'
import { normalizeHabits } from '@orbit/shared/utils'
import type { HabitScheduleItem } from '@orbit/shared/types/habit'
import en from '@orbit/shared/i18n/en.json'
import { useUIStore } from '@/stores/ui-store'
import type { Profile } from '@orbit/shared/types/profile'
import { useBulkActions } from '@/hooks/use-bulk-actions'

const mocks = vi.hoisted(() => ({ fetch: vi.fn<typeof fetch>(), toast: vi.fn(), loseActionResponse: false }))
vi.mock('@/lib/posthog', () => ({ captureHabitLogged: vi.fn(), identifyPostHogUser: vi.fn(), resetPostHogUser: vi.fn() }))
import { ACCOUNT_A_ACCESS_TOKEN } from '@/__tests__/helpers/auth-token'
import { useAuthStore } from '@/stores/auth-store'
vi.mock('@/lib/actions/habits', async original => {
  const actual = await original<typeof import('@/lib/actions/habits')>()
  return {
    ...actual,
    bulkLogHabits: async (...arguments_: Parameters<typeof actual.bulkLogHabits>) => {
      const response = await actual.bulkLogHabits(...arguments_)
      if (mocks.loseActionResponse) throw new Error('An unexpected response was received from the server.')
      return response
    },
    bulkSkipHabits: async (...arguments_: Parameters<typeof actual.bulkSkipHabits>) => {
      const response = await actual.bulkSkipHabits(...arguments_)
      if (mocks.loseActionResponse) throw new Error('An unexpected response was received from the server.')
      return response
    },
  }
})
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
let ids = Array.from({ length: 10 }, (_, index) => `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`)
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
  ids = Array.from({ length: 10 }, (_, index) => `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`)
  clearedAt = null
  useUIStore.setState({ activeCelebration: null, queuedCelebrations: [], dailyStreakMomentDate: '' })
  mocks.loseActionResponse = false
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
  it.each((['log', 'skip'] as const).flatMap(mode => (['toast', 'toolbar', 'remount'] as const).map(recovery => ({ mode, recovery }))))('keeps the $mode replay key after response loss through $recovery', async ({ mode, recovery }) => {
    const replay = new Map<string, object>()
    const requests: { key: string | null; body: string }[] = []
    let committed = 0
    mocks.loseActionResponse = true
    mocks.fetch.mockImplementation((_url, init) => {
      const key = new Headers(init?.headers).get('Idempotency-Key')
      if (typeof init?.body !== 'string') throw new Error('Missing bulk body')
      requests.push({ key, body: init.body })
      const identity = key ?? `unkeyed-${requests.length}`
      const { items } = JSON.parse(init.body) as { items: { habitId: string }[] }
      if (!replay.has(identity)) {
        committed += items.length
        replay.set(identity, { results: items.map(({ habitId }, index) => ({
          index, status: 'Success', habitId, error: null, errorCode: null,
          ...(mode === 'log' ? { logId: habitId } : {}),
        })), ...(mode === 'log' ? { previousStreak: 0, currentStreak: 1 } : {}) })
      }
      return Promise.resolve(Response.json(replay.get(identity)))
    })
    await act(async () => { await (mode === 'log' ? actions.confirmBulkLog() : actions.confirmBulkSkip()) })
    expect(selected).toEqual(new Set(ids))
    expect(settle).not.toHaveBeenCalled()
    const retry = mocks.toast.mock.calls.at(-1)?.[0]?.onAction as () => Promise<void>
    expect(retry).toBeTypeOf('function')
    mocks.loseActionResponse = false
    if (recovery !== 'toast') {
      mocks.toast.mockClear()
      selected = new Set(ids.slice(0, 3).reverse())
      if (recovery === 'remount') await act(() => tree.update(<QueryClientProvider client={client}>{null}</QueryClientProvider>))
      await act(() => tree.update(<QueryClientProvider client={client}><Owner /></QueryClientProvider>))
    }
    await act(async () => {
      if (recovery === 'toast') await retry()
      else await (mode === 'log' ? actions.confirmBulkLog() : actions.confirmBulkSkip())
    })
    expect(committed).toBe(10)
    expect(requests[0]?.key).toBeTruthy()
    expect(requests.at(-1)).toEqual(requests[0])
    expect(selected.size).toBe(0)
    expect(settle).toHaveBeenCalledOnce()
    if (recovery !== 'toast') {
      await act(async () => { await retry() })
      expect(committed).toBe(10)
      expect(requests.at(-1)).toEqual(requests[0])
    }
  })

  it.each(['log', 'skip'] as const)('retries only the original uncertain middle %s chunk', async mode => {
    ids = Array.from({ length: 205 }, (_, index) => `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`)
    selected = new Set(ids)
    client.setQueryData(habitKeys.list({}), ids.map(id => createMockHabitScheduleItem({ id })))
    await act(() => tree.update(<QueryClientProvider client={client}><Owner /></QueryClientProvider>))
    const replay = new Map<string, object>()
    const requests: { key: string; body: string }[] = []
    let committed = 0
    let unavailable = true
    mocks.fetch.mockImplementation((_url, init) => {
      const key = new Headers(init?.headers).get('Idempotency-Key')
      if (!key || typeof init?.body !== 'string') throw new Error('Missing bulk request identity')
      requests.push({ key, body: init.body })
      const { items } = JSON.parse(init.body) as { items: { habitId: string; date: string }[] }
      if (!replay.has(key)) {
        committed += items.length
        replay.set(key, { results: items.map(({ habitId }, index) => ({
          index, status: 'Success', habitId, error: null, errorCode: null,
          ...(mode === 'log' ? { logId: habitId } : {}),
        })) })
      }
      return Promise.resolve(unavailable && items[0]?.habitId === ids[100]
        ? new Response(null, { status: 502 }) : Response.json(replay.get(key)))
    })
    await act(async () => { await (mode === 'log' ? actions.confirmBulkLog() : actions.confirmBulkSkip()) })
    expect(selected).toEqual(new Set(ids.slice(100, 200)))
    const middle = requests.find(request => (JSON.parse(request.body) as { items: { habitId: string }[] }).items[0]?.habitId === ids[100])!
    const retry = mocks.toast.mock.calls.at(-1)?.[0]?.onAction as () => Promise<void>
    unavailable = false
    await act(async () => { await retry() })
    expect(requests.at(-1)).toEqual(middle)
    expect(requests.filter(request => request.key !== middle.key)).toHaveLength(2)
    expect(committed).toBe(205)
    expect(selected.size).toBe(0)
  })

  it.each(['log', 'skip'].flatMap(mode => [502, 503, 504, 'network'].map(failure => ({ mode, failure }))))('retains selection and replays the same $mode chunk after $failure', async ({ mode, failure }) => {
    const previousRows = client.getQueryData(habitKeys.list({}))
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
    expect(client.getQueryData(habitKeys.list({}))).toEqual(previousRows)
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



describe('bulk response settlement timing', () => {
  it.each(['log', 'skip'] as const)('clears ten %s rows at the response while profile work continues', async mode => {
    vi.useFakeTimers()
    const startedAt = Date.now()
    let profileFinished = false
    mocks.fetch.mockImplementation(async () => {
      await new Promise(resolve => setTimeout(resolve, 120))
      return Response.json({ results: ids.map((habitId, index) => ({
        index, status: 'Success', habitId, error: null, errorCode: null,
        ...(mode === 'log' ? { logId: habitId } : {}),
      })), ...(mode === 'log' ? { previousStreak: 0, currentStreak: 1 } : {}) })
    })
    vi.spyOn(client, 'invalidateQueries').mockImplementation(async filters => {
      if (filters?.queryKey?.[0] === profileKeys.all[0]) {
        await new Promise(resolve => setTimeout(resolve, 5000))
        client.setQueryData(profileKeys.detail(), createMockProfile({ totalXp: 200, currentStreak: 1 }))
        profileFinished = true
      }
    })
    let pending!: Promise<void>
    await act(() => { pending = mode === 'log' ? actions.confirmBulkLog() : actions.confirmBulkSkip() })
    await act(async () => { await vi.advanceTimersByTimeAsync(120) })
    const selectedAtResponse = selected.size
    if (mode === 'log') expect(client.getQueryData<HabitScheduleItem[]>(habitKeys.list({}))?.every(habit => habit.isCompleted)).toBe(true)
    expect(profileFinished).toBe(false)
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); await pending })
    expect(profileFinished).toBe(true)
    expect(client.getQueryData<Profile>(profileKeys.detail())?.totalXp).toBe(200)
    if (mode === 'log') expect(useUIStore.getState().dailyStreakMomentDate).toBe(date)
    expect(clearedAt === null ? null : clearedAt - startedAt).toBe(120)
    expect(selectedAtResponse).toBe(0)
    expect(settle).toHaveBeenCalledOnce()
  })
})
