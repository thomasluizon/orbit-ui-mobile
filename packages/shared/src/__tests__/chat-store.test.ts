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

  it('appends streamed text to the target message only', () => {
    const store = createStoreHarness()
    store.getState().addMessage({
      id: 'draft-1',
      role: 'ai',
      content: '',
      timestamp: new Date('2026-04-06T00:00:00Z'),
    })
    store.getState().addMessage({
      id: 'other',
      role: 'user',
      content: 'question',
      timestamp: new Date('2026-04-06T00:00:01Z'),
    })

    store.getState().appendToMessageContent('draft-1', 'Hel')
    store.getState().appendToMessageContent('draft-1', 'lo!')
    store.getState().appendToMessageContent('missing-id', 'ignored')

    const [draft, other] = store.getState().messages
    expect(draft?.content).toBe('Hello!')
    expect(other?.content).toBe('question')
  })

  it('patches an existing message without touching other fields', () => {
    const store = createStoreHarness()
    store.getState().addMessage({
      id: 'draft-1',
      role: 'ai',
      content: 'streamed text',
      timestamp: new Date('2026-04-06T00:00:00Z'),
    })

    store.getState().updateMessage('draft-1', {
      content: 'final text',
      correlationId: 'trace-9',
    })

    expect(store.getState().messages[0]).toMatchObject({
      id: 'draft-1',
      role: 'ai',
      content: 'final text',
      correlationId: 'trace-9',
    })
  })
})
