import AsyncStorage from '@react-native-async-storage/async-storage'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useChatStore } from '@/stores/chat-store'
import { CHAT_DRAFT_STORAGE_KEY } from '@orbit/shared/hooks'

describe('mobile chat store', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
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
      streamingMessageId: 'message-1',
    })

    useChatStore.getState().clearMessages()

    expect(useChatStore.getState()).toMatchObject({
      messages: [],
      isTyping: false,
      streamingMessageId: null,
    })
  })

  it('resets the composer draft and its stored copy', () => {
    const removeItem = vi.spyOn(AsyncStorage, 'removeItem').mockResolvedValue(undefined)
    const { clearMessages, hydrateDraft, setContextualSuggestion, setDraft } = useChatStore.getState()
    setDraft('cancel my 9pm meds reminder')
    hydrateDraft('cancel my 9pm meds reminder')
    setContextualSuggestion({ id: 'habit-1', label: 'Ask about Morning walk', prompt: 'How is Morning walk going?' })

    clearMessages()

    expect(useChatStore.getState().draft).toBe('')
    expect(useChatStore.getState().draftRevision).toBe(0)
    expect(useChatStore.getState().draftHydrated).toBe(false)
    expect(useChatStore.getState().contextualSuggestion).toBeNull()
    expect(removeItem).toHaveBeenCalledWith(CHAT_DRAFT_STORAGE_KEY)
  })
})
