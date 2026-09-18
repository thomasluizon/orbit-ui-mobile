import { create } from 'zustand'
import { CHAT_DRAFT_STORAGE_KEY } from '@orbit/shared/hooks'
import { createChatStoreState, type ChatStoreState } from '@orbit/shared/stores'

interface WebChatStoreState extends ChatStoreState {
  resetAccountScopedChat: () => void
}

/**
 * Removes the stored draft. A browser that denies storage access owns the property and throws
 * `SecurityError` on the read, which `'localStorage' in globalThis` cannot see, and this runs inside
 * sign in, so an unguarded throw would block the sign in rather than the Astra screen.
 */
function forgetStoredDraft(): void {
  try {
    globalThis.localStorage.removeItem(CHAT_DRAFT_STORAGE_KEY)
  } catch {
    return
  }
}

export const useChatStore = create<WebChatStoreState>((set) => ({
  ...createChatStoreState(set as Parameters<typeof createChatStoreState>[0]),

  /**
   * Empties every field the previous account wrote into Astra, not only the conversation. Zustand
   * merges a partial set, so a field left out here survives the account change. The composer reads
   * its draft back from storage whenever `draftHydrated` is false, so the stored copy goes first.
   */
  resetAccountScopedChat: () => {
    forgetStoredDraft()
    set({
      messages: [],
      isTyping: false,
      streamingMessageId: null,
      draft: '',
      draftRevision: 0,
      draftHydrated: false,
      contextualSuggestion: null,
    })
  },
}))
