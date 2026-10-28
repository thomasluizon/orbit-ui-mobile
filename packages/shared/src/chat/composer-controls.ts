import { prepareChatRequest, type ChatStoreState } from '../stores/chat-store'
import { hasComposerContent, type ComposerProps } from '../contracts/composer'

export function isComposerEditable(state: ComposerProps['state']): boolean {
  return state === 'idle' || state === 'sending'
}

function isComposerVoiceVisible(props: ComposerProps): boolean {
  return Boolean(props.onVoice) && (props.state === 'atLimit' || props.state === 'recording' || props.state === 'transcribing'
    || !hasComposerContent(props.value, props.attachments))
}

export function buildComposerPrimaryControl(props: ComposerProps): {
  kind: 'send' | 'stop' | 'microphone'; label: string; disabled: boolean; accented: boolean; onSelect: () => void
} {
  if (isComposerVoiceVisible(props) && props.onVoice) {
    const onVoice = props.onVoice
    const recording = props.state === 'recording'
    const active = recording || props.state === 'transcribing'
    const disabled = props.state !== 'idle' && props.state !== 'atLimit' && !recording
    return {
      kind: active ? 'stop' : 'microphone',
      label: props.voiceWords[active ? 'stop' : 'start'],
      disabled, accented: recording,
      onSelect: () => { if (!disabled) onVoice() },
    }
  }
  const canSend = isComposerEditable(props.state) && hasComposerContent(props.value, props.attachments)
  return {
    kind: 'send', label: props.words.send,
    disabled: !canSend, accented: canSend || props.state === 'sending',
    onSelect: () => { if (canSend) props.onSend() },
  }
}

type ComposerAction = { id: string; label: string; icon: string; disabled?: boolean }

export function buildComposerControls(props: ComposerProps): {
  disabled: boolean; label: string; items: ComposerAction[]
} {
  const inputDisabled = props.state !== 'idle'
  const disabled = inputDisabled && !(props.state === 'atLimit' && props.onVoice)
  const items = [
    ...(props.onAttachImage ? [{ id: 'image', label: props.attachWords.image, icon: 'photo', disabled: inputDisabled }] : []),
    ...(props.onAttachFile ? [{ id: 'file', label: props.attachWords.file, icon: 'file', disabled: inputDisabled }] : []),
  ]
  return { disabled, label: props.words.actions, items }
}

export function selectComposerAction(props: ComposerProps, id: string): void {
  if (id === 'image') props.onAttachImage?.()
  if (id === 'file') props.onAttachFile?.()
}

export function promptDisabledReason(state: {
  allowanceReason?: string; isOnline: boolean; dailyBudgetReached?: boolean; atMessageLimit: boolean; aiMessagesLimit: number; isSending: boolean
}, translate: (key: string, values?: { allowance: number }) => string): string | undefined {
  if (state.isOnline === false) return translate('shell.composer.offline.reason')
  if (state.dailyBudgetReached) return translate('chat.dailyBudgetReached')
  if (state.atMessageLimit) return state.allowanceReason ?? translate('shell.composer.limit.reason', { allowance: state.aiMessagesLimit })
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
