import { QueryClient } from '@tanstack/query-core'
import { afterEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import { createChatStoreState, type ChatStoreState } from '../stores/chat-store'
import { ChatTurnReconciliation } from '../chat/stream-turn'
import { CHAT_STREAM_IDLE_TIMEOUT_MS } from '../chat'
import { makeConversationPage } from '../test-support/conversation-fixtures'

function deferred<Value>() {
  let resolve!: (value: Value) => void
  const promise = new Promise<Value>(finish => { resolve = finish })
  return { promise, resolve }
}

function streamContext() {
  let chat: ChatStoreState
  const setChat = (patch: Partial<ChatStoreState> | ((current: ChatStoreState) => Partial<ChatStoreState>)) => { chat = { ...chat, ...(typeof patch === 'function' ? patch(chat) : patch) } }
  chat = createChatStoreState(setChat)
  chat.beginReply()
  let generation = 0
  const context = {
    ...chat, getChat: () => chat, queryClient: new QueryClient(),
    t: (key: string) => key, allowanceText: (key: string) => key,
    activeStepsRef: { current: [] }, setActiveSteps: vi.fn(),
    stopReply: { current: null as (() => void) | null }, scrollToBottom: vi.fn(),
    getAccountGeneration: () => generation, createTurnKey: () => 'turn-key', createMessageId: () => 'message-id',
    turnReconciliation: new ChatTurnReconciliation(), buildChatFormData: () => 'payload',
    isAbortError: () => false, applyFinalResponse: vi.fn(), onModuleLoadError: vi.fn(),
  }
  return { context, replaceAccount: () => { generation += 1 } }
}

afterEach(() => {
  vi.doUnmock('../hooks/chat-stream-execution-core')
  vi.doUnmock('../chat/conversation-restore')
  vi.useRealTimers()
})

describe('composer execution module loading', () => {
  it('reports a rejected execution import to the platform adapter', async () => {
    const { runComposerStream } = await import('../hooks/chat-send-stream-core')
    vi.doMock('../hooks/chat-stream-execution-core', () => { throw new Error('Missing stream chunk') })
    const { context } = streamContext()
    await runComposerStream({ ...context, createTransport: () => vi.fn() }, { content: 'Read', image: null, messageCost: 1 })
    await vi.dynamicImportSettled()
    expect(context.onModuleLoadError).toHaveBeenCalledOnce()
    context.queryClient.clear()
  })

  it('reports a rejected import without opening a transport', async () => {
    const { runComposerStream } = await import('../hooks/chat-send-stream-core')
    const error = new Error('Missing stream chunk')
    vi.doMock('../hooks/chat-stream-execution-core', () => { throw error })
    const { context } = streamContext()
    const open = vi.fn(async () => ({ kind: 'httpError' as const, status: 500, error: 'Unavailable', code: null }))
    const outcome = await runComposerStream({ ...context, createTransport: () => open }, { content: 'Read', image: null, messageCost: 1 })
    await vi.dynamicImportSettled()
    expect(outcome).toMatchObject({ kind: 'failed', failure: { error: 'chat.sendError' } })
    expect(open).not.toHaveBeenCalled()
    expect(context.onModuleLoadError).toHaveBeenCalledOnce()
    expect(context.getChat().replyActive).toBe(false)
    context.queryClient.clear()
  })

  it('bounds a stalled import and clears the busy reply without a request', async () => {
    vi.useFakeTimers()
    const { runComposerStream } = await import('../hooks/chat-send-stream-core')
    const module = deferred<typeof import('../hooks/chat-stream-execution-core')>()
    onTestFinished(async () => { module.resolve(await vi.importActual('../hooks/chat-stream-execution-core')); await vi.dynamicImportSettled() })
    vi.doMock('../hooks/chat-stream-execution-core', () => module.promise)
    const { context } = streamContext()
    const open = vi.fn()
    const sending = runComposerStream({ ...context, createTransport: () => open }, { content: 'Read', image: null, messageCost: 1 })
    let outcome: Awaited<typeof sending> | undefined
    void sending.then(result => { outcome = result })
    await vi.advanceTimersByTimeAsync(CHAT_STREAM_IDLE_TIMEOUT_MS)
    expect(outcome).toMatchObject({ kind: 'failed', failure: { error: 'chat.sendError' } })
    expect(context.getChat().replyActive).toBe(false)
    expect(open).not.toHaveBeenCalled()
    expect(context.onModuleLoadError).toHaveBeenCalledOnce()
    module.resolve(await vi.importActual('../hooks/chat-stream-execution-core'))
    await sending
    await vi.dynamicImportSettled()
    expect(open).not.toHaveBeenCalled()
    context.queryClient.clear()
  })

  it('starts the idle budget at the transport after a slow import', async () => {
    vi.useFakeTimers()
    const { runComposerStream } = await import('../hooks/chat-send-stream-core')
    const module = deferred<typeof import('../hooks/chat-stream-execution-core')>()
    onTestFinished(async () => { module.resolve(await vi.importActual('../hooks/chat-stream-execution-core')); await vi.dynamicImportSettled() })
    vi.doMock('../hooks/chat-stream-execution-core', () => module.promise)
    const { context } = streamContext()
    const opened: number[] = []
    const controllers: AbortController[] = []
    const sending = runComposerStream({ ...context, createTransport: (_request, reply) => async () => {
      opened.push(Date.now())
      controllers.push(reply.resetController())
      reply.armIdleTimer()
      return { kind: 'stream', chunks: (async function* () { yield 'data: {"type":"error","error":"Unavailable","status":400}\n\n' })() }
    } }, { content: 'Read', image: null, messageCost: 1 })
    const start = Date.now()
    await vi.advanceTimersByTimeAsync(CHAT_STREAM_IDLE_TIMEOUT_MS - 1)
    expect(opened).toEqual([])
    module.resolve(await vi.importActual('../hooks/chat-stream-execution-core'))
    await sending
    expect(opened).toEqual([start + CHAT_STREAM_IDLE_TIMEOUT_MS - 1])
    expect(controllers[0]?.signal.aborted).toBe(true)
    context.queryClient.clear()
  })

  it('does not open a stream for an account replaced during import', async () => {
    const { runComposerStream } = await import('../hooks/chat-send-stream-core')
    const module = deferred<typeof import('../hooks/chat-stream-execution-core')>()
    onTestFinished(async () => { module.resolve(await vi.importActual('../hooks/chat-stream-execution-core')); await vi.dynamicImportSettled() })
    vi.doMock('../hooks/chat-stream-execution-core', () => module.promise)
    const { context, replaceAccount } = streamContext()
    const open = vi.fn()
    const sending = runComposerStream({ ...context, createTransport: () => open }, { content: 'Read', image: null, messageCost: 1 })
    replaceAccount()
    module.resolve(await vi.importActual('../hooks/chat-stream-execution-core'))
    expect(await sending).toEqual({ kind: 'cancelled' })
    expect(open).not.toHaveBeenCalled()
    context.queryClient.clear()
  })

  it('aborts an opened stream when the account changes before its first read', async () => {
    const { runComposerStream } = await import('../hooks/chat-send-stream-core')
    const { context, replaceAccount } = streamContext()
    const read = vi.fn()
    let controller: AbortController | undefined
    const sending = runComposerStream({ ...context, createTransport: (_request, reply) => async () => {
      controller = reply.resetController()
      replaceAccount()
      return { kind: 'stream', chunks: (async function* () { read(); yield '' })() }
    } }, { content: 'Read', image: null, messageCost: 1 })
    expect(await sending).toEqual({ kind: 'cancelled' })
    expect(read).not.toHaveBeenCalled()
    expect(controller?.signal.aborted).toBe(true)
    context.queryClient.clear()
  })
})

describe('conversation restore module loading', () => {
  it.each(['latest', 'earlier'] as const)('reports a rejected %s import and settles busy before any read', async operation => {
    const { createConversationHistory } = await import('../chat/conversation-history')
    vi.doMock('../chat/conversation-restore', () => { throw new Error('Missing history chunk') })
    const { context } = streamContext()
    context.getChat().finishReply(false)
    Object.assign(context.getChat(), { serverConversationId: makeConversationPage().conversationId, conversationBeforeOrder: 3 })
    const read = vi.fn(async () => makeConversationPage())
    const history = createConversationHistory({ getState: context.getChat,
      setState: patch => Object.assign(context.getChat(), patch), getAccountGeneration: () => 0,
      read, remove: vi.fn(), onModuleLoadError: context.onModuleLoadError })
    await expect(history[operation]()).rejects.toThrow()
    await vi.dynamicImportSettled()
    expect(context.onModuleLoadError).toHaveBeenCalledOnce()
    expect(context.getChat().conversationBusy).toBe(false)
    expect(read).not.toHaveBeenCalled()
    context.queryClient.clear()
  })

  it('loads before reading and keeps messages added during the import', async () => {
    const { createConversationHistory } = await import('../chat/conversation-history')
    const module = deferred<typeof import('../chat/conversation-restore')>()
    onTestFinished(async () => { module.resolve(await vi.importActual('../chat/conversation-restore')); await vi.dynamicImportSettled() })
    vi.doMock('../chat/conversation-restore', () => module.promise)
    const { context } = streamContext()
    context.getChat().finishReply(false)
    const read = vi.fn(async () => makeConversationPage())
    const history = createConversationHistory({ getState: context.getChat,
      setState: patch => Object.assign(context.getChat(), patch), getAccountGeneration: () => 0,
      read, remove: vi.fn(), onModuleLoadError: context.onModuleLoadError })
    const loading = history.latest()
    await Promise.resolve()
    expect(read).not.toHaveBeenCalled()
    context.getChat().addMessage({ id: 'daily-summary-today', role: 'ai', content: 'Summary', timestamp: new Date() })
    module.resolve(await vi.importActual('../chat/conversation-restore'))
    expect(await loading).toBe(true)
    expect(context.getChat().conversationLoaded).toBe(true)
    expect(context.getChat().messages.map(message => message.id)).toContain('daily-summary-today')
    context.queryClient.clear()
  })
})
