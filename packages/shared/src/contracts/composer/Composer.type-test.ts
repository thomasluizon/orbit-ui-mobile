import type { ReactNode } from 'react'
import type {
  ComposerAttachWords,
  ComposerAttachment,
  ComposerProps,
  ComposerSuggestion,
  ComposerSuggestions,
  ComposerVoiceWords,
  ComposerWords,
} from './Composer'

type IsExactWidth<T, U> =
  (<TValue>() => TValue extends T ? 1 : 2) extends <TValue>() => TValue extends U ? 1 : 2
    ? (<TValue>() => TValue extends U ? 1 : 2) extends <TValue>() => TValue extends T ? 1 : 2
      ? true
      : false
    : false
type Assert<T extends true> = T
type Fields<T> = { [TKey in keyof T]: T[TKey] }
type Project<T, TKeys extends keyof T> = Pick<T, TKeys>
type NormalizeFunction<T> = T extends (...args: infer TArgs) => infer TResult
  ? (...args: TArgs) => TResult
  : T

type IdleVariant = Extract<ComposerProps, { state: 'idle' }>
type SendingVariant = Extract<ComposerProps, { state: 'sending' }>
type AtLimitVariant = Extract<ComposerProps, { state: 'atLimit' }>
type OfflineVariant = Extract<ComposerProps, { state: 'offline' }>
type RecordingVariant = Extract<ComposerProps, { state: 'recording' }>
type TranscribingVariant = Extract<ComposerProps, { state: 'transcribing' }>
type VoiceVariant = Extract<ComposerProps, { onVoice: () => void }>
type NoVoiceVariant = Extract<ComposerProps, { onVoice?: never }>
type BothAttachVariant = Extract<
  ComposerProps,
  { onAttachFile: () => void; onAttachImage: () => void }
>
type FileAttachVariant = Extract<
  ComposerProps,
  { onAttachFile: () => void; onAttachImage?: never }
>
type ImageAttachVariant = Extract<
  ComposerProps,
  { onAttachFile?: never; onAttachImage: () => void }
>
type NoAttachVariant = Extract<
  ComposerProps,
  { onAttachFile?: never; onAttachImage?: never }
>
type AttachmentTrayVariant = Extract<ComposerProps, { attachments: readonly ComposerAttachment[] }>
type NoAttachmentTrayVariant = Extract<ComposerProps, { attachments?: never }>
type RetryVariant = Extract<ComposerProps, { onRetry: () => void }>
type NoRetryVariant = Extract<ComposerProps, { onRetry?: never }>

type ExpectedComposerWords = {
  placeholder: string
  send: string
  suggestionsLabel: string
  retry?: string
}
type ExpectedComposerVoiceWords = {
  start: string
  stop: string
  recording: string
  transcribing: string
}
type ExpectedComposerAttachWords = {
  file: string
  image: string
  trayLabel: string
  remove: (name: string) => string
}
type ExpectedComposerAttachment = {
  id: string
  kind: 'file' | 'image'
  name: string
}
type ExpectedComposerSuggestion = {
  id: string
  label: string
  icon?: ReactNode
  onSelect: () => void
}
type ExpectedComposerSuggestions =
  | readonly [ExpectedComposerSuggestion, ExpectedComposerSuggestion, ExpectedComposerSuggestion]
  | readonly [
      ExpectedComposerSuggestion,
      ExpectedComposerSuggestion,
      ExpectedComposerSuggestion,
      ExpectedComposerSuggestion,
    ]
  | readonly [
      ExpectedComposerSuggestion,
      ExpectedComposerSuggestion,
      ExpectedComposerSuggestion,
      ExpectedComposerSuggestion,
      ExpectedComposerSuggestion,
    ]
  | readonly [
      ExpectedComposerSuggestion,
      ExpectedComposerSuggestion,
      ExpectedComposerSuggestion,
      ExpectedComposerSuggestion,
      ExpectedComposerSuggestion,
      ExpectedComposerSuggestion,
    ]
type ExpectedComposerBase = {
  words: ExpectedComposerWords
  value: string
  onChangeValue: (value: string) => void
  onSend: () => void
  suggestions: ExpectedComposerSuggestions
  onOpenConversation?: () => void
  conversationLabel?: string
}
type ExpectedIdleState = { state: 'idle'; limitReason?: never; limitRecovery?: never }
type ExpectedSendingState = { state: 'sending'; limitReason?: never; limitRecovery?: never }
type ExpectedAtLimitState = { state: 'atLimit'; limitReason: string; limitRecovery?: ReactNode }
type ExpectedOfflineState = { state: 'offline'; limitReason: string; limitRecovery?: never }
type ExpectedRecordingState = {
  state: 'recording'
  limitReason?: never
  limitRecovery?: never
  onVoice: () => void
  voiceWords: ExpectedComposerVoiceWords
}
type ExpectedTranscribingState = {
  state: 'transcribing'
  limitReason?: never
  limitRecovery?: never
  onVoice: () => void
  voiceWords: ExpectedComposerVoiceWords
}
type ExpectedComposerVoice =
  | { onVoice: () => void; voiceWords: ExpectedComposerVoiceWords }
  | { onVoice?: never; voiceWords?: never }
type ExpectedComposerAttachControls =
  | { onAttachFile: () => void; onAttachImage: () => void }
  | { onAttachFile: () => void; onAttachImage?: never }
  | { onAttachFile?: never; onAttachImage: () => void }
type ExpectedComposerAttachmentTray =
  | {
      attachments: readonly ExpectedComposerAttachment[]
      onAttachRemove: (id: string) => void
    }
  | { attachments?: never; onAttachRemove?: never }
type ExpectedComposerAttach =
  | (ExpectedComposerAttachControls & {
      attachWords: ExpectedComposerAttachWords
    } & ExpectedComposerAttachmentTray)
  | {
      onAttachFile?: never
      onAttachImage?: never
      attachWords?: never
      attachments?: never
      onAttachRemove?: never
    }
type ExpectedComposerRetry =
  | {
      onRetry: () => void
      words: ExpectedComposerWords & { retry: string }
    }
  | { onRetry?: never }
type ExpectedIdleVariant = ExpectedComposerBase &
  ExpectedIdleState &
  ExpectedComposerVoice &
  ExpectedComposerAttach &
  ExpectedComposerRetry
type ExpectedSendingVariant = ExpectedComposerBase &
  ExpectedSendingState &
  ExpectedComposerVoice &
  ExpectedComposerAttach &
  ExpectedComposerRetry
type ExpectedAtLimitVariant = ExpectedComposerBase &
  ExpectedAtLimitState &
  ExpectedComposerVoice &
  ExpectedComposerAttach &
  ExpectedComposerRetry
type ExpectedOfflineVariant = ExpectedComposerBase &
  ExpectedOfflineState &
  ExpectedComposerVoice &
  ExpectedComposerAttach &
  ExpectedComposerRetry
type ExpectedRecordingVariant = ExpectedComposerBase &
  ExpectedRecordingState &
  ExpectedComposerVoice &
  ExpectedComposerAttach &
  ExpectedComposerRetry
type ExpectedTranscribingVariant = ExpectedComposerBase &
  ExpectedTranscribingState &
  ExpectedComposerVoice &
  ExpectedComposerAttach &
  ExpectedComposerRetry

export type ComposerContractWidthAssertions = [
  Assert<IsExactWidth<Fields<IdleVariant>, Fields<ExpectedIdleVariant>>>,
  Assert<IsExactWidth<Fields<SendingVariant>, Fields<ExpectedSendingVariant>>>,
  Assert<IsExactWidth<Fields<AtLimitVariant>, Fields<ExpectedAtLimitVariant>>>,
  Assert<IsExactWidth<Fields<OfflineVariant>, Fields<ExpectedOfflineVariant>>>,
  Assert<IsExactWidth<Fields<RecordingVariant>, Fields<ExpectedRecordingVariant>>>,
  Assert<IsExactWidth<NormalizeFunction<RecordingVariant['onVoice']>, () => void>>,
  Assert<IsExactWidth<Fields<TranscribingVariant>, Fields<ExpectedTranscribingVariant>>>,
  Assert<IsExactWidth<NormalizeFunction<TranscribingVariant['onVoice']>, () => void>>,
  Assert<IsExactWidth<NormalizeFunction<VoiceVariant['onVoice']>, () => void>>,
  Assert<IsExactWidth<VoiceVariant['voiceWords'], ExpectedComposerVoiceWords>>,
  Assert<IsExactWidth<Project<NoVoiceVariant, 'onVoice' | 'voiceWords'>, { onVoice?: never; voiceWords?: never }>>,
  Assert<IsExactWidth<Project<BothAttachVariant, 'onAttachFile' | 'onAttachImage' | 'attachWords'>, { onAttachFile: () => void; onAttachImage: () => void; attachWords: ExpectedComposerAttachWords }>>,
  Assert<IsExactWidth<Project<FileAttachVariant, 'onAttachFile' | 'onAttachImage' | 'attachWords'>, { onAttachFile: () => void; onAttachImage?: never; attachWords: ExpectedComposerAttachWords }>>,
  Assert<IsExactWidth<Project<ImageAttachVariant, 'onAttachFile' | 'onAttachImage' | 'attachWords'>, { onAttachFile?: never; onAttachImage: () => void; attachWords: ExpectedComposerAttachWords }>>,
  Assert<IsExactWidth<Project<NoAttachVariant, 'onAttachFile' | 'onAttachImage' | 'attachWords'>, { onAttachFile?: never; onAttachImage?: never; attachWords?: never }>>,
  Assert<IsExactWidth<Project<AttachmentTrayVariant, 'attachments' | 'onAttachRemove'>, { attachments: readonly ExpectedComposerAttachment[]; onAttachRemove: (id: string) => void }>>,
  Assert<IsExactWidth<Project<NoAttachmentTrayVariant, 'attachments' | 'onAttachRemove'>, { attachments?: never; onAttachRemove?: never }>>,
  Assert<IsExactWidth<Project<RetryVariant, 'words' | 'onRetry'>, { words: ExpectedComposerWords & { retry: string }; onRetry: () => void }>>,
  Assert<IsExactWidth<Project<NoRetryVariant, 'words' | 'onRetry'>, { words: ExpectedComposerWords; onRetry?: never }>>,
  Assert<IsExactWidth<Extract<ComposerSuggestions, readonly [unknown, unknown, unknown]>, readonly [ExpectedComposerSuggestion, ExpectedComposerSuggestion, ExpectedComposerSuggestion]>>,
  Assert<IsExactWidth<Extract<ComposerSuggestions, readonly [unknown, unknown, unknown, unknown]>, readonly [ExpectedComposerSuggestion, ExpectedComposerSuggestion, ExpectedComposerSuggestion, ExpectedComposerSuggestion]>>,
  Assert<IsExactWidth<Extract<ComposerSuggestions, readonly [unknown, unknown, unknown, unknown, unknown]>, readonly [ExpectedComposerSuggestion, ExpectedComposerSuggestion, ExpectedComposerSuggestion, ExpectedComposerSuggestion, ExpectedComposerSuggestion]>>,
  Assert<IsExactWidth<Extract<ComposerSuggestions, readonly [unknown, unknown, unknown, unknown, unknown, unknown]>, readonly [ExpectedComposerSuggestion, ExpectedComposerSuggestion, ExpectedComposerSuggestion, ExpectedComposerSuggestion, ExpectedComposerSuggestion, ExpectedComposerSuggestion]>>,
  Assert<IsExactWidth<ComposerWords['placeholder'], string>>,
  Assert<IsExactWidth<ComposerWords['send'], string>>,
  Assert<IsExactWidth<ComposerWords['suggestionsLabel'], string>>,
  Assert<IsExactWidth<ComposerWords['retry'], string | undefined>>,
  Assert<IsExactWidth<ComposerVoiceWords['start'], string>>,
  Assert<IsExactWidth<ComposerVoiceWords['stop'], string>>,
  Assert<IsExactWidth<ComposerVoiceWords['recording'], string>>,
  Assert<IsExactWidth<ComposerVoiceWords['transcribing'], string>>,
  Assert<IsExactWidth<ComposerAttachWords['file'], string>>,
  Assert<IsExactWidth<ComposerAttachWords['image'], string>>,
  Assert<IsExactWidth<ComposerAttachWords['trayLabel'], string>>,
  Assert<IsExactWidth<ComposerAttachWords['remove'], (name: string) => string>>,
  Assert<IsExactWidth<ComposerAttachment['id'], string>>,
  Assert<IsExactWidth<ComposerAttachment['kind'], 'file' | 'image'>>,
  Assert<IsExactWidth<ComposerAttachment['name'], string>>,
  Assert<IsExactWidth<ComposerSuggestion['id'], string>>,
  Assert<IsExactWidth<ComposerSuggestion['label'], string>>,
  Assert<IsExactWidth<ComposerSuggestion['icon'], ReactNode>>,
  Assert<IsExactWidth<ComposerSuggestion['onSelect'], () => void>>,
  Assert<IsExactWidth<ComposerProps['words'], ExpectedComposerWords | (ExpectedComposerWords & { retry: string })>>,
  Assert<IsExactWidth<ComposerProps['value'], string>>,
  Assert<IsExactWidth<ComposerProps['onChangeValue'], (value: string) => void>>,
  Assert<IsExactWidth<ComposerProps['onSend'], () => void>>,
  Assert<IsExactWidth<ComposerProps['suggestions'], ExpectedComposerSuggestions>>,
  Assert<IsExactWidth<ComposerProps['onOpenConversation'], (() => void) | undefined>>,
  Assert<IsExactWidth<ComposerProps['conversationLabel'], string | undefined>>,
  Assert<IsExactWidth<ComposerProps['state'], 'idle' | 'sending' | 'atLimit' | 'offline' | 'recording' | 'transcribing'>>,
  Assert<IsExactWidth<ComposerProps['limitReason'], string | undefined>>,
  Assert<IsExactWidth<ComposerProps['limitRecovery'], ReactNode>>,
  Assert<IsExactWidth<NormalizeFunction<ComposerProps['onVoice']>, (() => void) | undefined>>,
  Assert<IsExactWidth<ComposerProps['voiceWords'], ExpectedComposerVoiceWords | undefined>>,
  Assert<IsExactWidth<ComposerProps['onAttachFile'], (() => void) | undefined>>,
  Assert<IsExactWidth<ComposerProps['onAttachImage'], (() => void) | undefined>>,
  Assert<IsExactWidth<ComposerProps['attachWords'], ExpectedComposerAttachWords | undefined>>,
  Assert<IsExactWidth<ComposerProps['attachments'], readonly ExpectedComposerAttachment[] | undefined>>,
  Assert<IsExactWidth<ComposerProps['onAttachRemove'], ((id: string) => void) | undefined>>,
  Assert<IsExactWidth<ComposerProps['onRetry'], (() => void) | undefined>>,
]

const words = {
  placeholder: 'Placeholder',
  send: 'Send',
  suggestionsLabel: 'Suggestions',
}
const voiceWords = {
  start: 'Speak',
  stop: 'Stop',
  recording: 'Listening',
  transcribing: 'Transcribing',
}
const attachWords = {
  file: 'Add file',
  image: 'Add image',
  trayLabel: 'Attachments',
  remove: (name: string) => `Remove ${name}`,
}
const chip = { id: 'one', label: 'One', onSelect: () => undefined }
const suggestions3 = [chip, chip, chip] as const
const base = {
  words,
  value: '',
  onChangeValue: (_value: string) => undefined,
  onSend: () => undefined,
  suggestions: suggestions3,
}

function acceptComposer(_props: ComposerProps) {}

acceptComposer({ ...base, state: 'idle' })
acceptComposer({ ...base, state: 'idle', words: { ...words } })
acceptComposer({ ...base, state: 'atLimit', limitReason: 'Limit' })
acceptComposer({ ...base, state: 'recording', onVoice: () => undefined, voiceWords })
acceptComposer({ ...base, state: 'transcribing', onVoice: () => undefined, voiceWords })
acceptComposer({ ...base, state: 'idle', onAttachFile: () => undefined, attachWords })
acceptComposer({ ...base, state: 'idle', onAttachImage: () => undefined, attachWords })
acceptComposer({
  ...base,
  state: 'idle',
  onAttachFile: () => undefined,
  onAttachImage: () => undefined,
  attachWords,
})
acceptComposer({
  ...base,
  state: 'idle',
  onAttachFile: () => undefined,
  onAttachImage: () => undefined,
  attachWords,
  attachments: [],
  onAttachRemove: () => undefined,
})
acceptComposer({
  ...base,
  state: 'idle',
  onRetry: () => undefined,
  words: { ...words, retry: 'Retry' },
})

const suggestions4: ComposerSuggestions = [chip, chip, chip, chip]
const suggestions5: ComposerSuggestions = [chip, chip, chip, chip, chip]
const suggestions6: ComposerSuggestions = [chip, chip, chip, chip, chip, chip]
void [suggestions4, suggestions5, suggestions6]

// @ts-expect-error words are required in every state
acceptComposer({ ...base, state: 'idle', words: undefined })
// @ts-expect-error send is a required control name
acceptComposer({ ...base, state: 'idle', words: { placeholder: 'Ask', suggestionsLabel: 'Suggestions' } })
// @ts-expect-error atLimit requires the caller's real reason
acceptComposer({ ...base, state: 'atLimit' })
// @ts-expect-error limitReason belongs only to atLimit
acceptComposer({ ...base, state: 'idle', limitReason: 'Limit' })
// @ts-expect-error limitReason belongs only to atLimit
acceptComposer({ ...base, state: 'sending', limitReason: 'Limit' })
// @ts-expect-error limitReason belongs only to atLimit
acceptComposer({ ...base, state: 'recording', limitReason: 'Limit', onVoice: () => undefined, voiceWords })
// @ts-expect-error limitReason belongs only to atLimit
acceptComposer({ ...base, state: 'transcribing', limitReason: 'Limit', onVoice: () => undefined, voiceWords })
// @ts-expect-error voice words are paired with the callback
acceptComposer({ ...base, state: 'idle', onVoice: () => undefined })
// @ts-expect-error the voice callback is paired with its words
acceptComposer({ ...base, state: 'idle', voiceWords })
// @ts-expect-error recording is not constructible without voice
acceptComposer({ ...base, state: 'recording' })
// @ts-expect-error transcribing is not constructible without voice
acceptComposer({ ...base, state: 'transcribing' })
// @ts-expect-error attachment words are paired with the callback
acceptComposer({ ...base, state: 'idle', onAttachFile: () => undefined })
// @ts-expect-error attachments cannot exist without the capability
acceptComposer({ ...base, state: 'idle', attachments: [], onAttachRemove: () => undefined })
// @ts-expect-error removal cannot exist without the capability
acceptComposer({ ...base, state: 'idle', onAttachRemove: () => undefined })
// @ts-expect-error a tray requires its removal callback
acceptComposer({ ...base, state: 'idle', onAttachFile: () => undefined, attachWords, attachments: [] })
// @ts-expect-error retry requires its accessible word
acceptComposer({ ...base, state: 'idle', onRetry: () => undefined })

const invalidAttachWords: ComposerAttachWords = {
  file: 'Add file',
  image: 'Add image',
  trayLabel: 'Tray',
  // @ts-expect-error remove names each attachment and is therefore a function
  remove: 'Remove',
}
void invalidAttachWords

const validAttachment: ComposerAttachment = { id: 'image', kind: 'image', name: 'image.png' }
void validAttachment
// @ts-expect-error attachment id is required
const missingAttachmentId: ComposerAttachment = { kind: 'image', name: 'image.png' }
// @ts-expect-error attachment kind is required
const missingAttachmentKind: ComposerAttachment = { id: 'image', name: 'image.png' }
// @ts-expect-error attachment name is required
const missingAttachmentName: ComposerAttachment = { id: 'image', kind: 'image' }
// @ts-expect-error video is not an accepted attachment kind
const videoAttachment: ComposerAttachment = { id: 'video', kind: 'video', name: 'video.mp4' }
void [missingAttachmentId, missingAttachmentKind, missingAttachmentName, videoAttachment]

// @ts-expect-error two suggestions are below the contract minimum
const suggestions2: ComposerSuggestions = [chip, chip]
// @ts-expect-error seven suggestions are above the contract maximum
const suggestions7: ComposerSuggestions = [chip, chip, chip, chip, chip, chip, chip]
void [suggestions2, suggestions7]
