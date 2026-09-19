import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  announceAccountToOtherTabs,
  resetAccountSignalForTests,
  subscribeToAccountSignal,
} from '@/lib/cross-tab-account-signal'

const ACCOUNT_SIGNAL_CHANNEL = 'orbit-account-signal'

function settle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

/**
 * Stands in for a second tab, holding its channel open for the whole file.
 *
 * A channel closed in the turn it posted delivers nothing, which is the defect the module itself
 * was carrying, so a helper that opens and closes one per message reproduces it here.
 */
let otherTab: BroadcastChannel | null = null

function getOtherTab(): BroadcastChannel {
  otherTab ??= new BroadcastChannel(ACCOUNT_SIGNAL_CHANNEL)
  return otherTab
}

async function postRawPayload(payload: unknown): Promise<void> {
  getOtherTab().postMessage(payload)
  await settle()
}

describe('the cross-tab account signal', () => {
  const teardowns: Array<() => void> = []

  afterEach(() => {
    for (const teardown of teardowns.splice(0)) teardown()
    resetAccountSignalForTests()
    otherTab?.close()
    otherTab = null
  })

  function listen(): Array<string | null> {
    const announced: Array<string | null> = []
    teardowns.push(subscribeToAccountSignal((accountId) => announced.push(accountId)))
    return announced
  }

  it('carries an account from another tab', async () => {
    const announced = listen()

    await postRawPayload({ accountId: 'account-b' })

    expect(announced).toEqual(['account-b'])
  })

  it('carries a sign out from another tab', async () => {
    const announced = listen()

    await postRawPayload({ accountId: null })

    expect(announced).toEqual([null])
  })

  it('never hands a tab back its own announcement', async () => {
    const announced = listen()

    announceAccountToOtherTabs('account-b')
    announceAccountToOtherTabs(null)
    await settle()

    expect(announced).toEqual([])
  })

  it('reaches another tab that is listening on the channel', async () => {
    const received: unknown[] = []
    getOtherTab().addEventListener('message', (event) => received.push(event.data))

    announceAccountToOtherTabs('account-b')
    await settle()

    expect(received).toEqual([{ accountId: 'account-b' }])
  })

  it.each([
    ['a payload with no account', {}],
    ['an account that is not a string', { accountId: 7 }],
    ['an empty account', { accountId: '' }],
    ['a bare string', 'account-b'],
    ['nothing at all', null],
  ])('ignores %s rather than reading it as a sign out', async (_name, payload) => {
    const announced = listen()

    await postRawPayload(payload)

    expect(announced).toEqual([])
  })

  it('stops delivering once the listener is removed', async () => {
    const announced: Array<string | null> = []
    const stopListening = subscribeToAccountSignal((accountId) => announced.push(accountId))

    stopListening()
    await postRawPayload({ accountId: 'account-b' })

    expect(announced).toEqual([])
  })

  it('announces nothing and hands back a safe teardown where BroadcastChannel is missing', () => {
    resetAccountSignalForTests()
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
    resetAccountSignalForTests()
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
