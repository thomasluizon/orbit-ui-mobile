import type { ChatMessage } from '../types/chat'

type ChatStoreSet = {
  (partial: Partial<ChatStoreState> | ((state: ChatStoreState) => Partial<ChatStoreState>), replace?: false): void
  (state: ChatStoreState | ((state: ChatStoreState) => ChatStoreState), replace: true): void
}

export interface ChatStoreState {
  messages: ChatMessage[]
  isTyping: boolean
  addMessage: (message: ChatMessage) => void
  updateMessage: (id: string, patch: Partial<Omit<ChatMessage, 'id'>>) => void
  appendToMessageContent: (id: string, text: string) => void
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

    updateMessage: (id, patch) =>
      set((state) => ({
        messages: state.messages.map((message) =>
          message.id === id ? { ...message, ...patch } : message,
        ),
      })),

    appendToMessageContent: (id, text) =>
      set((state) => ({
        messages: state.messages.map((message) =>
          message.id === id ? { ...message, content: message.content + text } : message,
        ),
      })),

    setIsTyping: (value) => set({ isTyping: value }),
  }
}
