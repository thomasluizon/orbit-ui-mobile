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
  add: string
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
  return value.trim().length > 0 || attachments.length > 0
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
}

type ComposerState =
  | { state: 'idle'; limitReason?: never; limitRecovery?: never }
  | { state: 'sending'; limitReason?: never; limitRecovery?: never }
  | { state: 'atLimit'; limitReason: string; limitRecovery?: ReactNode }
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

type ComposerAttach =
  | {
      onAttach: () => void
      attachWords: ComposerAttachWords
      attachments: readonly ComposerAttachment[]
      onAttachRemove: (id: string) => void
    }
  | {
      onAttach: () => void
      attachWords: ComposerAttachWords
      attachments?: never
      onAttachRemove?: never
    }
  | {
      onAttach?: never
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
