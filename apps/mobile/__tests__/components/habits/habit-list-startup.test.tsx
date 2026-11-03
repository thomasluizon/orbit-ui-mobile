import React from 'react'
import TestRenderer, { act } from 'react-test-renderer'
import { afterEach, expect, it, vi } from 'vitest'
import { I18nextProvider } from 'react-i18next'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { habitKeys } from '@orbit/shared/query'
import { habitListQueryFilters } from '@orbit/shared/utils'
import { API } from '@orbit/shared/api'
import { createMockHabitScheduleItem, createMockHabitScheduleChild, createMockProfile } from '@orbit/shared/__tests__/factories'
import { DEFAULT_CONFIG } from '@orbit/shared/types/config'
import { HabitList } from '@/components/habit-list'
import { __setWindowDimensions, __resetTestHostConfig } from '@/test-mocks/react-native'
import { testI18n } from '@/__tests__/support/i18n'
import { advanceAccountGeneration } from '@/lib/session-epoch'
import { configCache } from '@/lib/config-cache'

const request = vi.hoisted(() => vi.fn())
vi.mock('@/components/habits/create-habit-modal', () => ({ CreateHabitModal: () => null }))
vi.mock('@/components/habits/reschedule-sheet', () => ({ RescheduleSheet: () => null }))
vi.mock('expo-crypto', () => ({ randomUUID: () => '22222222-2222-4222-8222-222222222222' }))
vi.mock('react-i18next', async (importOriginal) => importOriginal<typeof import('react-i18next')>())
vi.mock('@/lib/api-client', () => ({ apiClient: request }))
vi.mock('@/stores/auth-store', () => ({ useAuthStore: (select: (state: { isAuthenticated: boolean }) => unknown) => select({ isAuthenticated: true }) }))
vi.mock('expo-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))

let tree: ReturnType<typeof TestRenderer.create> | undefined
let client: QueryClient

afterEach(async () => {
  await act(() => tree?.unmount())
  tree = undefined
  client.clear()
  configCache.setAccount(null)
  __resetTestHostConfig()
  vi.useRealTimers()
})

it.each([480, 840])('settles Hoje through startup query failures and layout at %s dp', async (width) => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.useFakeTimers()
  request.mockClear()
  vi.setSystemTime(new Date('2026-09-12T09:00:00Z'))
  __setWindowDimensions({ width, height: 751, scale: 2.625, fontScale: 1 })
  await testI18n.changeLanguage('pt-BR')
  configCache.setAccount('startup-account')
  const habit = createMockHabitScheduleItem({ id: 'startup-habit', title: 'Startup habit', dueDate: '2026-09-12', scheduledDates: ['2026-09-12'], hasSubHabits: true, children: [createMockHabitScheduleChild({ id: 'startup-child', title: 'Startup child', scheduledDates: ['2026-09-12'] })] })
  const attempts = new Map<string, number>()
  request.mockImplementation((url: string) => {
    const key = url.split('?')[0]!
    const attempt = (attempts.get(key) ?? 0) + 1
    attempts.set(key, attempt)
    if (attempt < 3) return Promise.reject(new TypeError('Network request failed'))
    if (key === API.profile.get) return Promise.resolve(createMockProfile({ language: 'pt-BR' }))
    if (key === API.config.get) return Promise.resolve(DEFAULT_CONFIG)
    if (key === API.habits.count) return Promise.resolve({ count: 1 })
    return Promise.resolve({ items: [habit], totalCount: 1, totalPages: 1, page: 1, pageSize: 200 })
  })
  client = new QueryClient({ defaultOptions: { queries: { retry: 2, retryDelay: 10 } } })
  let search = ''
  const render = () => <I18nextProvider i18n={testI18n}><QueryClientProvider client={client}>
    <HabitList view="today" filters={{ dateFrom: '2026-09-12', dateTo: '2026-09-12', includeOverdue: true, search }} showCompleted onCreatePress={vi.fn()} />
  </QueryClientProvider></I18nextProvider>
  await act(() => { tree = TestRenderer.create(render()) })
  await act(async () => {
    __setWindowDimensions({ width: width - 40, height: 751, scale: 2.625, fontScale: 1 })
    tree!.update(render())
    await vi.advanceTimersByTimeAsync(50)
  })
  for (let retry = 0; retry < 5; retry += 1) await act(async () => { await vi.advanceTimersByTimeAsync(20) })
  expect(client.getQueryCache().findAll({ queryKey: habitKeys.lists() })[0]!.state.status).toBe('success')
  const rows = () => tree!.root.findAll((node) => node.props.testID === 'habit-list')[0]!.props.data as { id: string; habit: { title: string } }[]
  expect(rows().map((row) => row.habit.title)).toContain('Startup habit')
  const layout = tree!.root.findAll((node) => node.props.testID === 'habit-list')[0]!.props.onLayout as (event: { nativeEvent: { layout: { width: number; height: number; x: number; y: number } } }) => void
  await act(() => layout({ nativeEvent: { layout: { width: width - 40, height: 600, x: 0, y: 0 } } }))
  search = 'Startup'
  client.setQueryData(habitKeys.list(habitListQueryFilters({ dateFrom: '2026-09-12', dateTo: '2026-09-12', includeOverdue: true, search }, true)), [{ ...habit, title: 'Startup cached' }])
  await act(() => { tree!.update(render()) })
  expect(rows().map((row) => row.habit.title)).toContain('Startup cached')
  await act(async () => { advanceAccountGeneration(); tree!.update(render()); await vi.advanceTimersByTimeAsync(400) })
  expect(rows().map((row) => row.id)).toContain(habit.id)
  expect(attempts.get(API.profile.get)).toBe(3)
  expect(attempts.get(API.config.get)).toBe(3)
  const selectedReads = request.mock.calls.filter(([url]) => String(url).includes('dateFrom=2026-09-12'))
  expect(selectedReads).toHaveLength(3)
})
