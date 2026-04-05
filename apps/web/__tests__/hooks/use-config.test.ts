import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { useConfig, isFeatureEnabled } from '@/hooks/use-config'
import { DEFAULT_CONFIG } from '@orbit/shared/types/config'
import type { AppConfig } from '@orbit/shared/types/config'

// Mock fetch
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children)
  }
}

describe('useConfig', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  it('returns fetched config on success', async () => {
    const customConfig: AppConfig = {
      ...DEFAULT_CONFIG,
      limits: { ...DEFAULT_CONFIG.limits, maxTagsPerHabit: 10 },
    }
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(customConfig),
    })

    const { result } = renderHook(() => useConfig(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.config.limits.maxTagsPerHabit).toBe(10))
  })

  it('falls back to DEFAULT_CONFIG on error', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
    })

    const { result } = renderHook(() => useConfig(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    // fetchConfig returns DEFAULT_CONFIG on !ok
    expect(result.current.config).toEqual(DEFAULT_CONFIG)
  })

  it('provides config immediately via placeholderData', () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => new Promise(() => {}), // Never resolves
    })

    const { result } = renderHook(() => useConfig(), {
      wrapper: createWrapper(),
    })

    // Should have config from placeholderData even while loading
    expect(result.current.config).toEqual(DEFAULT_CONFIG)
  })
})

describe('isFeatureEnabled', () => {
  it('returns true for enabled feature with no plan restriction', () => {
    expect(isFeatureEnabled(DEFAULT_CONFIG, 'habits.create', 'free')).toBe(true)
    expect(isFeatureEnabled(DEFAULT_CONFIG, 'habits.create', 'pro')).toBe(true)
  })

  it('returns true for Pro-gated feature when user is Pro', () => {
    expect(isFeatureEnabled(DEFAULT_CONFIG, 'goals', 'pro')).toBe(true)
  })

  it('returns false for Pro-gated feature when user is free', () => {
    expect(isFeatureEnabled(DEFAULT_CONFIG, 'goals', 'free')).toBe(false)
  })

  it('returns false for non-existent feature key', () => {
    expect(isFeatureEnabled(DEFAULT_CONFIG, 'nonexistent.feature', 'pro')).toBe(false)
  })

  it('returns false for disabled feature', () => {
    const config: AppConfig = {
      ...DEFAULT_CONFIG,
      features: {
        ...DEFAULT_CONFIG.features,
        'habits.create': { enabled: false, plan: null },
      },
    }
    expect(isFeatureEnabled(config, 'habits.create', 'pro')).toBe(false)
  })
})
