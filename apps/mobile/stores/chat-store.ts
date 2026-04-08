import { create } from 'zustand'
import { createChatStoreState, type ChatStoreState } from '@orbit/shared/stores'

interface MobileChatStoreState extends ChatStoreState {
  isStreaming: boolean
  setIsStreaming: (value: boolean) => void
  clearMessages: () => void
}

export const useChatStore = create<MobileChatStoreState>((set) => ({
  ...createChatStoreState(set as Parameters<typeof createChatStoreState>[0]),
  isStreaming: false,

  setIsStreaming: (value) => set({ isStreaming: value }),

  clearMessages: () =>
    set({
      messages: [],
      isTyping: false,
      isStreaming: false,
    }),
}))
