import * as ImagePicker from "expo-image-picker"
import type { PreparedChatTurn } from "@orbit/shared/chat"
import type { ChatClientContext } from "@orbit/shared/types"
import type { ChatStoreState } from "@orbit/shared/stores"

export interface AttemptedSend {
  turn?: PreparedChatTurn<FormData>
  content: string
  draftContent: string
  image: ImagePicker.ImagePickerAsset | null
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

export interface SelectedChatTextFile {
  name: string
  content: string
}

export interface StreamSendFailure {
  status: number | null
  error: string
  code: string | null
}

interface ByteStreamReader {
  read(): Promise<{ done: boolean; value?: Uint8Array }>
  releaseLock(): void
}

export interface ByteStream {
  getReader(): ByteStreamReader
}

export interface UseChatComposerOptions {
  isOnline: boolean
  offlineTitle: string
  pathname?: string
  selectedDate?: string
  today?: string
  totalHabitCount?: number | null
  includeGeneral?: boolean
}
