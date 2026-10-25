import type { ProactiveItem } from '../types/proactive'
import type { ChatMessage } from '../types/chat'

type ChatStoreSet = {
  (partial: Partial<ChatStoreState> | ((state: ChatStoreState) => Partial<ChatStoreState>), replace?: false): void
  (state: ChatStoreState | ((state: ChatStoreState) => ChatStoreState), replace: true): void
}

export interface QueuedPrompt {
  id: string
  content: string
  send: () => Promise<boolean>
}

export interface ChatStoreState {
  queuedPrompts: QueuedPrompt[]
  queuePaused: boolean
  queueReady: boolean
  replyActive: boolean
  replyRevision: number
  enqueuePrompt: (prompt: QueuedPrompt) => boolean
  removeQueuedPrompt: (id: string) => void
  takeQueuedPrompt: (id: string) => QueuedPrompt | null
  beginReply: () => void
  finishReply: (succeeded: boolean) => void
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
    queuedPrompts: [],
    queuePaused: false,
    queueReady: false,
    replyActive: false,
    replyRevision: 0,
    enqueuePrompt: (prompt) => {
      let accepted = false
      set((state) => {
        if (state.queuedPrompts.length >= 3) return {}
        accepted = true
        return { queuedPrompts: [...state.queuedPrompts, prompt] }
      })
      return accepted
    },
    removeQueuedPrompt: (id) => set((state) => ({
      queuedPrompts: state.queuedPrompts.filter(prompt => prompt.id !== id),
      queuePaused: state.queuePaused && state.queuedPrompts.some(prompt => prompt.id !== id),
    })),
    takeQueuedPrompt: (id) => {
      let prompt: QueuedPrompt | null = null
      set((state) => {
        if (state.replyActive || state.isTyping || state.streamingMessageId !== null) return {}
        prompt = state.queuedPrompts.find(queued => queued.id === id) ?? null
        return prompt ? { queuedPrompts: state.queuedPrompts.filter(queued => queued.id !== id), queueReady: false, queuePaused: state.queuePaused && state.queuedPrompts.length > 1 } : {}
      })
      return prompt
    },
    beginReply: () => set(state => ({ replyActive: true, queueReady: false, replyRevision: state.replyRevision + 1 })),
    finishReply: (succeeded) => set((state) => ({
      replyActive: false, queueReady: succeeded, queuePaused: state.queuedPrompts.length > 0 && (state.queuePaused || !succeeded),
    })),
    messages: [],
    proactiveEntryId: null,
    clearProactiveEntry: (id) => set((state) => state.proactiveEntryId === id ? { proactiveEntryId: null } : {}),
    proactiveOutcomes: {},
    openProactiveItem: (item) => {
      let added = false
      set((state) => {
        const existing = state.messages.find((message) => message.proactiveItem?.id === item.id)
        const proactiveContextAfterMessageId = state.messages.filter((message) => message.role === 'user').at(-1)?.id ?? null
        if (existing) {
          const upgrade = !existing.parts?.some(part => part?.type === 'block') && item.parts?.some(part => part?.type === 'block')
          const entry = { ...existing, ...(upgrade ? { parts: item.parts, proactiveItem: item } : {}), proactiveContextAfterMessageId }
          return { proactiveEntryId: item.id, messages: [entry, ...state.messages.filter((message) => message !== existing)] }
        }
        added = !state.proactiveOutcomes[item.id]
        return { proactiveEntryId: item.id, proactiveOutcomes: { ...state.proactiveOutcomes, [item.id]: state.proactiveOutcomes[item.id] ?? 'opened' }, messages: [{
          id: `proactive-${item.id}`,
          role: 'ai',
          content: item.text,
          parts: item.parts,
          proactiveItem: item,
          proactiveContextAfterMessageId,
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
        proactiveEntryId: null,
        messages: existing ? state.messages : [...state.messages,
          { id, role: 'ai', content: summary, timestamp: new Date() }],
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
