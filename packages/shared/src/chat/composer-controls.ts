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
