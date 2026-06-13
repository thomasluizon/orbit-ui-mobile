import { beforeEach, describe, expect, it } from 'vitest'
import { useChatStore } from '@/stores/chat-store'

describe('mobile chat store', () => {
  beforeEach(() => {
    useChatStore.setState({
      messages: [],
      isTyping: false,
    })
  })

  it('appends messages and toggles the typing flag', () => {
    const { addMessage, setIsTyping } = useChatStore.getState()

    addMessage({
      id: 'message-1',
      role: 'ai',
      content: 'Hello',
      timestamp: new Date('2026-04-06T00:00:00Z'),
    })
    setIsTyping(true)

    const state = useChatStore.getState()
    expect(state.messages).toHaveLength(1)
    expect(state.isTyping).toBe(true)
  })

  it('clears the conversation state', () => {
    useChatStore.setState({
      messages: [
        {
          id: 'message-1',
          role: 'ai',
          content: 'Hello',
          timestamp: new Date('2026-04-06T00:00:00Z'),
        },
      ],
      isTyping: true,
    })

    useChatStore.getState().clearMessages()

    expect(useChatStore.getState()).toMatchObject({
      messages: [],
      isTyping: false,
    })
  })
})
