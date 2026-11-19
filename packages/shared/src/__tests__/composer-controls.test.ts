import { describe, expect, it, vi } from 'vitest'
import { buildComposerControls, buildComposerPrimaryControl, conversationRestReason, getOrbitRest, resolveAiMessagesLimit, selectComposerAction, submitComposerFromKeyboard } from '../chat/composer-controls'
import { buildComposerAvailability } from '../hooks/chat-composer-state-core'
import type { ComposerProps } from '../contracts/composer'

function composerProps() {
  return {
    state: 'idle', value: '', onChangeValue: vi.fn(), onSend: vi.fn(), suggestions: [],
    words: { placeholder: 'Ask Astra', send: 'Send', paste: 'Paste', nothingToPaste: 'Nothing to paste', clear: 'Clear message', actions: 'Actions', suggestionsLabel: 'Suggestions' },
    onAttachImage: vi.fn(), onAttachFile: vi.fn(),
    attachWords: { image: 'Photo', file: 'File', trayLabel: 'Attachments', remove: name => name },
    onVoice: vi.fn(), voiceWords: { start: 'Record', stop: 'Stop', recording: 'Recording', transcribing: 'Transcribing' },
  } satisfies ComposerProps
}

describe('composer controls', () => {
  it('lists supported actions in their displayed order with localized labels', () => {
    expect(buildComposerControls(composerProps())).toEqual({
      disabled: false, label: 'Actions',
      items: [
        { id: 'image', label: 'Photo', icon: 'photo', disabled: false },
        { id: 'file', label: 'File', icon: 'file', disabled: false },
      ],
    })
    const { onAttachImage, onAttachFile, attachWords, onVoice, voiceWords, ...textOnly } = composerProps()
    expect(buildComposerControls(textOnly).items).toEqual([])
    expect(buildComposerControls({ ...textOnly, onVoice, voiceWords }).items.map(item => item.id)).toEqual([])
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

  it('disables attachment controls while recording, transcribing, sending and offline', () => {
    const props = composerProps()
    const recording: ComposerProps = { ...props, state: 'recording', onVoice: vi.fn(), voiceWords: { start: 'Record', stop: 'Stop', recording: 'Recording', transcribing: 'Transcribing' } }
    expect(buildComposerControls(recording)).toMatchObject({ disabled: true, label: 'Actions' })
    expect(buildComposerControls({ ...recording, state: 'transcribing' })).toMatchObject({ disabled: true })
    expect(buildComposerControls({ ...props, state: 'sending' })).toMatchObject({ disabled: true })
    expect(buildComposerControls({ ...props, state: 'offline', limitReason: 'Offline' })).toMatchObject({ disabled: true })
  })

  it('shows the microphone on an empty field and starts voice from it', () => {
    const props = composerProps()
    const control = buildComposerPrimaryControl(props)
    expect(control).toMatchObject({ kind: 'microphone', label: 'Record', disabled: false, accented: false })
    control.onSelect()
    expect(props.onVoice).toHaveBeenCalledTimes(1)
    expect(props.onSend).not.toHaveBeenCalled()
  })

  it('replaces the microphone with send once the field has content', () => {
    const props = { ...composerProps(), value: 'Plan my week' }
    const control = buildComposerPrimaryControl(props)
    expect(control).toMatchObject({ kind: 'send', label: 'Send', disabled: false, accented: true })
    control.onSelect()
    expect(props.onSend).toHaveBeenCalledTimes(1)
    expect(props.onVoice).not.toHaveBeenCalled()
  })

  it('keeps an empty send disabled and inert when voice is unavailable', () => {
    const { onVoice, voiceWords, ...withoutVoice } = composerProps()
    expect(onVoice).toBeDefined()
    expect(voiceWords).toBeDefined()
    const control = buildComposerPrimaryControl(withoutVoice)
    expect(control).toMatchObject({ kind: 'send', disabled: true, accented: false })
    control.onSelect()
    expect(withoutVoice.onSend).not.toHaveBeenCalled()
  })

  it('stops a recording and blocks the control while transcribing', () => {
    const props = composerProps()
    const recording: ComposerProps = { ...props, value: 'Draft', state: 'recording', onVoice: props.onVoice, voiceWords: props.voiceWords }
    const stop = buildComposerPrimaryControl(recording)
    expect(stop).toMatchObject({ kind: 'stop', label: 'Stop', disabled: false, accented: true })
    stop.onSelect()
    expect(props.onVoice).toHaveBeenCalledTimes(1)
    const transcribing = buildComposerPrimaryControl({ ...recording, state: 'transcribing' })
    expect(transcribing).toMatchObject({ kind: 'stop', label: 'Stop', disabled: true, accented: false })
    transcribing.onSelect()
    expect(props.onVoice).toHaveBeenCalledTimes(1)
  })

  it('keeps voice reachable at the limit and inert offline', () => {
    const props = { ...composerProps(), value: 'Draft' }
    const limited = buildComposerPrimaryControl({ ...props, state: 'atLimit', limitReason: 'Daily limit' })
    expect(limited).toMatchObject({ kind: 'microphone', disabled: false })
    limited.onSelect()
    expect(props.onVoice).toHaveBeenCalledTimes(1)
    const offline = buildComposerPrimaryControl({ ...props, value: '', state: 'offline', limitReason: 'Offline' })
    expect(offline).toMatchObject({ kind: 'microphone', disabled: true })
    offline.onSelect()
    expect(props.onVoice).toHaveBeenCalledTimes(1)
  })

  it('dispatches only the selected action and ignores unknown or unavailable actions', () => {
    const props = composerProps()
    for (const id of ['image', 'file']) selectComposerAction(props, id)
    expect(props.onAttachImage).toHaveBeenCalledTimes(1)
    expect(props.onAttachFile).toHaveBeenCalledTimes(1)
    expect(props.onVoice).not.toHaveBeenCalled()
    selectComposerAction(props, 'voice')
    selectComposerAction(props, 'unknown')
    expect(props.onVoice).not.toHaveBeenCalled()
    const { words, value, onChangeValue, onSend, suggestions, state } = props
    const textOnly = { words, value, onChangeValue, onSend, suggestions, state }
    for (const id of ['image', 'file', 'voice']) expect(() => selectComposerAction(textOnly, id)).not.toThrow()
  })

  it.each([
    ['an empty composer', ''],
    ['the restored draft', 'Quais habitos tenho hoje'],
  ])('puts retry in the send position over %s while idle', (_case, value) => {
    const onRetry = vi.fn()
    const props = { ...composerProps(), value, words: { ...composerProps().words, retry: 'Tentar de novo' }, onRetry } satisfies ComposerProps
    const action = buildComposerPrimaryControl(props)
    expect(action).toMatchObject({ kind: 'retry', label: 'Tentar de novo', disabled: false, accented: false })
    action.onSelect()
    expect(onRetry).toHaveBeenCalledOnce()
    expect(props.onSend).not.toHaveBeenCalled()
    expect(props.onVoice).not.toHaveBeenCalled()
  })

  it.each([
    ['sending', { state: 'sending' }, 'send'],
    ['offline', { state: 'offline', limitReason: 'Offline' }, 'send'],
    ['recording', { state: 'recording' }, 'stop'],
  ] as const)('leaves the send position to its own control while %s', (_case, stateProps, kind) => {
    const props = { ...composerProps(), value: 'Quais habitos', words: { ...composerProps().words, retry: 'Tentar de novo' }, onRetry: vi.fn(), ...stateProps } as ComposerProps
    expect(buildComposerPrimaryControl(props).kind).toBe(kind)
  })

  it.each([
    ['retry over the restored draft', { value: 'Quais habitos tenho hoje', onRetry: vi.fn() }, 'retry'],
    ['send over an edited draft', { value: 'Quais habitos tenho amanha' }, 'send'],
    ['send while a reply streams', { value: 'Quais habitos tenho amanha', state: 'sending' }, 'send'],
    ['nothing over an empty field', { value: '' }, 'none'],
    ['nothing over a blank field', { value: '  ' }, 'none'],
    ['nothing offline', { value: 'Quais habitos', state: 'offline', limitReason: 'Offline' }, 'none'],
    ['nothing while recording', { value: '', state: 'recording' }, 'none'],
  ] as const)('submits from the keyboard through the send position: %s', (_case, overrides, expected) => {
    const props = { ...composerProps(), words: { ...composerProps().words, retry: 'Tentar de novo' }, ...overrides } as ComposerProps
    submitComposerFromKeyboard(props)
    expect(props.onRetry ?? vi.fn()).toHaveBeenCalledTimes(expected === 'retry' ? 1 : 0)
    expect(props.onSend).toHaveBeenCalledTimes(expected === 'send' ? 1 : 0)
    expect(props.onVoice).not.toHaveBeenCalled()
  })
})

describe('when the AI rests', () => {
  const available = { aiMessagesUsed: 0, aiMessagesLimit: 5 as number | undefined, hasProAccess: false }

  it.each([
    [true, { aiMessagesUsed: 0 }, null],
    [false, { aiMessagesUsed: 0 }, 'todayAstra.guided.offline'],
    [true, { aiMessagesUsed: 4 }, null],
    [true, { aiMessagesUsed: 5 }, 'conversation.restLimit'],
    [true, { aiMessagesUsed: 4, aiMessagesLimit: undefined, hasProAccess: false }, null],
    [true, { aiMessagesUsed: 5, aiMessagesLimit: undefined, hasProAccess: false }, 'conversation.restLimit'],
    [true, { aiMessagesUsed: 49, aiMessagesLimit: undefined, hasProAccess: true }, null],
    [true, { aiMessagesUsed: 50, aiMessagesLimit: undefined, hasProAccess: true }, 'conversation.restLimit'],
  ] as const)('gives the reason for online %s and %j: %s', (isOnline, profile, reason) => {
    expect(getOrbitRest({ isOnline, profile: { ...available, ...profile } })).toBe(reason)
  })

  it('treats a missing profile as a free plan that has used nothing', () => {
    expect(getOrbitRest({ isOnline: true, profile: undefined })).toBeNull()
    expect(resolveAiMessagesLimit(undefined)).toBe(5)
  })

  it.each([
    [{ aiMessagesUsed: 0, aiMessagesLimit: undefined, hasProAccess: false }],
    [{ aiMessagesUsed: 5, aiMessagesLimit: undefined, hasProAccess: false }],
    [{ aiMessagesUsed: 50, aiMessagesLimit: undefined, hasProAccess: true }],
    [{ aiMessagesUsed: 7, aiMessagesLimit: 7, hasProAccess: false }],
  ] as const)('gives the conversation the same limit as Hoje and Calendário for %j', (profile) => {
    const composer = buildComposerAvailability({ profile: profile as never, dailyBudgetDate: null, today: '2026-11-13', replyActive: false, isTyping: false, streamingMessageId: null, messages: [], input: '', isOnline: true, attachments: [] })
    expect(conversationRestReason({ isOnline: true, atMessageLimit: composer.atMessageLimit })).toBe(getOrbitRest({ isOnline: true, profile }))
    expect(composer.aiMessagesLimit).toBe(resolveAiMessagesLimit(profile))
  })
})
