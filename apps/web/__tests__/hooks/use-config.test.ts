import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { focusManager, onlineManager, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import '@/lib/query-client'
import { useConfig } from '@/hooks/use-config'
import { useFlag } from '@/hooks/use-flag'
import { setAccountId } from '@/lib/account-scope'
import { configCache } from '@/lib/config-cache'
import { createMockConfigResponse } from '@orbit/shared/__tests__/factories'
import { DEFAULT_CONFIG } from '@orbit/shared/types/config'

const mocks = vi.hoisted(() => ({ fetch: vi.fn(), report: vi.fn() }))
vi.mock('@/lib/api-fetch', () => ({ sessionAwareFetch: mocks.fetch }))
vi.mock('@sentry/nextjs', () => ({ captureException: mocks.report }))

let queryClient: QueryClient
function Wrapper({ children }: { children: React.ReactNode }) {
  return React.createElement(QueryClientProvider, { client: queryClient }, children)
}
function mount() {
  return renderHook(() => ({
    ...useConfig(), enabled: useFlag('analytics'), unknown: useFlag('unknown'), defaultFlag: useFlag('habits.create'),
  }), { wrapper: Wrapper })
}
function respond(enabled: boolean) {
  mocks.fetch.mockResolvedValue(new Response(JSON.stringify(createMockConfigResponse({ analytics: { enabled, planRequirement: null } }))))
}

beforeEach(() => {
  mocks.fetch.mockReset()
  mocks.report.mockReset()
  setAccountId(null)
  setAccountId('account-a')
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  focusManager.setFocused(true)
  onlineManager.setOnline(true)
})
afterEach(() => {
  cleanup()
  queryClient.clear()
  setAccountId(null)
  focusManager.setFocused(undefined)
  onlineManager.setOnline(true)
})

describe('web config and flags', () => {
  it.each([true, false])('returns the resolved flag %s and keeps unknown flags off', async (enabled) => {
    respond(enabled)
    const { result } = mount()
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.enabled).toBe(enabled)
    expect(result.current.unknown).toBe(false)
  })

  it('keeps every flag off on a cold start, including default-enabled features', () => {
    mocks.fetch.mockReturnValue(new Promise(() => {}))
    const { result } = mount()
    expect(result.current.enabled).toBe(false)
    expect(result.current.defaultFlag).toBe(false)
    expect(result.current.config).toEqual(DEFAULT_CONFIG)
  })

  it('rejects malformed config instead of returning an unparsed response', async () => {
    mocks.fetch.mockResolvedValue(new Response(JSON.stringify({ limits: 'invalid' })))
    const { result } = mount()
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.config).toEqual(DEFAULT_CONFIG)
    expect(result.current.enabled).toBe(false)
    expect(mocks.report).toHaveBeenCalled()
  })

  it.each(['network', 'http'])('keeps flags off without a last good value after %s failure', async (failure) => {
    if (failure === 'network') mocks.fetch.mockRejectedValue(new Error('offline'))
    else mocks.fetch.mockResolvedValue(new Response(null, { status: 500 }))
    const { result } = mount()
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.enabled).toBe(false)
    expect(result.current.defaultFlag).toBe(false)
    expect(mocks.report).toHaveBeenCalled()
  })

  it.each(['network', 'parse'])('keeps the last good value during and after a %s failure', async (failure) => {
    respond(true)
    const { result } = mount()
    await waitFor(() => { expect(result.current.enabled).toBe(true); expect(result.current.isSuccess).toBe(true) })
    if (failure === 'network') mocks.fetch.mockRejectedValue(new Error('offline'))
    else mocks.fetch.mockResolvedValue(new Response(JSON.stringify({ limits: 'invalid' })))
    await act(async () => { await result.current.refetch() })
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.enabled).toBe(true)
    expect(mocks.report).toHaveBeenCalled()
  })

  it('does not republish a canceled refresh after a newer response disables a flag', async () => {
    respond(true)
    const { result } = mount()
    await waitFor(() => { expect(result.current.enabled).toBe(true); expect(result.current.isSuccess).toBe(true) })
    let finishOlder!: (response: Response) => void
    let finishNewer!: (response: Response) => void
    mocks.fetch.mockReturnValueOnce(new Promise<Response>((resolve) => { finishOlder = resolve }))
    mocks.fetch.mockReturnValueOnce(new Promise<Response>((resolve) => { finishNewer = resolve }))
    act(() => { void result.current.refetch() })
    await waitFor(() => expect(mocks.fetch).toHaveBeenCalledTimes(2))
    act(() => { void result.current.refetch() })
    await waitFor(() => expect(mocks.fetch).toHaveBeenCalledTimes(3))

    await act(async () => {
      finishNewer(new Response(JSON.stringify(createMockConfigResponse({ analytics: { enabled: false, planRequirement: null } }))))
    })
    await waitFor(() => { expect(result.current.enabled).toBe(false); expect(result.current.isFetching).toBe(false) })
    await act(async () => {
      finishOlder(new Response(JSON.stringify(createMockConfigResponse({ analytics: { enabled: true, planRequirement: null } }))))
    })

    expect(result.current.enabled).toBe(false)
    expect(result.current.resolvedConfig?.features.analytics?.enabled).toBe(false)
  })

  it('refreshes on window focus even while config is fresh', async () => {
    respond(true)
    const { result } = mount()
    await waitFor(() => { expect(result.current.enabled).toBe(true); expect(result.current.isSuccess).toBe(true) })
    respond(false)
    act(() => { window.dispatchEvent(new Event('focus')) })
    await waitFor(() => expect(result.current.enabled).toBe(false))
  })

  it.each([0, 1])('attempts an offline launch request and refreshes on reconnect with %s retries', async (retry) => {
    queryClient.setDefaultOptions({ queries: { retry, retryDelay: 0 } })
    mocks.fetch.mockRejectedValue(new Error('offline'))
    onlineManager.setOnline(false)

    const { result } = mount()

    await waitFor(() => expect(mocks.fetch).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(retry ? result.current.isPaused : result.current.isError).toBe(true))
    expect(result.current.enabled).toBe(false)
    expect(result.current.defaultFlag).toBe(false)

    respond(true)
    act(() => { onlineManager.setOnline(true) })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.enabled).toBe(true)
    expect(mocks.fetch).toHaveBeenCalledTimes(2)
  })

  it('refreshes at launch when the same account has a last good value', async () => {
    respond(true)
    const first = mount()
    await waitFor(() => expect(first.result.current.enabled).toBe(true))
    first.unmount()
    respond(false)
    const next = mount()
    expect(next.result.current.enabled).toBe(true)
    await waitFor(() => expect(next.result.current.enabled).toBe(false))
  })

  it('clears flags on account switch, refreshes immediately and never revives the old account', async () => {
    respond(true)
    const { result } = mount()
    await waitFor(() => { expect(result.current.enabled).toBe(true); expect(result.current.isSuccess).toBe(true) })
    mocks.fetch.mockRejectedValue(new Error('offline'))
    act(() => { setAccountId('account-b') })
    expect(result.current.enabled).toBe(false)
    await waitFor(() => expect(result.current.isError).toBe(true))
    act(() => { setAccountId('account-a') })
    expect(result.current.enabled).toBe(false)
    await waitFor(() => expect(result.current.isError).toBe(true))
  })

  it('clears on sign-out and refreshes immediately after sign-in', async () => {
    respond(true)
    const { result } = mount()
    await waitFor(() => { expect(result.current.enabled).toBe(true); expect(result.current.isSuccess).toBe(true) })
    act(() => { setAccountId(null) })
    expect(result.current.enabled).toBe(false)
    expect(configCache.getSnapshot().config).toBeUndefined()
    respond(false)
    act(() => { setAccountId('account-b') })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.enabled).toBe(false)
  })

  it('discards a late response from the previous account', async () => {
    let finish!: (response: Response) => void
    mocks.fetch.mockReturnValueOnce(new Promise<Response>((resolve) => { finish = resolve }))
    const { result } = mount()
    await waitFor(() => expect(mocks.fetch).toHaveBeenCalled())
    mocks.fetch.mockRejectedValue(new Error('offline'))
    act(() => { setAccountId('account-b') })
    await act(async () => { finish(new Response(JSON.stringify(createMockConfigResponse({ analytics: { enabled: true, planRequirement: null } })))) })
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.enabled).toBe(false)
  })

  it('parses limits, settings, minVersion and an old API response without features', async () => {
    const { features: _features, ...response } = createMockConfigResponse(undefined, { MaxHabitDepth: '8' })
    mocks.fetch.mockResolvedValue(new Response(JSON.stringify({ ...response, minVersion: '2.3.4' })))
    const { result } = mount()
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.config.limits.maxHabitDepth).toBe(8)
    expect(result.current.config.settings).toEqual(response.settings)
    expect(result.current.config.minVersion).toBe('2.3.4')
    expect(result.current.enabled).toBe(false)
  })
})
