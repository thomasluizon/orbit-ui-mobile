import { create } from 'zustand'
import { CHAT_DRAFT_STORAGE_KEY } from '@orbit/shared/hooks/chat-composer-core'
import { createChatStoreState, type ChatStoreState } from '@orbit/shared/stores'
import { forgetDesktopChatCheckpoint } from '@/lib/web-reload-state'

interface WebChatStoreState extends ChatStoreState {
  resetAccountScopedChat: () => void
}

function forgetStoredDraft(): void {
  for (const forgetDraft of [() => globalThis.localStorage.removeItem(CHAT_DRAFT_STORAGE_KEY), forgetDesktopChatCheckpoint]) {
    try {
      forgetDraft()
    } catch {
      continue
    }
  }
}

export const useChatStore = create<WebChatStoreState>((set) => ({
  ...createChatStoreState(set as Parameters<typeof createChatStoreState>[0]),

  resetAccountScopedChat: () => {
    forgetStoredDraft()
    set({
      queuedPrompts: [],
      queuePaused: false,
      queueReady: false,
      replyActive: false,
      replyRevision: 0,
      messages: [],
      conversationId: null,
      serverConversationId: null,
      conversationBeforeOrder: null,
      conversationLoaded: false,
      conversationBusy: false,
      conversationEpoch: 0,
      dismissedOfferKeys: [],
      proactiveEntryId: null,
      proactiveOutcomes: {},
      isTyping: false,
      streamingMessageId: null,
      draft: '',
      draftRevision: 0,
      draftHydrated: false,
      contextualSuggestion: null,
    })
  },
}))
