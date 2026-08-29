import type {
  ComposerAttachWords,
  ComposerAttachment,
  ComposerProps,
  ComposerSuggestions,
} from './Composer'

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
  add: 'Add',
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
acceptComposer({ ...base, state: 'offline', offlineReason: 'Offline' })
acceptComposer({ ...base, state: 'idle', words: { ...words } })
acceptComposer({
  ...base,
  state: 'idle',
  onOpenConversation: () => undefined,
  openConversationLabel: 'Open conversation',
})
acceptComposer({ ...base, state: 'atLimit', limitReason: 'Limit' })
acceptComposer({ ...base, state: 'recording', onVoice: () => undefined, voiceWords })
acceptComposer({ ...base, state: 'transcribing', onVoice: () => undefined, voiceWords })
acceptComposer({ ...base, state: 'idle', onAttach: () => undefined, attachWords })
acceptComposer({
  ...base,
  state: 'idle',
  onAttach: () => undefined,
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
// @ts-expect-error offline requires the caller's visible reason
acceptComposer({ ...base, state: 'offline' })
// @ts-expect-error offlineReason belongs only to offline
acceptComposer({ ...base, state: 'idle', offlineReason: 'Offline' })
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
acceptComposer({ ...base, state: 'idle', onAttach: () => undefined })
// @ts-expect-error attachments cannot exist without the capability
acceptComposer({ ...base, state: 'idle', attachments: [], onAttachRemove: () => undefined })
// @ts-expect-error removal cannot exist without the capability
acceptComposer({ ...base, state: 'idle', onAttachRemove: () => undefined })
// @ts-expect-error a tray requires its removal callback
acceptComposer({ ...base, state: 'idle', onAttach: () => undefined, attachWords, attachments: [] })
// @ts-expect-error retry requires its accessible word
acceptComposer({ ...base, state: 'idle', onRetry: () => undefined })
// @ts-expect-error the conversation trigger requires its accessible name
acceptComposer({ ...base, state: 'idle', onOpenConversation: () => undefined })
// @ts-expect-error a conversation name without its trigger names nothing
acceptComposer({ ...base, state: 'idle', openConversationLabel: 'Open conversation' })

// @ts-expect-error remove names each attachment and is therefore a function
const invalidAttachWords: ComposerAttachWords = { add: 'Add', trayLabel: 'Tray', remove: 'Remove' }
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
