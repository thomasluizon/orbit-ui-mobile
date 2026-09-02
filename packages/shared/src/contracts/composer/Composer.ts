import type { ReactNode } from 'react'

export type ComposerWords = {
  placeholder: string
  send: string
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
  icon?: ReactNode
  onSelect: () => void
}

type Chip = ComposerSuggestion

export type ComposerSuggestions =
  | readonly [Chip, Chip, Chip]
  | readonly [Chip, Chip, Chip, Chip]
  | readonly [Chip, Chip, Chip, Chip, Chip]
  | readonly [Chip, Chip, Chip, Chip, Chip, Chip]

type ComposerBase = {
  words: ComposerWords
  value: string
  onChangeValue: (value: string) => void
  onSend: () => void
  suggestions: ComposerSuggestions
  onOpenConversation?: () => void
  conversationLabel?: string
}

type ComposerState =
  | { state: 'idle'; limitReason?: never; limitRecovery?: never }
  | { state: 'sending'; limitReason?: never; limitRecovery?: never }
  | { state: 'atLimit'; limitReason: string; limitRecovery?: ReactNode }
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
