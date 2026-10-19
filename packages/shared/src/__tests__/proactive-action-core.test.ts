import { afterEach, describe, expect, it, vi } from 'vitest'
import { QueryClient } from '@tanstack/query-core'
import { createUseProactiveAction, type ProactiveActionAdapters } from '../hooks/proactive-action-core'
import { proactiveKeys } from '../query/keys'
import { createChatStoreState } from '../stores/chat-store'
import { proactiveItemSchema, type ProactiveItemStatus } from '../types/proactive'
import { createMockProactiveItem } from './factories'

const item = proactiveItemSchema.parse(createMockProactiveItem())
const clients: QueryClient[] = []

interface HookState {
  profile: { aiMessagesUsed: number; aiMessagesLimit: number } | undefined
  status: { data: ProactiveItemStatus | undefined; isError: boolean }
  isPending: boolean
  isOnline: boolean
  acted: boolean
}

function setup(overrides: Partial<HookState> = {}) {
  const state: HookState = {
    profile: { aiMessagesUsed: 0, aiMessagesLimit: 5 },
    status: { data: { id: item.id, status: 'active' }, isError: false },
    isPending: false, isOnline: true, acted: false, ...overrides,
  }
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  clients.push(client)
  let chat = createChatStoreState((patch) => { chat = { ...chat, ...typeof patch === 'function' ? patch(chat) : patch } })
  chat.openProactiveItem(item)
  const useChatStore: ProactiveActionAdapters['useChatStore'] = Object.assign(
    (selector: Parameters<ProactiveActionAdapters['useChatStore']>[0]) => selector(chat),
    { getState: () => chat },
  )
  const reportActed = vi.fn(async (_id: string) => undefined)
  const requestStatus = vi.fn(async (): Promise<ProactiveItemStatus> => ({ id: item.id, status: 'active' }))
  const send = vi.fn(async (_prompt: string) => undefined)
  const currentSend = { onSend: send }
  let reference: { current: unknown } | undefined
  let pending: Promise<void> | undefined
  const useAction = createUseProactiveAction({
    useRef: <T>(initial: T) => {
      reference ??= { current: initial }
      return reference as { current: T }
    },
    useEffect: (effect) => effect(),
    useQueryClient: () => client,
    useQuery: () => state.status,
    useMutation: ({ mutationFn }) => ({ isPending: state.isPending, mutate: () => { pending = mutationFn() } }),
    useProfile: () => ({ profile: state.profile }),
    useChatStore, getSessionEpoch: () => 0, requestStatus, reportActed,
  })
  return {
    state, client, chat, getChat: () => chat, reportActed, requestStatus, send, currentSend,
    render: () => useAction(item, state.acted, state.isOnline, currentSend.onSend),
    settle: () => pending,
  }
}

afterEach(() => {
  for (const client of clients.splice(0)) client.clear()
})

describe('shared proactive action hook', () => {
  it.each<{ scenario: string; overrides: Partial<HookState>; reason: string }>([
    { scenario: 'already acted', overrides: { acted: true }, reason: 'proactive.ended' },
    { scenario: 'ended status', overrides: { status: { data: { id: item.id, status: 'ended' }, isError: false } }, reason: 'proactive.ended' },
    { scenario: 'offline', overrides: { isOnline: false }, reason: 'shell.composer.offline.reason' },
    { scenario: 'at limit', overrides: { profile: { aiMessagesUsed: 5, aiMessagesLimit: 5 } }, reason: 'shell.composer.limit.reason' },
    { scenario: 'mutation pending', overrides: { isPending: true }, reason: 'shell.composer.busy.reason' },
    { scenario: 'failed status', overrides: { status: { data: { id: item.id, status: 'active' }, isError: true } }, reason: 'chat.sendError' },
    { scenario: 'not ready', overrides: { status: { data: undefined, isError: false } }, reason: 'common.loading' },
  ])('explains $scenario and refuses act', async ({ overrides, reason }) => {
    const context = setup(overrides)
    const action = context.render()
    expect(action.reason).toBe(reason)
    action.act()
    await context.settle()
    expect(context.requestStatus).not.toHaveBeenCalled()
    expect(context.reportActed).not.toHaveBeenCalled()
    expect(context.send).not.toHaveBeenCalled()
    expect(context.getChat().messages[0]?.proactiveActed).toBe(false)
  })

  it.each(['typing', 'streaming'] as const)('explains busy chat while %s and refuses act', async (busy) => {
    const context = setup()
    if (busy === 'typing') context.chat.setIsTyping(true)
    else context.chat.setStreamingMessageId('reply')
    const action = context.render()
    expect(action.reason).toBe('shell.composer.busy.reason')
    action.act()
    await context.settle()
    expect(context.requestStatus).not.toHaveBeenCalled()
    expect(context.reportActed).not.toHaveBeenCalled()
    expect(context.send).not.toHaveBeenCalled()
  })

  it('claims the item, reports acted, invalidates current and sends the action prompt', async () => {
    const context = setup()
    context.client.setQueryData(proactiveKeys.current(), item)
    const action = context.render()
    expect(action).toMatchObject({ reason: null, allowance: 5 })
    action.act()
    await context.settle()
    expect(context.requestStatus).toHaveBeenCalledExactlyOnceWith(item.id, expect.any(AbortSignal))
    expect(context.getChat().messages[0]?.proactiveActed).toBe(true)
    expect(context.reportActed).toHaveBeenCalledExactlyOnceWith(item.id)
    expect(context.client.getQueryState(proactiveKeys.current())?.isInvalidated).toBe(true)
    expect(context.send).toHaveBeenCalledExactlyOnceWith(item.actionPrompt)
  })

  it('refuses a second act even before the acted prop updates', async () => {
    const context = setup()
    const action = context.render()
    action.act()
    await context.settle()
    action.act()
    await context.settle()
    expect(context.reportActed).toHaveBeenCalledExactlyOnceWith(item.id)
    expect(context.send).toHaveBeenCalledExactlyOnceWith(item.actionPrompt)
  })

  it.each(['offline', 'at limit'] as const)('refuses sending when the hook becomes %s during revalidation', async (condition) => {
    const context = setup()
    let finish!: (status: ProactiveItemStatus) => void
    context.requestStatus.mockImplementation(() => new Promise((resolve) => { finish = resolve }))
    context.render().act()
    if (condition === 'offline') context.state.isOnline = false
    else context.state.profile = { aiMessagesUsed: 5, aiMessagesLimit: 5 }
    context.render()
    finish({ id: item.id, status: 'active' })
    await context.settle()
    expect(context.reportActed).not.toHaveBeenCalled()
    expect(context.send).not.toHaveBeenCalled()
    expect(context.getChat().messages[0]?.proactiveActed).toBe(false)
  })

  it('sends with the latest callback when the hook rerenders during revalidation', async () => {
    const context = setup()
    let finish!: (status: ProactiveItemStatus) => void
    context.requestStatus.mockImplementation(() => new Promise((resolve) => { finish = resolve }))
    context.render().act()
    const replacement = vi.fn(async (_prompt: string) => undefined)
    context.currentSend.onSend = replacement
    context.render()
    finish({ id: item.id, status: 'active' })
    await context.settle()
    expect(context.send).not.toHaveBeenCalled()
    expect(replacement).toHaveBeenCalledExactlyOnceWith(item.actionPrompt)
  })

  it('returns zero allowance while the profile is unavailable', () => {
    const context = setup({ profile: undefined })
    expect(context.render()).toMatchObject({ allowance: 0, reason: null })
  })
})
