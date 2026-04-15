import type { ChatMessage } from '../types/chat'

type ChatStoreSet = {
  (partial: Partial<ChatStoreState> | ((state: ChatStoreState) => Partial<ChatStoreState>), replace?: false): void
  (state: ChatStoreState | ((state: ChatStoreState) => ChatStoreState), replace: true): void
}

export interface ChatStoreState {
  messages: ChatMessage[]
  isTyping: boolean
  /**
   * Server-managed conversation id (returned from POST /api/chat).
   * Persisted client-side only as a pointer — the actual transcript
   * lives in the backend `conversations` table. Locally-echoed messages
   * are kept in `messages` for instant render but the server treats the
   * conversationId as the source of truth on every subsequent turn.
   */
  conversationId: string | null
  addMessage: (message: ChatMessage) => void
  setIsTyping: (value: boolean) => void
  setConversationId: (id: string | null) => void
}

export function createChatStoreState(set: ChatStoreSet): ChatStoreState {
  return {
    messages: [],
    isTyping: false,
    conversationId: null,

    addMessage: (message) =>
      set((state) => ({
        messages: [...state.messages, message],
      })),

    setIsTyping: (value) => set({ isTyping: value }),

    setConversationId: (id) => set({ conversationId: id }),
  }
}
