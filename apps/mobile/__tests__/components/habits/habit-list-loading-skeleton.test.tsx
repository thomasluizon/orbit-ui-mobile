import React from 'react'
import TestRenderer, { act } from 'react-test-renderer'
import { afterEach, expect, it, vi } from 'vitest'
import { I18nextProvider } from 'react-i18next'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { DEFAULT_CONFIG } from '@orbit/shared/types/config'
import { createMockProfile } from '@orbit/shared/__tests__/factories'
import { API } from '@orbit/shared/api'
import { HabitList } from '@/components/habit-list'
import { HabitListSkeleton } from '@/components/habit-list/habit-list-skeleton'
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

it('draws the shared habit list skeleton on the first frame while the habits query is pending', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-09-12T09:00:00Z'))
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  request.mockImplementation((path: string) => {
    if (path === API.config.get) return Promise.resolve(DEFAULT_CONFIG)
    if (path === API.profile.get) return Promise.resolve(createMockProfile({ timeZone: 'UTC' }))
    return new Promise(() => {})
  })
  await act(() => {
    tree = TestRenderer.create(<I18nextProvider i18n={testI18n}><QueryClientProvider client={client}>
      <HabitList view="today" filters={{ dateFrom: '2026-09-12', dateTo: '2026-09-12', includeOverdue: true }} showCompleted onCreatePress={vi.fn()} />
    </QueryClientProvider></I18nextProvider>)
  })
  const skeletonUnits = () => tree!.root.findAll((node) => typeof node.type === 'string' && node.props.testID === 'skeleton-unit-habit-row')
  expect(tree!.root.findAllByType(HabitListSkeleton)).toHaveLength(1)
  expect(skeletonUnits()).toHaveLength(5)
  for (let tick = 0; tick < 20; tick += 1) {
    await act(async () => { await vi.advanceTimersByTimeAsync(50) })
    expect(tree!.root.findAllByType(HabitListSkeleton)).toHaveLength(1)
    expect(skeletonUnits()).toHaveLength(5)
  }
})
