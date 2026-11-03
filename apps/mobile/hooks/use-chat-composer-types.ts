import type { ComposerAttempt } from '@orbit/shared/hooks'
import * as ImagePicker from "expo-image-picker"

export type AttemptedSend = ComposerAttempt<ImagePicker.ImagePickerAsset, FormData>

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
