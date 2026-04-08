import type { ChatMessage } from '../types/chat'

type ChatStoreSet = {
  (partial: Partial<ChatStoreState> | ((state: ChatStoreState) => Partial<ChatStoreState>), replace?: false): void
  (state: ChatStoreState | ((state: ChatStoreState) => ChatStoreState), replace: true): void
}

export interface ChatStoreState {
  messages: ChatMessage[]
  isTyping: boolean
  addMessage: (message: ChatMessage) => void
  setIsTyping: (value: boolean) => void
}

export function createChatStoreState(set: ChatStoreSet): ChatStoreState {
  return {
    messages: [],
    isTyping: false,

    addMessage: (message) =>
      set((state) => ({
        messages: [...state.messages, message],
      })),

    setIsTyping: (value) => set({ isTyping: value }),
  }
}
