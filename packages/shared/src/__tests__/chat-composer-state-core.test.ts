import { describe,expect,it,vi } from 'vitest'
import { createComposerRuntime,buildChatComposerProps,buildComposerAvailability,buildComposerSuggestions } from '../hooks/chat-composer-state-core'
import { createChatStoreState,type ChatStoreState } from '../stores/chat-store'
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

  it('dispatches send, retry and stop through the produced composer controls', () => {
    const inputs = { ...composerInputs(), isSending: true, canRetryLastSend: true, stopReply: { current: vi.fn() } }
    const props = buildChatComposerProps(inputs, {})
    props.onChangeValue('Updated draft')
    props.onSend()
    props.onRetry?.()
    props.replyControl?.onStop()
    expect(inputs.setInput).toHaveBeenCalledExactlyOnceWith('Updated draft')
    expect(inputs.sendMessage).toHaveBeenCalledOnce()
    expect(inputs.retryLastSend).toHaveBeenCalledOnce()
    expect(inputs.stopReply.current).toHaveBeenCalledOnce()
    expect(props.attachWords?.remove('plan.txt')).toBe('shell.composer.attach.remove')
    expect(props.state).toBe('sending')
  })

  it('treats the daily backstop and message allowance independently', () => {
    const inputs = { profile: createMockProfile({ aiMessagesUsed: 0, aiMessagesLimit: 3 }), dailyBudgetDate: null,
      today: '2026-09-16', replyActive: false, isTyping: false, streamingMessageId: null, messages: [], input: 'draft', isOnline: true, attachments: [] }
    expect(buildComposerAvailability(inputs)).toMatchObject({ canSend: true, atMessageLimit: false })
    expect(buildComposerAvailability({ ...inputs, dailyBudgetDate: inputs.today })).toMatchObject({ canSend: false, atMessageLimit: true, dailyBudgetReached: true })
    expect(buildComposerAvailability({ ...inputs, profile: createMockProfile({ aiMessagesUsed: 3, aiMessagesLimit: 3 }) })).toMatchObject({ canSend: false, atMessageLimit: true, dailyBudgetReached: false })
  })
})

function suggestionInputs(): Parameters<typeof buildComposerSuggestions>[0] {
  let chat: ChatStoreState
  chat = createChatStoreState(update => { chat = { ...chat, ...(typeof update === 'function' ? update(chat) : update) } })
  return { surface: 'today', habitsQuery: { isError: false, data: { topLevelHabits: [], totalCount: 0 } },
    detailQuery: { isError: false }, calendarHasError: false, selectedDate: '2026-09-16', today: '2026-09-16',
    profile: createMockProfile(), contextualSuggestion: null, t: vi.fn(t), allowanceText: vi.fn(t),
    sendMessage: vi.fn(async () => {}), aiMessagesLimit: 5, aiMessagesUsed: 4, dailyBudgetReached: false,
    queuedPrompts: [], queuePaused: false, isSending: false, isOnline: true, atMessageLimit: false,
    setSendError: vi.fn(), sendQueuedPrompt: vi.fn(async () => {}), getChat: () => chat }
}

describe('shared composer suggestions', () => {
  it('sends a translated prompt and preserves the selected contextual request', () => {
    const inputs = suggestionInputs()
    const suggestions = buildComposerSuggestions(inputs).composerSuggestions
    expect(suggestions[0]?.label).toBe('shell.composer.chips.today.buildMorningRoutine')
    suggestions[0]?.onSelect()
    expect(inputs.sendMessage).toHaveBeenLastCalledWith('shell.composer.prompts.today.buildMorningRoutine', undefined, undefined)
    const contextualSuggestion = { id: 'goal-detail:reading', label: 'Reading goal', prompt: 'Review my reading goal' }
    const contextual = buildComposerSuggestions({ ...inputs, contextualSuggestion }).composerSuggestions
    expect(contextual[0]?.label).toBe(contextualSuggestion.label)
    contextual[0]?.onSelect()
    expect(inputs.sendMessage).toHaveBeenLastCalledWith(contextualSuggestion.prompt, undefined, contextualSuggestion)
    contextual[1]?.onSelect()
    expect(inputs.sendMessage).toHaveBeenLastCalledWith(expect.any(String), undefined, undefined)
  })

  it('removes and sends queued requests without changing the composer draft', () => {
    const inputs = suggestionInputs()
    const chat = inputs.getChat()
    chat.setDraft('Keep my draft')
    chat.enqueuePrompt({ id: 'queued', content: 'Read', send: async () => true })
    const { queue } = buildComposerSuggestions({ ...inputs, queuedPrompts: inputs.getChat().queuedPrompts, queuePaused: true })
    expect(queue.items.map(item => item.id)).toEqual(['queued'])
    expect(queue.pausedReason).toBe('shell.composer.queue.paused')
    expect(queue.canSend).toBe(true)
    expect(queue.removeLabel('Read')).toBe('shell.composer.queue.remove')
    expect(inputs.t).toHaveBeenLastCalledWith('shell.composer.queue.remove', { message: 'Read' })
    expect(queue.sendLabel('Read')).toBe('shell.composer.queue.send')
    expect(inputs.t).toHaveBeenLastCalledWith('shell.composer.queue.send', { message: 'Read' })
    queue.onSend('queued')
    expect(inputs.sendQueuedPrompt).toHaveBeenCalledExactlyOnceWith('queued')
    queue.onRemove('queued')
    expect(inputs.getChat().queuedPrompts).toEqual([])
    expect(inputs.setSendError).toHaveBeenCalledExactlyOnceWith(null)
    expect(inputs.getChat().draft).toBe('Keep my draft')
  })

  it.each(['sending', 'offline', 'limit'] as const)('disables queued sending while %s', reason => {
    const state = buildComposerSuggestions({ ...suggestionInputs(), isSending: reason === 'sending',
      isOnline: reason !== 'offline', atMessageLimit: reason === 'limit' })
    expect(state.queue.canSend).toBe(false)
  })

  it('distinguishes renewal hints from the daily budget refusal', () => {
    const inputs = suggestionInputs()
    const nearLimit = buildComposerSuggestions(inputs)
    expect(nearLimit).toMatchObject({ usageMessage: 'shell.composer.usage', renewalHint: 'shell.composer.limit.renewal',
      allowanceReason: 'shell.composer.limit.reason', messageLimitReason: 'shell.composer.limit.reason' })
    expect(inputs.allowanceText).toHaveBeenCalledWith('shell.composer.usage', { used: 4, limit: 5 })
    const daily = buildComposerSuggestions({ ...inputs, dailyBudgetReached: true })
    expect(daily).toMatchObject({ usageMessage: undefined, renewalHint: undefined, allowanceReason: undefined,
      messageLimitReason: 'chat.dailyBudgetReached', messageLimitPlaceholder: 'shell.composer.limit.placeholder' })
    expect(buildComposerSuggestions({ ...inputs, aiMessagesUsed: 5 }).usageMessage).toBeUndefined()
    expect(buildComposerSuggestions({ ...inputs, aiMessagesUsed: 0 }).renewalHint).toBeUndefined()
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
