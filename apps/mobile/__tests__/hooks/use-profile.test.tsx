import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockProfile } from '@orbit/shared/__tests__/factories'
import type { Profile } from '@orbit/shared/types/profile'

import { useCanViewGamification, useProfile } from '@/hooks/use-profile'

const TestRenderer = require('react-test-renderer')

const mocks = vi.hoisted(() => {
  const state = {
    profile: null as unknown as Profile,
    isAuthenticated: true,
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

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ i18n: mocks.i18n, t: (key: string) => key }),
}))

vi.mock('@/lib/api-client', () => ({
  apiClient: vi.fn(),
}))

vi.mock('@/stores/auth-store', () => ({
  useAuthStore: (selector: (state: { isAuthenticated: boolean }) => unknown) =>
    selector({ isAuthenticated: mocks.state.isAuthenticated }),
}))

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
    mocks.state.isAuthenticated = true
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

  it('invalidates and patches the cached profile', () => {
    mocks.state.profile = createMockProfile({ name: 'Original' })
    const holder: { current: ReturnType<typeof useProfile> | null } = { current: null }

    function Harness() {
      holder.current = useProfile()
      return null
    }

    TestRenderer.act(() => {
      TestRenderer.create(<Harness />)
    })

    TestRenderer.act(() => {
      holder.current?.invalidate()
      holder.current?.patchProfile({ name: 'Patched' })
    })

    expect(mocks.queryClient.invalidateQueries).toHaveBeenCalled()
    expect(mocks.state.profile.name).toBe('Patched')
  })

  it('leaves an empty cache untouched when patching before the profile loads', () => {
    mocks.state.profile = null as unknown as Profile
    const holder: { current: ReturnType<typeof useProfile> | null } = { current: null }

    function Harness() {
      holder.current = useProfile()
      return null
    }

    TestRenderer.act(() => {
      TestRenderer.create(<Harness />)
    })

    TestRenderer.act(() => {
      holder.current?.patchProfile({ name: 'Ignored' })
    })

    expect(mocks.state.profile).toBeNull()
  })

  it('derives gamification visibility from the profile flag', () => {
    mocks.state.profile = createMockProfile({ canViewGamification: true })
    const holder: { current: boolean } = { current: false }

    function Harness() {
      holder.current = useCanViewGamification()
      return null
    }

    TestRenderer.act(() => {
      TestRenderer.create(<Harness />)
    })

    expect(holder.current).toBe(true)
  })
})
