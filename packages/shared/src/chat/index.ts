export const CHAT_SPEECH_LANG_KEY = 'orbit:speech-lang'

export const CHAT_SPEECH_LANGUAGES = [
  { value: 'en-US', label: 'English', flag: '\u{1F1FA}\u{1F1F8}' },
  { value: 'pt-BR', label: 'Portugues', flag: '\u{1F1E7}\u{1F1F7}' },
  { value: 'es-ES', label: 'Espanol', flag: '\u{1F1EA}\u{1F1F8}' },
  { value: 'fr-FR', label: 'Francais', flag: '\u{1F1EB}\u{1F1F7}' },
  { value: 'de-DE', label: 'Deutsch', flag: '\u{1F1E9}\u{1F1EA}' },
  { value: 'it-IT', label: 'Italiano', flag: '\u{1F1EE}\u{1F1F9}' },
  { value: 'ja-JP', label: '\u65E5\u672C\u8A9E', flag: '\u{1F1EF}\u{1F1F5}' },
  { value: 'ko-KR', label: '\uD55C\uAD6D\uC5B4', flag: '\u{1F1F0}\u{1F1F7}' },
  { value: 'zh-CN', label: '\u4E2D\u6587', flag: '\u{1F1E8}\u{1F1F3}' },
] as const

export const CHAT_VISUALIZER_BAR_OFFSETS = [0, 0.08, 0.16, 0.04, 0.12, 0.2, 0.06, 0.14, 0.22] as const

export const CHAT_STARTER_CHIP_KEYS = [
  'chat.starterChips.logHabit',
  'chat.starterChips.createRoutine',
  'chat.starterChips.howAmIDoing',
  'chat.starterChips.planWeek',
] as const

export const MAX_CHAT_IMAGE_SIZE_BYTES = 20 * 1024 * 1024

export const CHAT_IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const

export type ChatImageValidationError = 'type' | 'size'

export interface ChatImageCandidate {
  mimeType?: string | null
  fileSize?: number | null
  name?: string | null
  uri?: string | null
}

function inferChatImageMimeType(value: string | null | undefined): string | null {
  if (!value) return null

  const normalized = value.trim().toLowerCase()
  if (normalized.endsWith('.jpg') || normalized.endsWith('.jpeg')) return 'image/jpeg'
  if (normalized.endsWith('.png')) return 'image/png'
  if (normalized.endsWith('.webp')) return 'image/webp'
  return null
}

export function resolveChatImageMimeType(candidate: ChatImageCandidate): string | null {
  const normalizedMimeType = candidate.mimeType?.trim().toLowerCase()
  if (normalizedMimeType) return normalizedMimeType

  return inferChatImageMimeType(candidate.name) ?? inferChatImageMimeType(candidate.uri)
}

export function getChatImageValidationError(
  candidate: ChatImageCandidate,
): ChatImageValidationError | null {
  const mimeType = resolveChatImageMimeType(candidate)
  if (!mimeType || !CHAT_IMAGE_MIME_TYPES.includes(mimeType as (typeof CHAT_IMAGE_MIME_TYPES)[number])) {
    return 'type'
  }

  if (typeof candidate.fileSize === 'number' && candidate.fileSize > MAX_CHAT_IMAGE_SIZE_BYTES) {
    return 'size'
  }

  return null
}

export function getDefaultChatSpeechLanguage(locale: string | null | undefined): string {
  return locale?.toLowerCase().startsWith('pt') ? 'pt-BR' : 'en-US'
}
