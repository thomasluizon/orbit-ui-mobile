import type { ChatMessage } from '../types/chat'

type ChatStoreSet = {
  (partial: Partial<ChatStoreState> | ((state: ChatStoreState) => Partial<ChatStoreState>), replace?: false): void
  (state: ChatStoreState | ((state: ChatStoreState) => ChatStoreState), replace: true): void
}

export interface ChatStoreState {
  messages: ChatMessage[]
  isTyping: boolean
  streamingMessageId: string | null
  draft: string
  draftRevision: number
  draftHydrated: boolean
  addMessage: (message: ChatMessage) => void
  updateMessage: (id: string, patch: Partial<Omit<ChatMessage, 'id'>>) => void
  appendToMessageContent: (id: string, text: string) => void
  setIsTyping: (value: boolean) => void
  setStreamingMessageId: (value: string | null) => void
  setDraft: (value: string | ((current: string) => string)) => void
  hydrateDraft: (storedDraft: string | null) => void
}

export function createChatStoreState(set: ChatStoreSet): ChatStoreState {
  return {
    messages: [],
    isTyping: false,
    streamingMessageId: null,
    draft: '',
    draftRevision: 0,
    draftHydrated: false,

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
    setStreamingMessageId: (value) => set({ streamingMessageId: value }),
    setDraft: (value) => set((state) => ({
      draft: typeof value === 'function' ? value(state.draft) : value,
      draftRevision: state.draftRevision + 1,
    })),
    hydrateDraft: (storedDraft) => set((state) => ({
      draft: state.draft || storedDraft || '',
      draftHydrated: true,
    })),
  }
}
