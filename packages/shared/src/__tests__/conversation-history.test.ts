import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createStore } from 'zustand/vanilla'
import { createChatStoreState } from '../stores/chat-store'
import type { ConversationPage } from '../types/conversation'
import { conversationPagePath, createConversationHistory, prepareConversationSend, restoreConversationPage } from '../chat/conversation-history'
import { buildChatClientContext } from '../chat/client-context'
import { makeConversationPage, storedOperationId, storedConversationId } from '../test-support/conversation-fixtures'

const store = createStore(createChatStoreState)
const read = vi.fn(async (): Promise<ConversationPage | null> => makeConversationPage())
const remove = vi.fn(async () => {})
let generation = 0
const history = createConversationHistory({ getState: store.getState, setState: store.setState, getAccountGeneration: () => generation, read, remove })
beforeEach(() => { store.setState(createChatStoreState(store.setState)); vi.clearAllMocks(); read.mockResolvedValue(makeConversationPage()); generation++ })

describe('conversation restoration', () => {
  it('builds the initial and pinned page paths without losing zero or string cursors', () => {
    expect(conversationPagePath()).toBe('/api/chat/conversations/latest?pageSize=40')
    expect(conversationPagePath({ conversationId: storedConversationId, beforeOrder: 0 }))
      .toBe(`/api/chat/conversations/latest?pageSize=40&conversationId=${storedConversationId}&beforeOrder=0`)
    expect(conversationPagePath({ conversationId: storedConversationId, beforeOrder: '9223372036854775806' }))
      .toBe(`/api/chat/conversations/latest?pageSize=40&conversationId=${storedConversationId}&beforeOrder=9223372036854775806`)
  })
  it('uses distinct role identities for one producer turn and existing response parts', () => {
    const messages = restoreConversationPage(makeConversationPage())
    expect(messages.map(message => message.role)).toEqual(['user', 'ai'])
    expect(messages[0]!.id).not.toBe(messages[1]!.id)
    expect(messages[0]!.imageUrl).toContain(`/conversations/${storedConversationId}/images/`)
    expect(messages[1]!.parts).toEqual([{ type: 'text', text: 'Review ready' }])
  })
  it.each(['approved', 'edited', 'expired', 'rejected', 'pending'])('restores a %s preview without implying successful execution', outcome => {
    const page = makeConversationPage()
    page.turns[1]!.previewOutcomesJson = JSON.stringify([{ PendingOperationId: storedOperationId, Outcome: outcome, Arguments: {}, Revision: 2 }])
    const state = restoreConversationPage(page)[1]!.pendingOperationStates?.[storedOperationId]
    if (outcome === 'pending') expect(state).toBeUndefined()
    else if (outcome === 'rejected') expect(state).toMatchObject({ rejected: true, dismissed: true })
    else expect(state).toMatchObject({ recordedOutcome: outcome })
    expect(state?.status).toBeUndefined()
  })
  it('deduplicates simultaneous reads and pins earlier pages to their thread', async () => {
    await Promise.all([history.latest(), history.latest()])
    expect(read).toHaveBeenCalledTimes(1)
    read.mockResolvedValue(makeConversationPage({ beforeOrder: null, turns: [] }))
    await history.earlier()
    expect(read).toHaveBeenLastCalledWith({ conversationId: storedConversationId, beforeOrder: 3 })
    expect(store.getState().messages).toHaveLength(2)
    expect(store.getState().conversationBeforeOrder).toBeNull()
  })
  it('prepends earlier turns once and rejects pages for a different conversation', async () => {
    await history.latest()
    const page = makeConversationPage({ beforeOrder: 1 })
    page.turns[0] = { ...page.turns[0]!, turnId: '00000000-0000-4000-8000-000000000004', order: 1 }
    read.mockResolvedValueOnce(page)
    expect(await history.earlier()).toBe(true)
    expect(store.getState().messages.map(message => message.id)).toEqual([
      'stored-00000000-0000-4000-8000-000000000004-user', ...restoreConversationPage(makeConversationPage()).map(message => message.id),
    ])
    read.mockResolvedValueOnce(makeConversationPage({ conversationId: '00000000-0000-4000-8000-000000000005' }))
    expect(await history.earlier()).toBe(false)
    expect(store.getState().messages).toHaveLength(3)
    expect(store.getState().conversationBeforeOrder).toBe(1)
  })
  it('keeps an empty conversation ready after the adapter maps a missing conversation to null', async () => {
    read.mockResolvedValueOnce(null)
    expect(history.isReady()).toBe(false)
    expect(await history.prepareSend()).toBe(true)
    expect(history.isReady()).toBe(true)
    expect(store.getState()).toMatchObject({ messages: [], conversationId: null, serverConversationId: null })
    expect(await history.earlier()).toBe(false)
    expect(await history.remove()).toBe(false)
    expect(prepareConversationSend(history, { astraConversationOpen: true, setAstraConversationOpen: vi.fn() }, vi.fn())).toBe(true)
    expect(await history.prepareSend()).toBe(true)
    expect(read).toHaveBeenCalledOnce()
  })
  it.each(['web', 'mobile'] as const)('hands the restored id to the next %s request and clears it after delete', async platform => {
    await history.latest()
    const context = () => buildChatClientContext({ platform, locale: 'en', conversationId: store.getState().serverConversationId ?? undefined })
    expect(context().conversationId).toBe(storedConversationId)
    expect(await history.remove()).toBe(true)
    expect(remove).toHaveBeenCalledExactlyOnceWith(storedConversationId)
    expect(context().conversationId).toBeUndefined()
  })
  it('does not allow a send prepared for an earlier account', async () => {
    let finish!: (page: ConversationPage) => void
    read.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    const pending = history.prepareSend()
    await Promise.resolve()
    generation++
    store.setState(createChatStoreState(store.setState))
    finish(makeConversationPage())
    expect(await pending).toBe(false)
    expect(history.isReady()).toBe(false)
    expect(store.getState().serverConversationId).toBeNull()
  })
  it('ignores a response from an earlier account', async () => {
    let finish!: (page: ReturnType<typeof makeConversationPage>) => void
    read.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    const pending = history.latest()
    await Promise.resolve()
    generation++
    store.setState(createChatStoreState(store.setState))
    finish(makeConversationPage())
    await pending
    expect(store.getState().messages).toEqual([])
  })
  it('forgets a previously restored thread when it is no longer available', async () => {
    await history.latest()
    read.mockResolvedValueOnce(null)
    await history.latest(true)
    expect(store.getState()).toMatchObject({ messages: [], conversationId: null, serverConversationId: null, conversationBeforeOrder: null })
  })
  it('opens immediately and restores the server identity before allowing a send', async () => {
    const open = vi.fn()
    const failure = vi.fn()
    const ready = prepareConversationSend(history, { astraConversationOpen: false, setAstraConversationOpen: open }, failure)
    expect(open).toHaveBeenCalledWith(true)
    expect(await ready).toBe(true)
    expect(store.getState().serverConversationId).toBe(storedConversationId)
    expect(failure).not.toHaveBeenCalled()
  })
  it('keeps the draft and refuses sending when the initial history request fails', async () => {
    store.setState({ draft: 'Keep this request' })
    read.mockRejectedValueOnce(new Error('Network request failed'))
    const failure = vi.fn()
    expect(await prepareConversationSend(history, { astraConversationOpen: true, setAstraConversationOpen: vi.fn() }, failure)).toBe(false)
    expect(failure).toHaveBeenCalledOnce()
    expect(store.getState().draft).toBe('Keep this request')
  })
  it('keeps a failed delete and resets identity after a successful retry', async () => {
    await history.latest()
    remove.mockRejectedValueOnce(new Error('Network request failed'))
    await expect(history.remove()).rejects.toThrow()
    expect(store.getState().serverConversationId).toBe(storedConversationId)
    expect(store.getState().messages).toHaveLength(2)
    await history.remove()
    expect(store.getState()).toMatchObject({ messages: [], conversationId: null, serverConversationId: null, conversationBeforeOrder: null, conversationLoaded: true, conversationBusy: false })
  })
})
