import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMockProactiveItem } from '@orbit/shared/__tests__/factories'
import { proactiveItemSchema, proactiveItemStatusSchema } from '@orbit/shared/types'
import { proactiveKeys } from '@orbit/shared/query'
import { ProactiveAction } from '@/components/chat/proactive-action'
import { TodayAstra } from '@/components/today/today-astra'
import { useChatStore } from '@/stores/chat-store'
import { useUIStore } from '@/stores/ui-store'
import { openCurrentProactiveItem } from '@/lib/proactive-item'

const mocks = vi.hoisted(() => ({
  current: vi.fn(), status: vi.fn(), opened: vi.fn(), acted: vi.fn(),
  online: true, used: 0, epoch: 0,
}))
vi.mock('@/app/actions/chat', () => ({
  getCurrentProactiveItem: mocks.current,
  getProactiveItemStatus: mocks.status,
  reportProactiveOpened: mocks.opened,
  reportProactiveActed: mocks.acted,
}))
vi.mock('@/stores/auth-store', () => ({
  useAuthStore: (selector: (state: { isAuthenticated: boolean }) => unknown) => selector({ isAuthenticated: true }),
  getHeldAccountId: () => 'account',
}))
vi.mock('@/lib/session-epoch', () => ({ getSessionEpoch: () => mocks.epoch }))
vi.mock('@/hooks/use-profile', () => ({ useProfile: () => ({ profile: { aiMessagesUsed: mocks.used, aiMessagesLimit: 5 } }) }))
vi.mock('@/hooks/use-offline', () => ({ useOffline: () => ({ isOnline: mocks.online }) }))
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))

const item = proactiveItemSchema.parse(createMockProactiveItem())
function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return { client, wrapper: ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider> }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.online = true
  mocks.used = 0
  mocks.epoch = 0
  mocks.current.mockResolvedValue(item)
  mocks.status.mockResolvedValue(proactiveItemStatusSchema.parse({ id: item.id, status: 'active' }))
  mocks.opened.mockResolvedValue(null)
  mocks.acted.mockResolvedValue(null)
  useChatStore.setState({ messages: [], proactiveOutcomes: {}, isTyping: false, streamingMessageId: null })
  useUIStore.setState({ astraConversationOpen: false })
})

describe('proactive conversation', () => {
  it('loads the endpoint, opens the full item once and sends its action through chat once', async () => {
    const { wrapper } = setup()
    const line = render(<TodayAstra today={item.localDate} isTodaySelected suppressed={false} />, { wrapper })
    fireEvent.click(await screen.findByRole('button', { name: item.text }))
    fireEvent.click(screen.getByRole('button', { name: item.text }))
    expect(useChatStore.getState().messages).toEqual([expect.objectContaining({ role: 'ai', content: item.text })])
    expect(mocks.opened).toHaveBeenCalledExactlyOnceWith(item.id, 'account')
    expect(useUIStore.getState().astraConversationOpen).toBe(true)
    expect(mocks.acted).not.toHaveBeenCalled()
    line.unmount()
    const send = vi.fn(async () => undefined)
    render(<ProactiveAction item={item} acted={false} onSend={send} />, { wrapper })
    const button = await screen.findByRole('button', { name: item.actionLabel })
    await waitFor(() => expect(button).toBeEnabled())
    fireEvent.click(button)
    fireEvent.click(button)
    await waitFor(() => expect(send).toHaveBeenCalledExactlyOnceWith(item.actionPrompt))
    expect(mocks.acted).toHaveBeenCalledExactlyOnceWith(item.id, 'account')
  })

  it.each([
    ['offline', false, 0, 'shell.composer.offline.reason'],
    ['limit', true, 5, 'shell.composer.limit.reason'],
  ])('keeps the line and explains the disabled action at %s', async (_scenario, online, used, reason) => {
    mocks.online = online
    mocks.used = used
    const { wrapper, client } = setup()
    client.setQueryData(proactiveKeys.current(), item)
    useChatStore.getState().openProactiveItem(item)
    const send = vi.fn()
    render(<><TodayAstra today={item.localDate} isTodaySelected suppressed={false} /><ProactiveAction item={item} acted={false} onSend={send} /></>, { wrapper })
    expect(screen.getByRole('button', { name: item.text })).toBeEnabled()
    const action = screen.getByRole('button', { name: item.actionLabel })
    expect(action).toBeDisabled()
    expect(action).toHaveAccessibleDescription(reason)
    fireEvent.click(action)
    expect(send).not.toHaveBeenCalled()
  })

  it('checks the shown item by id again before acting, even when current has advanced', async () => {
    const { wrapper } = setup()
    useChatStore.getState().openProactiveItem(item)
    const send = vi.fn()
    render(<ProactiveAction item={item} acted={false} onSend={send} />, { wrapper })
    const button = screen.getByRole('button', { name: item.actionLabel })
    await waitFor(() => expect(button).toBeEnabled())
    const explanation = screen.getByRole('status')
    expect(explanation).toBeEmptyDOMElement()
    mocks.status.mockResolvedValue(proactiveItemStatusSchema.parse({ id: item.id, status: 'ended' }))
    fireEvent.click(button)
    await waitFor(() => expect(button).toHaveAccessibleDescription('proactive.ended'))
    expect(screen.getByRole('status')).toBe(explanation)
    expect(button).toBeDisabled()
    expect(send).not.toHaveBeenCalled()
    expect(mocks.acted).not.toHaveBeenCalled()
  })

  it('recovers after a failed status refresh without sending while unavailable', async () => {
    const { wrapper, client } = setup()
    const send = vi.fn()
    render(<ProactiveAction item={item} acted={false} onSend={send} />, { wrapper })
    const button = screen.getByRole('button', { name: item.actionLabel })
    await waitFor(() => expect(button).toBeEnabled())
    mocks.status.mockRejectedValue(new Error('Network unavailable'))
    fireEvent.click(button)
    await waitFor(() => expect(button).toBeDisabled())
    expect(send).not.toHaveBeenCalled()
    mocks.status.mockResolvedValue(proactiveItemStatusSchema.parse({ id: item.id, status: 'active' }))
    await client.invalidateQueries({ queryKey: proactiveKeys.status(item.id) })
    await waitFor(() => expect(button).toBeEnabled())
    useChatStore.getState().openProactiveItem(item)
    fireEvent.click(button)
    await waitFor(() => expect(send).toHaveBeenCalledExactlyOnceWith(item.actionPrompt))
  })

  it('uses the trigger fallback and silently consumes outcome failures', async () => {
    const { wrapper, client } = setup()
    mocks.opened.mockRejectedValue(new Error('Report unavailable'))
    mocks.acted.mockRejectedValue(new Error('Report unavailable'))
    await openCurrentProactiveItem(client)
    await openCurrentProactiveItem(client)
    expect(mocks.opened).toHaveBeenCalledTimes(1)
    const send = vi.fn(async () => undefined)
    render(<ProactiveAction item={{ ...item, actionLabel: '' }} acted={false} onSend={send} />, { wrapper })
    const button = screen.getByRole('button', { name: 'proactive.actions.eveningCheckin' })
    await waitFor(() => expect(button).toBeEnabled())
    fireEvent.click(button)
    await waitFor(() => expect(send).toHaveBeenCalledWith(item.actionPrompt))
    expect(mocks.acted).toHaveBeenCalledTimes(1)
  })

  it('opens an ordinary empty conversation on no item and rejects a response from a replaced account', async () => {
    const { client } = setup()
    mocks.current.mockResolvedValue(null)
    await openCurrentProactiveItem(client)
    expect(useChatStore.getState().messages).toEqual([])
    expect(useUIStore.getState().astraConversationOpen).toBe(true)
    useUIStore.setState({ astraConversationOpen: false })
    mocks.current.mockImplementation(async () => { mocks.epoch++; return item })
    await openCurrentProactiveItem(client)
    expect(useChatStore.getState().messages).toEqual([])
    expect(useUIStore.getState().astraConversationOpen).toBe(false)
  })
})
