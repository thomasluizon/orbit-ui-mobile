import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { renderToString } from 'react-dom/server'
import { hydrateRoot } from 'react-dom/client'
import { profileKeys } from '@orbit/shared/query'
import { useProfile, useHasProAccess, useCurrentPlan, useTrialExpired, useTrialUrgent, useIsYearlyPro } from '@/hooks/use-profile'
import { ApiError } from '@/lib/api-fetch'
import { useAppToastStore } from '@/stores/app-toast-store'
import { createMockProfile } from '@orbit/shared/__tests__/factories'
import type { Profile } from '@orbit/shared/types/profile'

const PINNED_TEST_TIME = new Date('2026-09-12T09:00:00.000Z')
vi.setSystemTime(PINNED_TEST_TIME)
beforeEach(() => vi.setSystemTime(PINNED_TEST_TIME))
afterEach(() => vi.useRealTimers())

const boundaryMocks = vi.hoisted(() => ({
  toastError: vi.fn(),
  logout: vi.fn(),
  confirmSessionRefreshFailure: vi.fn(),
  recoverSessionRefreshFailure: vi.fn(),
}))

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)


vi.mock('@/stores/auth-store', () => ({
  useAuthStore: {
    getState: () => ({
      logout: boundaryMocks.logout,
      confirmSessionRefreshFailure: boundaryMocks.confirmSessionRefreshFailure,
      recoverSessionRefreshFailure: boundaryMocks.recoverSessionRefreshFailure,
    }),
  },
}))

vi.mock('next-intl', () => ({
  useLocale: () => 'en',
}))

vi.mock('@/lib/actions/profile', () => ({
  updateThemePreference: vi.fn().mockResolvedValue(undefined),
  updateColorScheme: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/hooks/use-color-scheme', () => ({
  useColorScheme: () => ({
    scheme: null,
    mode: 'dark',
    definition: null,
    setScheme: vi.fn(),
    setMode: vi.fn(),
    syncSchemeFromProfile: vi.fn(),
    syncThemeFromProfile: vi.fn(),
    detectAndSaveSchemeIfNeeded: vi.fn(),
    detectAndSaveThemeIfNeeded: vi.fn(),
  }),
}))

let queryClient: QueryClient

function createWrapper() {
  queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  })
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(
      QueryClientProvider,
      { client: queryClient },
      children,
    )
  }
}

function mockProfileResponse(profile: Profile) {
  mockFetch.mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(profile),
  })
}

function mockErrorResponse(
  status: number,
  body: unknown = {},
  headers?: HeadersInit,
) {
  mockFetch.mockResolvedValue({
    ok: false,
    status,
    headers: new Headers(headers),
    json: () => Promise.resolve(body),
  })
}

function apiErrorFrom(error: unknown): ApiError {
  if (!(error instanceof ApiError)) {
    throw new Error(`expected an ApiError, received ${String(error)}`)
  }
  return error
}

describe('useProfile', () => {
  it('keeps the first client profile and loading state equal to the server render', async () => {
    function ProfileStatus() {
      const { profile, isLoading } = useProfile({ enabled: false })
      return React.createElement('span', null, isLoading ? 'loading' : profile?.name)
    }
    const serverClient = new QueryClient()
    const html = renderToString(React.createElement(QueryClientProvider, { client: serverClient }, React.createElement(ProfileStatus)))
    expect(html).toContain('loading')
    const container = document.createElement('div')
    container.innerHTML = html
    document.body.append(container)

    const client = new QueryClient()
    client.setQueryData(profileKeys.detail(), createMockProfile({ name: 'Alex' }))
    const recoverableError = vi.fn()
    let root: ReturnType<typeof hydrateRoot> | undefined
    await act(async () => {
      root = hydrateRoot(container, React.createElement(QueryClientProvider, { client }, React.createElement(ProfileStatus)), {
        onRecoverableError: recoverableError,
      })
    })
    expect(recoverableError).not.toHaveBeenCalled()
    expect(container).toHaveTextContent('Alex')
    await act(async () => root?.unmount())
    container.remove()
    client.clear()
    serverClient.clear()
  })
  beforeEach(() => {
    mockFetch.mockReset()
    boundaryMocks.toastError.mockClear()
    useAppToastStore.setState({ showError: boundaryMocks.toastError, currentToast: null, queue: [] })
    boundaryMocks.logout.mockClear()
    boundaryMocks.confirmSessionRefreshFailure.mockClear()
    boundaryMocks.recoverSessionRefreshFailure.mockClear()
  })

  it('fetches and returns profile data', async () => {
    const profile = createMockProfile({ name: 'Alex' })
    mockProfileResponse(profile)

    const { result } = renderHook(() => useProfile(), {
      wrapper: createWrapper(),
    })

    expect(result.current.isFetching).toBe(true)
    await act(async () => { await result.current.refetch({ cancelRefetch: false, throwOnError: true }) })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.profile).toBeDefined()
    expect(result.current.profile!.name).toBe('Alex')
    expect(result.current.profile!.email).toBe('alex@example.com')
  })

  it('returns undefined profile while loading', () => {
    mockFetch.mockReturnValue(new Promise(() => {}))

    const { result } = renderHook(() => useProfile(), {
      wrapper: createWrapper(),
    })

    expect(result.current.profile).toBeUndefined()
    expect(result.current.isLoading).toBe(true)
  })

  it('seeds a profile query already opened by the app shell', () => {
    const profile = createMockProfile()

    const { result } = renderHook(() => {
      const shell = useProfile({ enabled: false })
      const today = useProfile({ enabled: false, initialData: profile })
      const habitList = useProfile({ enabled: false })
      return { shell, today, habitList }
    }, { wrapper: createWrapper() })

    expect(result.current.today.profile).toEqual(profile)
    expect(result.current.habitList.profile).toEqual(profile)
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('surfaces a 401 and exposes the failed-refresh sign-in state', async () => {
    mockErrorResponse(
      401,
      { error: 'Unauthorized' },
      { 'x-orbit-session-refresh': 'failed' },
    )

    const { result } = renderHook(() => useProfile(), {
      wrapper: createWrapper(),
    })

    expect(result.current.isFetching).toBe(true)
    await act(async () => { await expect(result.current.refetch({ cancelRefetch: false, throwOnError: true })).rejects.toThrow() })
    await waitFor(() => expect(result.current.isError).toBe(true))

    expect(result.current.isSuccess).toBe(false)
    expect(result.current.profile).toBeUndefined()
    expect(apiErrorFrom(result.current.error).status).toBe(401)
    expect(boundaryMocks.confirmSessionRefreshFailure).toHaveBeenCalledTimes(1)
    expect(boundaryMocks.logout).not.toHaveBeenCalled()
    expect(boundaryMocks.toastError).not.toHaveBeenCalled()
  })

  it('surfaces a 404 as an ApiError and raises a categorized error toast', async () => {
    mockErrorResponse(404, { error: 'Profile not found' })

    const { result } = renderHook(() => useProfile(), {
      wrapper: createWrapper(),
    })

    expect(result.current.isFetching).toBe(true)
    await act(async () => { await expect(result.current.refetch({ cancelRefetch: false, throwOnError: true })).rejects.toThrow() })
    await waitFor(() => expect(result.current.isError).toBe(true))

    expect(result.current.isSuccess).toBe(false)
    expect(result.current.profile).toBeUndefined()
    expect(apiErrorFrom(result.current.error).status).toBe(404)
    expect(boundaryMocks.toastError).toHaveBeenCalledWith(
      'Not found: Profile not found',
    )
    expect(boundaryMocks.logout).not.toHaveBeenCalled()
  })

  it('surfaces a 500 as an ApiError with a server-error toast, not a silent success', async () => {
    mockErrorResponse(500, { error: 'Internal error' })

    const { result } = renderHook(() => useProfile(), {
      wrapper: createWrapper(),
    })

    expect(result.current.isFetching).toBe(true)
    await act(async () => { await expect(result.current.refetch({ cancelRefetch: false, throwOnError: true })).rejects.toThrow() })
    await waitFor(() => expect(result.current.isError).toBe(true))

    expect(result.current.isSuccess).toBe(false)
    expect(result.current.profile).toBeUndefined()
    expect(apiErrorFrom(result.current.error).status).toBe(500)
    expect(boundaryMocks.toastError).toHaveBeenCalledWith(
      'Server error: Internal error',
    )
  })

  it('surfaces a 503 gateway failure as a server error', async () => {
    mockErrorResponse(503)

    const { result } = renderHook(() => useProfile(), {
      wrapper: createWrapper(),
    })

    expect(result.current.isFetching).toBe(true)
    await act(async () => { await expect(result.current.refetch({ cancelRefetch: false, throwOnError: true })).rejects.toThrow() })
    await waitFor(() => expect(result.current.isError).toBe(true))

    expect(apiErrorFrom(result.current.error).status).toBe(503)
    expect(boundaryMocks.toastError).toHaveBeenCalledWith('Server error')
  })

  it('exposes invalidate helper', async () => {
    const profile = createMockProfile()
    mockProfileResponse(profile)

    const { result } = renderHook(() => useProfile(), {
      wrapper: createWrapper(),
    })

    expect(result.current.isFetching).toBe(true)
    await act(async () => { await result.current.refetch({ cancelRefetch: false, throwOnError: true }) })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(typeof result.current.invalidate).toBe('function')
  })

  it('exposes patchProfile helper', async () => {
    const profile = createMockProfile()
    mockProfileResponse(profile)

    const { result } = renderHook(() => useProfile(), {
      wrapper: createWrapper(),
    })

    expect(result.current.isFetching).toBe(true)
    await act(async () => { await result.current.refetch({ cancelRefetch: false, throwOnError: true }) })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(typeof result.current.patchProfile).toBe('function')
  })

  it('patchProfile updates the profile in query cache', async () => {
    const profile = createMockProfile({ name: 'Alex' })
    mockProfileResponse(profile)

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    function Wrapper({ children }: { children: React.ReactNode }) {
      return React.createElement(
        QueryClientProvider,
        { client: queryClient },
        children,
      )
    }

    const { result } = renderHook(() => useProfile(), { wrapper: Wrapper })

    expect(result.current.isFetching).toBe(true)
    await act(async () => { await result.current.refetch({ cancelRefetch: false, throwOnError: true }) })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    const { profileKeys } = await import('@orbit/shared/query')
    act(() => {
      result.current.patchProfile({ name: 'Updated' })
    })

    const cached = queryClient.getQueryData<Profile>(profileKeys.detail())
    expect(cached?.name).toBe('Updated')
  })

})

describe('useHasProAccess', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  it('returns false for free user', async () => {
    mockProfileResponse(createMockProfile({ hasProAccess: false }))

    const { result } = renderHook(() => useHasProAccess(), {
      wrapper: createWrapper(),
    })

    expect(mockFetch).toHaveBeenCalled()
    await act(async () => {
      await queryClient.refetchQueries({ queryKey: profileKeys.detail() }, { cancelRefetch: false, throwOnError: true })
    })
    await waitFor(() => expect(result.current).toBe(false))
  })

  it('returns true for pro user', async () => {
    mockProfileResponse(createMockProfile({ hasProAccess: true, plan: 'pro' }))

    const { result } = renderHook(() => useHasProAccess(), {
      wrapper: createWrapper(),
    })

    expect(mockFetch).toHaveBeenCalled()
    await act(async () => {
      await queryClient.refetchQueries({ queryKey: profileKeys.detail() }, { cancelRefetch: false, throwOnError: true })
    })
    await waitFor(() => expect(result.current).toBe(true))
  })
})

describe('useCurrentPlan', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  it('returns Free for free user', async () => {
    mockProfileResponse(createMockProfile({ plan: 'free', hasProAccess: false, isTrialActive: false }))

    const { result } = renderHook(() => useCurrentPlan(), {
      wrapper: createWrapper(),
    })

    expect(mockFetch).toHaveBeenCalled()
    await act(async () => {
      await queryClient.refetchQueries({ queryKey: profileKeys.detail() }, { cancelRefetch: false, throwOnError: true })
    })
    await waitFor(() => expect(result.current).toBe('Free'))
  })

  it('returns Trial for trial user', async () => {
    mockProfileResponse(createMockProfile({ isTrialActive: true }))

    const { result } = renderHook(() => useCurrentPlan(), {
      wrapper: createWrapper(),
    })

    expect(mockFetch).toHaveBeenCalled()
    await act(async () => {
      await queryClient.refetchQueries({ queryKey: profileKeys.detail() }, { cancelRefetch: false, throwOnError: true })
    })
    await waitFor(() => expect(result.current).toBe('Trial'))
  })

  it('returns Pro for pro user', async () => {
    mockProfileResponse(createMockProfile({ plan: 'pro', hasProAccess: true, isTrialActive: false }))

    const { result } = renderHook(() => useCurrentPlan(), {
      wrapper: createWrapper(),
    })

    expect(mockFetch).toHaveBeenCalled()
    await act(async () => {
      await queryClient.refetchQueries({ queryKey: profileKeys.detail() }, { cancelRefetch: false, throwOnError: true })
    })
    await waitFor(() => expect(result.current).toBe('Pro'))
  })
})

describe('useTrialExpired', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  it('returns false when no trial', async () => {
    mockProfileResponse(createMockProfile({ trialEndsAt: null }))

    const { result } = renderHook(() => useTrialExpired(), {
      wrapper: createWrapper(),
    })

    expect(mockFetch).toHaveBeenCalled()
    await act(async () => {
      await queryClient.refetchQueries({ queryKey: profileKeys.detail() }, { cancelRefetch: false, throwOnError: true })
    })
    await waitFor(() => expect(result.current).toBe(false))
  })

  it('returns true when trial ended and user is on free plan', async () => {
    mockProfileResponse(
      createMockProfile({
        trialEndsAt: '2025-01-01T00:00:00Z',
        isTrialActive: false,
        plan: 'free',
      }),
    )

    const { result } = renderHook(() => useTrialExpired(), {
      wrapper: createWrapper(),
    })

    expect(mockFetch).toHaveBeenCalled()
    await act(async () => {
      await queryClient.refetchQueries({ queryKey: profileKeys.detail() }, { cancelRefetch: false, throwOnError: true })
    })
    await waitFor(() => expect(result.current).toBe(true))
  })

  it('returns false when trial is still active', async () => {
    mockProfileResponse(
      createMockProfile({
        trialEndsAt: '2099-01-01T00:00:00Z',
        isTrialActive: true,
        plan: 'free',
      }),
    )

    const { result } = renderHook(() => useTrialExpired(), {
      wrapper: createWrapper(),
    })

    expect(mockFetch).toHaveBeenCalled()
    await act(async () => {
      await queryClient.refetchQueries({ queryKey: profileKeys.detail() }, { cancelRefetch: false, throwOnError: true })
    })
    await waitFor(() => expect(result.current).toBe(false))
  })
})

describe('useTrialUrgent', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  it('returns true when trial ends within 2 days', async () => {
    const soon = new Date()
    soon.setDate(soon.getDate() + 1)
    mockProfileResponse(
      createMockProfile({
        trialEndsAt: soon.toISOString(),
        isTrialActive: true,
      }),
    )

    const { result } = renderHook(() => useTrialUrgent(), {
      wrapper: createWrapper(),
    })

    expect(mockFetch).toHaveBeenCalled()
    await act(async () => {
      await queryClient.refetchQueries({ queryKey: profileKeys.detail() }, { cancelRefetch: false, throwOnError: true })
    })
    await waitFor(() => expect(result.current).toBe(true))
  })

  it('returns false when trial has more than 2 days left', async () => {
    const future = new Date()
    future.setDate(future.getDate() + 10)
    mockProfileResponse(
      createMockProfile({
        trialEndsAt: future.toISOString(),
        isTrialActive: true,
      }),
    )

    const { result } = renderHook(() => useTrialUrgent(), {
      wrapper: createWrapper(),
    })

    expect(mockFetch).toHaveBeenCalled()
    await act(async () => {
      await queryClient.refetchQueries({ queryKey: profileKeys.detail() }, { cancelRefetch: false, throwOnError: true })
    })
    await waitFor(() => expect(result.current).toBe(false))
  })

  it('returns false when not in trial', async () => {
    mockProfileResponse(createMockProfile({ trialEndsAt: null }))

    const { result } = renderHook(() => useTrialUrgent(), {
      wrapper: createWrapper(),
    })

    expect(mockFetch).toHaveBeenCalled()
    await act(async () => {
      await queryClient.refetchQueries({ queryKey: profileKeys.detail() }, { cancelRefetch: false, throwOnError: true })
    })
    await waitFor(() => expect(result.current).toBe(false))
  })
})

describe('useIsYearlyPro', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  it('returns true for yearly subscription', async () => {
    mockProfileResponse(
      createMockProfile({
        hasProAccess: true,
        plan: 'pro',
        subscriptionInterval: 'yearly',
        isLifetimePro: false,
      }),
    )

    const { result } = renderHook(() => useIsYearlyPro(), {
      wrapper: createWrapper(),
    })

    expect(mockFetch).toHaveBeenCalled()
    await act(async () => {
      await queryClient.refetchQueries({ queryKey: profileKeys.detail() }, { cancelRefetch: false, throwOnError: true })
    })
    await waitFor(() => expect(result.current).toBe(true))
  })

  it('returns true for lifetime pro', async () => {
    mockProfileResponse(
      createMockProfile({
        hasProAccess: true,
        plan: 'pro',
        isLifetimePro: true,
        subscriptionInterval: null,
      }),
    )

    const { result } = renderHook(() => useIsYearlyPro(), {
      wrapper: createWrapper(),
    })

    expect(mockFetch).toHaveBeenCalled()
    await act(async () => {
      await queryClient.refetchQueries({ queryKey: profileKeys.detail() }, { cancelRefetch: false, throwOnError: true })
    })
    await waitFor(() => expect(result.current).toBe(true))
  })

  it('returns false for monthly pro', async () => {
    mockProfileResponse(
      createMockProfile({
        hasProAccess: true,
        plan: 'pro',
        subscriptionInterval: 'monthly',
        isLifetimePro: false,
      }),
    )

    const { result } = renderHook(() => useIsYearlyPro(), {
      wrapper: createWrapper(),
    })

    expect(mockFetch).toHaveBeenCalled()
    await act(async () => {
      await queryClient.refetchQueries({ queryKey: profileKeys.detail() }, { cancelRefetch: false, throwOnError: true })
    })
    await waitFor(() => expect(result.current).toBe(false))
  })

  it('returns false for free user', async () => {
    mockProfileResponse(createMockProfile({ hasProAccess: false, plan: 'free' }))

    const { result } = renderHook(() => useIsYearlyPro(), {
      wrapper: createWrapper(),
    })

    expect(mockFetch).toHaveBeenCalled()
    await act(async () => {
      await queryClient.refetchQueries({ queryKey: profileKeys.detail() }, { cancelRefetch: false, throwOnError: true })
    })
    await waitFor(() => expect(result.current).toBe(false))
  })

  it('returns false when profile is not loaded', () => {
    mockFetch.mockReturnValue(new Promise(() => {}))

    const { result } = renderHook(() => useIsYearlyPro(), {
      wrapper: createWrapper(),
    })

    expect(result.current).toBe(false)
  })
})
