import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockProfile } from '@orbit/shared/__tests__/factories'
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
    getQueryData: vi.fn(() => state.profile),
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
    mocks.queryClient.getQueryData.mockClear()
    mocks.useQuery.mockClear()
    mocks.useQueryClient.mockClear()
    mocks.i18n.changeLanguage.mockClear()
    mocks.i18n.language = 'en'
  })

  it('renders without error and exposes profile data', async () => {
    mocks.state.profile = createMockProfile({ email: 'thomas@example.com' })

    await renderHookHarness()

    expect(mocks.useQuery).toHaveBeenCalled()
    expect(mocks.state.profile.email).toBe('thomas@example.com')
  })

  it('syncs i18n language when profile language differs', async () => {
    mocks.state.profile = createMockProfile({ language: 'pt-BR' })
    mocks.i18n.language = 'en'

    await renderHookHarness()

    expect(mocks.i18n.changeLanguage).toHaveBeenCalledWith('pt-BR')
  })
})
