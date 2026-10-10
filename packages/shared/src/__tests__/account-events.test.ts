import { describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryObserver } from '@tanstack/query-core'
import { createAccountEventParser, consumeAccountEventStream } from '../query/account-event-stream'
import {
  accountChangeQueryKeys, invalidateAccountEvent, invalidateAccountQueriesAtFailure, invalidateAccountQueriesBefore,
} from '../query/account-events'
import { goalKeys, habitKeys, notificationKeys, profileKeys } from '../query/keys'
import { createApiClientError } from '../utils/error-utils'

const habitId = '123e4567-e89b-42d3-a456-426614174000'
const payload = { v: 1 as const, changes: [{ kind: 'habitLog' as const, op: 'create' as const, ids: [habitId], dates: ['2026-09-26'] }], origin: 'own' }

describe('account events', () => {
  it('parses split SSE frames and ignores heartbeats', () => {
    const parser = createAccountEventParser()
    expect(parser.feed(': heartbeat\n\n' + 'event: ready\ndata: {"connectionId":"own"}\r')).toEqual([])
    expect(parser.feed('\n\r\nid: epoch.1\nevent: changes\ndata: ' + JSON.stringify(payload) + '\n\n')).toEqual([
      { type: 'ready', connectionId: 'own', id: null },
      { type: 'changes', payload, id: 'epoch.1' },
    ])
  })

  it('maps notifications and skips events from the same connection', () => {
    expect(accountChangeQueryKeys({ kind: 'notification', op: 'create', ids: [habitId] })).toContainEqual(notificationKeys.all)
    const invalidateQueries = vi.fn()
    invalidateAccountEvent({ invalidateQueries }, { type: 'changes', payload }, 'own')
    expect(invalidateQueries).not.toHaveBeenCalled()
    invalidateAccountEvent({ invalidateQueries }, { type: 'changes', payload }, 'other')
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: habitKeys.all })
    expect(accountChangeQueryKeys({ kind: 'futureKind', op: 'update', ids: [] })).toContainEqual(habitKeys.all)
  })

  it('refreshes cached account data from before mount without fetching fresh data again', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const mountedAt = Date.now() - 500
    const oldKey = habitKeys.list({ date: 'today' })
    const freshKey = goalKeys.list({ status: 'active' })
    client.setQueryData(oldKey, 'old', { updatedAt: mountedAt - 1 })
    client.setQueryData(freshKey, 'fresh', { updatedAt: mountedAt + 1 })
    const fetchOld = vi.fn(async () => 'changed')
    const fetchFresh = vi.fn(async () => 'fresh')
    const oldObserver = new QueryObserver(client, { queryKey: oldKey, queryFn: fetchOld, staleTime: Infinity })
    const freshObserver = new QueryObserver(client, { queryKey: freshKey, queryFn: fetchFresh, staleTime: Infinity })
    const stopOld = oldObserver.subscribe(() => {})
    const stopFresh = freshObserver.subscribe(() => {})
    expect(fetchOld).not.toHaveBeenCalled()
    expect(fetchFresh).not.toHaveBeenCalled()

    invalidateAccountQueriesBefore(client, mountedAt)
    await vi.waitFor(() => expect(oldObserver.getCurrentResult().data).toBe('changed'))
    invalidateAccountQueriesBefore(client, mountedAt)
    expect(fetchOld).toHaveBeenCalledTimes(1)
    expect(fetchFresh).not.toHaveBeenCalled()
    stopOld()
    stopFresh()
    client.clear()
  })

  it('refreshes an account query fetching at a failed open once that fetch settles or fails', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    client.setQueryData(habitKeys.count(), 'before failure', { updatedAt: Date.now() - 1000 })
    const fetchIdle = vi.fn(async () => 'after failure')
    const stopIdle = new QueryObserver(client, { queryKey: habitKeys.count(), queryFn: fetchIdle, staleTime: Infinity }).subscribe(() => {})
    const settling = observeHeldQuery(client, profileKeys.detail())
    const failing = observeHeldQuery(client, goalKeys.list({ status: 'active' }))

    invalidateAccountQueriesAtFailure(client, Date.now(), new AbortController().signal)
    await vi.waitFor(() => expect(fetchIdle).toHaveBeenCalledTimes(1))
    expect([settling.queryFn.mock.calls.length, failing.queryFn.mock.calls.length]).toEqual([1, 1])
    settling.release.resolve('before the change')
    failing.release.reject(new Error('network unavailable'))
    await vi.waitFor(() => expect(settling.observer.getCurrentResult().data).toBe('after failure'))
    await vi.waitFor(() => expect(failing.observer.getCurrentResult().data).toBe('after failure'))
    expect([fetchIdle, settling.queryFn, failing.queryFn].map((queryFn) => queryFn.mock.calls.length)).toEqual([1, 2, 2])
    expect(client.getQueryCache().hasListeners()).toBe(false)
    stopIdle()
    settling.unsubscribe()
    failing.unsubscribe()
    client.clear()
  })

  it('leaves a cancelled fetch to its canceller and a fetch that settles after the connection closed', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const cancelled = observeHeldQuery(client, habitKeys.list({ date: 'today' }))
    const closed = observeHeldQuery(client, goalKeys.list({ status: 'active' }))
    const controller = new AbortController()

    invalidateAccountQueriesAtFailure(client, Date.now(), controller.signal)
    await client.cancelQueries({ queryKey: habitKeys.list({ date: 'today' }) })
    controller.abort()
    expect(client.getQueryCache().hasListeners()).toBe(false)
    closed.release.resolve('before the change')
    await vi.waitFor(() => expect(closed.observer.getCurrentResult().data).toBe('before the change'))
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect([cancelled.queryFn.mock.calls.length, closed.queryFn.mock.calls.length]).toEqual([1, 1])
    expect(cancelled.observer.getCurrentResult().data).toBe('before failure')
    cancelled.unsubscribe()
    closed.unsubscribe()
    client.clear()
  })

  it('reconnects with the last event id and recovers on resync', async () => {
    const controller = new AbortController()
    const ids: (string | null)[] = []
    const events: string[] = []
    const encoder = new TextEncoder()
    let attempt = 0
    const open = vi.fn(async (_signal: AbortSignal, lastId: string | null) => {
      ids.push(lastId)
      attempt += 1
      const frame = attempt === 1
        ? `id: epoch.1\nevent: changes\ndata: ${JSON.stringify(payload)}\n\n`
        : 'event: resync\ndata: {"v":1,"changes":[]}\n\n'
      return { ok: true, body: new ReadableStream<Uint8Array>({
        start(stream) { stream.enqueue(encoder.encode(frame)); stream.close() },
      }) }
    })
    vi.useFakeTimers()
    try {
      const running = consumeAccountEventStream({
        open,
        signal: controller.signal,
        onOpen: () => {},
        onReconnect: () => events.push('reconnect'),
        onEvent: (event) => {
          events.push(event.type)
          if (event.type === 'resync') controller.abort()
        },
      })
      await vi.advanceTimersByTimeAsync(1000)
      await running
      expect(ids).toEqual([null, 'epoch.1'])
      expect(events).toEqual(['changes', 'reconnect', 'resync'])
    } finally {
      vi.useRealTimers()
    }
  })

  it('refreshes queries fetched during a failed first open when the cursorless stream opens', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const controller = new AbortController()
    const oldKey = habitKeys.list({ date: 'today' })
    const freshKey = goalKeys.list({ status: 'active' })
    client.setQueryData(oldKey, 'before connection', { updatedAt: Date.now() - 1000 })
    client.setQueryData(freshKey, 'already fresh', { updatedAt: Date.now() + 10000 })
    const fetchOld = vi.fn(async () => 'after connection')
    const fetchFresh = vi.fn(async () => 'already fresh')
    const stopOld = new QueryObserver(client, { queryKey: oldKey, queryFn: fetchOld, staleTime: Infinity }).subscribe(() => {})
    const stopFresh = new QueryObserver(client, { queryKey: freshKey, queryFn: fetchFresh, staleTime: Infinity }).subscribe(() => {})
    const open = vi.fn()
      .mockRejectedValueOnce(new Error('ticket unavailable'))
      .mockResolvedValueOnce({ ok: true, body: new ReadableStream<Uint8Array>({ start(stream) { stream.close() } }) })
    vi.useFakeTimers()
    try {
      const running = consumeAccountEventStream({
        open,
        signal: controller.signal,
        onEvent: () => {},
        onReconnect: () => {},
        onOpen: (openedAt) => {
          invalidateAccountQueriesBefore(client, openedAt)
        },
      })
      await vi.advanceTimersByTimeAsync(2000)
      controller.abort()
      await running
    } finally {
      vi.useRealTimers()
    }
    await vi.waitFor(() => expect(fetchOld).toHaveBeenCalledTimes(1))
    expect(fetchFresh).not.toHaveBeenCalled()
    expect(open).toHaveBeenCalledTimes(2)
    stopOld()
    stopFresh()
    client.clear()
  })

  it('reports only the first failed open of a resumed stream, then refreshes when it opens', async () => {
    const open = vi.fn()
      .mockRejectedValueOnce(new Error('ticket unavailable'))
      .mockResolvedValueOnce({ ok: false, body: null })
      .mockResolvedValueOnce(closedStream())
    const calls = await recordStreamCallbacks(open, { resumed: true }, 6000)
    expect(open).toHaveBeenCalledTimes(3)
    expect(calls).toEqual(['failure', 'open', 'reconnect'])
  })

  it('does not report a failed first open before the stream ever opened', async () => {
    const open = vi.fn()
      .mockRejectedValueOnce(new Error('ticket unavailable'))
      .mockResolvedValueOnce(closedStream())
    const calls = await recordStreamCallbacks(open, {}, 2000)
    expect(open).toHaveBeenCalledTimes(2)
    expect(calls).toEqual(['open', 'reconnect'])
  })

  it('refreshes once for each gap after a cursorless stream closes', async () => {
    const open = vi.fn()
      .mockResolvedValueOnce(closedStream())
      .mockRejectedValueOnce(new Error('ticket unavailable'))
      .mockRejectedValueOnce(new Error('ticket unavailable'))
      .mockResolvedValueOnce(closedStream())
      .mockResolvedValueOnce(closedStream())
    const calls = await recordStreamCallbacks(open, {}, 11000)
    expect(open).toHaveBeenCalledTimes(5)
    expect(calls).toEqual(['open', 'reconnect', 'failure', 'open', 'reconnect', 'open', 'reconnect'])
  })

  it('refreshes a failed reopen with an event id and preserves server replay', async () => {
    const open = vi.fn()
      .mockResolvedValueOnce(closedStream(`id: epoch.1\nevent: changes\ndata: ${JSON.stringify(payload)}\n\n`))
      .mockRejectedValueOnce(new Error('ticket unavailable'))
      .mockResolvedValueOnce(closedStream())
    const calls = await recordStreamCallbacks(open, { resumed: true }, 3000)
    expect(open.mock.calls.map((call) => call[1])).toEqual([null, 'epoch.1', 'epoch.1'])
    expect(calls).toEqual(['open', 'reconnect', 'failure', 'cursor open', 'reconnect'])
  })
})

function observeHeldQuery(client: QueryClient, queryKey: readonly unknown[]) {
  client.setQueryData(queryKey, 'before failure', { updatedAt: Date.now() - 1000 })
  let release!: { resolve: (data: string) => void; reject: (error: Error) => void }
  const queryFn = vi.fn()
    .mockReturnValueOnce(new Promise<string>((resolve, reject) => { release = { resolve, reject } }))
    .mockResolvedValue('after failure')
  const observer = new QueryObserver(client, { queryKey, queryFn, staleTime: Infinity })
  const unsubscribe = observer.subscribe(() => {})
  void observer.refetch()
  return { queryFn, observer, unsubscribe, release }
}

function closedStream(frame = '') {
  return { ok: true, body: new ReadableStream<Uint8Array>({
    start(stream) {
      if (frame) stream.enqueue(new TextEncoder().encode(frame))
      stream.close()
    },
  }) }
}

async function recordStreamCallbacks(
  open: Parameters<typeof consumeAccountEventStream>[0]['open'],
  options: { resumed?: boolean },
  duration: number,
): Promise<string[]> {
  const controller = new AbortController()
  const calls: string[] = []
  vi.useFakeTimers()
  try {
    const running = consumeAccountEventStream({
      ...options,
      open,
      signal: controller.signal,
      onEvent: () => {},
      onOpen: (_openedAt, hasReplayCursor) => { calls.push(hasReplayCursor ? 'cursor open' : 'open') },
      onFirstFailure: () => { calls.push('failure') },
      onReconnect: () => { calls.push('reconnect') },
    })
    await vi.advanceTimersByTimeAsync(duration)
    controller.abort()
    await running
  } finally {
    vi.useRealTimers()
  }
  return calls
}

it.each([429, 503])('honours a stream %s Retry-After without a 429 failure fan-out', async (status) => {
  vi.useFakeTimers()
  const controller = new AbortController()
  const open = vi.fn().mockResolvedValue(new Response(null, { status, headers: { 'Retry-After': '60' } }))
  const onFirstFailure = vi.fn()
  const running = consumeAccountEventStream({
    open, resumed: true, signal: controller.signal,
    onEvent: () => {}, onOpen: () => {}, onReconnect: () => {}, onFirstFailure,
  })
  try {
    await vi.advanceTimersByTimeAsync(59_999)
    expect(open).toHaveBeenCalledOnce()
    expect(onFirstFailure).toHaveBeenCalledTimes(status === 429 ? 0 : 1)
    await vi.advanceTimersByTimeAsync(1)
    expect(open).toHaveBeenCalledTimes(2)
  } finally {
    controller.abort()
    await running
    vi.useRealTimers()
  }
})

it('keeps a starting event connection from invalidating pending account reads', async () => {
  vi.useFakeTimers()
  const controller = new AbortController()
  const open = vi.fn().mockRejectedValue(createApiClientError(503, { errorCode: 'UPSTREAM_STARTING' }, 'Unavailable', '5'))
  const onFirstFailure = vi.fn()
  const running = consumeAccountEventStream({
    open, resumed: true, signal: controller.signal,
    onEvent: () => {}, onOpen: () => {}, onReconnect: () => {}, onFirstFailure,
  })
  try {
    await vi.advanceTimersByTimeAsync(5_000)
    expect(open).toHaveBeenCalledTimes(2)
    expect(onFirstFailure).not.toHaveBeenCalled()
  } finally {
    controller.abort()
    await running
    vi.useRealTimers()
  }
})
