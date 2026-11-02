'use client'

import type { ChatClientContext } from '@orbit/shared/types/chat'
import type { PreparedChatTurn } from '@orbit/shared/chat'
import type { ChatStoreState } from '@orbit/shared/stores'
import type { SelectedChatTextFile } from '@/hooks/use-chat-text-file-attachment'

export type UseChatComposerOptions = { pathname?: string; selectedDate?: string; today?: string; totalHabitCount?: number | null; includeGeneral?: boolean }

export interface AttemptedSend {
  turn?: PreparedChatTurn<FormData>
  intendedAccountId: string | null
  content: string
  draftContent: string
  image: File | null
  preview: string | null
  textFile: SelectedChatTextFile | null
  restoreDraftOnFailure: boolean
  clearDraftOnSuccess: boolean
  restoredDraftRevision: number | null
  messageOrigin?: 'followUp'
  selectedOfferKey?: ChatClientContext['selectedOfferKey']
  previousStartingStep?: ChatClientContext['previousStartingStep']
  contextualRequest?: NonNullable<ChatStoreState['contextualSuggestion']>
}

export interface StreamSendFailure {
  status: number | null
  error: string
  code: string | null
}
