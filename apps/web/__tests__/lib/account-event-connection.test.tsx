import { useVersionGateStore } from '@/stores/version-gate-store'
import { afterEach, expect, it, vi } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import { QueryClient, QueryObserver } from '@tanstack/query-core'
import { habitKeys, profileKeys } from '@orbit/shared/query'
import { AccountEventConnection } from '@/lib/account-event-connection'
import { getAccountEventOrigin, setAccountEventOrigin } from '@/lib/account-event-origin'

const invalidateQueries = vi.fn()
const queryClientState = vi.hoisted(() => ({ current: null as QueryClient | null }))
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () =>
  queryClientState.current ?? {
    invalidateQueries,
    getQueryCache: () => ({ findAll: () => [] }),
  },
}))

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  setAccountEventOrigin(null)
  invalidateQueries.mockClear()
  queryClientState.current?.clear()
  queryClientState.current = null
})

it('records an upgrade refusal from the account event ticket', async () => {
  useVersionGateStore.setState(useVersionGateStore.getInitialState())
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
  vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 426 })))
  const view = render(<AccountEventConnection />)
  await waitFor(() => expect(useVersionGateStore.getState().upgradeRequired).toBe(true))
  view.unmount()
})

it('refreshes a query fetched while the first ticket request failed', async () => {
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  queryClientState.current = client
  const fetchMock = vi.fn()
    .mockRejectedValueOnce(new Error('ticket unavailable'))
    .mockResolvedValueOnce(new Response(JSON.stringify({ ticket: 'ticket', apiBase: 'https://api.example.test' })))
    .mockResolvedValueOnce(new Response(new ReadableStream<Uint8Array>({ start() {} })))
  vi.stubGlobal('fetch', fetchMock)
  const view = render(<AccountEventConnection />)
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
  const queryKey = ['habits', 'list', { date: 'today' }]
  client.setQueryData(queryKey, 'while disconnected', { updatedAt: Date.now() - 1 })
  const fetchHabits = vi.fn(async () => 'after connection')
  const observer = new QueryObserver(client, { queryKey, queryFn: fetchHabits, staleTime: Infinity })
  const unsubscribe = observer.subscribe(() => {})
  expect(fetchHabits).not.toHaveBeenCalled()
  await waitFor(() => expect(fetchHabits).toHaveBeenCalledTimes(1), { timeout: 4000 })
  expect(observer.getCurrentResult().data).toBe('after connection')
  expect((fetchMock.mock.calls[2]?.[0] as URL).origin).toBe('https://api.example.test')
  expect(fetchMock.mock.calls[2]?.[1]).toMatchObject({ headers: undefined })
  unsubscribe()
  view.unmount()
})

it('requests replay after a closed stream and handles a server resync', async () => {
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
  const ticket = new Response(JSON.stringify({ ticket: 'ticket', apiBase: 'https://api.example.test' }))
  const firstEvent = 'event: ready\ndata: {"connectionId":"first"}\n\nid: epoch.1\nevent: changes\ndata: {"v":1,"changes":[]}\n\n'
  const fetchMock = vi.fn()
    .mockResolvedValueOnce(ticket)
    .mockResolvedValueOnce(new Response(firstEvent))
    .mockResolvedValueOnce(new Response(JSON.stringify({ ticket: 'new-ticket', apiBase: 'https://api.example.test' })))
    .mockImplementationOnce(async (_url: URL, init: RequestInit) => new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('event: ready\ndata: {"connectionId":"second"}\n\nevent: resync\ndata: {"v":1,"changes":[]}\n\n'))
        init.signal?.addEventListener('abort', () => controller.close(), { once: true })
      },
    })))
  vi.stubGlobal('fetch', fetchMock)

  const view = render(<AccountEventConnection />)
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4), { timeout: 3000 })
  expect(fetchMock.mock.calls[3]?.[1]).toMatchObject({ headers: { 'Last-Event-ID': 'epoch.1' } })
  await waitFor(() => expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['habits'] }))
  view.unmount()
})

it('opens a visible direct stream, skips its own change, and invalidates another device change', async () => {
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
  const id = '123e4567-e89b-42d3-a456-426614174000'
  const change = (origin: string) => `event: changes\ndata: ${JSON.stringify({
    v: 1, origin, changes: [{ kind: 'habitLog', op: 'create', ids: [id] }],
  })}\n\n`
  const stream = `event: ready\ndata: {"connectionId":"current"}\n\n${change('current')}${change('other')}`
  const fetchMock = vi.fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({ ticket: 'ticket', apiBase: 'https://api.example.test' })))
    .mockImplementationOnce(async (_url: URL, init: RequestInit) => new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(stream))
        init.signal?.addEventListener('abort', () => controller.close(), { once: true })
      },
    }), { headers: { 'content-type': 'text/event-stream' } }))
  vi.stubGlobal('fetch', fetchMock)

  const view = render(<AccountEventConnection />)
  await waitFor(() => expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['habits'] }))
  expect(invalidateQueries).toHaveBeenCalledTimes(3)
  expect(getAccountEventOrigin()).toBe('current')
  expect(fetchMock).toHaveBeenCalledWith(
    expect.objectContaining({ href: expect.stringContaining('/api/events?ticket=ticket') }),
    expect.objectContaining({ signal: expect.any(AbortSignal) }),
  )
  expect((fetchMock.mock.calls[1]?.[0] as URL).origin).toBe('https://api.example.test')
  view.unmount()
  expect(getAccountEventOrigin()).toBeNull()
})

it('replays changes missed while the page was hidden', async () => {
  let visibility: DocumentVisibilityState = 'visible'
  vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility)
  const fetchMock = vi.fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({ ticket: 'first', apiBase: 'https://api.example.test' })))
    .mockResolvedValueOnce(new Response(new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(new TextEncoder().encode('id: epoch.5\nevent: changes\ndata: {"v":1,"changes":[]}\n\n')) },
    })))
    .mockResolvedValueOnce(new Response(JSON.stringify({ ticket: 'second', apiBase: 'https://api.example.test' })))
    .mockResolvedValueOnce(new Response(new ReadableStream<Uint8Array>({ start() {} })))
  vi.stubGlobal('fetch', fetchMock)
  const view = render(<AccountEventConnection />)
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
  visibility = 'hidden'
  document.dispatchEvent(new Event('visibilitychange'))
  visibility = 'visible'
  document.dispatchEvent(new Event('visibilitychange'))
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4))
  expect(fetchMock.mock.calls[3]?.[1]).toMatchObject({ headers: { 'Last-Event-ID': 'epoch.5' } })
  view.unmount()
})

it('refreshes each account query once after returning without a replay cursor', async () => {
  const setVisibility = stubVisibility()
  const client = useRealQueryClient()
  let openSecondStream!: (response: Response) => void
  const fetchMock = vi.fn()
    .mockResolvedValueOnce(ticketResponse('first'))
    .mockResolvedValueOnce(idleStream())
    .mockResolvedValueOnce(ticketResponse('second'))
    .mockReturnValueOnce(new Promise<Response>((resolve) => { openSecondStream = resolve }))
  vi.stubGlobal('fetch', fetchMock)
  const view = render(<AccountEventConnection />)
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
  await settle()
  const queries = observeAccountQueries(client)
  setVisibility('hidden')
  setVisibility('visible')
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4))
  await waitFor(() => expect(client.isFetching()).toBe(0))
  const beforeOpen = refreshCounts(queries)
  await settle(2)
  openSecondStream(idleStream())
  await settle()
  await waitFor(() => expect(client.isFetching()).toBe(0))
  expect({ beforeOpen, afterOpen: refreshCounts(queries) }).toEqual({ beforeOpen: [0, 0, 0], afterOpen: [1, 1, 1] })
  expect(fetchMock.mock.calls[3]?.[1]).toMatchObject({ headers: undefined })
  stopObserving(queries)
  view.unmount()
})

it('refreshes once when the first open after a return fails and again when the stream opens', async () => {
  const setVisibility = stubVisibility()
  const client = useRealQueryClient()
  let failSecondTicket!: (error: Error) => void
  const fetchMock = vi.fn()
    .mockResolvedValueOnce(ticketResponse('first'))
    .mockResolvedValueOnce(idleStream())
    .mockReturnValueOnce(new Promise<Response>((_resolve, reject) => { failSecondTicket = reject }))
    .mockResolvedValueOnce(ticketResponse('third'))
    .mockResolvedValueOnce(idleStream())
  vi.stubGlobal('fetch', fetchMock)
  const view = render(<AccountEventConnection />)
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
  await settle()
  const queries = observeAccountQueries(client)
  setVisibility('hidden')
  setVisibility('visible')
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3))
  await waitFor(() => expect(client.isFetching()).toBe(0))
  const beforeFailure = refreshCounts(queries)
  failSecondTicket(new Error('ticket unavailable'))
  await settle()
  await waitFor(() => expect(client.isFetching()).toBe(0))
  const afterFailure = refreshCounts(queries)
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(5), { timeout: 4000 })
  await settle()
  await waitFor(() => expect(client.isFetching()).toBe(0))
  expect({ beforeFailure, afterFailure, afterOpen: refreshCounts(queries) }).toEqual({
    beforeFailure: [0, 0, 0], afterFailure: [1, 1, 1], afterOpen: [2, 2, 2],
  })
  stopObserving(queries)
  view.unmount()
})

it('refreshes a query still fetching at a failed open after a return once that fetch settles', async () => {
  const setVisibility = stubVisibility()
  const client = useRealQueryClient()
  let failSecondTicket!: (error: Error) => void
  const fetchMock = vi.fn()
    .mockResolvedValueOnce(ticketResponse('first'))
    .mockResolvedValueOnce(idleStream())
    .mockReturnValueOnce(new Promise<Response>((_resolve, reject) => { failSecondTicket = reject }))
    .mockRejectedValue(new Error('ticket unavailable'))
  vi.stubGlobal('fetch', fetchMock)
  const view = render(<AccountEventConnection />)
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
  await settle()
  const idleQueries = observeAccountQueries(client, [habitKeys.count()])
  const inFlightQuery = observeInFlightQuery(client, profileKeys.detail())
  setVisibility('hidden')
  setVisibility('visible')
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3))
  failSecondTicket(new Error('ticket unavailable'))
  await waitFor(() => expect(refreshCounts(idleQueries)).toEqual([1]))
  expect(inFlightQuery.queryFn).toHaveBeenCalledTimes(1)
  inFlightQuery.settle('before the change')
  await waitFor(() => expect(inFlightQuery.observer.getCurrentResult().data).toBe('after return'))
  await waitFor(() => expect(client.isFetching()).toBe(0))
  expect({ idle: refreshCounts(idleQueries), inFlight: inFlightQuery.queryFn.mock.calls.length })
    .toEqual({ idle: [1], inFlight: 2 })
  inFlightQuery.unsubscribe()
  stopObserving(idleQueries)
  view.unmount()
})

it('refreshes each account query once after a cursorless stream closes and reopens', async () => {
  stubVisibility()
  const client = useRealQueryClient()
  let closeFirstStream!: () => void
  let openSecondStream!: (response: Response) => void
  const fetchMock = vi.fn()
    .mockResolvedValueOnce(ticketResponse('first'))
    .mockResolvedValueOnce(new Response(new ReadableStream<Uint8Array>({
      start(controller) { closeFirstStream = () => controller.close() },
    })))
    .mockResolvedValueOnce(ticketResponse('second'))
    .mockReturnValueOnce(new Promise<Response>((resolve) => { openSecondStream = resolve }))
  vi.stubGlobal('fetch', fetchMock)
  const view = render(<AccountEventConnection />)
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
  await settle()
  const queries = observeAccountQueries(client)
  closeFirstStream()
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4), { timeout: 3000 })
  await waitFor(() => expect(client.isFetching()).toBe(0))
  const beforeOpen = refreshCounts(queries)
  await settle(2)
  openSecondStream(idleStream())
  await settle()
  await waitFor(() => expect(client.isFetching()).toBe(0))
  expect({ beforeOpen, afterOpen: refreshCounts(queries) }).toEqual({ beforeOpen: [0, 0, 0], afterOpen: [1, 1, 1] })
  stopObserving(queries)
  view.unmount()
})

function ticketResponse(ticket: string) {
  return new Response(JSON.stringify({ ticket, apiBase: 'https://api.example.test' }))
}

function idleStream() {
  return new Response(new ReadableStream<Uint8Array>({ start() {} }))
}

function settle(milliseconds = 0) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

function stubVisibility() {
  let visibility: DocumentVisibilityState = 'visible'
  vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility)
  return (next: DocumentVisibilityState) => {
    visibility = next
    document.dispatchEvent(new Event('visibilitychange'))
  }
}

function useRealQueryClient() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  queryClientState.current = client
  return client
}

function observeAccountQueries(
  client: QueryClient,
  queryKeys: readonly (readonly unknown[])[] = [profileKeys.detail(), habitKeys.list({ date: 'today' }), habitKeys.count()],
) {
  return queryKeys.map((queryKey) => {
    client.setQueryData(queryKey, 'before return', { updatedAt: Date.now() - 60_000 })
    const queryFn = vi.fn(async () => 'after return')
    const unsubscribe = new QueryObserver(client, { queryKey, queryFn, staleTime: Infinity }).subscribe(() => {})
    return { queryFn, unsubscribe }
  })
}

function observeInFlightQuery(client: QueryClient, queryKey: readonly unknown[]) {
  client.setQueryData(queryKey, 'before return', { updatedAt: Date.now() - 60_000 })
  let settle!: (data: string) => void
  const queryFn = vi.fn()
    .mockReturnValueOnce(new Promise<string>((resolve) => { settle = resolve }))
    .mockResolvedValue('after return')
  const observer = new QueryObserver(client, { queryKey, queryFn, staleTime: Infinity })
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
