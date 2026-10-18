import type { ProactiveItem } from '../types/proactive'
import type { ChatMessage } from '../types/chat'

type ChatStoreSet = {
  (partial: Partial<ChatStoreState> | ((state: ChatStoreState) => Partial<ChatStoreState>), replace?: false): void
  (state: ChatStoreState | ((state: ChatStoreState) => ChatStoreState), replace: true): void
}

export interface ChatStoreState {
  messages: ChatMessage[]
  proactiveEntryId: string | null
  clearProactiveEntry: (id: string) => void
  proactiveOutcomes: Record<string, 'opened' | 'acted'>
  openDailySummary: (date: string, summary: string) => void
  openProactiveItem: (item: ProactiveItem) => boolean
  claimProactiveAction: (id: string) => boolean
  isTyping: boolean
  streamingMessageId: string | null
  draft: string
  draftRevision: number
  draftHydrated: boolean
  contextualSuggestion: { id: string; label: string; prompt: string } | null
  addMessage: (message: ChatMessage) => void
  updateMessage: (id: string, patch: Partial<Omit<ChatMessage, 'id'>>) => void
  transitionMessage: (id: string, transition: (message: ChatMessage) => ChatMessage) => void
  appendToMessageContent: (id: string, text: string) => void
  setIsTyping: (value: boolean) => void
  setStreamingMessageId: (value: string | null) => void
  setDraft: (value: string | ((current: string) => string)) => void
  hydrateDraft: (storedDraft: string | null, preHydrationText?: string) => void
  setContextualSuggestion: (suggestion: ChatStoreState['contextualSuggestion']) => void
}

type ContextualSuggestion = NonNullable<ChatStoreState['contextualSuggestion']>
type ContextualChat = Pick<ChatStoreState, 'contextualSuggestion' | 'setContextualSuggestion'>

export function clearContextualSuggestionIfCurrent(chat: ContextualChat, id: string): void {
  if (chat.contextualSuggestion?.id === id) chat.setContextualSuggestion(null)
}

export function prepareChatRequest(
  chat: Pick<ChatStoreState, 'draft' | 'setDraft' | 'setContextualSuggestion'>,
  request: ContextualSuggestion,
): void {
  if (chat.draft) chat.setContextualSuggestion(request)
  else chat.setDraft(request.prompt)
}

export function createChatStoreState(set: ChatStoreSet): ChatStoreState {
  return {
    messages: [],
    proactiveEntryId: null,
    clearProactiveEntry: (id) => set((state) => state.proactiveEntryId === id ? { proactiveEntryId: null } : {}),
    proactiveOutcomes: {},
    openProactiveItem: (item) => {
      let added = false
      set((state) => {
        const existing = state.messages.find((message) => message.proactiveItem?.id === item.id)
        if (existing) return { proactiveEntryId: item.id, messages: [existing, ...state.messages.filter((message) => message !== existing)] }
        added = !state.proactiveOutcomes[item.id]
        return { proactiveEntryId: item.id, proactiveOutcomes: { ...state.proactiveOutcomes, [item.id]: state.proactiveOutcomes[item.id] ?? 'opened' }, messages: [{
          id: `proactive-${item.id}`,
          role: 'ai',
          content: item.text,
          proactiveItem: item,
          proactiveActed: state.proactiveOutcomes[item.id] === 'acted',
          timestamp: new Date(),
        }, ...state.messages] }
      })
      return added
    },
    openDailySummary: (date, summary) => set((state) => {
      const id = `daily-summary-${date}`
      const existing = state.messages.find((message) => message.id === id)
      return {
        proactiveEntryId: id,
        messages: [{ id, role: 'ai', content: summary, timestamp: existing?.timestamp ?? new Date() },
          ...state.messages.filter((message) => message.id !== id)],
      }
    }),
    claimProactiveAction: (id) => {
      let claimed = false
      set((state) => {
        if (state.proactiveOutcomes[id] === 'acted') return {}
        const messages = state.messages.map((message) => {
          if (message.proactiveItem?.id !== id || message.proactiveActed) return message
          claimed = true
          return { ...message, proactiveActed: true }
        })
        return claimed ? { messages, proactiveOutcomes: { ...state.proactiveOutcomes, [id]: 'acted' } } : {}
      })
      return claimed
    },
    isTyping: false,
    streamingMessageId: null,
    draft: '',
    draftRevision: 0,
    draftHydrated: false,
    contextualSuggestion: null,

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

    transitionMessage: (id, transition) =>
      set((state) => ({
        messages: state.messages.map((message) => message.id === id ? transition(message) : message),
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
    hydrateDraft: (storedDraft, preHydrationText) => set((state) => ({
      draft: preHydrationText || state.draft || storedDraft || '',
      draftHydrated: true,
    })),
    setContextualSuggestion: (contextualSuggestion) => set({ contextualSuggestion }),
  }
}
