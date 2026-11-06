import { QueryClient } from '@tanstack/query-core'
import { afterEach,describe,expect,it,vi } from 'vitest'
import { ChatTurnReconciliation } from '../chat/stream-turn'
import { createChatStoreState,type ChatStoreState } from '../stores/chat-store'
import { chatResponseSchema } from '../types/chat'
import { profileKeys } from '../query/keys'
import {
createComposerFailureHandlers,retryComposerSend,runComposerStream,settleComposerResponse,
type ComposerAttempt,
} from '../hooks/chat-send-stream-core'
import { createChatThreadScroll } from '../hooks/chat-thread-scroll-core'
import { createMockProfile } from './factories'
import { makeAstraPlan } from '../test-support/astra-plan-fixtures'

function composerHarness() {
  let chat: ChatStoreState
  const setChat = (update: Partial<ChatStoreState> | ((current: ChatStoreState) => Partial<ChatStoreState>)) => {
    chat = { ...chat, ...(typeof update === 'function' ? update(chat) : update) }
  }
  chat = createChatStoreState(setChat)
  chat.beginReply()
  let generation = 0
  let nextId = 0
  const queryClient = new QueryClient()
  queryClient.setQueryData(profileKeys.detail(), createMockProfile({ aiMessagesUsed: 0 }))
  const context = {
    ...chat, onModuleLoadError: vi.fn(), getChat: () => chat, setChat, queryClient,
    t: (key: string) => key, allowanceText: (key: string) => key,
    activeStepsRef: { current: [] as { domain: string; access: string }[] }, setActiveSteps: vi.fn(),
    stopReply: { current: null as (() => void) | null }, scrollToBottom: (revealed?: () => void) => revealed?.(),
    getAccountGeneration: () => generation, createTurnKey: () => '11111111-1111-4111-8111-111111111111', createMessageId: () => `message-${++nextId}`,
    threadScroll: createChatThreadScroll(), turnReconciliation: new ChatTurnReconciliation(),
    buildChatFormData: (attempt: { content: string }) => attempt.content,
    isAbortError: (error: unknown) => error instanceof Error && error.name === 'AbortError',
    applyFinalResponse: (...args: Parameters<typeof settleComposerResponse> extends [unknown, ...infer Args] ? Args : never) => settleComposerResponse(context, ...args),
  }
  return { context, replaceAccount: () => { generation += 1; chat = createChatStoreState(setChat) } }
}

function attemptedSend(): ComposerAttempt<string, string> {
  return { content: 'Read', draftContent: 'Read', image: 'image', preview: 'preview', textFile: null,
    restoreDraftOnFailure: true, clearDraftOnSuccess: true, restoredDraftRevision: null }
}

afterEach(() => vi.useRealTimers())

describe('shared composer stream', () => {
  it('renders a plan before text and applies only matching live step updates', async () => {
    const { context } = composerHarness()
    const plan = makeAstraPlan()
    const step = { ...plan.steps[0]!, status: 'done' }
    const observations: ChatStoreState['messages'][] = []
    const frame = (event: unknown) => `data: ${JSON.stringify(event)}\n\n`
    const result = await runComposerStream({ ...context, createTransport: () => async () => ({ kind: 'stream', chunks: (async function* () {
      yield frame({ type: 'plan_step', planId: plan.id, planStep: step })
      observations.push(context.getChat().messages)
      yield frame({ type: 'plan', plan })
      observations.push(context.getChat().messages)
      yield frame({ type: 'plan_step', planId: 'another-plan', planStep: step })
      observations.push(context.getChat().messages)
      yield frame({ type: 'plan_step', planId: plan.id, planStep: step })
      observations.push(context.getChat().messages)
      yield frame({ type: 'final', response: chatResponseSchema.parse({ aiMessage: 'Saved', actions: [], plan: { ...plan, steps: [step, ...plan.steps.slice(1)] } }) })
    })() }) }, { ...attemptedSend(), messageCost: 0 })
    expect(observations[0]).toEqual([])
    expect(observations[1]?.[0]?.plan).toEqual(plan)
    expect(observations[2]?.[0]?.plan).toEqual(plan)
    expect(observations[3]?.[0]?.id).toBe(observations[1]?.[0]?.id)
    expect(observations[3]?.[0]?.plan?.steps[0]).toEqual(step)
    expect(result).toEqual({ kind: 'final' })
    expect(context.getChat().messages).toHaveLength(1)
    expect(context.getChat().messages[0]?.plan?.steps[0]).toEqual(step)
    context.queryClient.clear()
  })

  it('reuses the prepared turn across transport retries and settles its final response once', async () => {
    const { context } = composerHarness()
    const response = chatResponseSchema.parse({ aiMessage: 'Saved', actions: [] })
    const open = vi.fn()
      .mockResolvedValueOnce({ kind: 'httpError', status: 500, error: 'Unavailable', code: null })
      .mockResolvedValueOnce({ kind: 'stream', chunks: (async function* () {
        yield 'data: {"type":"delta","text":"Saving"}\n\n'
        yield `data: ${JSON.stringify({ type: 'final', response })}\n\n`
      })() })
    const request = { ...attemptedSend(), messageCost: 1 as const }
    const result = await runComposerStream({ ...context, createTransport: () => open }, request)
    expect(result).toEqual({ kind: 'final' })
    expect(open).toHaveBeenCalledTimes(2)
    expect(open.mock.calls[0]?.[0]).toBe(open.mock.calls[1]?.[0])
    expect(open.mock.calls[0]?.[0].key).toBe(context.createTurnKey())
    expect(context.getChat().messages[0]?.id).toMatch(/^message-/)
    expect(context.getChat().messages.map(message => message.content)).toEqual(['Saved'])
    expect(context.getChat().replyActive).toBe(false)
    expect(context.queryClient.getQueryData<ReturnType<typeof createMockProfile>>(profileKeys.detail())?.aiMessagesUsed).toBe(1)
    expect(context.stopReply.current).toBeNull()
    context.queryClient.clear()
  })

  it('discards a late final response after account replacement', async () => {
    const { context, replaceAccount } = composerHarness()
    const result = await runComposerStream({ ...context, createTransport: () => async () => ({ kind: 'stream', chunks: (async function* () {
      yield 'data: {"type":"delta","text":"Previous account"}\n\n'
      replaceAccount()
      yield `data: ${JSON.stringify({ type: 'final', response: chatResponseSchema.parse({ aiMessage: 'Late', actions: [] }) })}\n\n`
    })() }) }, { ...attemptedSend(), messageCost: 1 })
    expect(result).toEqual({ kind: 'cancelled' })
    expect(context.getChat().messages).toEqual([])
    expect(context.queryClient.getQueryData<ReturnType<typeof createMockProfile>>(profileKeys.detail())?.aiMessagesUsed).toBe(0)
    expect(context.stopReply.current).toBeNull()
    context.queryClient.clear()
  })

  it('retains a retryable turn when the transport fails before a terminal response', async () => {
    const { context } = composerHarness()
    const request = { ...attemptedSend(), messageCost: 1 as const }
    const result = await runComposerStream({ ...context, createTransport: () => async () => { throw new Error('Unavailable') } }, request)
    expect(result).toMatchObject({ kind: 'failed', failure: { status: null } })
    expect(request.turn?.payload).toBe('Read')
    expect(context.getChat().replyActive).toBe(false)
    expect(context.getChat().messages).toEqual([])
    context.queryClient.clear()
  })
})

describe('shared composer recovery', () => {
  it('restores a failed draft once and respects a newer draft when the daily ceiling is reached', () => {
    const { context } = composerHarness()
    const restoreImage = vi.fn()
    const setLastFailedSend = vi.fn()
    const setDailyBudgetDate = vi.fn()
    const handlers = createComposerFailureHandlers({ ...context, restoreImage, restoreTextFile: vi.fn(),
      setDailyBudgetDate, today: '2026-09-16', setSendError: vi.fn(), setLastFailedSend, setInput: context.getChat().setDraft })
    handlers.handleFailedSend({ status: 408, code: null, error: 'Timeout' }, attemptedSend(), null)
    expect(context.getChat().draft).toBe('Read')
    const failed = setLastFailedSend.mock.lastCall?.[0] as ComposerAttempt<string, string>
    expect(failed.restoreDraftOnFailure).toBe(false)
    expect(failed.restoredDraftRevision).toBe(context.getChat().draftRevision)
    context.getChat().setDraft('New draft')
    handlers.handleDailyBudgetExceeded(null, failed)
    expect(restoreImage).not.toHaveBeenCalled()
    expect(context.getChat().draft).toBe('New draft')
    expect(setDailyBudgetDate).toHaveBeenCalledWith('2026-09-16')
    context.queryClient.clear()
  })

  it.each([
    { failure: 'generic', status: 503, reason: 'chat.sendError', draft: false },
    { failure: 'generic', status: 503, reason: 'chat.sendError', draft: true },
    { failure: 'timeout', status: 408, reason: 'chat.timeoutError', draft: false },
    { failure: 'timeout', status: 408, reason: 'chat.timeoutError', draft: true },
  ])('reports a $failure failure once in the composer with retry (draft reply: $draft)', ({ status, reason, draft }) => {
    const { context } = composerHarness()
    const setSendError = vi.fn()
    const setLastFailedSend = vi.fn()
    const restoreImage = vi.fn()
    const handlers = createComposerFailureHandlers({ ...context, restoreImage, restoreTextFile: vi.fn(),
      setDailyBudgetDate: vi.fn(), today: '2026-09-16', setSendError, setLastFailedSend, setInput: context.getChat().setDraft })
    context.getChat().addMessage({ id: 'question', role: 'user', content: 'Read', timestamp: new Date() })
    if (draft) context.getChat().addMessage({ id: 'draft-reply', role: 'ai', content: 'Partial', timestamp: new Date() })
    handlers.handleFailedSend({ status, code: null, error: 'Unavailable' }, attemptedSend(), draft ? 'draft-reply' : null)
    expect(setSendError.mock.calls).toEqual([[reason]])
    expect(context.getChat().messages.map(message => message.id)).toEqual(['question'])
    expect(context.getChat().messages.some(message => message.content === 'chat.aiError')).toBe(false)
    expect(context.getChat().draft).toBe('Read')
    expect(setLastFailedSend).toHaveBeenCalledWith(expect.objectContaining({ content: 'Read', image: 'image', preview: 'preview', restoreDraftOnFailure: false }))
    context.queryClient.clear()
  })

  it('keeps a failed reply plan and drops its partial text without a second error', () => {
    const { context } = composerHarness()
    const setSendError = vi.fn()
    const handlers = createComposerFailureHandlers({ ...context, restoreImage: vi.fn(), restoreTextFile: vi.fn(),
      setDailyBudgetDate: vi.fn(), today: '2026-09-16', setSendError, setLastFailedSend: vi.fn(), setInput: context.getChat().setDraft })
    const plan = makeAstraPlan()
    context.getChat().addMessage({ id: 'draft-reply', role: 'ai', content: 'Partial', plan, timestamp: new Date() })
    handlers.handleFailedSend({ status: 503, code: null, error: 'Unavailable' }, attemptedSend(), 'draft-reply')
    expect(setSendError.mock.calls).toEqual([['chat.sendError']])
    expect(context.getChat().messages).toEqual([expect.objectContaining({ id: 'draft-reply', content: '', plan })])
    context.queryClient.clear()
  })

  it.each(['new draft', 'new account', 'matching revision'] as const)('clears only the matching retry draft: %s', async scenario => {
    const { context, replaceAccount } = composerHarness()
    context.getChat().setDraft('Read')
    const attempt = { ...attemptedSend(), restoredDraftRevision: context.getChat().draftRevision }
    const clearDraft = vi.fn(() => context.getChat().setDraft(''))
    await retryComposerSend(attempt, async () => {
      if (scenario === 'new account') replaceAccount()
      if (scenario === 'new draft') context.getChat().setDraft('New draft')
      return true
    }, context.getChat, context.getAccountGeneration, clearDraft)
    expect(clearDraft).toHaveBeenCalledTimes(scenario === 'matching revision' ? 1 : 0)
    context.queryClient.clear()
  })
})
