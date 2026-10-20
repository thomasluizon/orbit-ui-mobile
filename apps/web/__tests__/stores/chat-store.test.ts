import { describe, it, expect, beforeEach } from 'vitest'
import { useChatStore } from '@/stores/chat-store'
import { CHAT_DRAFT_STORAGE_KEY } from '@orbit/shared/hooks'
import type { ChatMessage } from '@orbit/shared/types/chat'

describe('chat store', () => {
  beforeEach(() => {
    globalThis.localStorage.removeItem(CHAT_DRAFT_STORAGE_KEY)
    useChatStore.setState({
      messages: [],
      isTyping: false,
      streamingMessageId: null,
      draft: '',
      draftRevision: 0,
      draftHydrated: false,
      contextualSuggestion: null,
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


  describe('initial state', () => {
    it('starts with empty messages', () => {
      const state = useChatStore.getState()
      expect(state.messages).toEqual([])
    })

    it('starts with typing false', () => {
      const state = useChatStore.getState()
      expect(state.isTyping).toBe(false)
    })
  })


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


  describe('resetAccountScopedChat', () => {
    it('clears all messages', () => {
      const { addMessage, resetAccountScopedChat } = useChatStore.getState()
      addMessage(makeMessage({ id: 'msg-1' }))
      addMessage(makeMessage({ id: 'msg-2' }))

      resetAccountScopedChat()

      expect(useChatStore.getState().messages).toEqual([])
    })

    it('resets typing state', () => {
      useChatStore.setState({ isTyping: true, streamingMessageId: 'draft-1' })
      const { resetAccountScopedChat } = useChatStore.getState()
      resetAccountScopedChat()
      expect(useChatStore.getState().isTyping).toBe(false)
      expect(useChatStore.getState().streamingMessageId).toBeNull()
    })

    it('resets the composer draft and its stored copy', () => {
      const { resetAccountScopedChat, hydrateDraft, setContextualSuggestion, setDraft } = useChatStore.getState()
      setDraft('cancel my 9pm meds reminder')
      hydrateDraft('cancel my 9pm meds reminder')
      setContextualSuggestion({ id: 'habit-1', label: 'Ask about Morning walk', prompt: 'How is Morning walk going?' })
      globalThis.localStorage.setItem(CHAT_DRAFT_STORAGE_KEY, 'cancel my 9pm meds reminder')

      resetAccountScopedChat()

      expect(useChatStore.getState().draft).toBe('')
      expect(useChatStore.getState().draftRevision).toBe(0)
      expect(useChatStore.getState().draftHydrated).toBe(false)
      expect(useChatStore.getState().contextualSuggestion).toBeNull()
      expect(globalThis.localStorage.getItem(CHAT_DRAFT_STORAGE_KEY)).toBeNull()
    })

    it('still resets when the browser denies access to storage', () => {
      const realStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
      Object.defineProperty(globalThis, 'localStorage', {
        configurable: true,
        get() {
          throw new DOMException('The operation is insecure.', 'SecurityError')
        },
      })

      try {
        useChatStore.getState().setDraft('cancel my 9pm meds reminder')

        expect(() => useChatStore.getState().resetAccountScopedChat()).not.toThrow()
        expect(useChatStore.getState().draft).toBe('')
      } finally {
        if (realStorage) Object.defineProperty(globalThis, 'localStorage', realStorage)
      }
    })
  })
})
