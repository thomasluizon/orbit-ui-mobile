import { describe, expect, it, vi } from 'vitest'
import { ChatReplyLifecycle, enqueueChatPrompt, nextQueuedChatPrompt, resolveChatRequestContext, sendChatPrompt, sendQueuedChatPrompt } from '../chat/prompt-queue'
import type { ChatStreamResult } from '../chat/block-answer-submission'
import type { PreparedChatTurn } from '../chat/stream-turn'
import { createChatStoreState, type ChatStoreState } from '../stores/chat-store'
import { makeApprovalPlan } from '../test-support/astra-plan-fixtures'

function setup() {
  let state = {} as ChatStoreState
  state = createChatStoreState(partial => {
    state = { ...state, ...(typeof partial === 'function' ? partial(state) : partial) }
  })
  const getChat = () => state
  const clearActivity = vi.fn()
  const abort = vi.fn()
  let ownsAccount = true
  state.beginReply()
  const reply = new ChatReplyLifecycle({
    getChat, ownsAccount: () => ownsAccount, getDraftMessageId: () => state.messages[0]?.id ?? null,
    createMessageId: () => 'stopped', stoppedMessage: 'Stopped', clearActivity, abort,
  })
  return { getChat, reply, clearActivity, abort, replaceAccount: () => { ownsAccount = false } }
}

const attempted = { content: 'Request with file content', draftContent: 'Request', textFile: null, restoreDraftOnFailure: true, clearDraftOnSuccess: true }

function promptSendHarness() {
  const { getChat } = setup()
  let generation = 0
  const contextualRequest = { id: 'goal-detail:reading', label: 'Reading goal', prompt: 'Review my reading goal' }
  getChat().setContextualSuggestion(contextualRequest)
  const prompt = { ...attempted, preview: 'image-preview', contextualRequest, turn: undefined as PreparedChatTurn<string> | undefined }
  const turn = { key: 'turn-key', payload: 'Request' }
  const run = vi.fn<(request: typeof prompt & { messageCost: 1 }) => Promise<ChatStreamResult>>(async request => {
    request.turn = turn
    return { kind: 'final' }
  })
  const context = { getChat, getAccountGeneration: () => generation, createMessageId: () => 'user-message',
    conversation: { astraConversationOpen: false, setAstraConversationOpen: vi.fn() },
    beginSend: vi.fn(() => getChat().beginReply()), run, onFailure: vi.fn(), retainRetry: vi.fn() }
  return { context, prompt, turn, replaceAccount: () => { generation += 1 } }
}

describe('shared prompt sending', () => {
  it('distinguishes the draft from follow-ups and explicit request context', () => {
    expect(resolveChatRequestContext(undefined)).toEqual({ sendsComposerDraft: true, messageOrigin: undefined })
    expect(resolveChatRequestContext('Read')).toMatchObject({ sendsComposerDraft: false })
    expect(resolveChatRequestContext(undefined, 'followUp')).toEqual({ sendsComposerDraft: false, messageOrigin: 'followUp' })
    expect(resolveChatRequestContext(undefined, { selectedOfferKey: 'morning-routine' }))
      .toEqual({ selectedOfferKey: 'morning-routine', sendsComposerDraft: true })
  })

  it.each([false, true])('opens the conversation and preserves the prepared turn with retry=%s', async isRetry => {
    const { context, prompt, turn } = promptSendHarness()
    expect(await sendChatPrompt(prompt, isRetry, context)).toBe(true)
    expect(context.conversation.setAstraConversationOpen).toHaveBeenCalledExactlyOnceWith(true)
    expect(context.beginSend).toHaveBeenCalledOnce()
    expect(context.run).toHaveBeenCalledExactlyOnceWith({ ...prompt, messageCost: 1 })
    expect(prompt.turn).toBe(turn)
    expect(context.getChat().messages).toEqual(isRetry ? [] : [expect.objectContaining({
      id: 'user-message', role: 'user', content: prompt.content, imageUrl: 'image-preview',
    })])
    expect(context.getChat().contextualSuggestion).toBeNull()
    expect(context.onFailure).not.toHaveBeenCalled()
  })

  it.each(['same reply', 'new reply', 'new account'] as const)('retains a stopped turn only for its owning account and reply: %s', async scenario => {
    const { context, prompt, turn, replaceAccount } = promptSendHarness()
    context.run.mockImplementationOnce(async request => {
      request.turn = turn
      if (scenario === 'new reply') context.getChat().beginReply()
      if (scenario === 'new account') replaceAccount()
      return { kind: 'cancelled' }
    })
    expect(await sendChatPrompt(prompt, false, context)).toBe(false)
    expect(prompt.turn).toBe(turn)
    expect(context.retainRetry.mock.calls).toEqual(scenario === 'same reply'
      ? [[{ ...prompt, restoreDraftOnFailure: false, clearDraftOnSuccess: false }]] : [])
    expect(context.getChat().contextualSuggestion).toBe(prompt.contextualRequest)
  })

  it('passes a failed stream and its draft to recovery without consuming the contextual request', async () => {
    const { context, prompt } = promptSendHarness()
    const failure = { status: 408, error: 'Timeout', code: null }
    context.run.mockResolvedValueOnce({ kind: 'failed', failure, draftMessageId: 'draft' })
    expect(await sendChatPrompt(prompt, false, context)).toBe(false)
    expect(context.onFailure).toHaveBeenCalledExactlyOnceWith(failure, prompt, 'draft')
    expect(context.getChat().contextualSuggestion).toBe(prompt.contextualRequest)
    expect(context.retainRetry).not.toHaveBeenCalled()
  })

  it('keeps a newer contextual request when the earlier send succeeds', async () => {
    const { context, prompt } = promptSendHarness()
    const replacement = { id: 'goal-detail:walking', label: 'Walking goal', prompt: 'Review my walking goal' }
    context.run.mockImplementationOnce(async () => {
      context.getChat().setContextualSuggestion(replacement)
      return { kind: 'final' }
    })
    expect(await sendChatPrompt(prompt, false, context)).toBe(true)
    expect(context.getChat().contextualSuggestion).toBe(replacement)
  })
})

describe('shared prompt queue', () => {
  it('caps the queue at three and sends the remaining prompts in order after removal', async () => {
    const { getChat, reply } = setup()
    const sent: string[] = []
    const send = async (request: typeof attempted) => { sent.push(request.content); return true }
    for (const content of ['first', 'remove', 'last']) {
      expect(enqueueChatPrompt(getChat(), content, { ...attempted, content, draftContent: content }, send)).toBe(true)
    }
    expect(enqueueChatPrompt(getChat(), 'fourth', attempted, send)).toBe(false)
    expect(nextQueuedChatPrompt(getChat())).toBeUndefined()
    getChat().removeQueuedPrompt('remove')
    reply.finish(true)
    expect(nextQueuedChatPrompt(getChat())).toBe('first')
    await sendQueuedChatPrompt(getChat(), 'first', true, undefined)
    getChat().finishReply(true)
    expect(nextQueuedChatPrompt(getChat())).toBe('last')
    await sendQueuedChatPrompt(getChat(), 'last', true, undefined)
    expect(sent).toEqual(['first', 'last'])
    expect(getChat().queuedPrompts).toEqual([])
  })

  it('keeps queued sends from restoring or clearing the current composer draft', async () => {
    const { getChat, reply } = setup()
    const send = vi.fn(async () => true)
    enqueueChatPrompt(getChat(), 'one', attempted, send)
    reply.finish(true)
    await sendQueuedChatPrompt(getChat(), 'one', true, undefined)
    expect(send).toHaveBeenCalledWith({ ...attempted, restoreDraftOnFailure: false, clearDraftOnSuccess: false }, false)
  })

  it.each([
    { draftContent: '', textFile: { name: 'plan.txt' }, expected: 'plan.txt' },
    { draftContent: '', textFile: null, expected: attempted.content },
  ])('uses $expected when the queued draft is empty', ({ draftContent, textFile, expected }) => {
    const { getChat } = setup()
    enqueueChatPrompt(getChat(), 'one', { ...attempted, draftContent, textFile }, async () => true)
    expect(getChat().queuedPrompts[0]?.content).toBe(expected)
  })

  it.each(['unavailable', 'allowance', 'active', 'typing', 'streaming', 'missing'] as const)('preserves the queue when dispatch is %s', async reason => {
    const { getChat, reply } = setup()
    const send = vi.fn(async () => true)
    enqueueChatPrompt(getChat(), 'one', attempted, send)
    if (reason !== 'active') reply.finish(true)
    if (reason === 'typing') getChat().setIsTyping(true)
    if (reason === 'streaming') getChat().setStreamingMessageId('streaming')
    await sendQueuedChatPrompt(getChat(), reason === 'missing' ? 'missing' : 'one', reason !== 'unavailable',
      reason === 'allowance' ? { aiMessagesUsed: 5, aiMessagesLimit: 5 } : undefined)
    expect(send).not.toHaveBeenCalled()
    expect(getChat().queuedPrompts).toHaveLength(1)
  })

  it('stops automatic dispatch after failure and allows an explicit send', async () => {
    const { getChat, reply } = setup()
    const send = vi.fn(async () => false)
    enqueueChatPrompt(getChat(), 'one', attempted, send)
    enqueueChatPrompt(getChat(), 'two', attempted, send)
    reply.finish(false)
    expect(nextQueuedChatPrompt(getChat())).toBeUndefined()
    await sendQueuedChatPrompt(getChat(), 'one', true, { aiMessagesUsed: 4, aiMessagesLimit: 5 })
    expect(send).toHaveBeenCalledOnce()
    expect(getChat().queuedPrompts.map(prompt => prompt.id)).toEqual(['two'])
    expect(getChat().queuePaused).toBe(true)
  })
})

describe('reply settlement lifecycle', () => {
  it.each(['stop', 'failure', 'success'] as const)('settles only unfinished work owned by the reply on %s', terminal => {
    const { reply, getChat } = setup()
    const plan = makeApprovalPlan()
    plan.steps.splice(1, 0,
      ...['pending', 'running', 'failed', 'skipped'].map(status => ({ ...plan.steps[0]!, id: status, status })),
      { ...plan.steps[1]!, id: 'approval-running', status: 'running' },
    )
    getChat().addMessage({ id: 'draft', role: 'ai', content: '', timestamp: new Date(), plan })
    getChat().addMessage({ id: 'unrelated', role: 'ai', content: '', timestamp: new Date(), plan })
    getChat().setStreamingMessageId('draft')
    if (terminal === 'stop') reply.stop()
    else reply.finish(terminal === 'success')
    expect(getChat().messages[0]?.plan?.steps.map(step => step.status)).toEqual(terminal === 'success'
      ? ['done', 'pending', 'running', 'failed', 'skipped', 'running', 'pending']
      : ['done', 'skipped', 'skipped', 'failed', 'skipped', 'skipped', 'pending'])
    expect(getChat().messages[0]?.plan?.steps.at(-1)).toEqual(plan.steps.at(-1))
    expect(getChat().messages[1]?.plan).toBe(plan)
    expect(plan.steps.map(step => step.status)).toEqual(['done', 'pending', 'running', 'failed', 'skipped', 'running', 'pending'])
    if (terminal === 'stop') {
      reply.finish(true)
      expect(getChat().messages[0]?.plan?.steps.some(step => step.status === 'running')).toBe(false)
    }
  })

  it('stops display and pauses the queue while keeping transport settlement alive', async () => {
    const { reply, getChat, abort } = setup()
    enqueueChatPrompt(getChat(), 'waiting', attempted, async () => true)
    getChat().setIsTyping(true)
    const reveal = reply.waitForReveal(new Promise<void>(() => {}))
    reply.stop()
    await reveal
    expect(reply.isHidden()).toBe(true)
    expect(reply.isCancelled()).toBe(false)
    expect(getChat()).toMatchObject({ replyActive: false, isTyping: false, queuePaused: true, queueReady: false })
    expect(getChat().messages.map(message => message.content)).toEqual(['Stopped'])
    reply.finish(true)
    reply.stop()
    expect(nextQueuedChatPrompt(getChat())).toBeUndefined()
    expect(abort).toHaveBeenCalledOnce()
  })

  it('retains streamed text without allowing old settlement to finish a newer reply', () => {
    const { reply, getChat } = setup()
    getChat().addMessage({ id: 'draft', role: 'ai', content: 'Partial', timestamp: new Date() })
    getChat().setStreamingMessageId('draft')
    reply.stop()
    expect(getChat().messages[0]?.content).toBe('Partial')
    getChat().beginReply()
    getChat().setIsTyping(true)
    reply.finish(true)
    expect(getChat()).toMatchObject({ replyActive: true, isTyping: true, queueReady: false })
  })

  it('cancels both display and settlement after account replacement', () => {
    const { reply, getChat, replaceAccount, abort, clearActivity } = setup()
    replaceAccount()
    reply.stop()
    reply.finish(true)
    expect(reply.isHidden()).toBe(true)
    expect(reply.isCancelled()).toBe(true)
    expect(getChat().messages).toEqual([])
    expect(abort).not.toHaveBeenCalled()
    expect(clearActivity).not.toHaveBeenCalled()
  })
})
