import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { useConfig, isFeatureEnabled } from '@/hooks/use-config'
import { DEFAULT_CONFIG } from '@orbit/shared/types/config'
import type { AppConfig } from '@orbit/shared/types/config'
import { createMockConfig } from '@orbit/shared/__tests__/factories'
import { API } from '@orbit/shared/api'
import './session-query-setup'

const mockFetch = vi.fn()
let queryClient: QueryClient

function createWrapper() {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children)
  }
}

describe('useConfig', () => {
  beforeEach(() => {
    mockFetch.mockReset()
    vi.stubGlobal('fetch', mockFetch)
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    })
  })

  afterEach(async () => {
    cleanup()
    queryClient.clear()
    const { useAuthStore } = await import('@/stores/auth-store')
    useAuthStore.setState(useAuthStore.getInitialState())
    vi.unstubAllGlobals()
  })

  it('returns fetched config on success', async () => {
    const customConfig = createMockConfig({
      limits: { ...DEFAULT_CONFIG.limits, maxTagsPerHabit: 10 },
      features: { ...DEFAULT_CONFIG.features, analytics: { enabled: true, planRequirement: null } },
    })
    mockFetch.mockResolvedValue(Response.json(customConfig))

    const { result } = renderHook(() => useConfig(), {
      wrapper: createWrapper(),
    })

    await act(async () => { await result.current.refetch({ cancelRefetch: false, throwOnError: true }) })
    await waitFor(() => expect(result.current.isPlaceholderData).toBe(false))
    expect(result.current.config).toEqual(customConfig)
    expect(result.current.config.limits.maxTagsPerHabit).toBe(10)
    expect(result.current.isFetching).toBe(false)
    expect(isFeatureEnabled(result.current.config, 'analytics', 'free')).toBe(true)
  })

  it('falls back to DEFAULT_CONFIG on error', async () => {
    mockFetch.mockResolvedValue(new Response(null, { status: 500 }))

    const { result } = renderHook(() => useConfig(), {
      wrapper: createWrapper(),
    })

    await act(async () => { await result.current.refetch({ cancelRefetch: false, throwOnError: true }) })
    await waitFor(() => expect(result.current.isPlaceholderData).toBe(false))
    expect(result.current.isFetching).toBe(false)
    expect(result.current.isSuccess).toBe(true)
    expect(result.current.config).toEqual(DEFAULT_CONFIG)
    expect(isFeatureEnabled(result.current.config, 'analytics', 'free')).toBe(false)
  })

  it('returns fetched config after slow session recovery', async () => {
    const { useAuthStore } = await import('@/stores/auth-store')
    const customConfig = createMockConfig({
      limits: { ...DEFAULT_CONFIG.limits, maxTagsPerHabit: 10 },
      features: { ...DEFAULT_CONFIG.features, analytics: { enabled: true, planRequirement: null } },
    })
    const expiresAt = Date.now() + 60_000
    useAuthStore.setState({ sessionRefreshFailed: true })
    mockFetch.mockImplementation(async (input: RequestInfo | URL) => {
      if (input === API.config.get) return Response.json(customConfig)
      if (input === '/api/auth/session') {
        await new Promise((resolve) => setTimeout(resolve, 1_200))
        return Response.json({ expiresAt, userId: null, refreshFailed: false })
      }
      throw new Error('Unexpected request during configuration fetch')
    })

    const { result } = renderHook(() => useConfig(), { wrapper: createWrapper() })

    expect(result.current.config).toEqual(DEFAULT_CONFIG)
    expect(result.current.isPlaceholderData).toBe(true)
    await act(async () => { await result.current.refetch({ cancelRefetch: false, throwOnError: true }) })
    await waitFor(() => expect(result.current.isPlaceholderData).toBe(false))
    expect(result.current.config).toEqual(customConfig)
    expect(result.current.config.limits.maxTagsPerHabit).toBe(10)
    expect(isFeatureEnabled(result.current.config, 'analytics', 'free')).toBe(true)
    expect(useAuthStore.getState()).toMatchObject({
      isAuthenticated: true,
      sessionRefreshFailed: false,
      expiresAt,
    })
  })

  it('provides config immediately via placeholderData', () => {
    mockFetch.mockReturnValue(new Promise<Response>(() => {}))

    const { result } = renderHook(() => useConfig(), {
      wrapper: createWrapper(),
    })

    expect(result.current.config).toEqual(DEFAULT_CONFIG)
    expect(result.current.isPlaceholderData).toBe(true)
    expect(result.current.isFetching).toBe(true)
    expect(isFeatureEnabled(result.current.config, 'analytics', 'free')).toBe(false)
  })
})

describe('isFeatureEnabled', () => {
  it('returns true for enabled feature with no plan restriction', () => {
    expect(isFeatureEnabled(DEFAULT_CONFIG, 'gamification', 'free')).toBe(true)
    expect(isFeatureEnabled(DEFAULT_CONFIG, 'gamification', 'pro')).toBe(true)
  })

  it('returns true for goals when user is Pro', () => {
    expect(isFeatureEnabled(DEFAULT_CONFIG, 'goals', 'pro')).toBe(true)
  })

  it('returns true for goals when user is free', () => {
    expect(isFeatureEnabled(DEFAULT_CONFIG, 'goals', 'free')).toBe(true)
  })

  it('returns false for non-existent feature key', () => {
    expect(isFeatureEnabled(DEFAULT_CONFIG, 'nonexistent.feature', 'pro')).toBe(false)
  })

  it('returns false for disabled feature', () => {
    const config: AppConfig = {
      ...DEFAULT_CONFIG,
      features: {
        ...DEFAULT_CONFIG.features,
        'gamification': { enabled: false, planRequirement: null },
      },
    }
    expect(isFeatureEnabled(config, 'gamification', 'pro')).toBe(false)
  })
})
