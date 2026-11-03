import { describe,expect,it,vi } from 'vitest'
import { createComposerRuntime,buildChatComposerProps,buildComposerAvailability } from '../hooks/chat-composer-state-core'
import { createMockProfile } from './factories'

const t = (key: string) => key

function composerInputs(): Parameters<typeof buildChatComposerProps>[0] {
  return { t, isOnline: true, isSending: false, queue: undefined, stopReply: { current: null },
    usageMessage: undefined, renewalHint: undefined, allowanceReason: undefined, input: 'draft', speechError: null,
    sendError: null, setInput: vi.fn(), sendMessage: vi.fn(async () => {}), composerSuggestions: [],
    openTextFilePicker: vi.fn(), openFilePicker: vi.fn(), attachments: [], removeTextFile: vi.fn(), removeImage: vi.fn(),
    canRetryLastSend: false, retryLastSend: vi.fn(async () => {}), isRecording: false, toggleRecording: vi.fn(),
    isTranscribing: false, speechSupported: true, atMessageLimit: false,
    messageLimitPlaceholder: 'allowance.placeholder', messageLimitReason: 'allowance.reason' }
}

describe('shared composer state projections', () => {
  it('prioritizes recording and transcription over offline and allowance states', () => {
    const inputs = { ...composerInputs(), isOnline: false, atMessageLimit: true }
    expect(buildChatComposerProps(inputs, {}).state).toBe('offline')
    expect(buildChatComposerProps({ ...inputs, isRecording: true }, {}).state).toBe('recording')
    expect(buildChatComposerProps({ ...inputs, isTranscribing: true }, {}).state).toBe('transcribing')
    const limited = buildChatComposerProps({ ...inputs, isOnline: true }, {})
    expect(limited.state).toBe('atLimit')
    expect(limited.words.placeholder).toBe('allowance.placeholder')
    expect(limited.suggestions).toEqual([])
  })

  it('keeps platform attachment and recovery actions on the produced contract', () => {
    const inputs = composerInputs()
    const onPaste = vi.fn()
    const errorRecovery = { label: 'settings', onSelect: vi.fn() }
    const props = buildChatComposerProps(inputs, { onPaste, errorRecovery })
    props.onPaste()
    props.onAttachRemove?.('chat-file')
    props.onAttachRemove?.('chat-image')
    expect(onPaste).toHaveBeenCalledOnce()
    expect(inputs.removeTextFile).toHaveBeenCalledOnce()
    expect(inputs.removeImage).toHaveBeenCalledOnce()
    expect(props.errorRecovery).toBe(errorRecovery)
  })

  it('keeps attachment controls synchronous while a native picker awaits input', () => {
    const inputs = composerInputs()
    inputs.openTextFilePicker = () => new Promise<void>(() => {})
    inputs.openFilePicker = () => new Promise<void>(() => {})
    const props = buildChatComposerProps(inputs, {})
    expect(props.onAttachFile?.()).toBeUndefined()
    expect(props.onAttachImage?.()).toBeUndefined()
  })

  it('treats the daily backstop and message allowance independently', () => {
    const inputs = { profile: createMockProfile({ aiMessagesUsed: 0, aiMessagesLimit: 3 }), dailyBudgetDate: null,
      today: '2026-09-16', replyActive: false, isTyping: false, streamingMessageId: null, messages: [], input: 'draft', isOnline: true, attachments: [] }
    expect(buildComposerAvailability(inputs)).toMatchObject({ canSend: true, atMessageLimit: false })
    expect(buildComposerAvailability({ ...inputs, dailyBudgetDate: inputs.today })).toMatchObject({ canSend: false, atMessageLimit: true, dailyBudgetReached: true })
    expect(buildComposerAvailability({ ...inputs, profile: createMockProfile({ aiMessagesUsed: 3, aiMessagesLimit: 3 }) })).toMatchObject({ canSend: false, atMessageLimit: true, dailyBudgetReached: false })
  })
})


it('isolates reply controls, scroll following and activity between composer instances', () => {
  const first = createComposerRuntime()
  const second = createComposerRuntime()
  first.activeStepsRef.current.push({ domain: 'habits', access: 'write' })
  first.pendingVoiceCommitRef.current = true
  first.stopReply.current = vi.fn()
  first.threadScroll.holdPosition()
  expect(first.threadScroll.isFollowing()).toBe(false)
  expect(second.threadScroll.isFollowing()).toBe(true)
  expect(second.activeStepsRef.current).toEqual([])
  expect(second.pendingVoiceCommitRef.current).toBe(false)
  expect(second.stopReply.current).toBeNull()
})
