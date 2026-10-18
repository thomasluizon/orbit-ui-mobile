import { prepareChatRequest, type ChatStoreState } from '../stores/chat-store'
import type { ComposerProps } from '../contracts/composer'

type ComposerAction = { id: string; label: string; icon: string; disabled?: boolean }

export function buildComposerControls(props: ComposerProps): {
  voiceActive: boolean; disabled: boolean; label: string; items: ComposerAction[]
} {
  const voiceActive = props.state === 'recording' || props.state === 'transcribing'
  const inputDisabled = props.state !== 'idle'
  const disabled = voiceActive ? props.state === 'transcribing' : inputDisabled && !(props.state === 'atLimit' && props.onVoice)
  const items = [
    ...(props.onAttachImage ? [{ id: 'image', label: props.attachWords.image, icon: 'photo', disabled: inputDisabled }] : []),
    ...(props.onAttachFile ? [{ id: 'file', label: props.attachWords.file, icon: 'file', disabled: inputDisabled }] : []),
    ...(props.onVoice ? [{ id: 'voice', label: props.voiceWords.start, icon: 'microphone' }] : []),
  ]
  const label = voiceActive ? props.voiceWords.stop : props.words.actions
  return { voiceActive, disabled, label, items }
}

export function selectComposerAction(props: ComposerProps, id: string): void {
  if (id === 'image') props.onAttachImage?.()
  if (id === 'file') props.onAttachFile?.()
  if (id === 'voice') props.onVoice?.()
}

export function promptDisabledReason(state: {
  isOnline: boolean; atMessageLimit: boolean; aiMessagesLimit: number; isSending: boolean
}, translate: (key: string, values?: { allowance: number }) => string): string | undefined {
  if (state.isOnline === false) return translate('shell.composer.offline.reason')
  if (state.atMessageLimit) return translate('shell.composer.limit.reason', { allowance: state.aiMessagesLimit })
  return state.isSending ? translate('shell.composer.busy.reason') : undefined
}

export function findPromptSlot(prompt: string): { start: number; end: number } | null {
  const slot = /\{[^{}]+\}/u.exec(prompt)
  return slot ? { start: slot.index, end: slot.index + slot[0].length } : null
}

export function preparePromptTemplate(chat: Pick<ChatStoreState, 'draft' | 'setDraft' | 'setContextualSuggestion'>, request: { id: string; label: string; prompt: string }): ReturnType<typeof findPromptSlot> {
  const slot = findPromptSlot(request.prompt)
  if (!slot) return null
  const hasDraft = Boolean(chat.draft)
  prepareChatRequest(chat, { ...request, id: `prompt-library:${request.id}` })
  return hasDraft ? null : slot
}
