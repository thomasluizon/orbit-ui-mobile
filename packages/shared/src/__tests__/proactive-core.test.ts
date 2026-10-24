import { afterEach, describe, expect, it, vi } from 'vitest'
import { onlineManager, QueryClient } from '@tanstack/query-core'
import { actOnProactiveItem, proactiveStatusOptions } from '../hooks/proactive-action-core'
import { createProactiveItemController, proactiveItemQueryOptions, proactiveItemQueryResult } from '../hooks/proactive-item-core'
import { proactiveKeys } from '../query/keys'
import { createChatStoreState, type ChatStoreState } from '../stores/chat-store'
import { proactiveItemSchema, type ProactiveItemStatus } from '../types/proactive'
import { createMockProactiveItem } from './factories'
import { focusedDatedHabitListFixture, habitListCardFixture } from '../test-support/chat-fixtures'
import { getChatMessageParts } from '../chat/final-message'
import { makeProactiveBlockItem, proactiveBlockCases } from '../test-support/chat-block-layout'
import { chatMessageSchema } from '../types/chat'

const item = proactiveItemSchema.parse(createMockProactiveItem())
const clients: QueryClient[] = []

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  clients.push(client)
  let epoch = 0
  let chat = createChatStoreState((patch) => { chat = { ...chat, ...typeof patch === 'function' ? patch(chat) : patch } })
  const useChatStore = Object.assign((selector: (state: ChatStoreState) => boolean) => selector(chat), { getState: () => chat })
  const report = vi.fn(async () => undefined)
  const send = { isOnline: true, atLimit: false, onSend: vi.fn(async (_prompt: string) => undefined) }
  const requestStatus = vi.fn(async (): Promise<ProactiveItemStatus> => ({ id: item.id, status: 'active' }))
  const adapters = { getSessionEpoch: () => epoch, useChatStore, reportActed: report }
  const statusOptions = proactiveStatusOptions(item.id, requestStatus)
  const act = () => actOnProactiveItem(item, adapters, client, statusOptions, () => send)
  const requestCurrent = vi.fn(async (): Promise<typeof item | null | undefined> => item)
  const openConversation = vi.fn()
  const controller = createProactiveItemController({ requestCurrent, reportOpened: report, getChat: () => chat, openConversation, getSessionEpoch: adapters.getSessionEpoch })
  return { client, chat, getChat: () => chat, report, send, requestStatus, act, controller, requestCurrent, openConversation, replaceSession: () => { epoch++ } }
}

afterEach(() => {
  onlineManager.setOnline(true)
  for (const client of clients.splice(0)) client.clear()
})

describe('shared proactive action', () => {
  it('revalidates the shown item and claims it once across simultaneous sends', async () => {
    const { chat, act, report, send, requestStatus } = setup()
    chat.openProactiveItem(item)
    await Promise.all([act(), act()])
    expect(requestStatus).toHaveBeenCalledWith(item.id, expect.any(AbortSignal))
    expect(report).toHaveBeenCalledExactlyOnceWith(item.id)
    expect(send.onSend).toHaveBeenCalledExactlyOnceWith(item.actionPrompt)
  })

  it.each(['ended', 'session', 'offline', 'limit', 'typing', 'streaming', 'claimed'] as const)('rejects %s after awaiting status', async (condition) => {
    const context = setup()
    context.chat.openProactiveItem(item)
    let finish!: (status: ProactiveItemStatus) => void
    context.requestStatus.mockImplementation(() => new Promise((resolve) => { finish = resolve }))
    const pending = context.act()
    if (condition === 'session') context.replaceSession()
    if (condition === 'offline') context.send.isOnline = false
    if (condition === 'limit') context.send.atLimit = true
    if (condition === 'typing') context.chat.setIsTyping(true)
    if (condition === 'streaming') context.chat.setStreamingMessageId('reply')
    if (condition === 'claimed') context.chat.claimProactiveAction(item.id)
    finish({ id: item.id, status: condition === 'ended' ? 'ended' : 'active' })
    await pending
    expect(context.report).not.toHaveBeenCalled()
    expect(context.send.onSend).not.toHaveBeenCalled()
  })

  it('uses the latest send callback after the status response', async () => {
    const { chat, act, requestStatus, send } = setup()
    chat.openProactiveItem(item)
    const originalSend = send.onSend
    requestStatus.mockImplementation(async () => {
      send.onSend = vi.fn(async () => undefined)
      return { id: item.id, status: 'active' }
    })
    await act()
    expect(originalSend).not.toHaveBeenCalled()
    expect(send.onSend).toHaveBeenCalledExactlyOnceWith(item.actionPrompt)
  })

  it('propagates status failures without claiming or reporting', async () => {
    const { chat, act, requestStatus, send, report } = setup()
    chat.openProactiveItem(item)
    requestStatus.mockRejectedValue(new Error('Unavailable'))
    await expect(act()).rejects.toThrow('Unavailable')
    expect(report).not.toHaveBeenCalled()
    expect(send.onSend).not.toHaveBeenCalled()
    expect(chat.claimProactiveAction(item.id)).toBe(true)
  })

  it('keeps sending when reporting fails without retrying the report', async () => {
    const { chat, act, send, report } = setup()
    chat.openProactiveItem(item)
    report.mockRejectedValue(new Error('Report unavailable'))
    await act()
    await act()
    expect(report).toHaveBeenCalledTimes(1)
    expect(send.onSend).toHaveBeenCalledExactlyOnceWith(item.actionPrompt)
  })

  it('invalidates the current slot and propagates send failures after consuming the action', async () => {
    const { client, chat, act, send, report } = setup()
    client.setQueryData(proactiveKeys.current(), item)
    chat.openProactiveItem(item)
    send.onSend.mockRejectedValue(new Error('Send failed'))
    await expect(act()).rejects.toThrow('Send failed')
    expect(client.getQueryState(proactiveKeys.current())?.isInvalidated).toBe(true)
    await act()
    expect(report).toHaveBeenCalledTimes(1)
    expect(send.onSend).toHaveBeenCalledTimes(1)
  })

  it('rejects a cancelled status response even when the adapter completed', async () => {
    const signal = AbortSignal.abort()
    const options = proactiveStatusOptions(item.id, async () => ({ id: item.id, status: 'active' }))
    await expect(options.queryFn({ signal })).rejects.toThrow('Proactive request cancelled')
  })
})

describe('shared proactive item', () => {
  it('opens negotiated proactive parts once and preserves the block in replay', async () => {
    const { controller, client, requestCurrent, report, getChat } = setup()
    const parts = [{ type: 'block', kind: 'habitList', block: habitListCardFixture }]
    requestCurrent.mockResolvedValue(proactiveItemSchema.parse({ ...item, parts }))
    await controller.openCurrentProactiveItem(client)
    await controller.openCurrentProactiveItem(client)
    expect(getChat().messages).toHaveLength(1)
    const message = chatMessageSchema.parse(getChat().messages[0])
    expect(getChatMessageParts(message)).toEqual(parts)
    expect(report).toHaveBeenCalledExactlyOnceWith(item.id)
  })

  it('opens full content and reports once without turning a report failure into an error', async () => {
    const { controller, client, report, openConversation, getChat } = setup()
    report.mockRejectedValue(new Error('Report unavailable'))
    await controller.openCurrentProactiveItem(client)
    await controller.openCurrentProactiveItem(client)
    expect(report).toHaveBeenCalledExactlyOnceWith(item.id)
    expect(openConversation).toHaveBeenCalledTimes(2)
    expect(getChat().messages).toEqual([expect.objectContaining({ role: 'ai', content: item.text })])
  })

  it('keeps the original dated query and refresh token when a typed item is reopened', async () => {
    const { controller, client, requestCurrent, getChat } = setup()
    const parts = [{ type: 'block', kind: 'habitList', block: focusedDatedHabitListFixture }]
    requestCurrent.mockResolvedValue(proactiveItemSchema.parse({ ...item, parts }))
    await controller.openCurrentProactiveItem(client)
    requestCurrent.mockResolvedValue(proactiveItemSchema.parse({ ...item, parts: [
      { type: 'block', kind: 'habitList', block: habitListCardFixture },
    ] }))
    await controller.openCurrentProactiveItem(client)
    expect(getChatMessageParts(chatMessageSchema.parse(getChat().messages[0]))).toEqual(parts)
  })

  it('upgrades an already opened legacy item without another opened report or losing acted state', async () => {
    const { controller, client, requestCurrent, report, getChat } = setup()
    await controller.openCurrentProactiveItem(client)
    getChat().claimProactiveAction(item.id)
    const response = makeProactiveBlockItem(proactiveBlockCases[0]!)
    requestCurrent.mockResolvedValue(response)
    await controller.openCurrentProactiveItem(client)
    expect(getChat().messages).toHaveLength(1)
    const message = chatMessageSchema.parse(getChat().messages[0])
    expect(getChatMessageParts(message)).toEqual(response.parts)
    expect(message.proactiveActed).toBe(true)
    expect(report).toHaveBeenCalledExactlyOnceWith(item.id)
  })

  it.each(proactiveBlockCases)('retains the $trigger answer block and its action on replay', async scenario => {
    const { controller, client, requestCurrent, getChat } = setup()
    const response = makeProactiveBlockItem(scenario)
    requestCurrent.mockResolvedValue(response)
    await controller.openCurrentProactiveItem(client)
    const message = chatMessageSchema.parse(getChat().messages[0])
    expect(getChatMessageParts(message)).toEqual(response.parts)
    expect(message.proactiveItem?.actionPrompt).toBe(response.actionPrompt)
  })

  it.each([undefined, null, [], {}, [{ type: 'block', kind: 'future', block: {} }],
    [{ type: 'block', kind: 'habitList', block: {} }]])('keeps legacy recovery for unusable parts %j', async parts => {
    const { controller, client, requestCurrent, getChat } = setup()
    requestCurrent.mockResolvedValue(proactiveItemSchema.parse({ ...item, parts }))
    await controller.openCurrentProactiveItem(client)
    expect(getChatMessageParts(chatMessageSchema.parse(getChat().messages[0])))
      .toEqual([{ type: 'text', text: item.text }])
  })

  it.each([true, false])('opens offline immediately with cached item: %s', async (cached) => {
    const { controller, client, requestCurrent, report, openConversation } = setup()
    if (cached) client.setQueryData(proactiveKeys.current(), item)
    onlineManager.setOnline(false)
    await controller.openCurrentProactiveItem(client)
    expect(openConversation).toHaveBeenCalledOnce()
    expect(requestCurrent).not.toHaveBeenCalled()
    expect(report).toHaveBeenCalledTimes(cached ? 1 : 0)
  })

  it.each([true, false])('uses cached item after a request fails: %s', async (cached) => {
    const { controller, client, requestCurrent, report, openConversation } = setup()
    if (cached) client.setQueryData(proactiveKeys.current(), item)
    requestCurrent.mockRejectedValue(new Error('Unavailable'))
    await controller.openCurrentProactiveItem(client)
    expect(openConversation).toHaveBeenCalledOnce()
    expect(requestCurrent).toHaveBeenCalledOnce()
    expect(report).toHaveBeenCalledTimes(cached ? 1 : 0)
  })

  it('discards a response when the session changes', async () => {
    const { controller, client, replaceSession, requestCurrent, openConversation, report } = setup()
    requestCurrent.mockImplementation(async () => { replaceSession(); return item })
    await controller.openCurrentProactiveItem(client)
    expect(openConversation).not.toHaveBeenCalled()
    expect(report).not.toHaveBeenCalled()
  })

  it('normalizes absent items and preserves authentication and polling options', async () => {
    const { controller, requestCurrent } = setup()
    requestCurrent.mockResolvedValue(undefined)
    const options = proactiveItemQueryOptions(controller, false)
    expect(await options.queryFn({ signal: new AbortController().signal })).toBeNull()
    expect(options).toMatchObject({ queryKey: proactiveKeys.current(), enabled: false, refetchInterval: 60_000, staleTime: 30_000 })
    const result = proactiveItemQueryResult({ data: undefined, isError: false }, controller.openProactiveItem)
    expect(result).toEqual({ data: undefined, isError: false, item: null, openItem: controller.openProactiveItem })
  })

  it('rejects a cancelled item response', async () => {
    const { controller } = setup()
    await expect(controller.currentProactiveOptions.queryFn({ signal: AbortSignal.abort() })).rejects.toThrow('Proactive request cancelled')
  })
})
