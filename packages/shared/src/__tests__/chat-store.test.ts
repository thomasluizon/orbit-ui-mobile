import { beforeEach, describe, expect, it } from 'vitest'
import type { ChatStoreState } from '../stores/chat-store'
import { createChatStoreState } from '../stores/chat-store'

function createStoreHarness() {
  let state = {} as ChatStoreState

  const set = (
    partial: Partial<ChatStoreState> | ((current: ChatStoreState) => Partial<ChatStoreState>),
  ) => {
    const next = typeof partial === 'function' ? partial(state) : partial
    state = { ...state, ...next }
  }

  state = createChatStoreState(set)

  return {
    getState: () => state,
  }
}

describe('shared chat store', () => {
  beforeEach(() => {
    createStoreHarness()
  })

  it('appends messages and toggles typing state', () => {
    const store = createStoreHarness()
    const { addMessage, setIsTyping } = store.getState()

    addMessage({
      id: 'message-1',
      role: 'ai',
      content: 'Hello',
      timestamp: new Date('2026-04-06T00:00:00Z'),
    })
    setIsTyping(true)

    expect(store.getState()).toMatchObject({
      isTyping: true,
      messages: [
        expect.objectContaining({
          id: 'message-1',
          role: 'ai',
          content: 'Hello',
        }),
      ],
    })
  })
})
