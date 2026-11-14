import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider, focusManager } from '@tanstack/react-query'
import { notificationKeys } from '@orbit/shared/query'
import { createMockNotification } from '@orbit/shared/__tests__/factories'
import { enableTestFlags } from '@orbit/shared/test-support/flag-state'
import { resolveMotionPreset } from '@orbit/shared/theme'
import type { NotificationItem } from '@orbit/shared/types/notification'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { NotificationBell } from '@/components/navigation/notification-bell'
import { NotificationInbox } from '@/components/navigation/notification-inbox'
import { NotificationDeleteNotice } from '@/components/navigation/notification-delete-notice'
import { RootNotificationHeader } from '@/components/navigation/root-notification-header'
import { fetchJson } from '@/lib/api-fetch'
import { resetPendingNotificationDeletesForTests } from '@/lib/pending-notification-deletes'
import { useAppToastStore } from '@/stores/app-toast-store'

const PINNED_TEST_TIME = new Date('2026-09-12T09:00:00.000Z')

const actionMocks = vi.hoisted(() => ({
  markNotificationRead: vi.fn(),
  markAllNotificationsRead: vi.fn(),
  deleteNotification: vi.fn(),
  deleteAllNotifications: vi.fn(),
  subscribePush: vi.fn(),
  unsubscribePush: vi.fn(),
}))
const view = vi.hoisted(() => ({ locale: 'en' as 'en' | 'pt-BR', reducedMotion: false, wide: false, pathname: '/notifications', push: vi.fn(), goBack: vi.fn() }))

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: view.push }), usePathname: () => view.pathname }))
vi.mock('next-intl', async () => {
  const { createTranslator } = await vi.importActual<typeof import('next-intl')>('next-intl')
  const messages = { en: (await import('@orbit/shared/i18n/en.json')).default, 'pt-BR': (await import('@orbit/shared/i18n/pt-BR.json')).default }
  return { useTranslations: () => createTranslator({ locale: view.locale, messages: messages[view.locale] }) }
})
vi.mock('@/hooks/use-go-back-or-fallback', () => ({ useGoBackOrFallback: () => view.goBack }))
vi.mock('@/lib/api-fetch', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/lib/api-fetch')>()), fetchJson: vi.fn() }))
vi.mock('@/app/actions/notifications', () => actionMocks)
vi.mock('@/components/ui/sheet', async () => await import('@/__tests__/support/sheet-double'))

let queryClient: QueryClient

function seed(items: NotificationItem[]) {
  const response = { items, unreadCount: items.filter((item) => !item.isRead).length }
  queryClient.setQueryData(notificationKeys.lists(), response)
  vi.mocked(fetchJson).mockResolvedValue(response)
}

/** What the server returns on the next read. The cache keeps what the surface shows now. */
function serve(items: NotificationItem[]) {
  vi.mocked(fetchJson).mockResolvedValue({ items, unreadCount: items.filter((item) => !item.isRead).length })
}

function mount() {
  return render(<QueryClientProvider client={queryClient}><NotificationBell /><NotificationInbox /><NotificationDeleteNotice /></QueryClientProvider>)
}

async function advance(milliseconds: number) {
  await act(async () => { await vi.advanceTimersByTimeAsync(milliseconds) })
}

async function chooseInboxAction(optionsLabel: string, label: string) {
  await act(async () => {
    fireEvent.pointerDown(screen.getByRole('button', { name: optionsLabel }), { button: 0, ctrlKey: false })
    await vi.dynamicImportSettled()
  })
  fireEvent.click(screen.getByRole('menuitem', { name: label }))
}

const rowNames = () => within(screen.getByRole('list', { name: view.locale === 'en' ? 'Alerts' : 'Avisos' })).getAllByRole('button')
  .map((button) => button.getAttribute('aria-label') ?? '').filter((name) => !name.startsWith(view.locale === 'en' ? 'Delete' : 'Apagar'))
const marks = (container: HTMLElement) => [...container.querySelectorAll<HTMLElement>('[data-unread-mark]')]
const three = () => [
  createMockNotification({ id: 'first', title: 'First', isRead: false }),
  createMockNotification({ id: 'second', title: 'Second', isRead: false }),
  createMockNotification({ id: 'third', title: 'Third', isRead: true }),
]

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(PINNED_TEST_TIME)
  vi.clearAllMocks()
  view.locale = 'en'
  view.reducedMotion = false
  view.wide = false
  view.pathname = '/notifications'
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query === '(prefers-reduced-motion: reduce)' ? view.reducedMotion : view.wide && /min-width/.test(query),
    media: query, onchange: null, addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn(),
  }))
  useAppToastStore.setState({ currentToast: null, queue: [] })
  resetPendingNotificationDeletesForTests()
  focusManager.setFocused(true)
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })
  seed(three())
  const success = { ok: true as const, data: undefined }
  for (const action of [actionMocks.markNotificationRead, actionMocks.markAllNotificationsRead, actionMocks.deleteNotification, actionMocks.deleteAllNotifications]) action.mockResolvedValue(success)
})

afterEach(() => {
  cleanup()
  resetPendingNotificationDeletesForTests()
  queryClient.clear()
  focusManager.setFocused(undefined)
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('the Avisos inbox with the guided flows off', () => {
  it('renders the current rows: plain list items, no settle and no list motion', () => {
    const { container } = mount()
    expect(rowNames()).toEqual(['First. unread', 'Second. unread', 'Third. read'])
    expect(container.querySelectorAll('[data-list-motion]')).toHaveLength(0)
    expect(container.querySelectorAll('[data-unread-settle], [data-unread-mark]')).toHaveLength(0)
    expect(container.querySelectorAll('[data-unread-dot]')).toHaveLength(2)
    expect(container.querySelectorAll('ul > li[data-read]')).toHaveLength(3)
  })

  it('renders the current failed state with no Orbit, and the current empty state with the mark at 96 at 1024 and above', () => {
    view.wide = true
    seed([])
    const { container, unmount } = mount()
    expect(container.querySelector('[data-notification-state="empty"] [data-asset="orbit-mascot"]')!.getAttribute('width')).toBe('96')
    unmount()
    queryClient.clear()
    vi.mocked(fetchJson).mockRejectedValue(new Error('offline'))
    const failed = mount()
    return advance(0).then(() => {
      expect(screen.getByText(en.notifications.loadError)).toBeInTheDocument()
      expect(failed.container.querySelector('[data-notification-state="failed"] [data-asset="orbit-mascot"]')).toBeNull()
    })
  })

  it('shows the count of the bell with no roll', () => {
    const { container } = mount()
    seed(three().map((item) => ({ ...item, isRead: true })).slice(0, 2).concat(createMockNotification({ id: 'third', title: 'Third', isRead: false })))
    return advance(0).then(() => {
      expect(screen.getByRole('img', { name: 'Alerts, 1 unread' })).toBeInTheDocument()
      expect(container.querySelector('[data-count-motion]')).toBeNull()
      expect(container.querySelector('[data-count-roll]')).toBeNull()
    })
  })
})

describe('the Avisos inbox on the Orbit logic', () => {
  beforeEach(() => enableTestFlags('orbit_guided_flows'))

  it.each([{ locale: 'en' as const, wide: false, size: '96' }, { locale: 'pt-BR' as const, wide: false, size: '96' }, { locale: 'pt-BR' as const, wide: true, size: '128' }])(
    'shows the empty inbox as Orbit in Parado at $size with the current title in $locale, with no motion on arrival', ({ locale, wide, size }) => {
      view.locale = locale
      view.wide = wide
      seed([])
      const { container } = mount()
      const state = container.querySelector('[data-notification-state="empty"]')!
      const mascot = state.querySelector('[data-asset="orbit-mascot"]')!
      expect(mascot.getAttribute('data-orbit-state')).toBe('parado')
      expect(mascot.getAttribute('width')).toBe(size)
      expect(within(state as HTMLElement).getByText((locale === 'en' ? en : ptBR).notifications.empty)).toBeInTheDocument()
      expect(container.querySelectorAll('[data-list-motion]')).toHaveLength(0)
      expect(state.closest('li')!.getAttribute('style')).toBeNull()
      expect(state.closest('[data-shell-centred-region]')).not.toBeNull()
      expect(screen.queryByRole('dialog')).toBeNull()
    })

  it('shows the failed inbox as Orbit in Parado with the current message, and retry reads the inbox again', async () => {
    view.locale = 'pt-BR'
    queryClient.clear()
    vi.mocked(fetchJson).mockRejectedValue(new Error('offline'))
    const { container } = mount()
    await advance(0)
    const state = container.querySelector('[data-notification-state="failed"]')!
    expect(state.querySelector('[data-asset="orbit-mascot"]')!.getAttribute('data-orbit-state')).toBe('parado')
    expect(state.querySelector('[data-asset="orbit-mascot"]')!.getAttribute('width')).toBe('96')
    expect(within(state as HTMLElement).getByText(ptBR.notifications.loadError)).toBeInTheDocument()
    const reads = vi.mocked(fetchJson).mock.calls.length
    seed(three())
    fireEvent.click(within(state as HTMLElement).getByRole('button', { name: ptBR.common.retry }))
    await advance(0)
    expect(vi.mocked(fetchJson).mock.calls.length).toBe(reads + 1)
    expect(rowNames()).toHaveLength(3)
  })

  it('opens one detail for a double press on a row, with view, mark as read and delete', () => {
    seed([createMockNotification({ id: 'habit', title: 'Walk', isRead: false, url: '/habits/abc', habitId: 'abc' })])
    mount()
    const row = screen.getByRole('button', { name: /^Walk\./ })
    fireEvent.click(row)
    fireEvent.click(row)
    const dialogs = screen.getAllByRole('dialog')
    expect(dialogs).toHaveLength(1)
    const actions = within(dialogs[0]!).getAllByRole('button').map((button) => button.textContent)
    expect(actions).toEqual(expect.arrayContaining([en.notifications.markAsRead, en.notifications.delete]))
    const open = within(dialogs[0]!).getByRole('button', { name: /^Open in / })
    fireEvent.click(open)
    expect(view.push).toHaveBeenCalledWith('/habits/abc')
  })

  it('settles the unread mark of the one row that is marked read with the selection exit, and moves no other row', async () => {
    const { container } = mount()
    const before = marks(container).map((mark) => mark.getAttribute('style'))
    expect(marks(container).map((mark) => mark.dataset.unreadMark)).toEqual(['unread', 'unread', 'read'])
    serve(three().map((item) => (item.id === 'first' ? { ...item, isRead: true } : item)))
    fireEvent.click(screen.getByRole('button', { name: /^First\./ }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: en.notifications.markAsRead }))
    await advance(0)
    expect(actionMocks.markNotificationRead).toHaveBeenCalledTimes(1)
    expect(actionMocks.markNotificationRead.mock.calls[0]?.[0]).toBe('first')
    const after = marks(container)
    expect(after.map((mark) => mark.dataset.unreadMark)).toEqual(['read', 'unread', 'read'])
    expect(after[0]!.style.opacity).toBe('0')
    expect(after[0]!.style.transition).toBe('opacity var(--motion-selection-exit) var(--motion-ease-exit)')
    expect(after.slice(1).map((mark) => mark.getAttribute('style'))).toEqual(before.slice(1))
    const row = after[0]!.closest<HTMLElement>('[data-read]')!
    expect(row.dataset.unreadSettle).toBe('motion')
    expect(row.style.transition).toBe('background-color var(--motion-selection-exit) var(--motion-ease-exit), box-shadow var(--motion-selection-exit) var(--motion-ease-exit)')
    expect(rowNames()).toEqual(['First. read', 'Second. unread', 'Third. read'])
    expect(container.querySelectorAll('[data-list-motion][inert]')).toHaveLength(0)
  })

  it('sends the same mark all read request as the current surface and settles every unread mark in one motion', async () => {
    const guided = mount()
    serve(three().map((item) => ({ ...item, isRead: true })))
    await chooseInboxAction('Alert options', en.notifications.markAllReadMenu)
    await advance(0)
    const guidedCalls = actionMocks.markAllNotificationsRead.mock.calls.map((call) => [...call])
    const settled = marks(guided.container)
    expect(settled.map((mark) => mark.dataset.unreadMark)).toEqual(['read', 'read', 'read'])
    expect(new Set(settled.map((mark) => mark.style.transition))).toEqual(new Set(['opacity var(--motion-selection-exit) var(--motion-ease-exit)']))
    expect(settled.every((mark) => !mark.style.transitionDelay && !mark.style.transition.includes('delay'))).toBe(true)
    expect(screen.getByRole('img', { name: 'Alerts' })).toBeInTheDocument()
    guided.unmount()

    const { resetTestFlags } = await import('@orbit/shared/test-support/flag-state')
    resetTestFlags()
    actionMocks.markAllNotificationsRead.mockClear()
    queryClient.clear()
    seed(three())
    mount()
    await chooseInboxAction('Alert options', en.notifications.markAllReadMenu)
    await advance(0)
    expect(guidedCalls).toHaveLength(1)
    expect(actionMocks.markAllNotificationsRead.mock.calls.map((call) => [...call])).toEqual(guidedCalls)
    expect(actionMocks.markNotificationRead).not.toHaveBeenCalled()
  })

  it('makes a deleted row leave with the list exit, shows the notice, and undo returns the same row to the same place', async () => {
    const { container } = mount()
    const order = rowNames()
    fireEvent.click(screen.getByRole('button', { name: 'Delete: Second' }))
    expect(rowNames()).toEqual(['First. unread', 'Third. read'])
    const leaving = container.querySelector<HTMLElement>('[data-list-motion][inert]')!
    expect(leaving.tagName).toBe('LI')
    expect(within(leaving).getByText('Second')).toBeInTheDocument()
    expect(container.querySelectorAll('[data-list-motion]:not([inert])')).toHaveLength(2)
    await advance(0)
    expect(screen.getByText(en.notifications.deleteQueued)).toBeInTheDocument()
    await advance(resolveMotionPreset('list-exit').exitDuration)
    expect(container.querySelectorAll('[data-list-motion]')).toHaveLength(2)
    expect(actionMocks.deleteNotification).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: en.notifications.deleteUndo }))
    expect(rowNames()).toEqual(order)
    expect([...container.querySelectorAll('ul > [data-list-motion]')].map((item) => item.querySelector('[data-notification-title]')!.textContent)).toEqual(['First', 'Second', 'Third'])
    await advance(6000)
    expect(actionMocks.deleteNotification).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('keeps the short still exit under reduced motion: no travel, and the unread settle is off', async () => {
    view.reducedMotion = true
    const { container } = mount()
    expect([...container.querySelectorAll<HTMLElement>('[data-unread-settle]')].map((row) => row.dataset.unreadSettle)).toEqual(['still', 'still', 'still'])
    expect([...container.querySelectorAll<HTMLElement>('[data-unread-settle]')].map((row) => row.style.transition)).toEqual(['none', 'none', 'none'])
    expect(marks(container).map((mark) => mark.style.transition)).toEqual(['none', 'none', 'none'])
    fireEvent.click(screen.getByRole('button', { name: 'Delete: Second' }))
    expect(resolveMotionPreset('list-exit', true).shift).toBe(0)
    await advance(resolveMotionPreset('list-exit', true).exitDuration)
    expect(container.querySelectorAll('[data-list-motion]')).toHaveLength(2)
    expect([...container.querySelectorAll<HTMLElement>('[data-list-motion]')].every((item) => !/translate/.test(item.style.transform))).toBe(true)
  })

  it('shows the current message with retry when a delete fails', async () => {
    actionMocks.deleteNotification.mockResolvedValue({ ok: false, error: 'Server error', status: 500, sessionRefreshFailed: false })
    mount()
    fireEvent.click(screen.getByRole('button', { name: 'Delete: Second' }))
    await advance(5000)
    await advance(0)
    expect(screen.getByText(en.notifications.deleteError)).toBeInTheDocument()
    expect(rowNames()).toEqual(['First. unread', 'Second. unread', 'Third. read'])
    actionMocks.deleteNotification.mockResolvedValue({ ok: true as const, data: undefined })
    fireEvent.click(screen.getByRole('button', { name: en.common.retry }))
    await advance(5000)
    expect(actionMocks.deleteNotification).toHaveBeenCalledTimes(2)
    expect(actionMocks.deleteNotification.mock.calls.map((call) => call[0])).toEqual(['second', 'second'])
  })

  it.each(['en', 'pt-BR'] as const)('keeps the clear all confirm with its count sentence and no Orbit in %s, then shows the empty state and no result dialog', async (locale) => {
    view.locale = locale
    const words = locale === 'en' ? en : ptBR
    const { container } = mount()
    await chooseInboxAction(words.notifications.options, words.notifications.deleteAll)
    serve([])
    const confirm = screen.getByRole('dialog')
    expect(confirm).toHaveTextContent(locale === 'en' ? 'All 3 alerts leave the list. There is no way to undo this.' : 'Os 3 avisos saem da lista. Não há como desfazer.')
    expect(confirm.querySelector('[data-asset="orbit-mascot"]')).toBeNull()
    fireEvent.click(within(confirm).getAllByRole('button').find((button) => button.dataset.variant === 'destructive')!)
    await advance(0)
    expect(actionMocks.deleteAllNotifications).toHaveBeenCalledTimes(1)
    expect(container.querySelector('[data-notification-state="empty"] [data-asset="orbit-mascot"]')!.getAttribute('data-orbit-state')).toBe('parado')
    expect(container.querySelectorAll('[data-list-motion]')).toHaveLength(0)
    expect(screen.queryByText(words.result.title)).toBeNull()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it.each(['/social', '/public-profile/ana', '/u/ana'])('renders no notification that targets %s', (url) => {
    seed([createMockNotification({ id: 'retired', title: 'Retired', isRead: false, url }), createMockNotification({ id: 'kept', title: 'Kept', isRead: false })])
    mount()
    expect(rowNames()).toEqual(['Kept. unread'])
    expect(screen.queryByText('Retired')).toBeNull()
    expect(screen.getByRole('img', { name: 'Alerts, 1 unread' })).toBeInTheDocument()
  })

  it('rolls the count of the bell once when it changes, keeps the count in the accessible name, and never rolls the first count', async () => {
    const { container } = mount()
    expect(screen.getByRole('img', { name: 'Alerts, 2 unread' })).toBeInTheDocument()
    expect(container.querySelector('[data-count-motion]')).toBeNull()
    expect(container.querySelector('[data-count-roll]')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Delete: First' }))
    await advance(0)
    expect(screen.getByRole('img', { name: 'Alerts, 1 unread' })).toBeInTheDocument()
    const count = container.querySelector<HTMLElement>('[data-notification-count]')!
    expect(count.dataset.countMotion).toBe('roll')
    expect(count.querySelectorAll('[data-count-roll]')).toHaveLength(1)
    expect(count).toHaveTextContent('1')
    expect(count).toHaveAttribute('aria-hidden', 'true')
  })

  it('keeps the back control of the inbox header, and the bell of the root header as the control that opens the inbox', () => {
    const inbox = mount()
    fireEvent.click(screen.getByRole('button', { name: en.common.back }))
    expect(view.goBack).toHaveBeenCalledWith('/')
    expect(screen.getByRole('heading', { level: 1, name: en.notifications.title })).toBeInTheDocument()
    inbox.unmount()

    view.pathname = '/'
    const { container } = render(<QueryClientProvider client={queryClient}><RootNotificationHeader /></QueryClientProvider>)
    const header = container.querySelector<HTMLElement>('[data-root-notification-header]')!
    fireEvent.click(within(header).getByRole('button', { name: 'Alerts, 2 unread' }))
    expect(view.push).toHaveBeenCalledWith('/notifications')
    expect(header.querySelector('[data-asset="orbit-mascot"]')).toBeNull()
  })

  it('swaps the count of the bell with no roll under reduced motion', async () => {
    view.reducedMotion = true
    const { container } = mount()
    fireEvent.click(screen.getByRole('button', { name: 'Delete: First' }))
    await advance(0)
    expect(screen.getByRole('img', { name: 'Alerts, 1 unread' })).toBeInTheDocument()
    const count = container.querySelector<HTMLElement>('[data-notification-count]')!
    expect(count.dataset.countMotion).toBe('still')
    expect(count.querySelector('[data-count-roll]')).toBeNull()
    expect(count).toHaveTextContent('1')
  })
})
