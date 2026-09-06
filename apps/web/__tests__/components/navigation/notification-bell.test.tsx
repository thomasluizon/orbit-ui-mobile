import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react'
import type { NotificationItem } from '@orbit/shared/types/notification'
import { createMockNotification } from '@orbit/shared/__tests__/factories'
import en from '@orbit/shared/i18n/en.json'
import pt from '@orbit/shared/i18n/pt-BR.json'
import { resetPendingNotificationDeletesForTests } from '@/lib/pending-notification-deletes'
import { NotificationBell } from '@/components/navigation/notification-bell'
import { NotificationInbox } from '@/components/navigation/notification-inbox'
import { NotificationDeleteNotice } from '@/components/navigation/notification-delete-notice'

const state = vi.hoisted(() => ({
  notifications: [] as NotificationItem[], unreadCount: 0, isLoading: false, isError: false,
  locale: 'en', push: vi.fn(), back: vi.fn(), refetch: vi.fn(), mark: vi.fn(), markAll: vi.fn(),
  remove: vi.fn(), clear: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: state.push }), usePathname: () => '/',
}))
vi.mock('@/hooks/use-go-back-or-fallback', () => ({ useGoBackOrFallback: () => state.back }))
vi.mock('@/components/ui/sheet', async () => await import('@/__tests__/support/sheet-double'))
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) => {
    const messages = state.locale === 'en' ? en : pt
    const [namespace, name = ''] = key.split('.')
    const group = messages[namespace as keyof typeof messages]
    const value = typeof group === 'object' ? Reflect.get(group, name) as unknown : undefined
    return typeof value === 'string' ? value.replace(/\{(\w+)\}/g, (_, token: string) => String(values?.[token])) : key
  },
}))
vi.mock('@/hooks/use-notifications', () => ({
  useNotifications: () => ({ ...state }),
  useMarkNotificationRead: () => ({ mutate: state.mark }),
  useMarkAllNotificationsRead: () => ({ mutate: state.markAll }),
  useDeleteNotification: () => ({ mutate: state.remove }),
  useDeleteAllNotifications: () => ({ mutate: state.clear }),
}))

function showInbox() {
  return render(<><NotificationInbox /><NotificationDeleteNotice /></>)
}
function seed(count: number) {
  state.notifications = Array.from({ length: count }, (_, index) => createMockNotification({
    id: String(index), title: `Alert ${index}`, url: '/progress', isRead: false,
  }))
  state.unreadCount = count
}
beforeEach(() => {
  vi.useFakeTimers()
  vi.clearAllMocks()
  resetPendingNotificationDeletesForTests()
  Object.assign(state, { notifications: [], unreadCount: 0, isLoading: false, isError: false, locale: 'en' })
  state.mark.mockImplementation((id: string) => {
    state.notifications = state.notifications.map((item) => item.id === id ? { ...item, isRead: true } : item)
    state.unreadCount -= 1
  })
  state.markAll.mockImplementation(() => {
    state.notifications = state.notifications.map((item) => ({ ...item, isRead: true }))
    state.unreadCount = 0
  })
  state.remove.mockImplementation((id: string) => {
    state.notifications = state.notifications.filter((item) => item.id !== id)
    state.unreadCount -= 1
  })
  state.clear.mockImplementation(() => { state.notifications = []; state.unreadCount = 0 })
})
afterEach(() => {
  cleanup()
  resetPendingNotificationDeletesForTests()
  vi.useRealTimers()
})

describe('alerts', () => {
  it('pushes the inbox and keeps zero absent', () => {
    const { container } = render(<NotificationBell />)
    fireEvent.click(screen.getByRole('button', { name: 'Alerts' }))
    expect(state.push).toHaveBeenCalledWith('/notifications')
    expect(container.querySelector('[data-notification-count]')).toBeNull()
    expect(screen.queryByText('0')).toBeNull()
  })

  it.each([1, 9, 25])('renders the neutral count pill from the unread total %s while loading', (count) => {
    state.unreadCount = count
    state.isLoading = true
    const { container } = render(<NotificationBell />)
    expect(screen.getByText(count > 9 ? '9+' : String(count))).toBeInTheDocument()
    expect(screen.getByRole('button', { name: `Alerts, ${count} unread` })).toBeInTheDocument()
    const badge = container.querySelector('[data-notification-count]')!
    expect(badge.outerHTML).not.toMatch(/--primary/)
    expect(badge.outerHTML).toContain('--fg-1')
  })

  it('renders an empty inbox without an action and returns through the back affordance', () => {
    showInbox()
    expect(screen.getByText('Nothing to see here')).toBeInTheDocument()
    expect(screen.queryByText('Clear all')).toBeNull()
    expect(screen.queryByText('Mark all read')).toBeNull()
    expect(screen.getByRole('list').querySelector('button')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: en.common.back }))
    expect(state.back).toHaveBeenCalledWith('/')
  })

  it('reserves three skeleton lines per row and exposes loading', () => {
    state.isLoading = true
    const { container } = showInbox()
    expect(screen.getByRole('list')).toHaveAttribute('aria-busy', 'true')
    expect(container.querySelectorAll('[data-skeleton-line]')).toHaveLength(15)
    expect(screen.queryByText('Nothing to see here')).toBeNull()
  })

  it('offers retry after a load failure', () => {
    state.isError = true
    showInbox()
    expect(screen.getByText(en.notifications.loadError)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: en.common.retry }))
    expect(state.refetch).toHaveBeenCalledOnce()
  })

  it.each([1, 50])('renders the endpoint list of %s items without paging', (count) => {
    seed(count)
    showInbox()
    expect(screen.getAllByRole('listitem')).toHaveLength(count)
    expect(screen.queryByText(/load more/i)).toBeNull()
  })

  it('distinguishes unread without colour and changes only when marked read', () => {
    seed(1)
    const view = showInbox()
    const row = screen.getByRole('listitem')
    expect(row.querySelector('[data-unread-dot]')).not.toBeNull()
    expect(row.querySelector('[data-notification-title]')).toHaveStyle({ fontWeight: 500 })
    fireEvent.click(screen.getByRole('button', { name: 'Alert 0. unread. Progress' }))
    expect(screen.getByRole('button', { name: 'Mark as read' })).toBeInTheDocument()
    expect(state.mark).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Mark as read' }))
    view.rerender(<><NotificationInbox /><NotificationDeleteNotice /></>)
    expect(screen.queryByRole('button', { name: 'Mark as read' })).toBeNull()
    expect(row.querySelector('[data-unread-dot]')).toBeNull()
    expect(row.querySelector('[data-unread-column]')).not.toBeNull()
    expect(row.querySelector('[data-notification-title]')).toHaveStyle({ fontWeight: 400 })
  })

  it.each(['en', 'pt-BR'])('announces the title, read state and habit destination in %s', (locale) => {
    state.locale = locale
    const messages = locale === 'en' ? en : pt
    state.notifications = [createMockNotification({ title: 'Reminder', url: '/', habitId: 'a12b34cd-1234-4567-89ab-123456789abc', isRead: false })]
    state.unreadCount = 1
    const view = showInbox()
    expect(screen.getByRole('button', { name: `Reminder. ${messages.notifications.unread}. ${messages.notifications.habit}` })).toBeInTheDocument()
    state.notifications[0] = { ...state.notifications[0]!, isRead: true }
    view.rerender(<NotificationInbox />)
    expect(screen.getByRole('button', { name: `Reminder. ${messages.notifications.read}. ${messages.notifications.habit}` })).toBeInTheDocument()
  })

  it('marks all read and removes the header action at zero', () => {
    seed(2)
    const view = showInbox()
    fireEvent.click(screen.getByRole('button', { name: 'Mark all read' }))
    view.rerender(<NotificationInbox />)
    expect(screen.queryByRole('button', { name: 'Mark all read' })).toBeNull()
    expect(screen.getAllByRole('button', { name: /Alert \d. read/ })).toHaveLength(2)
    expect(screen.getByRole('button', { name: 'Clear all' })).toBeInTheDocument()
  })

  it('keeps delete beside the row and offers undo until the queue commits', () => {
    seed(2)
    showInbox()
    const remove = screen.getByRole('button', { name: 'Delete: Alert 0' })
    expect(remove.parentElement).toBe(screen.getAllByRole('listitem')[0])
    fireEvent.click(remove)
    expect(screen.queryByRole('button', { name: 'Alert 0. unread. Progress' })).toBeNull()
    expect(state.remove).not.toHaveBeenCalled()
    void act(() => vi.advanceTimersByTime(4000))
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(screen.getByRole('button', { name: 'Alert 0. unread. Progress' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull()
    void act(() => vi.advanceTimersByTime(5000))
    expect(state.remove).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Delete: Alert 0' }))
    void act(() => vi.advanceTimersByTime(5000))
    expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Alert 0. unread. Progress' })).toBeNull()
    expect(state.remove).toHaveBeenCalledOnce()
  })

  it.each(['en', 'pt-BR'])('confirms the full scope and irreversible clear in %s, asks first, and clears pending undo', (locale) => {
    state.locale = locale
    seed(50)
    const messages = locale === 'en' ? en : pt
    const view = showInbox()
    fireEvent.click(screen.getByRole('button', { name: messages.notifications.deleteAll }))
    expect(screen.getByText(locale === 'en' ? 'All alerts leave the list. There is no way to undo this.' : 'Todos os avisos saem da lista. Não há como desfazer.')).toBeInTheDocument()
    expect(state.clear).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: messages.common.cancel }))
    expect(screen.getAllByRole('listitem')).toHaveLength(50)
    fireEvent.click(screen.getByRole('button', { name: messages.notifications.deleteNotification.replace('{title}', 'Alert 0') }))
    fireEvent.click(screen.getByRole('button', { name: messages.notifications.deleteAll }))
    fireEvent.click(screen.getByRole('button', { name: messages.notifications.delete }))
    view.rerender(<><NotificationInbox /><NotificationDeleteNotice /></>)
    expect(screen.getByText(messages.notifications.empty)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: messages.notifications.deleteUndo })).toBeNull()
    void act(() => vi.advanceTimersByTime(5000))
    expect(state.remove).not.toHaveBeenCalled()
  })
})
