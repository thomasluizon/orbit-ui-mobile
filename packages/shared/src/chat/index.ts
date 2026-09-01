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

/**
 * Voice-input auto-stop tuning shared by both platforms. Recording stops on its
 * own after {@link VOICE_SILENCE_TIMEOUT_MS} of continuous silence, but only
 * once speech has been heard, so an early pause before the user starts talking
 * never cuts the recording short. Levels are sampled every
 * {@link VOICE_LEVEL_POLL_MS}. Both platforms compare a linear time-domain RMS
 * amplitude (0..1): web via a Web Audio `AnalyserNode`, mobile via
 * `@siteed/audio-studio`'s `onAudioAnalysis` data points (expo-audio metering is
 * unusable on Android — it breaks `record()` — see
 * https://github.com/expo/expo/issues/37241). The thresholds are kept per-platform
 * so each can be tuned independently if the mic RMS scales differently.
 */
export const VOICE_SILENCE_TIMEOUT_MS = 2000
export const VOICE_LEVEL_POLL_MS = 150
export const VOICE_WEB_SPEECH_RMS_THRESHOLD = 0.025
export const VOICE_MOBILE_SPEECH_RMS_THRESHOLD = 0.025

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

const MAX_CHAT_TEXT_FILE_SIZE_BYTES = 1024 * 1024

const CHAT_TEXT_FILE_EXTENSIONS = ['.csv', '.json', '.txt', '.md'] as const

export const CHAT_TEXT_FILE_WEB_ACCEPT =
  '.csv,.json,.txt,.md,text/csv,application/json,text/plain,text/markdown'

export const CHAT_TEXT_FILE_PICKER_MIME_TYPES = ['text/*', 'application/json'] as const

type ChatTextFileValidationError = 'type' | 'size'

interface ChatTextFileCandidate {
  name?: string | null
  uri?: string | null
  fileSize?: number | null
}

function hasAllowedChatTextFileExtension(value: string | null | undefined): boolean {
  if (!value) return false

  const normalized = value.trim().toLowerCase()
  return CHAT_TEXT_FILE_EXTENSIONS.some((extension) => normalized.endsWith(extension))
}

export function getChatTextFileValidationError(
  candidate: ChatTextFileCandidate,
): ChatTextFileValidationError | null {
  const hasAllowedType =
    hasAllowedChatTextFileExtension(candidate.name) ||
    hasAllowedChatTextFileExtension(candidate.uri)
  if (!hasAllowedType) return 'type'

  if (
    typeof candidate.fileSize === 'number' &&
    candidate.fileSize > MAX_CHAT_TEXT_FILE_SIZE_BYTES
  ) {
    return 'size'
  }

  return null
}

export function buildChatMessageWithFileContent(params: {
  message: string
  fileLabel: string
  fileContent: string
}): string {
  const trimmedMessage = params.message.trim()
  const fileBlock = `${params.fileLabel}\n${params.fileContent.trim()}`
  return trimmedMessage ? `${trimmedMessage}\n\n${fileBlock}` : fileBlock
}

const COMPLETE_CHAT_DIRECTIVE = /\[\[orbit:[a-z:]+\]\]/gi

const CHAT_DIRECTIVE_OPEN = '[[orbit:'

function isChatDirectivePrefix(candidate: string): boolean {
  const normalized = candidate.toLowerCase()
  if (CHAT_DIRECTIVE_OPEN.startsWith(normalized)) return true
  if (!normalized.startsWith(CHAT_DIRECTIVE_OPEN)) return false

  const body = normalized.slice(CHAT_DIRECTIVE_OPEN.length)
  const closingBracket = body.indexOf(']')
  const directiveBody = closingBracket === -1 ? body : body.slice(0, closingBracket)
  if (closingBracket !== -1 && closingBracket !== body.length - 1) return false

  return [...directiveBody].every((character) =>
    character === ':' || (character >= 'a' && character <= 'z'),
  )
}

function stripTrailingChatDirectivePrefix(content: string): string {
  const withoutTrailingWhitespace = content.trimEnd()
  const directiveStart = withoutTrailingWhitespace.lastIndexOf('[[')
  if (directiveStart >= 0) {
    const candidate = withoutTrailingWhitespace.slice(directiveStart)
    if (isChatDirectivePrefix(candidate)) {
      return withoutTrailingWhitespace.slice(0, directiveStart).trimEnd()
    }
  }
  return withoutTrailingWhitespace.endsWith('[')
    ? withoutTrailingWhitespace.slice(0, -1).trimEnd()
    : withoutTrailingWhitespace
}

/**
 * Removes `[[orbit:...]]` directives Astra emits to request rendered cards. The
 * server strips them from the final message, but streamed deltas still carry them
 * mid-flight. Complete directives are always removed; a partial trailing token is
 * removed only while the message is actively streaming.
 */
export function stripChatDirectives(content: string, isStreaming = false): string {
  const withoutCompleteDirectives = content.replace(COMPLETE_CHAT_DIRECTIVE, '')
  return isStreaming
    ? stripTrailingChatDirectivePrefix(withoutCompleteDirectives)
    : withoutCompleteDirectives.trimEnd()
}
