import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactTestRenderer as NativeTestRenderer } from 'react-test-renderer'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { API } from '@orbit/shared/api'
import { proactiveKeys } from '@orbit/shared/query'
import { proactiveItemSchema, proactiveItemStatusSchema } from '@orbit/shared/types'
import { createMockProactiveItem } from '@orbit/shared/__tests__/factories'
import { ProactiveAction } from '@/components/chat/proactive-action'
import { TodayAstra } from '@/components/today/today-astra'
import { openCurrentProactiveItem } from '@/lib/proactive-item'
import { useChatStore } from '@/stores/chat-store'
import { useUIStore } from '@/stores/ui-store'

type ReactTestRenderer = NativeTestRenderer & { unmount: () => void }

const TestRenderer: typeof import('react-test-renderer') = require('react-test-renderer')
const mocks = vi.hoisted(() => ({ api: vi.fn(), online: true, used: 0, ended: false, epoch: 0 }))
vi.mock('@/lib/api-client', () => ({ apiClient: mocks.api }))
vi.mock('@/stores/auth-store', () => ({ useAuthStore: (selector: (state: { isAuthenticated: boolean }) => unknown) => selector({ isAuthenticated: true }) }))
vi.mock('@/lib/session-epoch', () => ({ getSessionEpoch: () => mocks.epoch }))
vi.mock('@/hooks/use-profile', () => ({ useProfile: () => ({ profile: { aiMessagesUsed: mocks.used, aiMessagesLimit: 5 } }) }))
vi.mock('@/hooks/use-offline', () => ({ useOffline: () => ({ isOnline: mocks.online }) }))
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))
vi.mock('expo-router', () => ({ useRouter: () => ({ navigate: vi.fn() }) }))
vi.mock('@/lib/use-app-theme', () => ({ useAppTheme: () => ({ currentScheme: 'orange', currentTheme: 'dark' }) }))
vi.mock('@/lib/motion', () => ({ usePrefersReducedMotion: () => true }))

const item = proactiveItemSchema.parse(createMockProactiveItem())
function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return { client, render: async (children: React.ReactNode) => {
    let tree!: ReactTestRenderer
    await TestRenderer.act(() => {
      tree = TestRenderer.create(<QueryClientProvider client={client}>{children}</QueryClientProvider>) as ReactTestRenderer
    })
    await TestRenderer.act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)) })
    return tree
  } }
}
function button(tree: ReactTestRenderer, label: string) {
  return tree.root.findAll((node) => typeof node.type === 'string' && node.props.accessibilityRole === 'button' && (node.props.accessibilityLabel === label || node.findAll((child) => child.props.children === label).length > 0))[0]!
}
async function press(tree: ReactTestRenderer, label: string) {
  await TestRenderer.act(() => { (button(tree, label).props.onPress as () => void)() })
  await TestRenderer.act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)) })
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.online = true
  mocks.used = 0
  mocks.ended = false
  mocks.epoch = 0
  mocks.api.mockImplementation((path: string) => {
    if (path === API.proactive.current) return Promise.resolve(item)
    if (path === API.proactive.status(item.id)) return Promise.resolve(proactiveItemStatusSchema.parse({ id: item.id, status: mocks.ended ? 'ended' : 'active' }))
    return Promise.resolve(undefined)
  })
  useChatStore.setState({ messages: [], proactiveOutcomes: {}, isTyping: false, streamingMessageId: null })
  useUIStore.setState({ astraConversationOpen: false })
})

describe('proactive conversation', () => {
  it('loads current, opens its full text as AI once and sends the action prompt once', async () => {
    const { render } = setup()
    const line = await render(<TodayAstra today={item.localDate} isTodaySelected suppressed={false} />)
    await press(line, item.text)
    await press(line, item.text)
    expect(useChatStore.getState().messages).toEqual([expect.objectContaining({ role: 'ai', content: item.text })])
    expect(mocks.api.mock.calls.filter(([path]) => path === API.proactive.opened(item.id))).toHaveLength(1)
    expect(useUIStore.getState().astraConversationOpen).toBe(true)
    const send = vi.fn(() => Promise.resolve())
    const action = await render(<ProactiveAction item={item} acted={false} onSend={send} />)
    expect(button(action, item.actionLabel).props.disabled).toBe(false)
    await press(action, item.actionLabel)
    await press(action, item.actionLabel)
    expect(send).toHaveBeenCalledExactlyOnceWith(item.actionPrompt)
    expect(mocks.api.mock.calls.filter(([path]) => path === API.proactive.acted(item.id))).toHaveLength(1)
    await TestRenderer.act(() => { line.unmount(); action.unmount() })
  })

  it.each([
    ['offline', false, 0, 'shell.composer.offline.reason'],
    ['limit', true, 5, 'shell.composer.limit.reason'],
  ])('keeps the line available and explains the disabled action at %s', async (_scenario, online, used, reason) => {
    mocks.online = online
    mocks.used = used
    const { render, client } = setup()
    client.setQueryData(proactiveKeys.current(), item)
    const send = vi.fn()
    const tree = await render(<><TodayAstra today={item.localDate} isTodaySelected suppressed={false} /><ProactiveAction item={item} acted={false} onSend={send} /></>)
    expect(button(tree, item.text).props.disabled).not.toBe(true)
    expect(button(tree, item.actionLabel).props.disabled).toBe(true)
    expect(button(tree, item.actionLabel).props.accessibilityHint).toBe(reason)
    await press(tree, item.actionLabel)
    expect(send).not.toHaveBeenCalled()
    await TestRenderer.act(() => tree.unmount())
  })

  it('rechecks the displayed item by id and disables it when it ended', async () => {
    const { render } = setup()
    const send = vi.fn()
    useChatStore.getState().openProactiveItem(item)
    const tree = await render(<ProactiveAction item={item} acted={false} onSend={send} />)
    const explanation = tree.root.findAll((node) => String(node.type) === 'Text' && node.props.accessibilityLiveRegion === 'polite')[0]!
    expect(explanation.props.children).toBeUndefined()
    mocks.ended = true
    await press(tree, item.actionLabel)
    expect(tree.root.findAll((node) => String(node.type) === 'Text' && node.props.accessibilityLiveRegion === 'polite')[0]!).toBe(explanation)
    expect(button(tree, item.actionLabel).props.disabled).toBe(true)
    expect(button(tree, item.actionLabel).props.accessibilityHint).toBe('proactive.ended')
    expect(send).not.toHaveBeenCalled()
    expect(mocks.api.mock.calls.filter(([path]) => path === API.proactive.acted(item.id))).toHaveLength(0)
    await TestRenderer.act(() => tree.unmount())
  })

  it('recovers after a status failure and uses the trigger fallback label', async () => {
    const { render, client } = setup()
    const send = vi.fn()
    const tree = await render(<ProactiveAction item={{ ...item, actionLabel: '' }} acted={false} onSend={send} />)
    mocks.api.mockRejectedValue(new Error('Network unavailable'))
    await press(tree, 'proactive.actions.eveningCheckin')
    expect(button(tree, 'proactive.actions.eveningCheckin').props.disabled).toBe(true)
    expect(send).not.toHaveBeenCalled()
    mocks.api.mockImplementation((path: string) => path === API.proactive.status(item.id) ? Promise.resolve({ id: item.id, status: 'active' }) : Promise.resolve(undefined))
    await TestRenderer.act(async () => {
      await client.invalidateQueries({ queryKey: proactiveKeys.status(item.id) })
      await new Promise((resolve) => setTimeout(resolve, 20))
    })
    expect(button(tree, 'proactive.actions.eveningCheckin').props.disabled).toBe(false)
    useChatStore.getState().openProactiveItem(item)
    await press(tree, 'proactive.actions.eveningCheckin')
    expect(send).toHaveBeenCalledExactlyOnceWith(item.actionPrompt)
    await TestRenderer.act(() => tree.unmount())
  })

  it('consumes report failures without retries and uses cached content when opening offline', async () => {
    const { client } = setup()
    client.setQueryData(proactiveKeys.current(), item)
    mocks.api.mockRejectedValue(new Error('Offline'))
    await openCurrentProactiveItem(client)
    await openCurrentProactiveItem(client)
    expect(useChatStore.getState().messages[0]?.content).toBe(item.text)
    expect(mocks.api.mock.calls.filter(([path]) => path === API.proactive.opened(item.id))).toHaveLength(1)
  })

  it('opens an empty conversation for no item and ignores a replaced account response', async () => {
    const { client } = setup()
    mocks.api.mockResolvedValue(undefined)
    await openCurrentProactiveItem(client)
    expect(useChatStore.getState().messages).toHaveLength(0)
    expect(useUIStore.getState().astraConversationOpen).toBe(true)
    useUIStore.setState({ astraConversationOpen: false })
    mocks.api.mockImplementation(() => { mocks.epoch++; return Promise.resolve(item) })
    await openCurrentProactiveItem(client)
    expect(useChatStore.getState().messages).toHaveLength(0)
    expect(useUIStore.getState().astraConversationOpen).toBe(false)
  })
})
