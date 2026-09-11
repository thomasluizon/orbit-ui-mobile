import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockProfile } from '@orbit/shared/__tests__/factories'
import { gamificationKeys, profileKeys } from '@orbit/shared/query'
import type { Profile } from '@orbit/shared/types/profile'

import { useTimezoneAutoSync } from '@/hooks/use-timezone-auto-sync'

const TestRenderer = require('react-test-renderer')

const mocks = vi.hoisted(() => {
  const state = {
    profile: null as unknown as Profile,
  }

  const appStateListeners: ((status: string) => void)[] = []
  const appState = {
    addEventListener: vi.fn((_event: string, listener: (status: string) => void) => {
      appStateListeners.push(listener)
      return {
        remove: vi.fn(() => {
          const idx = appStateListeners.indexOf(listener)
          if (idx >= 0) appStateListeners.splice(idx, 1)
        }),
      }
    }),
  }

  const queryClient = {
    getQueryData: vi.fn(() => state.profile),
    invalidateQueries: vi.fn(async () => {}),
    setQueryData: vi.fn((
      _queryKey: readonly unknown[],
      updater: Profile | ((old: Profile | undefined) => Profile | undefined),
    ) => {
      state.profile = typeof updater === 'function'
        ? updater(state.profile) ?? state.profile
        : updater
    }),
  }

  return {
    state,
    queryClient,
    appState,
    appStateListeners,
    useQueryClient: vi.fn(() => queryClient),
    performQueuedApiMutation: vi.fn((): Promise<unknown> => Promise.resolve(undefined)),
  }
})

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: mocks.useQueryClient,
}))

vi.mock('react-native', () => ({
  AppState: mocks.appState,
}))

vi.mock('@/lib/queued-api-mutation', () => ({
  performQueuedApiMutation: mocks.performQueuedApiMutation,
  isQueuedResult: (value: unknown) =>
    typeof value === 'object' && value !== null && 'queued' in value && value.queued === true,
}))

function renderHookHarness(profile: Profile | undefined) {
  function Harness() {
    useTimezoneAutoSync(profile)
    return null
  }

  return TestRenderer.act(async () => {
    TestRenderer.create(<Harness />)
    await Promise.resolve()
  })
}

function withDetectedTimezone(zone: string, fn: () => Promise<void>) {
  const original = Intl.DateTimeFormat
  vi.spyOn(Intl, 'DateTimeFormat').mockImplementation(
    () =>
      ({
        resolvedOptions: () => ({ timeZone: zone }),
      }) as Intl.DateTimeFormat,
  )
  return fn().finally(() => {
    Intl.DateTimeFormat = original
  })
}

describe('mobile useTimezoneAutoSync', () => {
  beforeEach(() => {
    mocks.state.profile = createMockProfile()
    mocks.queryClient.getQueryData.mockClear()
    mocks.queryClient.setQueryData.mockClear()
    mocks.queryClient.invalidateQueries.mockClear()
    mocks.useQueryClient.mockClear()
    mocks.performQueuedApiMutation.mockReset()
    mocks.performQueuedApiMutation.mockResolvedValue(undefined)
    mocks.appState.addEventListener.mockClear()
    mocks.appStateListeners.length = 0
  })

  it('queues a timezone update when the account has none', async () => {
    mocks.state.profile = createMockProfile({ timeZone: null })

    await withDetectedTimezone('America/Sao_Paulo', async () => {
      await renderHookHarness(mocks.state.profile)
      await Promise.resolve()
    })

    expect(mocks.performQueuedApiMutation).toHaveBeenCalledWith({
      type: 'setTimeZone',
      scope: 'profile',
      endpoint: '/api/profile/timezone',
      method: 'PUT',
      payload: { timeZone: 'America/Sao_Paulo' },
      dedupeKey: 'profile-timezone-auto',
    })

    expect(mocks.queryClient.setQueryData).toHaveBeenCalledWith(
      profileKeys.detail(),
      expect.any(Function),
    )
    expect(mocks.state.profile.timeZone).toBe('America/Sao_Paulo')
    expect(mocks.queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: gamificationKeys.all,
      refetchType: 'none',
    })
  })

  it('keeps the timezone empty while its first update is queued', async () => {
    mocks.state.profile = createMockProfile({ timeZone: null })
    mocks.performQueuedApiMutation.mockResolvedValue({
      queued: true,
      queuedMutationId: 'offline-mutation-1',
    })

    await withDetectedTimezone('Pacific/Kiritimati', async () => {
      await renderHookHarness(mocks.state.profile)
      await Promise.resolve()
    })

    expect(mocks.state.profile.timeZone).toBeNull()
    expect(mocks.queryClient.setQueryData).not.toHaveBeenCalled()
    expect(mocks.queryClient.invalidateQueries).not.toHaveBeenCalled()
  })

  it('does not overwrite a saved timezone', async () => {
    mocks.state.profile = createMockProfile({ timeZone: 'Europe/London' })

    await withDetectedTimezone('America/New_York', async () => {
      await renderHookHarness(mocks.state.profile)
    })

    expect(mocks.performQueuedApiMutation).not.toHaveBeenCalled()
  })

  it('preserves a saved timezone when the device moves', async () => {
    mocks.state.profile = createMockProfile({ timeZone: 'America/New_York' })

    await withDetectedTimezone('Europe/London', async () => {
      await renderHookHarness(mocks.state.profile)
      await Promise.resolve()
    })

    expect(mocks.performQueuedApiMutation).not.toHaveBeenCalled()
  })

  it('registers an AppState listener for resume events', async () => {
    await renderHookHarness(mocks.state.profile)

    expect(mocks.appState.addEventListener).toHaveBeenCalledWith(
      'change',
      expect.any(Function),
    )
    expect(mocks.appStateListeners.length).toBeGreaterThan(0)
  })
})
