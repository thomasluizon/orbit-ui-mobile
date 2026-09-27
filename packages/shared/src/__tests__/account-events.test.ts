import { describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryObserver } from '@tanstack/query-core'
import { createAccountEventParser, consumeAccountEventStream } from '../query/account-event-stream'
import { accountChangeQueryKeys, invalidateAccountEvent, invalidateAccountQueriesBefore } from '../query/account-events'
import { goalKeys, habitKeys, notificationKeys } from '../query/keys'

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
})
