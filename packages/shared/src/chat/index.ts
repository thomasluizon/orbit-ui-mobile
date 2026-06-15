export * from './related-surfaces'
export * from './sse-stream'

export const CHAT_VISUALIZER_BAR_OFFSETS = [0, 0.08, 0.16, 0.04, 0.12, 0.2, 0.06, 0.14, 0.22] as const

export const CHAT_STARTER_CHIP_KEYS = [
  'chat.starterChips.logHabit',
  'chat.starterChips.createRoutine',
  'chat.starterChips.howAmIDoing',
  'chat.starterChips.planWeek',
] as const

/**
 * Maximum silence between chat stream events before the client aborts the send
 * and offers retry. Tool rounds emit keepalive `round` events, so a healthy
 * request never goes quiet this long.
 */
export const CHAT_STREAM_IDLE_TIMEOUT_MS = 60_000

const MAX_CHAT_IMAGE_SIZE_BYTES = 20 * 1024 * 1024

const CHAT_IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const

type ChatImageValidationError = 'type' | 'size'

interface ChatImageCandidate {
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
