import { describe, expect, it, vi } from 'vitest'
import { createStore } from 'zustand/vanilla'
import { createUseConversationHistory } from '../chat/conversation-history-hook'
import { createConversationHistory, type ConversationCursor } from '../chat/conversation-history'
import { createChatStoreState } from '../stores/chat-store'
import { createHookStateHarness } from '../test-support/hook-state'
import { makeConversationPage, storedConversationId } from '../test-support/conversation-fixtures'
import type { ConversationPage } from '../types/conversation'

function setup() {
  const state = createHookStateHarness()
  const store = createStore(createChatStoreState)
  const read = vi.fn(async (_cursor: ConversationCursor): Promise<ConversationPage | null> => makeConversationPage())
  const remove = vi.fn(async (_id: string) => {})
  let generation = 0
  let mounted = false
  let cleanup: (() => void) | undefined
  const getAccountGeneration = () => generation
  const history = createConversationHistory({ getState: store.getState, setState: store.setState, getAccountGeneration, read, remove })
  const useHistory = createUseConversationHistory({
    useState: state.useState, history, getAccountGeneration,
    useEffect: effect => {
      if (!mounted) { mounted = true; cleanup = effect() }
    },
  })
  return {
    history, store, read, remove,
    render: () => state.render(useHistory),
    changeAccount: () => { generation++ },
    unmount: () => cleanup?.(),
  }
}

describe('conversation history controls', () => {
  it('reopens the stored thread and loads its earlier page through the pinned cursor', async () => {
    const session = setup()
    session.render()
    await session.history.latest()
    expect(session.store.getState().serverConversationId).toBe(storedConversationId)
    session.read.mockResolvedValueOnce(makeConversationPage({ beforeOrder: null, turns: [] }))
    expect(await session.render().loadEarlier()).toBe(true)
    expect(session.read).toHaveBeenLastCalledWith({ conversationId: storedConversationId, beforeOrder: 3 })
    expect(session.store.getState().messages).toHaveLength(2)
    expect(await session.render().loadEarlier()).toBe(false)
    expect(session.render().failed).toBeNull()
  })

  it('keeps the flag-off or missing-conversation path empty and ready', async () => {
    const session = setup()
    session.read.mockResolvedValueOnce(null)
    session.render()
    await session.history.latest()
    expect(session.history.isReady()).toBe(true)
    expect(session.store.getState()).toMatchObject({ messages: [], serverConversationId: null })
    expect(session.render().failed).toBeNull()
    expect(await session.render().loadEarlier()).toBe(false)
  })

  it('retries initial load failures and permits an explicit refresh without a prior failure', async () => {
    const session = setup()
    session.read.mockRejectedValueOnce(new Error('Offline'))
    session.render()
    await expect(session.history.latest()).rejects.toThrow('Offline')
    expect(session.render().failed).toBe('load')
    session.render().retry()
    await session.history.latest()
    expect(session.render().failed).toBeNull()
    expect(session.store.getState().serverConversationId).toBe(storedConversationId)
    session.render().retry()
    await session.history.latest()
    expect(session.read).toHaveBeenCalledTimes(3)
  })

  it('retries a failed earlier page without replacing the visible thread', async () => {
    const session = setup()
    session.render()
    await session.history.latest()
    const messages = session.store.getState().messages
    session.read.mockRejectedValueOnce(new Error('Offline'))
    expect(await session.render().loadEarlier()).toBe(false)
    expect(session.render().failed).toBe('earlier')
    expect(session.store.getState().messages).toBe(messages)
    session.render().retry()
    await session.history.latest()
    expect(session.read).toHaveBeenLastCalledWith({ conversationId: storedConversationId, beforeOrder: 3 })
    expect(session.render().failed).toBeNull()
    expect(session.store.getState().messages).toEqual(messages)
  })

  it('requires confirmation again after a failed delete and clears the identity on success', async () => {
    const session = setup()
    session.render()
    await session.history.latest()
    session.render().requestDelete()
    expect(session.render().confirmationOpen).toBe(true)
    session.render().cancelDelete()
    expect(session.render().confirmationOpen).toBe(false)
    expect(session.remove).not.toHaveBeenCalled()
    session.render().requestDelete()
    session.remove.mockRejectedValueOnce(new Error('Offline'))
    expect(await session.render().confirmDelete()).toBe(false)
    expect(session.render()).toMatchObject({ failed: 'delete', confirmationOpen: false })
    expect(session.store.getState().serverConversationId).toBe(storedConversationId)
    session.render().retry()
    expect(session.render().confirmationOpen).toBe(true)
    expect(session.remove).toHaveBeenCalledOnce()
    expect(await session.render().confirmDelete()).toBe(true)
    expect(session.render()).toMatchObject({ failed: null, confirmationOpen: false })
    expect(session.store.getState()).toMatchObject({ messages: [], serverConversationId: null, conversationId: null })
  })

  it.each(['unmount', 'account'] as const)('ignores an initial failure after %s', async invalidation => {
    const session = setup()
    let reject!: (error: Error) => void
    session.read.mockImplementationOnce(() => new Promise((_resolve, fail) => { reject = fail }))
    session.render()
    const pending = session.history.latest()
    await Promise.resolve()
    if (invalidation === 'unmount') session.unmount()
    else session.changeAccount()
    reject(new Error('Offline'))
    await expect(pending).rejects.toThrow('Offline')
    expect(session.render().failed).toBeNull()
  })

  it('ignores an earlier-page failure from the previous account', async () => {
    const session = setup()
    session.render()
    await session.history.latest()
    let reject!: (error: Error) => void
    session.read.mockImplementationOnce(() => new Promise((_resolve, fail) => { reject = fail }))
    const pending = session.render().loadEarlier()
    await Promise.resolve()
    session.changeAccount()
    reject(new Error('Offline'))
    expect(await pending).toBe(false)
    expect(session.render().failed).toBeNull()
  })
})
