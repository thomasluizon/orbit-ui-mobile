import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  accountId: 'account-a',
  stored: new Map<string, string>(),
  captureError: vi.fn(),
  delayedReads: new Set<string>(),
  readResolvers: new Map<string, (value: string | null) => void>(),
  delayedWrites: new Set<string>(),
  writeResolvers: new Map<string, () => void>(),
}))

vi.mock('@/lib/account-scope', () => ({ getAccountId: () => state.accountId }))
vi.mock('@/lib/sentry', () => ({ captureError: state.captureError }))
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: (key: string) => new Promise<string | null>((resolve) => {
      if (state.delayedReads.has(key)) state.readResolvers.set(key, resolve)
      else resolve(state.stored.get(key) ?? null)
    }),
    setItem: (key: string, value: string) => {
      return new Promise<void>((resolve) => {
        const finish = () => { state.stored.set(key, value); resolve() }
        if (state.delayedWrites.has(key)) state.writeResolvers.set(key, finish)
        else finish()
      })
    },
  },
}))

describe('bulk replay success delivery', () => {
  beforeEach(() => {
    vi.resetModules()
    state.accountId = 'account-a'
    state.stored.clear()
    state.delayedReads.clear()
    state.readResolvers.clear()
    state.delayedWrites.clear()
    state.writeResolvers.clear()
    state.captureError.mockClear()
  })

  it('delivers a confirmed replay after restart and clears its account record', async () => {
    const firstSession = await import('@/lib/bulk-replay-events')
    const success = {
      mutationId: 'mutation-1',
      type: 'bulkLogHabits' as const,
      items: [{ habitId: 'child', date: '2026-09-25' }],
    }
    await firstSession.notifyBulkReplaySuccess(success)
    expect(state.stored.get('@orbit/bulk-replay-successes:account-a')).toContain('mutation-1')

    vi.resetModules()
    const nextSession = await import('@/lib/bulk-replay-events')
    const listener = vi.fn(() => true)
    const unsubscribe = nextSession.subscribeBulkReplaySuccesses(listener)

    await vi.waitFor(() => expect(listener).toHaveBeenCalledExactlyOnceWith(success))
    await vi.waitFor(() => expect(state.stored.get('@orbit/bulk-replay-successes:account-a'))
      .toBe('[]'))
    unsubscribe()
    expect(state.captureError).not.toHaveBeenCalled()
  })

  it('keeps delayed reads and writes with their originating account', async () => {
    const replay = await import('@/lib/bulk-replay-events')
    const keyA = '@orbit/bulk-replay-successes:account-a'
    const keyB = '@orbit/bulk-replay-successes:account-b'
    const successA = { mutationId: 'a', type: 'bulkLogHabits' as const, items: [{ habitId: 'a' }] }
    const successB = { mutationId: 'b', type: 'bulkLogHabits' as const, items: [{ habitId: 'b' }] }
    state.stored.set(keyA, JSON.stringify([successA]))
    state.stored.set(keyB, JSON.stringify([successB]))
    state.delayedReads.add(keyA)
    const listenerA = vi.fn(() => true)
    const unsubscribeA = replay.subscribeBulkReplaySuccesses(listenerA)
    state.accountId = 'account-b'
    const listenerB = vi.fn(() => false)
    const unsubscribeB = replay.subscribeBulkReplaySuccesses(listenerB)
    await vi.waitFor(() => expect(listenerB).toHaveBeenCalledWith(successB))
    const finishA = state.readResolvers.get(keyA)!
    finishA(state.stored.get(keyA)!)
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(state.stored.get(keyB)).toContain('"mutationId":"b"')
    expect(listenerB).not.toHaveBeenCalledWith(successA)
    expect(state.stored.get(keyA)).toContain('"mutationId":"a"')
    unsubscribeA()
    unsubscribeB()
  })

  it('persists each account when storage writes finish out of order', async () => {
    const replay = await import('@/lib/bulk-replay-events')
    const keyA = '@orbit/bulk-replay-successes:account-a'
    const keyB = '@orbit/bulk-replay-successes:account-b'
    state.delayedWrites.add(keyA)
    const writeA = replay.notifyBulkReplaySuccess({
      mutationId: 'write-a', type: 'bulkSkipHabits', items: [{ habitId: 'a' }],
    })
    await vi.waitFor(() => expect(state.writeResolvers.has(keyA)).toBe(true))
    state.accountId = 'account-b'
    await replay.notifyBulkReplaySuccess({
      mutationId: 'write-b', type: 'bulkSkipHabits', items: [{ habitId: 'b' }],
    })
    expect(state.stored.get(keyB)).toContain('"mutationId":"write-b"')
    state.writeResolvers.get(keyA)!()
    await writeA
    expect(state.stored.get(keyA)).toContain('"mutationId":"write-a"')
    expect(state.stored.get(keyB)).toContain('"mutationId":"write-b"')
  })

  it('persists only the unhandled items from a mixed delivery', async () => {
    const firstSession = await import('@/lib/bulk-replay-events')
    const success = {
      mutationId: 'partial', type: 'bulkLogHabits' as const,
      items: [{ habitId: 'present' }, { habitId: 'missing' }],
    }
    const unsubscribe = firstSession.subscribeBulkReplaySuccesses((event) =>
      event.items.filter((item) => item.habitId === 'missing'))
    await firstSession.notifyBulkReplaySuccess(success)
    unsubscribe()
    const key = '@orbit/bulk-replay-successes:account-a'
    expect(JSON.parse(state.stored.get(key)!)[0].items).toEqual([{ habitId: 'missing' }])

    vi.resetModules()
    const nextSession = await import('@/lib/bulk-replay-events')
    const listener = vi.fn(() => true)
    const unsubscribeNext = nextSession.subscribeBulkReplaySuccesses(listener)
    await vi.waitFor(() => expect(listener).toHaveBeenCalledWith({
      ...success, items: [{ habitId: 'missing' }],
    }))
    unsubscribeNext()
  })
})
