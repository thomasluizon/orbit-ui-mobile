import { create } from 'zustand'
import type { ChatMessage } from '@orbit/shared/types/chat'

interface ChatState {
  messages: ChatMessage[]
  isTyping: boolean
  isStreaming: boolean

  addMessage: (message: ChatMessage) => void
  setIsTyping: (value: boolean) => void
  setIsStreaming: (value: boolean) => void
  clearMessages: () => void
}

export const useChatStore = create<ChatState>((set) => ({
  messages: [],
  isTyping: false,
  isStreaming: false,

  addMessage: (message) =>
    set((state) => ({
      messages: [...state.messages, message],
    })),

  setIsTyping: (value) => set({ isTyping: value }),

  setIsStreaming: (value) => set({ isStreaming: value }),

  clearMessages: () =>
    set({
      messages: [],
      isTyping: false,
      isStreaming: false,
    }),
}))
