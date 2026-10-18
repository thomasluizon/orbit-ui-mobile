import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { focusManager, onlineManager, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import TestRenderer, { act } from 'react-test-renderer'
import * as SecureStore from 'expo-secure-store'
import { AppState } from 'react-native'
import React from 'react'
import { useConfig } from '@/hooks/use-config'
import { useFlag } from '@/hooks/use-flag'
import { setAccountId } from '@/lib/account-scope'
import { configCache } from '@/lib/config-cache'
import { createMockConfigResponse } from '@orbit/shared/__tests__/factories'
import { appConfigSchema, DEFAULT_CONFIG } from '@orbit/shared/types/config'

const mocks = vi.hoisted(() => ({ fetch: vi.fn(), report: vi.fn() }))
vi.mock('@/lib/api-client', () => ({ apiClient: mocks.fetch }))
vi.mock('@sentry/react-native', () => ({ captureException: mocks.report }))

let queryClient: QueryClient
function Wrapper({ children }: { children: React.ReactNode }) {
  return React.createElement(QueryClientProvider, { client: queryClient }, children)
}
type ProbeResult = ReturnType<typeof useConfig> & { enabled: boolean; unknown: boolean; defaultFlag: boolean }
type MountedRenderer = ReturnType<typeof TestRenderer.create> & { unmount: () => void }
const renderers: MountedRenderer[] = []
function mount() {
  const result = { current: undefined as unknown as ProbeResult }
  function Probe() {
    result.current = { ...useConfig(), enabled: useFlag('analytics'), unknown: useFlag('unknown'), defaultFlag: useFlag('habits.create') }
    return null
  }
  let renderer!: MountedRenderer
  void act(() => { renderer = TestRenderer.create(React.createElement(Wrapper, null, React.createElement(Probe))) as MountedRenderer })
  renderers.push(renderer)
  return { result, unmount: () => { void act(() => { renderer.unmount() }) } }
}
const waitFor = vi.waitFor
function respond(enabled: boolean) {
  mocks.fetch.mockResolvedValue(createMockConfigResponse({ analytics: { enabled, planRequirement: null } }))
}

beforeEach(async () => {
  mocks.fetch.mockReset()
  mocks.report.mockReset()
  setAccountId(null)
  setAccountId('account-a')
  await SecureStore.deleteItemAsync('account_config')
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  vi.spyOn(AppState, 'addEventListener')
  focusManager.setFocused(true)
  onlineManager.setOnline(true)
})
afterEach(() => {
  void act(() => { renderers.splice(0).forEach((renderer) => renderer.unmount()) })
  queryClient.clear()
  setAccountId(null)
  focusManager.setFocused(undefined)
  onlineManager.setOnline(true)
  vi.restoreAllMocks()
})

describe('mobile config and flags', () => {
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
    mocks.fetch.mockResolvedValue({ limits: 'invalid' })
    const { result } = mount()
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.config).toEqual(DEFAULT_CONFIG)
    expect(result.current.enabled).toBe(false)
    expect(mocks.report).toHaveBeenCalled()
  })

  it.each(['network', 'http'])('keeps flags off without a last good value after %s failure', async (failure) => {
    if (failure === 'network') mocks.fetch.mockRejectedValue(new Error('offline'))
    else mocks.fetch.mockRejectedValue(new Error('500'))
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
    else mocks.fetch.mockResolvedValue({ limits: 'invalid' })
    await act(async () => { await result.current.refetch() })
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.enabled).toBe(true)
    expect(mocks.report).toHaveBeenCalled()
  })

  it('refreshes on app foreground even while config is fresh', async () => {
    respond(true)
    const { result } = mount()
    await waitFor(() => { expect(result.current.enabled).toBe(true); expect(result.current.isSuccess).toBe(true) })
    respond(false)
    await import('@/lib/query-client')
    const listener = vi.mocked(AppState.addEventListener).mock.calls.at(-1)![1]
    void act(() => { listener('background'); listener('active') })
    await waitFor(() => expect(result.current.enabled).toBe(false))
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
    void act(() => { setAccountId('account-b') })
    expect(result.current.enabled).toBe(false)
    await waitFor(() => expect(result.current.isError).toBe(true))
    void act(() => { setAccountId('account-a') })
    expect(result.current.enabled).toBe(false)
    await waitFor(() => expect(result.current.isError).toBe(true))
  })

  it('clears on sign-out and refreshes immediately after sign-in', async () => {
    respond(true)
    const { result } = mount()
    await waitFor(() => { expect(result.current.enabled).toBe(true); expect(result.current.isSuccess).toBe(true) })
    void act(() => { setAccountId(null) })
    expect(result.current.enabled).toBe(false)
    expect(configCache.getSnapshot().config).toBeUndefined()
    respond(false)
    void act(() => { setAccountId('account-b') })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.enabled).toBe(false)
  })

  it('discards a late response from the previous account', async () => {
    let finish!: (response: unknown) => void
    mocks.fetch.mockReturnValueOnce(new Promise<unknown>((resolve) => { finish = resolve }))
    const { result } = mount()
    await waitFor(() => expect(mocks.fetch).toHaveBeenCalled())
    mocks.fetch.mockRejectedValue(new Error('offline'))
    void act(() => { setAccountId('account-b') })
    await act(() => { finish(createMockConfigResponse({ analytics: { enabled: true, planRequirement: null } })) })
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.enabled).toBe(false)
  })

  it('parses limits, settings, minVersion and an old API response without features', async () => {
    const { features: _features, ...response } = createMockConfigResponse(undefined, { MaxHabitDepth: '8' })
    mocks.fetch.mockResolvedValue({ ...response, minVersion: '2.3.4' })
    const { result } = mount()
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.config.limits.maxHabitDepth).toBe(8)
    expect(result.current.config.settings).toEqual(response.settings)
    expect(result.current.config.minVersion).toBe('2.3.4')
    expect(result.current.enabled).toBe(false)
  })

  it('restores the same account from SecureStore while launch refresh is pending', async () => {
    const config = appConfigSchema.parse(createMockConfigResponse({ analytics: { enabled: true, planRequirement: null } }))
    await SecureStore.setItemAsync('account_config', JSON.stringify({ accountId: 'account-a', config }))
    mocks.fetch.mockReturnValue(new Promise(() => {}))
    const { result } = mount()
    await waitFor(() => expect(result.current.enabled).toBe(true))
    expect(result.current.isFetching).toBe(true)
  })

  it.each([0, 1])('restores persisted flags on a disconnected cold start and refreshes on reconnect with %s retries', async (retry) => {
    const config = appConfigSchema.parse(createMockConfigResponse({ analytics: { enabled: true, planRequirement: null } }))
    await SecureStore.setItemAsync('account_config', JSON.stringify({ accountId: 'account-a', config }))
    queryClient.setDefaultOptions({ queries: { retry, retryDelay: 0 } })
    mocks.fetch.mockRejectedValue(new Error('offline'))
    onlineManager.setOnline(false)

    const { result } = mount()

    await waitFor(() => expect(result.current.enabled).toBe(true))
    await waitFor(() => expect(retry ? result.current.isPaused : result.current.isError).toBe(true))
    expect(mocks.fetch).toHaveBeenCalledTimes(1)
    expect(result.current.enabled).toBe(true)

    respond(false)
    void act(() => { onlineManager.setOnline(true) })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.enabled).toBe(false)
    expect(mocks.fetch).toHaveBeenCalledTimes(2)
  })

  it('retains a persisted last good value after a failed launch refresh', async () => {
    const config = appConfigSchema.parse(createMockConfigResponse({ analytics: { enabled: true, planRequirement: null } }))
    await SecureStore.setItemAsync('account_config', JSON.stringify({ accountId: 'account-a', config }))
    mocks.fetch.mockRejectedValue(new Error('offline'))
    const { result } = mount()
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.enabled).toBe(true)
  })

  it('rejects a persisted value owned by another account', async () => {
    const config = appConfigSchema.parse(createMockConfigResponse({ analytics: { enabled: true, planRequirement: null } }))
    await SecureStore.setItemAsync('account_config', JSON.stringify({ accountId: 'account-b', config }))
    mocks.fetch.mockRejectedValue(new Error('offline'))
    const { result } = mount()
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.enabled).toBe(false)
    await expect(SecureStore.getItemAsync('account_config')).resolves.toBeNull()
  })

  it('stores parsed config and deletes it on sign-out', async () => {
    respond(true)
    const { result } = mount()
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    const persisted = await SecureStore.getItemAsync('account_config')
    expect(JSON.parse(persisted!)).toEqual({ accountId: 'account-a', config: result.current.resolvedConfig })
    void act(() => { setAccountId(null) })
    await waitFor(async () => expect(await SecureStore.getItemAsync('account_config')).toBeNull())
    expect(result.current.enabled).toBe(false)
  })

})
