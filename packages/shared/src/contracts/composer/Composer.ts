/** Hoje and habit detail use a minimum-height 56 one-line pill with an inside leading Astra glyph,
 * input, + menu and trailing send. The conversation uses the same pill without the glyph.
 * Hoje chips live in the conversation; habit detail chips stay in one scroll row without ellipsis.
 * Photo, document and voice use the + menu. Input grows to five lines, then scrolls inside.
 * Recording keeps a visible stop; transcribing and attachments stay inside. Reasons and recovery sit
 * above the pill; retry replaces send. Disclosure keeps drafts. */
export type ComposerWords = {
  placeholder: string
  inputLabel?: string
  offlineReason?: string
  send: string
  actions: string
  suggestionsLabel: string
  retry?: string
}

export type ComposerVoiceWords = {
  start: string
  stop: string
  recording: string
  transcribing: string
}

export type ComposerAttachWords = {
  file: string
  image: string
  trayLabel: string
  remove: (name: string) => string
}

export type ComposerAttachment = {
  id: string
  kind: 'file' | 'image'
  name: string
}

export function hasComposerContent(
  value: string,
  attachments: readonly ComposerAttachment[] = [],
): boolean {
  // WHY: ChatController.cs:180 rejects blank messages, including images; https://github.com/thomasluizon/orbit-api/blob/main/src/Orbit.Api/Controllers/ChatController.cs#L180
  return value.trim().length > 0 || attachments.some((attachment) => attachment.kind === 'file')
}

export type ComposerSuggestion = {
  id: string
  label: string
  icon?: React.ReactNode
  onSelect: () => void
}

type Chip = ComposerSuggestion

export type ComposerSuggestions =
  | readonly []
  | readonly [Chip, Chip]
  | readonly [Chip, Chip, Chip]
  | readonly [Chip, Chip, Chip, Chip]
  | readonly [Chip, Chip, Chip, Chip, Chip]
  | readonly [Chip, Chip, Chip, Chip, Chip, Chip]

export function toComposerSuggestions(chips: readonly ComposerSuggestion[]): ComposerSuggestions {
  switch (chips.length) {
    case 0: return []
    case 2: return [chips[0]!, chips[1]!]
    case 3: return [chips[0]!, chips[1]!, chips[2]!]
    case 4: return [chips[0]!, chips[1]!, chips[2]!, chips[3]!]
    case 5: return [chips[0]!, chips[1]!, chips[2]!, chips[3]!, chips[4]!]
    case 6: return [chips[0]!, chips[1]!, chips[2]!, chips[3]!, chips[4]!, chips[5]!]
    default: throw new Error('Composer suggestions must contain zero or two to six chips')
  }
}

type ComposerBase = {
  words: ComposerWords
  value: string
  onChangeValue: (value: string) => void
  onSend: () => void
  suggestions: ComposerSuggestions
  onOpenConversation?: () => void
  conversationLabel?: string
  errorMessage?: string
  errorRecovery?: { label: string; onSelect: () => void }
}

type ComposerState =
  | { state: 'idle'; limitReason?: never; limitRecovery?: never }
  | { state: 'sending'; limitReason?: never; limitRecovery?: never }
  | { state: 'atLimit'; limitReason: string; limitRecovery?: React.ReactNode }
  | { state: 'offline'; limitReason: string; limitRecovery?: never }
  | {
      state: 'recording'
      limitReason?: never
      limitRecovery?: never
      onVoice: () => void
      voiceWords: ComposerVoiceWords
    }
  | {
      state: 'transcribing'
      limitReason?: never
      limitRecovery?: never
      onVoice: () => void
      voiceWords: ComposerVoiceWords
    }

type ComposerVoice =
  | { onVoice: () => void; voiceWords: ComposerVoiceWords }
  | { onVoice?: never; voiceWords?: never }

type ComposerAttachControls =
  | {
      onAttachFile: () => void
      onAttachImage: () => void
    }
  | {
      onAttachFile: () => void
      onAttachImage?: never
    }
  | {
      onAttachFile?: never
      onAttachImage: () => void
    }

type ComposerAttachmentTray =
  | {
      attachments: readonly ComposerAttachment[]
      onAttachRemove: (id: string) => void
    }
  | {
      attachments?: never
      onAttachRemove?: never
    }

type ComposerAttach =
  | (ComposerAttachControls & {
      attachWords: ComposerAttachWords
    } & ComposerAttachmentTray)
  | {
      onAttachFile?: never
      onAttachImage?: never
      attachWords?: never
      attachments?: never
      onAttachRemove?: never
    }

type ComposerRetry =
  | { onRetry: () => void; words: ComposerWords & { retry: string } }
  | { onRetry?: never }

export type ComposerProps = ComposerBase &
  ComposerState &
  ComposerVoice &
  ComposerAttach &
  ComposerRetry
