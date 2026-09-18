import AsyncStorage from '@react-native-async-storage/async-storage'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useChatStore } from '@/stores/chat-store'
import { captureError } from '@/lib/sentry'
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

  it('clears the conversation state', async () => {
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

    await useChatStore.getState().resetAccountScopedChat()

    expect(useChatStore.getState()).toMatchObject({
      messages: [],
      isTyping: false,
      streamingMessageId: null,
    })
  })

  it('resets the composer draft and its stored copy', async () => {
    const removeItem = vi.spyOn(AsyncStorage, 'removeItem').mockResolvedValue(undefined)
    const { resetAccountScopedChat, hydrateDraft, setContextualSuggestion, setDraft } = useChatStore.getState()
    setDraft('cancel my 9pm meds reminder')
    hydrateDraft('cancel my 9pm meds reminder')
    setContextualSuggestion({ id: 'habit-1', label: 'Ask about Morning walk', prompt: 'How is Morning walk going?' })

    await resetAccountScopedChat()

    expect(useChatStore.getState().draft).toBe('')
    expect(useChatStore.getState().draftRevision).toBe(0)
    expect(useChatStore.getState().draftHydrated).toBe(false)
    expect(useChatStore.getState().contextualSuggestion).toBeNull()
    expect(removeItem).toHaveBeenCalledWith(CHAT_DRAFT_STORAGE_KEY)
  })

  it('removes the stored draft before the composer can read it back', async () => {
    let releaseRemoval!: () => void
    const removal = new Promise<void>((resolve) => {
      releaseRemoval = resolve
    })
    vi.spyOn(AsyncStorage, 'removeItem').mockReturnValue(removal)
    useChatStore.getState().hydrateDraft('cancel my 9pm meds reminder')

    const reset = useChatStore.getState().resetAccountScopedChat()
    await Promise.resolve()

    expect(useChatStore.getState().draftHydrated).toBe(true)

    releaseRemoval()
    await reset

    expect(useChatStore.getState().draftHydrated).toBe(false)
  })

  it('reports a rejected removal and still empties the composer', async () => {
    const failure = new Error('storage unavailable')
    vi.spyOn(AsyncStorage, 'removeItem').mockRejectedValue(failure)
    useChatStore.getState().setDraft('cancel my 9pm meds reminder')

    await useChatStore.getState().resetAccountScopedChat()

    expect(captureError).toHaveBeenCalledWith(failure)
    expect(useChatStore.getState().draft).toBe('')
  })
})
