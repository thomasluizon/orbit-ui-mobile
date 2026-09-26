import AsyncStorage from '@react-native-async-storage/async-storage'
import { create } from 'zustand'
import { CHAT_DRAFT_STORAGE_KEY } from '@orbit/shared/hooks'
import { createChatStoreState, type ChatStoreState } from '@orbit/shared/stores'
import { captureError } from '@/lib/sentry'

interface MobileChatStoreState extends ChatStoreState {
  resetAccountScopedChat: () => Promise<void>
}

export const useChatStore = create<MobileChatStoreState>((set) => ({
  ...createChatStoreState(set as Parameters<typeof createChatStoreState>[0]),

  /**
   * Empties every field the previous account wrote into Astra, not only the conversation.
   * Zustand merges a partial set, so a field left out here survives the account change.
   */
  resetAccountScopedChat: async () => {
    try {
      await AsyncStorage.removeItem(CHAT_DRAFT_STORAGE_KEY)
    } catch (error) {
      captureError(error)
    }
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
