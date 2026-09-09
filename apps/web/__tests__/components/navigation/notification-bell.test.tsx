import { afterEach, beforeAll, beforeEach, describe, it, expect, vi } from 'vitest'
import { contrastOnSurface } from '@orbit/shared/__tests__/contrast'
import { render, screen, fireEvent, act, cleanup, within } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import { renderToStaticMarkup } from 'react-dom/server'
import { Calendar, ChartLine, CircleDot, Home, Trash2, User } from '@/components/ui/icons'
import type { NotificationItem } from '@orbit/shared/types/notification'
import { createMockNotification } from '@orbit/shared/__tests__/factories'
import en from '@orbit/shared/i18n/en.json'
import pt from '@orbit/shared/i18n/pt-BR.json'
import { resetPendingNotificationDeletesForTests } from '@/lib/pending-notification-deletes'
import { NotificationBell } from '@/components/navigation/notification-bell'
import { NotificationInbox } from '@/components/navigation/notification-inbox'
import { NotificationDeleteNotice } from '@/components/navigation/notification-delete-notice'
import { resolveWebThemeVariables } from '@/lib/theme-dom'

const state = vi.hoisted(() => ({
  notifications: [] as NotificationItem[], unreadCount: 0, isLoading: false, isError: false,
  locale: 'en', pathname: '/', push: vi.fn(), back: vi.fn(), refetch: vi.fn(), mark: vi.fn(), markAll: vi.fn(),
  remove: vi.fn(), clear: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: state.push }), usePathname: () => state.pathname,
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
  Object.assign(state, { notifications: [], unreadCount: 0, isLoading: false, isError: false, locale: 'en', pathname: '/' })
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
  let textStyles: string
  beforeAll(async () => {
    const source = resolve('app/globals.css')
    const compiled = await postcss([tailwind()]).process(readFileSync(source, 'utf8'), { from: source })
    const rules: string[] = []
    compiled.root.walkRules((rule) => {
      if (rule.selector.startsWith('.text-')) {
        rule.walkDecls('color', (declaration) => { rules.push(`${rule.selector} { color: ${declaration.value}; }`) })
      }
    })
    textStyles = rules.join('\n')
  })

  it.each(['dark', 'light'].flatMap((mode) =>
    ['row body', 'row timestamp', 'row target', 'detail body', 'detail metadata'].map((field) => ({ mode, field })),
  ))('resolves rendered $field to fg2 in $mode', ({ mode, field }) => {
    vi.setSystemTime(new Date('2026-09-06T12:00:00Z'))
    state.notifications = [createMockNotification({ title: 'Reminder', body: 'Time for a walk',
      url: '/calendar', isRead: false, createdAtUtc: '2026-09-06T11:55:00Z' })]
    showInbox()
    const stylesheet = document.createElement('style')
    stylesheet.textContent = textStyles
    document.head.append(stylesheet)
    try {
      const row = screen.getByRole('button', { name: 'Reminder. unread. Calendar' })
      const rowLabels = { 'row body': 'Time for a walk', 'row timestamp': '5 min ago', 'row target': 'Calendar' }
      let element: HTMLElement
      if (field === 'detail body' || field === 'detail metadata') {
        fireEvent.click(row)
        element = field === 'detail body' ? screen.getAllByText('Time for a walk').at(-1)!
          : screen.getByText('5 min ago · Calendar')
      } else {
        element = within(row).getByText(rowLabels[field as keyof typeof rowLabels])
      }
      const renderedColor = getComputedStyle(element).color
      expect(renderedColor, field).toBe('var(--fg-2)')
      const theme = resolveWebThemeVariables('purple', mode as 'dark' | 'light')
      const foreground = theme[renderedColor.slice(4, -1) as `--${string}`]!
      const surfaces = field.startsWith('detail') ? [[theme['--bg-elev']!]]
        : [[theme['--bg']!], [theme['--bg']!, theme['--bg-card']!],
          [theme['--bg']!, theme['--bg-card']!, theme['--bg-hover']!]]
      for (const layers of surfaces) expect(contrastOnSurface(foreground, layers)).toBeGreaterThanOrEqual(4.5)
    } finally {
      stylesheet.remove()
    }
  })

  it.each(['dark', 'light'] as const)('keeps the focused row visible against resting and hovered surfaces in %s', (mode) => {
    seed(2)
    showInbox()
    const stylesheet = document.createElement('style')
    const css = readFileSync('app/globals.css', 'utf8')
    stylesheet.textContent = css.match(/\.orbit-notification-row:focus-visible\s*\{[^}]+\}/)?.[0] ?? ''
    try {
      const first = screen.getByRole('button', { name: 'Alert 0. unread. Progress' })
      const second = screen.getByRole('button', { name: 'Alert 1. unread. Progress' })
      document.head.append(stylesheet)
      fireEvent.keyDown(document, { key: 'Tab' })
      first.focus()
      expect(first).toHaveFocus()
      const theme = resolveWebThemeVariables('purple', mode)
      const outlineColor = getComputedStyle(first).outline.match(/var\([^)]+\)/)![0]
      expect(outlineColor, 'Focus must retain the accent semantic').toBe('var(--primary)')
      const foreground = theme[outlineColor.slice(4, -1) as `--${string}`]!
      const contour = getComputedStyle(first).boxShadow
      expect(contour).toBe('inset 0 0 0 4px var(--fg-1)')
      const companion = theme[contour.match(/var\(([^)]+)\)/)![1] as `--${string}`]!
      expect(contrastOnSurface(foreground, [companion])).toBeGreaterThanOrEqual(3)
      const surfaces = {
        'resting read': [theme['--bg']!],
        'resting unread': [theme['--bg']!, theme['--bg-card']!],
        'hovered or pressed read': [theme['--bg']!, theme['--bg-hover']!],
        'hovered or pressed unread': [theme['--bg']!, theme['--bg-card']!, theme['--bg-hover']!],
      }
      for (const [surface, layers] of Object.entries(surfaces)) {
        expect.soft(contrastOnSurface(companion, layers), surface).toBeGreaterThanOrEqual(3)
      }
      expect(getComputedStyle(first).outlineOffset).toBe('-3px')
      expect(getComputedStyle(second).outlineOffset).not.toBe('-3px')
      expect(getComputedStyle(second).boxShadow).toBe('')
    } finally {
      stylesheet.remove()
    }
  })

  it.each([
    ['/', null, Home], ['/calendar-sync', null, Calendar], ['/streak', null, ChartLine],
    ['/profile', null, User], ['/', 'a12b34cd-1234-4567-89ab-123456789abc', CircleDot],
  ] as const)('shows the destination glyph at 16px for %s with habit %s', (url, habitId, Glyph) => {
    state.notifications = [createMockNotification({ title: 'Reminder', url, habitId, isRead: false })]
    showInbox()
    const glyph = screen.getByRole('button', { name: /^Reminder\. unread\./ }).querySelector('svg')!
    const expected = document.createElement('div')
    expected.innerHTML = renderToStaticMarkup(<Glyph size={16} />)
    expect(glyph.innerHTML).toBe(expected.querySelector('svg')!.innerHTML)
    expect(glyph).toHaveAttribute('width', '16')
    expect(glyph).toHaveAttribute('height', '16')
    expect(glyph).toHaveAttribute('aria-hidden', 'true')
  })

  it('uses canonical ghost list and read actions and a destructive detail delete', () => {
    seed(1)
    showInbox()
    for (const name of ['Mark all read', 'Clear all']) {
      expect(screen.getByRole('button', { name })).toHaveAttribute('data-variant', 'ghost')
      expect(screen.getByRole('button', { name })).toHaveAttribute('data-size', 'sm')
    }
    fireEvent.click(screen.getByRole('button', { name: 'Alert 0. unread. Progress' }))
    expect(screen.getByRole('button', { name: 'Mark as read' })).toHaveAttribute('data-variant', 'ghost')
    expect(screen.getByRole('button', { name: 'Delete' })).toHaveAttribute('data-variant', 'destructive')
  })

  it('identifies the queued delete with a neutral trash glyph beside undo', () => {
    seed(1)
    showInbox()
    fireEvent.click(screen.getByRole('button', { name: 'Delete: Alert 0' }))
    const notice = screen.getByRole('status')
    const expected = document.createElement('div')
    expected.innerHTML = renderToStaticMarkup(<Trash2 size={20} />)
    expect(notice.querySelector('svg')?.innerHTML).toBe(expected.querySelector('svg')!.innerHTML)
    expect(notice).toHaveAttribute('data-kind', 'neutral')
    expect(screen.getByRole('button', { name: 'Undo' })).toBeInTheDocument()
  })
  it.each(['en', 'pt-BR'])('keeps the inbox header count passive and updates it from inbox state in %s', (locale) => {
    state.locale = locale
    state.pathname = '/notifications'
    seed(2)
    const messages = locale === 'en' ? en : pt
    const view = showInbox()
    const expectCount = (count: number) => {
      const label = messages.notifications.bellWithCount.replace('{count}', String(count))
      expect(screen.queryByRole('button', { name: label })).toBeNull()
      const indicator = screen.getByRole('img', { name: label })
      expect(indicator).not.toHaveAttribute('tabindex')
      expect(indicator.querySelector('[data-notification-count]')).toHaveTextContent(String(count))
    }
    expectCount(2)
    fireEvent.click(screen.getByRole('button', { name: messages.notifications.deleteNotification.replace('{title}', 'Alert 0') }))
    expectCount(1)
    fireEvent.click(screen.getByRole('button', { name: messages.notifications.deleteUndo }))
    expectCount(2)
    state.unreadCount = 4
    view.rerender(<><NotificationInbox /><NotificationDeleteNotice /></>)
    expectCount(4)
    fireEvent.click(screen.getByRole('button', { name: messages.notifications.markAllRead }))
    view.rerender(<NotificationInbox />)
    expect(view.container.querySelector('[data-notification-count]')).toBeNull()
    expect(screen.getByRole('img', { name: messages.notifications.bell })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: messages.notifications.bell })).toBeNull()
  })
  it('renders the standalone bell passively on the current inbox route', () => {
    state.pathname = '/notifications'
    render(<NotificationBell />)
    expect(screen.queryByRole('button', { name: 'Alerts' })).toBeNull()
    expect(screen.getByRole('img', { name: 'Alerts' })).toBeInTheDocument()
  })
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

  it.each([
    ['en', '5 min ago · Calendar'],
    ['pt-BR', 'há 5 min · Calendário'],
  ])('renders the complete detail metadata with one middle dot in %s', (locale, metadata) => {
    state.locale = locale
    vi.setSystemTime(new Date('2026-09-06T12:00:00Z'))
    state.notifications = [createMockNotification({
      title: 'Reminder', url: '/calendar', isRead: false, createdAtUtc: '2026-09-06T11:55:00Z',
    })]
    const messages = locale === 'en' ? en : pt
    showInbox()
    fireEvent.click(screen.getByRole('button', {
      name: `Reminder. ${messages.notifications.unread}. ${messages.nav.calendar}`,
    }))
    expect(screen.getByText(metadata, { exact: true }).textContent).toBe(metadata)
  })
})
