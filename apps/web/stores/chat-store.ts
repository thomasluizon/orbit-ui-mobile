import { create } from 'zustand'
import { CHAT_DRAFT_STORAGE_KEY } from '@orbit/shared/hooks'
import { createChatStoreState, type ChatStoreState } from '@orbit/shared/stores'

interface WebChatStoreState extends ChatStoreState {
  clearMessages: () => void
}

export const useChatStore = create<WebChatStoreState>((set) => ({
  ...createChatStoreState(set as Parameters<typeof createChatStoreState>[0]),

  /**
   * Empties every field the previous account wrote into Astra, not only the conversation. Zustand
   * merges a partial set, so a field left out here survives the account change. The composer reads
   * its draft back from storage whenever `draftHydrated` is false, so the stored copy goes with it.
   */
  clearMessages: () => {
    if ('localStorage' in globalThis) globalThis.localStorage.removeItem(CHAT_DRAFT_STORAGE_KEY)
    set({
      messages: [],
      isTyping: false,
      streamingMessageId: null,
      draft: '',
      draftRevision: 0,
      draftHydrated: false,
      contextualSuggestion: null,
    })
  },
}))
