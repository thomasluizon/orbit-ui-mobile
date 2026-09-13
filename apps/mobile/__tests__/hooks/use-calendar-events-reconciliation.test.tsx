import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import TestRenderer from 'react-test-renderer'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { API } from '@orbit/shared/api'
import { createApiClientError } from '@orbit/shared/utils'
import type { CalendarAutoSyncState } from '@orbit/shared/types/calendar'
import { useCalendarEvents } from '@/hooks/use-calendar-events'
import { useCalendarAutoSyncState } from '@/hooks/use-calendar-auto-sync'
import { CalendarSyncBoundary } from '@/app/(tabs)/calendar/_components/calendar-sync-boundary'
import { createTokensV2 } from '@/lib/theme'

const mocks = vi.hoisted(() => ({
  apiClient: vi.fn(),
}))

vi.mock('react-native', async () => {
  const reactNative = await import('../../test-mocks/react-native')
  return { ...reactNative, default: reactNative }
})

vi.mock('@/lib/api-client', () => ({
  apiClient: mocks.apiClient,
}))

vi.mock('@/components/ui/icons', () => ({
  RefreshCw: () => React.createElement('RefreshCwMock'),
}))

vi.mock('@/components/ui/switch', () => ({
  Switch: ({ checked, label }: { checked: boolean; label: string }) =>
    React.createElement('SwitchMock', {
      accessibilityLabel: label,
      accessibilityState: { checked },
    }),
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

  it('removes the connected switch when a later events response reports a revoked grant', async () => {
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
    mocks.apiClient.mockImplementation((path: string) => {
      if (path === API.calendar.events) {
        return new Promise((_resolve, reject) => {
          rejectEvents = reject
        })
      }
      if (path === API.calendar.autoSyncState) {
        return Promise.resolve(connectedState)
      }
      throw new Error(`Unexpected API request: ${path}`)
    })

    function CalendarSyncHarness() {
      useCalendarEvents()
      const { data: autoSyncState } = useCalendarAutoSyncState()
      return (
        <CalendarSyncBoundary
          hasProAccess
          autoSyncState={autoSyncState}
          displayTime={(time) => time}
          onAutoSyncChange={async () => {}}
          onOpenPro={() => {}}
          t={((key: string) => key) as never}
          tokens={createTokensV2('purple', 'dark')}
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
      await vi.waitFor(() => expect(findSwitches()).toHaveLength(1))
    })
    expect(findSwitches()[0]?.props.accessibilityState).toEqual({ checked: true })

    await TestRenderer.act(async () => {
      rejectEvents(createApiClientError(
        400,
        {
          error: 'Google Calendar connection expired. Please reconnect.',
          errorCode: 'CALENDAR_NOT_CONNECTED',
        },
        'Request failed: 400',
      ))
      await Promise.resolve()
    })

    await vi.waitFor(() => expect(findSwitches()).toHaveLength(0))
  })
})
