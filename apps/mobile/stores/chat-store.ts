import { create } from 'zustand'
import { createChatStoreState, type ChatStoreState } from '@orbit/shared/stores'

interface MobileChatStoreState extends ChatStoreState {
  clearMessages: () => void
}

export const useChatStore = create<MobileChatStoreState>((set) => ({
  ...createChatStoreState(set as Parameters<typeof createChatStoreState>[0]),

  clearMessages: () =>
    set({
      messages: [],
      isTyping: false,
    }),
}))
