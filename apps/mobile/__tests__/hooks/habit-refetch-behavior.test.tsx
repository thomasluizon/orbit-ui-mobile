import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider, focusManager, onlineManager } from '@tanstack/react-query'
import { formatAPIDate } from '@orbit/shared/utils'
import { finalizeHabitMutation } from '@/lib/habit-mutation-helpers'
import { useHabits, useTotalHabitCount } from '@/hooks/use-habit-queries'

const TestRenderer = require('react-test-renderer')
const mocks = vi.hoisted(() => ({ apiClient: vi.fn(), syncWidgetData: vi.fn(async () => {}) }))

vi.mock('@/lib/api-client', () => ({ apiClient: (...args: unknown[]) => mocks.apiClient(...args) }))
vi.mock('@/lib/orbit-widget', () => ({ syncWidgetData: mocks.syncWidgetData }))
vi.mock('@/lib/offline-mutations', () => ({ isQueuedResult: () => false }))
vi.mock('@/stores/auth-store', () => ({
  useAuthStore: (selector: (state: { isAuthenticated: boolean }) => unknown) => selector({ isAuthenticated: true }),
}))

afterEach(() => {
  vi.restoreAllMocks()
  mocks.apiClient.mockReset()
  focusManager.setFocused(undefined)
  onlineManager.setOnline(true)
})

describe('habit request budget on mobile', () => {
  it('counts Today requests for a 450-habit account across focus, reconnect, log, and skip', async () => {
    const date = formatAPIDate(new Date())
    let now = Date.now()
    vi.spyOn(Date, 'now').mockImplementation(() => now)
    focusManager.setFocused(true)
    onlineManager.setOnline(true)
    mocks.apiClient.mockImplementation((url: string) => Promise.resolve(url.includes('/count')
      ? { count: 450 }
      : { items: [], page: 1, pageSize: 50, totalCount: 450, totalPages: 3 }))
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const filters = { dateFrom: date, dateTo: date, includeOverdue: true }
    function Today() {
      useHabits(filters)
      useTotalHabitCount()
      return null
    }

    let renderer: { unmount: () => void } | undefined
    await TestRenderer.act(async () => {
      renderer = TestRenderer.create(
        React.createElement(QueryClientProvider, { client: queryClient }, React.createElement(Today)),
      )
      await Promise.resolve()
    })
    try {
      expect(mocks.apiClient).toHaveBeenCalledTimes(2)

      now += 60_000
      await TestRenderer.act(async () => { focusManager.setFocused(false); focusManager.setFocused(true); await Promise.resolve() })
      expect(mocks.apiClient).toHaveBeenCalledTimes(2)

      now += 9 * 60_000
      await TestRenderer.act(async () => { focusManager.setFocused(false); focusManager.setFocused(true); await Promise.resolve() })
      expect(mocks.apiClient).toHaveBeenCalledTimes(4)

      await TestRenderer.act(async () => { onlineManager.setOnline(false); onlineManager.setOnline(true); await Promise.resolve() })
      expect(mocks.apiClient).toHaveBeenCalledTimes(4)

      await TestRenderer.act(async () => {
        finalizeHabitMutation(queryClient, { logId: 'log-1' }, null, { habitId: 'h-1', includeCount: false })
        await Promise.resolve()
      })
      expect(mocks.apiClient).toHaveBeenCalledTimes(5)

      await TestRenderer.act(async () => {
        finalizeHabitMutation(queryClient, undefined, null, { habitId: 'h-1', includeCount: false })
        await Promise.resolve()
      })
      expect(mocks.apiClient).toHaveBeenCalledTimes(6)
    } finally {
      renderer?.unmount()
      queryClient.clear()
    }
  })
})
