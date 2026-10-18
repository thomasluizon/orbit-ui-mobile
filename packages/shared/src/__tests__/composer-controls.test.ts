import { describe, expect, it, vi } from 'vitest'
import { buildComposerControls, selectComposerAction } from '../chat/composer-controls'
import type { ComposerProps } from '../contracts/composer'

function composerProps() {
  return {
    state: 'idle', value: '', onChangeValue: vi.fn(), onSend: vi.fn(), suggestions: [],
    words: { placeholder: 'Ask Astra', send: 'Send', actions: 'Actions', suggestionsLabel: 'Suggestions' },
    onAttachImage: vi.fn(), onAttachFile: vi.fn(),
    attachWords: { image: 'Photo', file: 'File', trayLabel: 'Attachments', remove: name => name },
    onVoice: vi.fn(), voiceWords: { start: 'Record', stop: 'Stop', recording: 'Recording', transcribing: 'Transcribing' },
  } satisfies ComposerProps
}

describe('composer controls', () => {
  it('lists supported actions in their displayed order with localized labels', () => {
    expect(buildComposerControls(composerProps())).toEqual({
      voiceActive: false, disabled: false, label: 'Actions',
      items: [
        { id: 'image', label: 'Photo', icon: 'photo', disabled: false },
        { id: 'file', label: 'File', icon: 'file', disabled: false },
        { id: 'voice', label: 'Record', icon: 'microphone' },
      ],
    })
    const { onAttachImage, onAttachFile, attachWords, onVoice, voiceWords, ...textOnly } = composerProps()
    expect(buildComposerControls(textOnly).items).toEqual([])
    expect(buildComposerControls({ ...textOnly, onVoice, voiceWords }).items.map(item => item.id)).toEqual(['voice'])
    expect(buildComposerControls({ ...textOnly, onAttachFile, attachWords }).items.map(item => item.id)).toEqual(['file'])
    expect(buildComposerControls({ ...textOnly, onAttachImage, attachWords }).items.map(item => item.id)).toEqual(['image'])
  })

  it('keeps voice available at capacity while preventing attachment input', () => {
    const props = composerProps()
    const limited = { ...props, state: 'atLimit', limitReason: 'Daily limit' } satisfies ComposerProps
    expect(buildComposerControls(limited).disabled).toBe(false)
    expect(buildComposerControls(limited).items.filter(item => item.disabled).map(item => item.id)).toEqual(['image', 'file'])
    const { onVoice, voiceWords, ...withoutVoice } = limited
    expect(onVoice).toBeDefined()
    expect(voiceWords).toBeDefined()
    expect(buildComposerControls(withoutVoice).disabled).toBe(true)
  })

  it('leaves recording stoppable, and disables transcribing, sending and offline controls', () => {
    const props = composerProps()
    const recording: ComposerProps = { ...props, state: 'recording', onVoice: vi.fn(), voiceWords: { start: 'Record', stop: 'Stop', recording: 'Recording', transcribing: 'Transcribing' } }
    expect(buildComposerControls(recording)).toMatchObject({ voiceActive: true, disabled: false, label: 'Stop' })
    expect(buildComposerControls({ ...recording, state: 'transcribing' })).toMatchObject({ voiceActive: true, disabled: true })
    expect(buildComposerControls({ ...props, state: 'sending' })).toMatchObject({ voiceActive: false, disabled: true })
    expect(buildComposerControls({ ...props, state: 'offline', limitReason: 'Offline' })).toMatchObject({ voiceActive: false, disabled: true })
  })

  it('dispatches only the selected action and ignores unknown or unavailable actions', () => {
    const props = composerProps()
    for (const id of ['image', 'file', 'voice']) selectComposerAction(props, id)
    expect(props.onAttachImage).toHaveBeenCalledTimes(1)
    expect(props.onAttachFile).toHaveBeenCalledTimes(1)
    expect(props.onVoice).toHaveBeenCalledTimes(1)
    selectComposerAction(props, 'unknown')
    expect(props.onVoice).toHaveBeenCalledTimes(1)
    const { words, value, onChangeValue, onSend, suggestions, state } = props
    const textOnly = { words, value, onChangeValue, onSend, suggestions, state }
    for (const id of ['image', 'file', 'voice']) expect(() => selectComposerAction(textOnly, id)).not.toThrow()
  })
})
