import React from 'react'
import TestRenderer, { act } from 'react-test-renderer'
import { afterEach, expect, it, vi } from 'vitest'
import { I18nextProvider } from 'react-i18next'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { RefreshControlProps } from 'react-native'
import { API } from '@orbit/shared/api'
import { createMockHabitScheduleItem, createMockProfile } from '@orbit/shared/__tests__/factories'
import { DEFAULT_CONFIG } from '@orbit/shared/types/config'
import { HabitList } from '@/components/habit-list'
import { __resetTestHostConfig } from '@/test-mocks/react-native'
import { testI18n } from '@/__tests__/support/i18n'
import { configCache } from '@/lib/config-cache'

const request = vi.hoisted(() => vi.fn())
vi.mock('@/components/habits/create-habit-modal', () => ({ CreateHabitModal: () => null }))
vi.mock('@/components/habits/reschedule-sheet', () => ({ RescheduleSheet: () => null }))
vi.mock('expo-crypto', () => ({ randomUUID: () => '22222222-2222-4222-8222-222222222222' }))
vi.mock('react-i18next', async (importOriginal) => importOriginal<typeof import('react-i18next')>())
vi.mock('@/lib/api-client', () => ({ apiClient: request }))
vi.mock('@/stores/auth-store', () => ({ useAuthStore: (select: (state: { isAuthenticated: boolean }) => unknown) => select({ isAuthenticated: true }) }))
vi.mock('expo-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))

type Node = TestRenderer.ReactTestInstance

let tree: TestRenderer.ReactTestRenderer | undefined
let client: QueryClient

afterEach(async () => {
  await act(() => tree?.unmount())
  tree = undefined
  client.clear()
  configCache.setAccount(null)
  __resetTestHostConfig()
  vi.useRealTimers()
})

const habit = createMockHabitScheduleItem({ id: 'refresh-habit', title: 'Refresh habit', dueDate: '2026-09-12', scheduledDates: ['2026-09-12'] })
const page = (title: string) => ({ items: [{ ...habit, title }], totalCount: 1, totalPages: 1, page: 1, pageSize: 200 })

function list(): Node {
  return tree!.root.findAll((node) => node.props.testID === 'habit-list')[0]!
}

function refreshControl(): React.ReactElement<RefreshControlProps> {
  return list().props.refreshControl as React.ReactElement<RefreshControlProps>
}

function titles() {
  return (list().props.data as { habit: { title: string } }[]).map((row) => row.habit.title)
}

function skeletonRows() {
  return tree!.root.findAll((node) => typeof node.type === 'string' && node.props.testID === 'skeleton-unit-habit-row')
}

it('pulls to refresh with no native wheel, keeps the rows for 300 ms, then holds the list with its skeleton rows until the request settles', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-09-12T09:00:00Z'))
  await testI18n.changeLanguage('en')
  configCache.setAccount('refresh-account')
  let finishRefresh!: (value: unknown) => void
  let listReads = 0
  request.mockImplementation((url: string) => {
    const key = url.split('?')[0]!
    if (key === API.profile.get) return Promise.resolve(createMockProfile({ language: 'en' }))
    if (key === API.config.get) return Promise.resolve(DEFAULT_CONFIG)
    if (key === API.habits.count) return Promise.resolve({ count: 1 })
    if (key !== API.habits.list) return Promise.resolve({ items: [], totalCount: 0, totalPages: 1, page: 1, pageSize: 200 })
    listReads += 1
    if (listReads === 1) return Promise.resolve(page('Refresh habit'))
    return new Promise((resolve) => { finishRefresh = resolve })
  })
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await act(() => {
    tree = TestRenderer.create(<I18nextProvider i18n={testI18n}><QueryClientProvider client={client}>
      <HabitList view="today" filters={{ dateFrom: '2026-09-12', dateTo: '2026-09-12', includeOverdue: true }} showCompleted onCreatePress={vi.fn()} />
    </QueryClientProvider></I18nextProvider>)
  })
  for (let tick = 0; tick < 5; tick += 1) await act(async () => { await vi.advanceTimersByTimeAsync(20) })
  expect(titles()).toEqual(['Refresh habit'])
  expect(skeletonRows()).toHaveLength(0)

  expect(refreshControl().props).toMatchObject({ refreshing: false, colors: ['transparent'], progressBackgroundColor: 'transparent', tintColor: 'transparent' })
  expect(refreshControl().props.progressViewOffset).toBeLessThanOrEqual(-128)

  const readsBeforePull = listReads
  await act(() => { refreshControl().props.onRefresh!() })
  expect(listReads).toBeGreaterThan(readsBeforePull)
  expect(refreshControl().props.refreshing).toBe(false)
  expect(titles()).toEqual(['Refresh habit'])
  expect(skeletonRows()).toHaveLength(0)
  expect(list().props.accessibilityState).toEqual({ busy: true })
  await act(async () => { await vi.advanceTimersByTimeAsync(299) })
  expect(titles()).toEqual(['Refresh habit'])
  expect(skeletonRows()).toHaveLength(0)
  await act(async () => { await vi.advanceTimersByTimeAsync(1) })
  expect(titles()).toEqual([])
  expect(list().props.accessibilityState).toEqual({ busy: true })
  expect(skeletonRows()).toHaveLength(5)
  expect(skeletonRows()[0]!.props).toMatchObject({ accessibilityRole: 'progressbar', accessibilityState: { busy: true } })
  expect(tree!.root.findAll((node) => String(node.type) === 'ActivityIndicator')).toHaveLength(0)

  await act(async () => { finishRefresh(page('Refreshed habit')); await vi.advanceTimersByTimeAsync(20) })
  expect(titles()).toEqual(['Refreshed habit'])
  expect(list().props.accessibilityState).toEqual({ busy: false })
  expect(skeletonRows()).toHaveLength(0)
})

it('keeps the rows and never draws the skeleton when a pull settles inside 300 ms', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-09-12T09:00:00Z'))
  await testI18n.changeLanguage('en')
  configCache.setAccount('refresh-account')
  let listReads = 0
  request.mockImplementation((url: string) => {
    const key = url.split('?')[0]!
    if (key === API.profile.get) return Promise.resolve(createMockProfile({ language: 'en' }))
    if (key === API.config.get) return Promise.resolve(DEFAULT_CONFIG)
    if (key === API.habits.count) return Promise.resolve({ count: 1 })
    if (key !== API.habits.list) return Promise.resolve({ items: [], totalCount: 0, totalPages: 1, page: 1, pageSize: 200 })
    listReads += 1
    if (listReads === 1) return Promise.resolve(page('Refresh habit'))
    return new Promise((resolve) => { setTimeout(() => resolve(page('Refreshed habit')), 100) })
  })
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await act(() => {
    tree = TestRenderer.create(<I18nextProvider i18n={testI18n}><QueryClientProvider client={client}>
      <HabitList view="today" filters={{ dateFrom: '2026-09-12', dateTo: '2026-09-12', includeOverdue: true }} showCompleted onCreatePress={vi.fn()} />
    </QueryClientProvider></I18nextProvider>)
  })
  for (let tick = 0; tick < 5; tick += 1) await act(async () => { await vi.advanceTimersByTimeAsync(20) })
  await act(() => { refreshControl().props.onRefresh!() })
  let sawSkeleton = false
  for (let elapsed = 0; elapsed < 400; elapsed += 20) {
    await act(async () => { await vi.advanceTimersByTimeAsync(20) })
    if (skeletonRows().length > 0 || titles().length === 0) sawSkeleton = true
  }
  expect(sawSkeleton).toBe(false)
  expect(titles()).toEqual(['Refreshed habit'])
  expect(list().props.accessibilityState).toEqual({ busy: false })
})
