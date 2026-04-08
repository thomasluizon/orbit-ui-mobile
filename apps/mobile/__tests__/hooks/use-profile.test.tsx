import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockProfile } from '@orbit/shared/__tests__/factories'
import { profileKeys } from '@orbit/shared/query'
import type { Profile } from '@orbit/shared/types/profile'

const TestRenderer = require('react-test-renderer')

const mocks = vi.hoisted(() => {
  const state = {
    profile: null as unknown as Profile,
  }

  const queryClient = {
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
    useQuery: vi.fn(() => ({
      data: state.profile,
      isLoading: false,
      isError: false,
      error: null,
    })),
    useQueryClient: vi.fn(() => queryClient),
    performQueuedApiMutation: vi.fn(async () => undefined),
    i18n: {
      language: 'en',
      changeLanguage: vi.fn(async () => undefined),
    },
  }
})

vi.mock('@tanstack/react-query', () => ({
  useQuery: mocks.useQuery,
  useQueryClient: mocks.useQueryClient,
}))

vi.mock('i18next', () => ({
  default: mocks.i18n,
}))

vi.mock('@/lib/api-client', () => ({
  apiClient: vi.fn(),
}))

vi.mock('@/lib/queued-api-mutation', () => ({
  performQueuedApiMutation: mocks.performQueuedApiMutation,
}))

import { useProfile } from '@/hooks/use-profile'

function renderHookHarness() {
  function Harness() {
    useProfile()
    return null
  }

  return TestRenderer.act(async () => {
    TestRenderer.create(<Harness />)
    await Promise.resolve()
  })
}

describe('mobile useProfile', () => {
  beforeEach(() => {
    mocks.state.profile = createMockProfile()
    mocks.queryClient.invalidateQueries.mockClear()
    mocks.queryClient.setQueryData.mockClear()
    mocks.useQuery.mockClear()
    mocks.useQueryClient.mockClear()
    mocks.performQueuedApiMutation.mockClear()
    mocks.i18n.changeLanguage.mockClear()
    mocks.i18n.language = 'en'
  })

  it('queues a timezone update when the backend profile is UTC and the device timezone is real', async () => {
    mocks.state.profile = createMockProfile({ timeZone: 'UTC' })

    const originalDateTimeFormat = Intl.DateTimeFormat
    vi.spyOn(Intl, 'DateTimeFormat').mockImplementation(
      () =>
        ({
          resolvedOptions: () => ({ timeZone: 'America/Sao_Paulo' }),
        }) as Intl.DateTimeFormat,
    )

    try {
      await renderHookHarness()
      await Promise.resolve()
    } finally {
      Intl.DateTimeFormat = originalDateTimeFormat
    }

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
  })

  it('does not queue a timezone update when the profile already has a concrete timezone', async () => {
    mocks.state.profile = createMockProfile({ timeZone: 'Europe/London' })

    await renderHookHarness()

    expect(mocks.performQueuedApiMutation).not.toHaveBeenCalled()
  })
})
