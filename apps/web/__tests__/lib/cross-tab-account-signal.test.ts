import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  announceAccountToOtherTabs,
  subscribeToAccountSignal,
} from '@/lib/cross-tab-account-signal'

const ACCOUNT_SIGNAL_CHANNEL = 'orbit-account-signal'

function settle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

async function postRawPayload(payload: unknown): Promise<void> {
  const otherTab = new BroadcastChannel(ACCOUNT_SIGNAL_CHANNEL)
  otherTab.postMessage(payload)
  otherTab.close()
  await settle()
}

describe('the cross-tab account signal', () => {
  const teardowns: Array<() => void> = []

  afterEach(() => {
    for (const teardown of teardowns.splice(0)) teardown()
  })

  function listen(): string[] {
    const announced: string[] = []
    teardowns.push(subscribeToAccountSignal((accountId) => announced.push(accountId)))
    return announced
  }

  it('carries the announced account to a listening tab', async () => {
    const announced = listen()

    announceAccountToOtherTabs('account-b')
    await settle()

    expect(announced).toEqual(['account-b'])
  })

  it.each([
    ['a payload with no account', {}],
    ['an account that is not a string', { accountId: 7 }],
    ['an empty account', { accountId: '' }],
    ['a bare string', 'account-b'],
    ['nothing at all', null],
  ])('ignores %s', async (_name, payload) => {
    const announced = listen()

    await postRawPayload(payload)

    expect(announced).toEqual([])
  })

  it('stops delivering once the listener is removed', async () => {
    const announced: string[] = []
    const stopListening = subscribeToAccountSignal((accountId) => announced.push(accountId))

    stopListening()
    announceAccountToOtherTabs('account-b')
    await settle()

    expect(announced).toEqual([])
  })

  it('announces nothing and hands back a safe teardown where BroadcastChannel is missing', () => {
    const realBroadcastChannel = globalThis.BroadcastChannel
    Reflect.deleteProperty(globalThis, 'BroadcastChannel')
    const onAccountAnnounced = vi.fn()

    try {
      const stopListening = subscribeToAccountSignal(onAccountAnnounced)
      announceAccountToOtherTabs('account-b')
      stopListening()
    } finally {
      globalThis.BroadcastChannel = realBroadcastChannel
    }

    expect(onAccountAnnounced).not.toHaveBeenCalled()
  })

  it('announces nothing when the channel cannot be opened', () => {
    const realBroadcastChannel = globalThis.BroadcastChannel
    globalThis.BroadcastChannel = class {
      constructor() {
        throw new Error('Channels are blocked in this context')
      }
    } as unknown as typeof BroadcastChannel

    try {
      expect(() => announceAccountToOtherTabs('account-b')).not.toThrow()
      expect(() => subscribeToAccountSignal(vi.fn())()).not.toThrow()
    } finally {
      globalThis.BroadcastChannel = realBroadcastChannel
    }
  })
})
