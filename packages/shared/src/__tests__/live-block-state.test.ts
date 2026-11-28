import { describe, expect, it, vi } from 'vitest'
import { calendarBlockErrorKey, liveBlockState } from '../chat/live-block-state'

const settled = { isPending: false, isError: false, isRefetchError: false }
const copy = { staleMessage: 'Refresh', onRefresh: vi.fn() }

describe('liveBlockState', () => {
  it.each([
    ['acting', { ...settled, isRefetchError: true }, { acting: true }],
    ['partiallyFailed', { ...settled, isError: true }, {}],
    ['partiallyFailed', settled, { failed: true }],
    ['loading', { ...settled, isPending: true }, {}],
    ['resting', settled, {}],
  ])('reads %s', (state, query, flags) => {
    expect(liveBlockState(query, { ...copy, ...flags })).toEqual({ state })
  })

  it.each([
    [{ ...settled, isError: true, isRefetchError: true }, {}],
    [settled, { stale: true }],
  ])('offers a refresh for old data', (query, flags) => {
    expect(liveBlockState(query, { ...copy, ...flags })).toEqual({ state: 'stale', ...copy })
  })
})

describe('calendarBlockErrorKey', () => {
  const sync = { enabled: true, status: 'Idle' as const, lastSyncedAt: null }

  it.each([
    [false, true, undefined, 'chat.calendarCard.syncState.ReconnectRequired'],
    [true, false, { ...sync, status: 'ReconnectRequired' as const }, 'chat.calendarCard.syncState.ReconnectRequired'],
    [true, false, sync, 'chat.liveBlock.error'],
    [false, false, { ...sync, status: 'TransientError' as const }, 'chat.calendarCard.syncState.TransientError'],
    [false, false, { ...sync, enabled: false, status: 'TransientError' as const }, null],
    [false, false, sync, null],
  ])('with a failed query %s and a lost connection %s, reads the error of the sync', (failed, disconnected, state, key) => {
    expect(calendarBlockErrorKey(failed, disconnected, state)).toBe(key)
  })
})
