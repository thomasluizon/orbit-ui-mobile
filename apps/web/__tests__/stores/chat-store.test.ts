import { describe, it, expect, beforeEach } from 'vitest'
import { useChatStore } from '@/stores/chat-store'
import type { ChatMessage } from '@orbit/shared/types/chat'

describe('chat store', () => {
  beforeEach(() => {
    useChatStore.setState({
      messages: [],
      isTyping: false,
      isStreaming: false,
    })
  })

  function makeMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
    return {
      id: 'msg-1',
      role: 'user',
      content: 'Hello',
      timestamp: new Date('2025-01-01T12:00:00Z'),
      ...overrides,
    }
  }

  // -------------------------------------------------------------------------
  // Initial state
  // -------------------------------------------------------------------------

  describe('initial state', () => {
    it('starts with empty messages', () => {
      const state = useChatStore.getState()
      expect(state.messages).toEqual([])
    })

    it('starts with typing and streaming false', () => {
      const state = useChatStore.getState()
      expect(state.isTyping).toBe(false)
      expect(state.isStreaming).toBe(false)
    })
  })

  // -------------------------------------------------------------------------
  // addMessage
  // -------------------------------------------------------------------------

  describe('addMessage', () => {
    it('adds a user message', () => {
      const { addMessage } = useChatStore.getState()
      addMessage(makeMessage({ id: 'msg-1', role: 'user', content: 'Hi' }))

      const state = useChatStore.getState()
      expect(state.messages).toHaveLength(1)
      expect(state.messages[0]!.role).toBe('user')
      expect(state.messages[0]!.content).toBe('Hi')
    })

    it('adds an AI message', () => {
      const { addMessage } = useChatStore.getState()
      addMessage(makeMessage({ id: 'msg-2', role: 'ai', content: 'Hello! How can I help?' }))

      const state = useChatStore.getState()
      expect(state.messages).toHaveLength(1)
      expect(state.messages[0]!.role).toBe('ai')
    })

    it('appends messages in order', () => {
      const { addMessage } = useChatStore.getState()
      addMessage(makeMessage({ id: 'msg-1', content: 'First' }))
      addMessage(makeMessage({ id: 'msg-2', content: 'Second' }))
      addMessage(makeMessage({ id: 'msg-3', content: 'Third' }))

      const state = useChatStore.getState()
      expect(state.messages).toHaveLength(3)
      expect(state.messages[0]!.content).toBe('First')
      expect(state.messages[1]!.content).toBe('Second')
      expect(state.messages[2]!.content).toBe('Third')
    })

    it('preserves message actions', () => {
      const { addMessage } = useChatStore.getState()
      addMessage(
        makeMessage({
          id: 'msg-ai',
          role: 'ai',
          content: 'Created habit!',
          actions: [
            {
              type: 'CreateHabit',
              status: 'Success',
              entityId: 'h-1',
              entityName: 'Exercise',
              error: null,
              field: null,
              suggestedSubHabits: null,
              conflictWarning: null,
            },
          ],
        }),
      )

      const state = useChatStore.getState()
      expect(state.messages[0]!.actions).toHaveLength(1)
      expect(state.messages[0]!.actions![0]!.type).toBe('CreateHabit')
    })
  })

  // -------------------------------------------------------------------------
  // setIsTyping
  // -------------------------------------------------------------------------

  describe('setIsTyping', () => {
    it('sets typing to true', () => {
      const { setIsTyping } = useChatStore.getState()
      setIsTyping(true)
      expect(useChatStore.getState().isTyping).toBe(true)
    })

    it('sets typing to false', () => {
      useChatStore.setState({ isTyping: true })
      const { setIsTyping } = useChatStore.getState()
      setIsTyping(false)
      expect(useChatStore.getState().isTyping).toBe(false)
    })
  })

  // -------------------------------------------------------------------------
  // setIsStreaming
  // -------------------------------------------------------------------------

  describe('setIsStreaming', () => {
    it('sets streaming to true', () => {
      const { setIsStreaming } = useChatStore.getState()
      setIsStreaming(true)
      expect(useChatStore.getState().isStreaming).toBe(true)
    })

    it('sets streaming to false', () => {
      useChatStore.setState({ isStreaming: true })
      const { setIsStreaming } = useChatStore.getState()
      setIsStreaming(false)
      expect(useChatStore.getState().isStreaming).toBe(false)
    })
  })

  // -------------------------------------------------------------------------
  // clearMessages
  // -------------------------------------------------------------------------

  describe('clearMessages', () => {
    it('clears all messages', () => {
      const { addMessage, clearMessages } = useChatStore.getState()
      addMessage(makeMessage({ id: 'msg-1' }))
      addMessage(makeMessage({ id: 'msg-2' }))

      clearMessages()

      expect(useChatStore.getState().messages).toEqual([])
    })

    it('resets typing state', () => {
      useChatStore.setState({ isTyping: true })
      const { clearMessages } = useChatStore.getState()
      clearMessages()
      expect(useChatStore.getState().isTyping).toBe(false)
    })

    it('resets streaming state', () => {
      useChatStore.setState({ isStreaming: true })
      const { clearMessages } = useChatStore.getState()
      clearMessages()
      expect(useChatStore.getState().isStreaming).toBe(false)
    })
  })
})
