import { afterEach, expect, it, vi } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import { QueryClient, QueryObserver } from '@tanstack/query-core'
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

it('refreshes Today when returning without a replay cursor', async () => {
  let visibility: DocumentVisibilityState = 'visible'
  vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility)
  const fetchMock = vi.fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({ ticket: 'first', apiBase: 'https://api.example.test' })))
    .mockResolvedValueOnce(new Response(new ReadableStream<Uint8Array>({ start() {} })))
    .mockResolvedValueOnce(new Response(JSON.stringify({ ticket: 'second', apiBase: 'https://api.example.test' })))
    .mockResolvedValueOnce(new Response(new ReadableStream<Uint8Array>({ start() {} })))
  vi.stubGlobal('fetch', fetchMock)
  const view = render(<AccountEventConnection />)
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
  visibility = 'hidden'
  document.dispatchEvent(new Event('visibilitychange'))
  visibility = 'visible'
  document.dispatchEvent(new Event('visibilitychange'))
  await waitFor(() => expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['habits'] }))
  expect(fetchMock).toHaveBeenCalledTimes(4)
  view.unmount()
})
