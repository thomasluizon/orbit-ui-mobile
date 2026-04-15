import { create } from 'zustand'
import { createChatStoreState, type ChatStoreState } from '@orbit/shared/stores'

interface WebChatStoreState extends ChatStoreState {
  clearMessages: () => void
}

export const useChatStore = create<WebChatStoreState>((set) => ({
  ...createChatStoreState(set as Parameters<typeof createChatStoreState>[0]),

  clearMessages: () =>
    set({
      messages: [],
      isTyping: false,
      // Resetting the local pointer effectively starts a brand-new
      // server-side conversation on the next message.
      conversationId: null,
    }),
}))
