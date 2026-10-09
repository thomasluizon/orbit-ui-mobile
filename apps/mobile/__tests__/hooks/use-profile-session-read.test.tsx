import React from 'react'
import type { ReactTestRenderer } from 'react-test-renderer'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { API } from '@orbit/shared/api'
import { profileKeys } from '@orbit/shared/query'
import { createMockProfile } from '@orbit/shared/__tests__/factories'
import { useProfile } from '@/hooks/use-profile'
import { apiClient } from '@/lib/api-client'

const TestRenderer = require('react-test-renderer')
const mocks = vi.hoisted(() => ({
  isAuthenticated: false,
  i18n: { language: 'en', changeLanguage: vi.fn(async () => {}) },
}))

vi.mock('react-i18next', () => ({ useTranslation: () => ({ i18n: mocks.i18n }) }))
vi.mock('@/lib/api-client', () => ({ apiClient: vi.fn() }))
vi.mock('@/stores/auth-store', () => ({
  useAuthStore: (selector: (state: { isAuthenticated: boolean }) => unknown) =>
    selector({ isAuthenticated: mocks.isAuthenticated }),
}))

describe('mobile profile reads before session validation', () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  let renderer: ReactTestRenderer | undefined
  let observed: ReturnType<typeof useProfile> | undefined

  function Harness({ enabled }: { enabled?: boolean }) {
    observed = useProfile({ enabled })
    return null
  }

  function QueryHarness({ enabled }: { enabled?: boolean }) {
    return <QueryClientProvider client={queryClient}><Harness enabled={enabled} /></QueryClientProvider>
  }

  beforeEach(() => {
    mocks.isAuthenticated = false
    mocks.i18n.changeLanguage.mockClear()
    vi.mocked(apiClient).mockReset()
    observed = undefined
  })

  afterEach(async () => {
    await TestRenderer.act(() => { renderer?.update(<></>) })
    queryClient.clear()
  })

  it('starts the read before validation and keeps language writes behind validation', async () => {
    const profile = createMockProfile({ language: 'pt-BR' })
    vi.mocked(apiClient).mockResolvedValue(profile)

    await TestRenderer.act(() => { renderer = TestRenderer.create(<QueryHarness />) })
    await vi.waitFor(() => expect(apiClient).toHaveBeenCalledWith(API.profile.get))
    await vi.waitFor(() => expect(queryClient.getQueryData(profileKeys.detail())).toEqual(profile))
    expect(observed?.profile).toBeUndefined()
    expect(mocks.i18n.changeLanguage).not.toHaveBeenCalled()

    mocks.isAuthenticated = true
    await TestRenderer.act(() => { renderer?.update(<QueryHarness />) })

    expect(observed?.profile).toEqual(profile)
    expect(mocks.i18n.changeLanguage).toHaveBeenCalledWith('pt-BR')
  })

  it('honors an explicitly disabled read before validation', async () => {
    await TestRenderer.act(() => { renderer = TestRenderer.create(<QueryHarness enabled={false} />) })

    expect(apiClient).not.toHaveBeenCalled()
    expect(observed?.isFetching).toBe(false)
    expect(observed?.isLoading).toBe(false)
  })
})
