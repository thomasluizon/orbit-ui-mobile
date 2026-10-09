import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import TestRenderer from 'react-test-renderer'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { API } from '@orbit/shared/api'
import { calendarKeys } from '@orbit/shared/query'
import { createApiClientError, isCalendarSyncConnectionActive, runCalendarSyncNowWithFeedback } from '@orbit/shared/utils'
import type { CalendarAutoSyncState } from '@orbit/shared/types/calendar'
import { queryClient as productionClient } from '@/lib/query-client'
import { createMockCalendarSyncEvent } from '@orbit/shared/__tests__/factories'
import { useCalendarEvents } from '@/hooks/use-calendar-events'
import { useCalendarAutoSyncState, useRunCalendarSyncNow } from '@/hooks/use-calendar-auto-sync'
import { CalendarSyncBoundary } from '@/app/(tabs)/calendar/_components/calendar-sync-boundary'
import { createTokensV2 } from '@/lib/theme'
import { advanceAccountGeneration, getAccountGeneration } from '@/lib/session-epoch'

const mocks = vi.hoisted(() => ({
  apiClient: vi.fn(),
}))

vi.mock('@/hooks/use-offline', () => ({ useOffline: () => ({ isOnline: true }) }))

vi.mock('react-native', async () => {
  const reactNative = await import('../../test-mocks/react-native')
  return { ...reactNative, default: reactNative }
})

vi.mock('@/lib/api-client', () => ({
  apiClient: mocks.apiClient,
}))

vi.mock('@/components/ui/switch', () => ({
  Switch: ({ checked, label }: { checked: boolean; label: string }) =>
    React.createElement('SwitchMock', {
      accessibilityLabel: label,
      accessibilityState: { checked },
    }),
}))

vi.mock('@/components/ui/pill-button', () => ({
  PillButton: ({ children, loading, disabled, onClick }: {
    children: string
    loading: boolean
    disabled: boolean
    onClick: () => void
  }) => React.createElement('SyncButtonMock', { loading, disabled, onClick }, children),
}))

interface TestNode {
  type: unknown
  props: Record<string, unknown>
  findAll: (predicate: (node: TestNode) => boolean) => TestNode[]
}

describe('mobile calendar events reconciliation', () => {
  beforeEach(() => {
    mocks.apiClient.mockReset()
  })

  it('keeps calendar events pending through Retry-After and recovers', async () => {
    productionClient.clear()
    vi.useFakeTimers()
    const events = [createMockCalendarSyncEvent()]
    mocks.apiClient.mockRejectedValueOnce(createApiClientError(429, null, 'Unavailable', '60'))
      .mockResolvedValue(events)
    let state: ReturnType<typeof useCalendarEvents> | undefined
    function Harness() {
      state = useCalendarEvents({ timeZone: 'UTC' })
      return null
    }
    let tree: TestRenderer.ReactTestRenderer | undefined
    try {
      await TestRenderer.act(async () => {
        tree = TestRenderer.create(<QueryClientProvider client={productionClient}><Harness /></QueryClientProvider>)
        await Promise.resolve()
      })
      await TestRenderer.act(async () => { await vi.advanceTimersByTimeAsync(59_999) })
      expect(state?.isPending).toBe(true)
      expect(state?.isError).toBe(false)
      expect(mocks.apiClient).toHaveBeenCalledOnce()
      await TestRenderer.act(async () => { await vi.advanceTimersByTimeAsync(2) })
      expect(state?.data).toEqual({ status: 'connected', events })
      expect(state?.isError).toBe(false)
    } finally {
      await TestRenderer.act(async () => {
        if (tree) (tree as unknown as { unmount: () => void }).unmount()
        await Promise.resolve()
      })
      productionClient.clear()
      vi.useRealTimers()
    }
  })

  it.each(['CALENDAR_NOT_CONNECTED', 'CALENDAR_RECONNECT_REQUIRED'])(
    'does not let a pending connected state restore a revoked grant after %s',
    async (errorCode) => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    const connectedState: CalendarAutoSyncState = {
      enabled: true,
      status: 'Idle',
      lastSyncedAt: '2026-09-12T09:12:00Z',
      hasGoogleConnection: true,
    }
    let rejectEvents!: (error: unknown) => void
    let resolveAutoSyncState!: () => void
    mocks.apiClient.mockImplementation((path: string) => {
      if (path === `${API.calendar.events}?includeImported=true`) {
        return new Promise((_resolve, reject) => {
          rejectEvents = reject
        })
      }
      if (path === API.calendar.autoSyncState) {
        return new Promise((resolve) => {
          resolveAutoSyncState = () => resolve(connectedState)
        })
      }
      throw new Error(`Unexpected API request: ${path}`)
    })

    function CalendarSyncHarness() {
      useCalendarEvents({ timeZone: 'UTC' })
      const { data: autoSyncState } = useCalendarAutoSyncState()
      return (
        <CalendarSyncBoundary
          isConnected={isCalendarSyncConnectionActive(autoSyncState?.hasGoogleConnection ?? false, autoSyncState?.status ?? 'Idle')}
          autoSyncState={autoSyncState}
          onAutoSyncChange={async () => {}}
          onSyncNow={async () => {}}
          t={((key: string) => key) as never} locale="en" tokens={createTokensV2('purple', 'dark')}
        />
      )
    }

    let tree!: TestRenderer.ReactTestRenderer
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(
        <QueryClientProvider client={queryClient}>
          <CalendarSyncHarness />
        </QueryClientProvider>,
      )
      await Promise.resolve()
    })

    const findSwitches = () => (tree.root as unknown as TestNode).findAll(
      (node) => node.type === 'SwitchMock',
    )
    await TestRenderer.act(async () => {
      await vi.waitFor(() => expect(mocks.apiClient).toHaveBeenCalledTimes(2))
    })

    await TestRenderer.act(async () => {
      rejectEvents(createApiClientError(
        400,
        {
          error: 'Google Calendar connection expired. Please reconnect.',
          errorCode,
        },
        'Request failed: 400',
      ))
      await Promise.resolve()
    })

    await vi.waitFor(() => {
      expect(queryClient.getQueryData([
        ...calendarKeys.all,
        'manual-fetch',
        'UTC',
      ])).toEqual({ status: 'not-connected' })
    })

    await TestRenderer.act(async () => {
      resolveAutoSyncState()
      await Promise.resolve()
      await Promise.resolve()
    })
    await vi.waitFor(() => expect(queryClient.isFetching({
      queryKey: calendarKeys.autoSyncState(),
    })).toBe(0))

    expect(queryClient.getQueryData(calendarKeys.autoSyncState()))
      .not.toMatchObject({ hasGoogleConnection: true })
    expect(findSwitches()).toHaveLength(0)
    },
  )
})

describe('mobile Calendar Sync now control', () => {
  const autoSyncState: CalendarAutoSyncState = {
    enabled: false,
    status: 'Idle',
    lastSyncedAt: null,
    hasGoogleConnection: true,
  }

  beforeEach(() => { mocks.apiClient.mockReset() })

  it('runs the mutation, reports a failure, and lets the next account sync while the old request is pending', async () => {
    const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false }, queries: { retry: false } } })
    const reportedErrors: string[] = []
    let failOld!: (error: Error) => void
    mocks.apiClient
      .mockRejectedValueOnce(new Error('Sync failed'))
      .mockImplementationOnce(() => new Promise((_resolve, reject) => { failOld = reject }))
      .mockResolvedValueOnce({ newSuggestions: 0, reconciledHabits: 0, status: 'Idle' })

    function Harness() {
      const mutation = useRunCalendarSyncNow()
      return <CalendarSyncBoundary
        isConnected={isCalendarSyncConnectionActive(autoSyncState.hasGoogleConnection, autoSyncState.status)}
        autoSyncState={autoSyncState}
        onAutoSyncChange={() => Promise.resolve()}
        onSyncNow={() => runCalendarSyncNowWithFeedback(
          () => mutation.mutateAsync(),
          (error) => { reportedErrors.push((error as Error).message) },
          getAccountGeneration,
        )}
        t={((key: string) => key) as never} locale="en" tokens={createTokensV2('purple', 'dark')}
      />
    }

    let tree!: TestRenderer.ReactTestRenderer
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(<QueryClientProvider client={queryClient}><Harness /></QueryClientProvider>)
      await Promise.resolve()
    })
    const button = () => (tree.root as unknown as TestNode).findAll((node) => node.type === 'SyncButtonMock')[0]!

    await TestRenderer.act(async () => { (button().props.onClick as () => void)(); await Promise.resolve() })
    await vi.waitFor(() => expect(mocks.apiClient).toHaveBeenCalledWith(API.calendar.autoSyncRun, { method: 'POST' }))
    await vi.waitFor(() => expect(reportedErrors).toEqual(['Sync failed']))
    expect(button().props.loading).toBe(false)

    await TestRenderer.act(async () => { (button().props.onClick as () => void)(); await Promise.resolve() })
    await vi.waitFor(() => expect(button().props.loading).toBe(true))
    await TestRenderer.act(async () => { advanceAccountGeneration(); await Promise.resolve() })
    expect(button().props.loading).toBe(false)

    await TestRenderer.act(async () => { (button().props.onClick as () => void)(); await Promise.resolve() })
    await vi.waitFor(() => expect(mocks.apiClient).toHaveBeenCalledTimes(3))
    await TestRenderer.act(async () => {
      failOld(new Error('Old account failure'))
      await Promise.resolve()
    })
    expect(button().props.loading).toBe(false)
    expect(reportedErrors).toEqual(['Sync failed'])
    await TestRenderer.act(async () => {
      (tree as unknown as { unmount: () => void }).unmount()
      await Promise.resolve()
    })
  })
})
