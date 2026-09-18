import AsyncStorage from '@react-native-async-storage/async-storage'
import { create } from 'zustand'
import { CHAT_DRAFT_STORAGE_KEY } from '@orbit/shared/hooks'
import { createChatStoreState, type ChatStoreState } from '@orbit/shared/stores'

interface MobileChatStoreState extends ChatStoreState {
  clearMessages: () => void
}

export const useChatStore = create<MobileChatStoreState>((set) => ({
  ...createChatStoreState(set as Parameters<typeof createChatStoreState>[0]),

  /**
   * Empties every field the previous account wrote into Astra, not only the conversation. Zustand
   * merges a partial set, so a field left out here survives the account change. The composer reads
   * its draft back from storage whenever `draftHydrated` is false, so the stored copy goes with it.
   */
  clearMessages: () => {
    void AsyncStorage.removeItem(CHAT_DRAFT_STORAGE_KEY)
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
