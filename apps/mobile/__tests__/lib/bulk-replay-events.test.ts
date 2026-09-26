import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  accountId: 'account-a',
  stored: new Map<string, string>(),
  captureError: vi.fn(),
}))

vi.mock('@/lib/account-scope', () => ({ getAccountId: () => state.accountId }))
vi.mock('@/lib/sentry', () => ({ captureError: state.captureError }))
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: (key: string) => Promise.resolve(state.stored.get(key) ?? null),
    setItem: (key: string, value: string) => {
      state.stored.set(key, value)
      return Promise.resolve()
    },
  },
}))

describe('bulk replay success delivery', () => {
  beforeEach(() => {
    vi.resetModules()
    state.accountId = 'account-a'
    state.stored.clear()
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
})
