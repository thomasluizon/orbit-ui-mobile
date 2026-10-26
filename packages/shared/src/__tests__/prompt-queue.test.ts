import { describe, expect, it, vi } from 'vitest'
import { ChatReplyLifecycle, enqueueChatPrompt, nextQueuedChatPrompt, sendQueuedChatPrompt } from '../chat/prompt-queue'
import { createChatStoreState, type ChatStoreState } from '../stores/chat-store'

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
