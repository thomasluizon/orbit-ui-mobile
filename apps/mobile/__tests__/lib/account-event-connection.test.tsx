import React from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import TestRenderer, { act } from 'react-test-renderer'
import { QueryObserver } from '@tanstack/query-core'
import { habitKeys, profileKeys } from '@orbit/shared/query'
import { AccountEventConnection } from '@/lib/account-event-connection'
import { getAccountEventOrigin, setAccountEventOrigin } from '@/lib/account-event-origin'
import { QUERY_CACHE_VERSION, queryClient, restoreQueryCache, setQueryCacheScope } from '@/lib/query-client'

const mocks = vi.hoisted(() => ({
  invalidateQueries: vi.fn(),
  expoFetch: vi.fn(),
  getToken: vi.fn(() => Promise.resolve('token')),
  refreshSessionToken: vi.fn(),
  onAppState: null as null | ((state: string) => void),
  getItem: vi.fn(),
  queryClient: null as null | typeof queryClient,
}))

vi.mock('@tanstack/react-query', async (importOriginal) => ({
  ...await importOriginal<typeof import('@tanstack/react-query')>(),
  useQueryClient: () => mocks.queryClient ?? {
    invalidateQueries: mocks.invalidateQueries,
    getQueryCache: () => ({ findAll: () => [] }),
  },
}))
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: { getItem: mocks.getItem, setItem: vi.fn(), removeItem: vi.fn() },
}))
vi.mock('@react-native-community/netinfo', () => ({ default: { addEventListener: vi.fn(() => () => {}) } }))
vi.mock('react-native', () => ({ AppState: {
  currentState: 'active',
  addEventListener: (_type: string, listener: (state: string) => void) => {
    mocks.onAppState = listener
    return { remove: () => { mocks.onAppState = null } }
  },
} }))
vi.mock('expo/fetch', () => ({ fetch: mocks.expoFetch }))
vi.mock('@/lib/secure-store', () => ({ getToken: mocks.getToken }))
vi.mock('@/stores/auth-store', () => ({
  useAuthStore: (select: (state: { isAuthenticated: boolean }) => boolean) => select({ isAuthenticated: true }),
  refreshSessionToken: mocks.refreshSessionToken,
}))

afterEach(() => {
  mocks.expoFetch.mockReset()
  mocks.invalidateQueries.mockReset()
  setAccountEventOrigin(null)
  queryClient.clear()
  mocks.queryClient = null
  mocks.getItem.mockReset()
})

it('refreshes a restored Today query on its first cursorless stream', async () => {
  mocks.queryClient = queryClient
  await setQueryCacheScope('account-1')
  const queryKey = ['habits', 'list', { date: 'today' }]
  mocks.getItem.mockResolvedValue(JSON.stringify({
    version: QUERY_CACHE_VERSION,
    entries: [{ queryKey, state: { data: ['before remote change'], dataUpdatedAt: Date.now() - 1000 } }],
  }))
  await restoreQueryCache()

  const fetchHabits = vi.fn(() => Promise.resolve(['after remote change']))
  const observer = new QueryObserver(queryClient, { queryKey, queryFn: fetchHabits, staleTime: 300_000 })
  const unsubscribe = observer.subscribe(() => {})
  expect(observer.getCurrentResult().data).toEqual(['before remote change'])
  expect(fetchHabits).not.toHaveBeenCalled()

  mocks.expoFetch.mockResolvedValue({
    ok: true, status: 200,
    body: new ReadableStream<Uint8Array>({ start() {} }),
  })
  let view!: ReturnType<typeof TestRenderer.create>
  await act(async () => { view = TestRenderer.create(React.createElement(AccountEventConnection)); await Promise.resolve() })
  expect(mocks.expoFetch).toHaveBeenCalledTimes(1)
  await vi.waitFor(() => expect(fetchHabits).toHaveBeenCalledTimes(1))
  expect(observer.getCurrentResult().data).toEqual(['after remote change'])
  await act(() => { (view as unknown as { unmount: () => void }).unmount() })
  unsubscribe()
})

it('refreshes a query fetched while the first stream open failed', async () => {
  mocks.queryClient = queryClient
  mocks.expoFetch
    .mockRejectedValueOnce(new Error('stream unavailable'))
    .mockResolvedValueOnce({
      ok: true, status: 200,
      body: new ReadableStream<Uint8Array>({ start() {} }),
    })
  vi.useFakeTimers()
  let view!: ReturnType<typeof TestRenderer.create>
  const queryKey = ['habits', 'list', { date: 'today' }]
  const fetchHabits = vi.fn(() => Promise.resolve(['after connection']))
  let unsubscribe = () => {}
  try {
    await act(async () => { view = TestRenderer.create(React.createElement(AccountEventConnection)); await Promise.resolve() })
    expect(mocks.expoFetch).toHaveBeenCalledTimes(1)
    queryClient.setQueryData(queryKey, ['while disconnected'], { updatedAt: Date.now() - 1 })
    const observer = new QueryObserver(queryClient, { queryKey, queryFn: fetchHabits, staleTime: Infinity })
    unsubscribe = observer.subscribe(() => {})
    expect(fetchHabits).not.toHaveBeenCalled()
    await act(async () => { await vi.advanceTimersByTimeAsync(2000) })
    expect(mocks.expoFetch).toHaveBeenCalledTimes(2)
    expect(fetchHabits).toHaveBeenCalledTimes(1)
    expect(observer.getCurrentResult().data).toEqual(['after connection'])
  } finally {
    await act(() => { (view as unknown as { unmount: () => void }).unmount() })
    unsubscribe()
    vi.useRealTimers()
  }
})

it('uses the bearer stream while active and closes it in background', async () => {
  const id = '123e4567-e89b-42d3-a456-426614174000'
  const ownChange = `event: changes\ndata: ${JSON.stringify({
    v: 1, origin: 'mobile', changes: [{ kind: 'habitLog', op: 'create', ids: [id] }],
  })}\n\n`
  const stream = `event: ready\ndata: {"connectionId":"mobile"}\n\n${ownChange}event: changes\ndata: ${JSON.stringify({
    v: 1, origin: 'other', changes: [{ kind: 'habitLog', op: 'create', ids: [id] }],
  })}\n\n`
  mocks.expoFetch.mockImplementation((_url: string, init: RequestInit) => Promise.resolve({
    ok: true,
    status: 200,
    body: new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(stream))
        init.signal?.addEventListener('abort', () => controller.close(), { once: true })
      },
    }),
  }))
  await act(async () => {
    TestRenderer.create(React.createElement(AccountEventConnection))
    await Promise.resolve()
  })
  expect(mocks.expoFetch).toHaveBeenCalledWith(
    'https://api.useorbit.org/api/events',
    expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer token' }) }),
  )
  expect(mocks.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['habits'] })
  expect(mocks.invalidateQueries).toHaveBeenCalledTimes(3)
  expect(getAccountEventOrigin()).toBe('mobile')
  await act(async () => {
    mocks.onAppState?.('background')
    await Promise.resolve()
  })
  expect(getAccountEventOrigin()).toBeNull()
})

it('replays changes missed while the app was backgrounded', async () => {
  mocks.expoFetch.mockImplementation((_url: string, _init: RequestInit) => Promise.resolve({
    ok: true, status: 200,
    body: new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(new TextEncoder().encode('id: epoch.5\nevent: changes\ndata: {"v":1,"changes":[]}\n\n')) },
    }),
  }))
  await act(async () => { TestRenderer.create(React.createElement(AccountEventConnection)); await Promise.resolve() })
  await act(async () => { mocks.onAppState?.('background'); await Promise.resolve() })
  await act(async () => { mocks.onAppState?.('active'); await Promise.resolve() })
  expect(mocks.expoFetch).toHaveBeenCalledTimes(2)
  expect(mocks.expoFetch.mock.calls[1]?.[1]).toMatchObject({ headers: expect.objectContaining({ 'Last-Event-ID': 'epoch.5' }) })
})

it('refreshes each account query once after returning without a replay cursor', async () => {
  mocks.queryClient = queryClient
  let openSecondStream!: (response: ReturnType<typeof idleStream>) => void
  mocks.expoFetch
    .mockResolvedValueOnce(idleStream())
    .mockReturnValueOnce(new Promise((resolve) => { openSecondStream = resolve }))
  vi.useFakeTimers()
  let view!: ReturnType<typeof TestRenderer.create>
  let queries: ReturnType<typeof observeAccountQueries> = []
  try {
    await act(async () => { view = TestRenderer.create(React.createElement(AccountEventConnection)); await vi.advanceTimersByTimeAsync(0) })
    queries = observeAccountQueries()
    await act(async () => { mocks.onAppState?.('background'); await vi.advanceTimersByTimeAsync(0) })
    await act(async () => { mocks.onAppState?.('active'); await vi.advanceTimersByTimeAsync(0) })
    expect(mocks.expoFetch).toHaveBeenCalledTimes(2)
    await vi.waitFor(() => expect(queryClient.isFetching()).toBe(0))
    const beforeOpen = refreshCounts(queries)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1)
      openSecondStream(idleStream())
      await vi.advanceTimersByTimeAsync(0)
    })
    await vi.waitFor(() => expect(queryClient.isFetching()).toBe(0))
    expect({ beforeOpen, afterOpen: refreshCounts(queries) }).toEqual({ beforeOpen: [0, 0, 0], afterOpen: [1, 1, 1] })
    expect(mocks.expoFetch.mock.calls[1]?.[1]?.headers).not.toHaveProperty('Last-Event-ID')
  } finally {
    await act(() => { (view as unknown as { unmount: () => void }).unmount() })
    stopObserving(queries)
    vi.useRealTimers()
  }
})

it('refreshes once when the first open after a return fails and again when the stream opens', async () => {
  mocks.queryClient = queryClient
  let failSecondOpen!: (error: Error) => void
  mocks.expoFetch
    .mockResolvedValueOnce(idleStream())
    .mockReturnValueOnce(new Promise((_resolve, reject) => { failSecondOpen = reject }))
    .mockResolvedValueOnce(idleStream())
  vi.useFakeTimers()
  let view!: ReturnType<typeof TestRenderer.create>
  let queries: ReturnType<typeof observeAccountQueries> = []
  try {
    await act(async () => { view = TestRenderer.create(React.createElement(AccountEventConnection)); await vi.advanceTimersByTimeAsync(0) })
    queries = observeAccountQueries()
    await act(async () => { mocks.onAppState?.('background'); await vi.advanceTimersByTimeAsync(0) })
    await act(async () => { mocks.onAppState?.('active'); await vi.advanceTimersByTimeAsync(0) })
    expect(mocks.expoFetch).toHaveBeenCalledTimes(2)
    await vi.waitFor(() => expect(queryClient.isFetching()).toBe(0))
    const beforeFailure = refreshCounts(queries)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1)
      failSecondOpen(new Error('stream unavailable'))
      await vi.advanceTimersByTimeAsync(0)
    })
    await vi.waitFor(() => expect(queryClient.isFetching()).toBe(0))
    const afterFailure = refreshCounts(queries)
    await act(async () => { await vi.advanceTimersByTimeAsync(2000) })
    expect(mocks.expoFetch).toHaveBeenCalledTimes(3)
    await vi.waitFor(() => expect(queryClient.isFetching()).toBe(0))
    expect({ beforeFailure, afterFailure, afterOpen: refreshCounts(queries) }).toEqual({
      beforeFailure: [0, 0, 0], afterFailure: [1, 1, 1], afterOpen: [2, 2, 2],
    })
  } finally {
    await act(() => { (view as unknown as { unmount: () => void }).unmount() })
    stopObserving(queries)
    vi.useRealTimers()
  }
})

it('refreshes a query still fetching at a failed open after a return once that fetch settles', async () => {
  mocks.queryClient = queryClient
  let failSecondOpen!: (error: Error) => void
  mocks.expoFetch
    .mockResolvedValueOnce(idleStream())
    .mockReturnValueOnce(new Promise((_resolve, reject) => { failSecondOpen = reject }))
    .mockRejectedValue(new Error('stream unavailable'))
  vi.useFakeTimers()
  let view!: ReturnType<typeof TestRenderer.create>
  let idleQueries: ReturnType<typeof observeAccountQueries> = []
  let inFlightQuery: ReturnType<typeof observeInFlightQuery> | null = null
  try {
    await act(async () => { view = TestRenderer.create(React.createElement(AccountEventConnection)); await vi.advanceTimersByTimeAsync(0) })
    idleQueries = observeAccountQueries([habitKeys.count()])
    inFlightQuery = observeInFlightQuery(profileKeys.detail())
    await act(async () => { mocks.onAppState?.('background'); await vi.advanceTimersByTimeAsync(0) })
    await act(async () => { mocks.onAppState?.('active'); await vi.advanceTimersByTimeAsync(0) })
    expect(mocks.expoFetch).toHaveBeenCalledTimes(2)
    await act(async () => {
      failSecondOpen(new Error('stream unavailable'))
      await vi.advanceTimersByTimeAsync(0)
    })
    await vi.waitFor(() => expect(refreshCounts(idleQueries)).toEqual([1]))
    expect(inFlightQuery.queryFn).toHaveBeenCalledTimes(1)
    const { observer, settle } = inFlightQuery
    await act(async () => { settle('before the change'); await vi.advanceTimersByTimeAsync(0) })
    await vi.waitFor(() => expect(observer.getCurrentResult().data).toBe('after return'))
    await vi.waitFor(() => expect(queryClient.isFetching()).toBe(0))
    expect({ idle: refreshCounts(idleQueries), inFlight: inFlightQuery.queryFn.mock.calls.length })
      .toEqual({ idle: [1], inFlight: 2 })
    expect(mocks.expoFetch).toHaveBeenCalledTimes(2)
  } finally {
    await act(() => { (view as unknown as { unmount: () => void }).unmount() })
    stopObserving(idleQueries)
    inFlightQuery?.unsubscribe()
    vi.useRealTimers()
  }
})

it('refreshes each account query once after a cursorless stream closes and reopens', async () => {
  mocks.queryClient = queryClient
  let closeFirstStream!: () => void
  let openSecondStream!: (response: ReturnType<typeof idleStream>) => void
  mocks.expoFetch
    .mockResolvedValueOnce({
      ok: true, status: 200,
      body: new ReadableStream<Uint8Array>({ start(controller) { closeFirstStream = () => controller.close() } }),
    })
    .mockReturnValueOnce(new Promise((resolve) => { openSecondStream = resolve }))
  vi.useFakeTimers()
  let view!: ReturnType<typeof TestRenderer.create>
  let queries: ReturnType<typeof observeAccountQueries> = []
  try {
    await act(async () => { view = TestRenderer.create(React.createElement(AccountEventConnection)); await vi.advanceTimersByTimeAsync(0) })
    queries = observeAccountQueries()
    await act(async () => { closeFirstStream(); await vi.advanceTimersByTimeAsync(1000) })
    expect(mocks.expoFetch).toHaveBeenCalledTimes(2)
    await vi.waitFor(() => expect(queryClient.isFetching()).toBe(0))
    const beforeOpen = refreshCounts(queries)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1)
      openSecondStream(idleStream())
      await vi.advanceTimersByTimeAsync(0)
    })
    await vi.waitFor(() => expect(queryClient.isFetching()).toBe(0))
    expect({ beforeOpen, afterOpen: refreshCounts(queries) }).toEqual({ beforeOpen: [0, 0, 0], afterOpen: [1, 1, 1] })
  } finally {
    await act(() => { (view as unknown as { unmount: () => void }).unmount() })
    stopObserving(queries)
    vi.useRealTimers()
  }
})

function idleStream() {
  return { ok: true, status: 200, body: new ReadableStream<Uint8Array>({ start() {} }) }
}

function observeAccountQueries(
  queryKeys: readonly (readonly unknown[])[] = [profileKeys.detail(), habitKeys.list({ date: 'today' }), habitKeys.count()],
) {
  return queryKeys.map((queryKey) => {
    queryClient.setQueryData(queryKey, 'before return', { updatedAt: Date.now() - 60_000 })
    const queryFn = vi.fn(() => Promise.resolve('after return'))
    const unsubscribe = new QueryObserver(queryClient, { queryKey, queryFn, staleTime: Infinity }).subscribe(() => {})
    return { queryFn, unsubscribe }
  })
}

function observeInFlightQuery(queryKey: readonly unknown[]) {
  queryClient.setQueryData(queryKey, 'before return', { updatedAt: Date.now() - 60_000 })
  let settle!: (data: string) => void
  const queryFn = vi.fn()
    .mockReturnValueOnce(new Promise<string>((resolve) => { settle = resolve }))
    .mockResolvedValue('after return')
  const observer = new QueryObserver(queryClient, { queryKey, queryFn, staleTime: Infinity })
  const unsubscribe = observer.subscribe(() => {})
  void observer.refetch()
  return { queryFn, observer, unsubscribe, settle: (data: string) => settle(data) }
}

function refreshCounts(queries: ReturnType<typeof observeAccountQueries>) {
  return queries.map(({ queryFn }) => queryFn.mock.calls.length)
}

function stopObserving(queries: ReturnType<typeof observeAccountQueries>) {
  for (const { unsubscribe } of queries) unsubscribe()
}
