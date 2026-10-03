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
import { ShellWide } from '@/components/shell/shell-wide'
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
vi.mock('next-intl', async () => {
  const { createTranslator } = await vi.importActual<typeof import('next-intl')>('next-intl')
  const translators = {
    en: createTranslator({ locale: 'en', messages: (await import('@orbit/shared/i18n/en.json')).default }),
    'pt-BR': createTranslator({ locale: 'pt-BR', messages: (await import('@orbit/shared/i18n/pt-BR.json')).default }),
  }
  return { useTranslations: () => translators[state.locale === 'pt-BR' ? 'pt-BR' : 'en'] }
})
vi.mock('@/hooks/use-notifications', () => ({
  useNotifications: () => ({ ...state }),
  useMarkNotificationRead: () => ({ mutate: state.mark }),
  useMarkAllNotificationsRead: () => ({ mutate: state.markAll }),
  useDeleteNotification: () => ({ mutate: state.remove, mutateAsync: async (id: string) => state.remove(id) }),
  useDeleteAllNotifications: () => ({ mutate: state.clear }),
}))

function showInbox() {
  return render(<><NotificationInbox /><NotificationDeleteNotice /></>)
}
function deleteFromSheet(title: string) {
  fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${title}\\.`) }))
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /^(Delete|Apagar)$/ }))
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
  let layoutRules: { selector: string; media: string; declarations: Record<string, string> }[]
  beforeAll(async () => {
    const source = resolve('app/globals.css')
    const compiled = await postcss([tailwind()]).process(readFileSync(source, 'utf8'), { from: source })
    const rules: string[] = []
    layoutRules = []
    compiled.root.walkRules((rule) => {
      const declarations: Record<string, string> = {}
      rule.walkDecls((declaration) => { declarations[declaration.prop] = declaration.value })
      layoutRules.push({ selector: rule.selector, media: rule.parent?.type === 'atrule' ? rule.parent.params : '', declarations })
      if (rule.selector.startsWith('.text-')) {
        rule.walkDecls('color', (declaration) => { rules.push(`${rule.selector} { color: ${declaration.value}; }`) })
      }
    })
    textStyles = rules.join('\n')
  })

  it('aligns the list with the header title at 1352px and caps it at 560px', () => {
    seed(1)
    showInbox()
    const heading = screen.getByRole('heading', { name: en.notifications.title })
    const back = screen.getByRole('button', { name: en.common.back })
    const list = screen.getByRole('list', { name: en.notifications.title })
    expect(heading.parentElement).toHaveClass('ps-[8px]', 'gap-[8px]')
    expect(back).toHaveClass('min-h-[48px]', 'w-[48px]')
    expect(list.parentElement).toHaveClass('lg:ms-12', 'lg:ps-4')
    expect(list).toHaveClass('lg:max-w-[560px]', 'lg:px-0')
    const wideRule = (selector: string, property: string) => layoutRules.find((rule) =>
      rule.selector === selector && rule.media === '(width >= 64rem)',
    )?.declarations[property]
    expect(1352).toBeGreaterThan(1024)
    expect(wideRule('.lg\\:ms-12', 'margin-inline-start')).toBe('calc(var(--spacing) * 12)')
    expect(wideRule('.lg\\:ps-4', 'padding-inline-start')).toBe('calc(var(--spacing) * 4)')
    expect(12 * 4 + 4 * 4).toBe(8 + 48 + 8)
    expect(wideRule('.lg\\:max-w-\\[560px\\]', 'max-width')).toBe('560px')
    expect(wideRule('.lg\\:px-0', 'padding-inline')).toBe('0px')
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
    expect(screen.getByRole('button', { name: 'Delete: Alert 0' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: en.notifications.options }))
    for (const name of [en.notifications.markAllReadMenu, en.notifications.deleteAll]) {
      expect(screen.getByRole('menuitem', { name })).toBeInTheDocument()
    }
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'close-overlay' }))
    fireEvent.click(screen.getByRole('button', { name: 'Alert 0. unread. Progress' }))
    expect(within(screen.getByRole('dialog')).getByRole('button', { name: en.notifications.markAsRead })).toHaveAttribute('data-variant', 'ghost')
    expect(screen.getByRole('button', { name: 'Delete' })).toHaveAttribute('data-variant', 'destructive')
  })

  it.each([
    ['en', 'Mark all read', 'Mark as read'],
    ['pt-BR', 'Marcar lidos', 'Marcar como lido'],
  ] as const)('keeps bulk and single read actions distinct in %s', (locale, bulkLabel, singleLabel) => {
    state.locale = locale
    seed(1)
    showInbox()

    fireEvent.click(screen.getByRole('button', { name: state.locale === 'en' ? en.notifications.options : pt.notifications.options }))
    expect(screen.getByRole('menuitem', { name: bulkLabel })).toBeInTheDocument()
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'close-overlay' }))
    fireEvent.click(screen.getByRole('button', { name: /^Alert 0\./ }))
    expect(
      within(screen.getByRole('dialog')).getByRole('button', { name: singleLabel }),
    ).toBeInTheDocument()
    expect(bulkLabel).not.toBe(singleLabel)
  })

  it('identifies the queued delete with a neutral trash glyph beside undo', () => {
    seed(1)
    showInbox()
    deleteFromSheet('Alert 0')
    const notice = screen.getByRole('status')
    const expected = document.createElement('div')
    expected.innerHTML = renderToStaticMarkup(<Trash2 size={20} />)
    expect(notice.querySelector('svg')?.innerHTML).toBe(expected.querySelector('svg')!.innerHTML)
    expect(notice).toHaveAttribute('data-kind', 'neutral')
    expect(screen.getByRole('button', { name: 'Undo' })).toBeInTheDocument()
  })
  it.each(['en', 'pt-BR'])('renders the inbox bell once in the wide sidebar in %s', (locale) => {
    state.locale = locale
    state.pathname = '/notifications'
    seed(2)
    const messages = locale === 'en' ? en : pt
    const { container } = render(<ShellWide items={[]} activeId="hoje" navLabel="Navigation" notifications={<NotificationBell />}><NotificationInbox /></ShellWide>)
    const indicators = screen.getAllByRole('img', { name: messages.notifications.bellWithCount.replace('{count}', '2') })
    expect(indicators).toHaveLength(1)
    expect(container.querySelector('[data-shell-sidebar]')).toContainElement(indicators[0]!)
    expect(container.querySelector('section [data-notification-count]')).toBeNull()
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

  it.each([1, 9, 25])('renders the neutral count badge from the unread total %s while loading', (count) => {
    state.unreadCount = count
    state.isLoading = true
    const { container } = render(<NotificationBell />)
    expect(screen.getByText(count > 9 ? '9+' : String(count))).toBeInTheDocument()
    expect(screen.getByRole('button', { name: `Alerts, ${count} unread` })).toBeInTheDocument()
    const badge = container.querySelector('[data-notification-count]')!
    expect(badge.outerHTML).not.toMatch(/--primary/)
    expect(badge.outerHTML).toContain('--fg-1')
    expect(getComputedStyle(badge).borderRadius).toBe('8px')
  })

  it('renders an empty inbox without an action and returns through the back affordance', () => {
    showInbox()
    expect(screen.getByText('Nothing to see here')).toBeInTheDocument()
    expect(screen.queryByText('Clear all')).toBeNull()
    expect(screen.queryByText(en.notifications.markAllReadMenu)).toBeNull()
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
    const detailAction = within(screen.getByRole('dialog')).getByRole('button', { name: 'Mark as read' })
    expect(detailAction).toBeInTheDocument()
    expect(state.mark).not.toHaveBeenCalled()
    fireEvent.click(detailAction)
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
    chooseInboxAction(en.notifications.markAllReadMenu)
    view.rerender(<NotificationInbox />)
    expect(screen.queryByRole('button', { name: en.notifications.markAllReadMenu })).toBeNull()
    expect(screen.getAllByRole('button', { name: /Alert \d. read/ })).toHaveLength(2)
    fireEvent.click(screen.getByRole('button', { name: en.notifications.options }))
    expect(screen.getByRole('menuitem', { name: 'Clear all' })).toBeInTheDocument()
  })

  it('deletes through the sibling row action and offers undo until its delete commits', () => {
    seed(2)
    showInbox()
    const body = screen.getByRole('button', { name: 'Alert 0. unread. Progress' })
    const remove = screen.getByRole('button', { name: 'Delete: Alert 0' })
    expect(remove.parentElement).toBe(body.parentElement)
    expect(body.contains(remove)).toBe(false)
    fireEvent.click(remove)
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByRole('button', { name: 'Alert 1. unread. Progress' })).toBeInTheDocument()
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

  it.each([
    ['en', 'All 50 alerts leave the list. There is no way to undo this.'],
    ['pt-BR', 'Os 50 avisos saem da lista. Não há como desfazer.'],
  ])('confirms the full scope and irreversible clear in %s, asks first, and clears pending undo', (locale, confirmBody) => {
    state.locale = locale
    seed(50)
    const messages = locale === 'en' ? en : pt
    const view = showInbox()
    chooseInboxAction(messages.notifications.deleteAll)
    expect(screen.getByText(confirmBody)).toBeInTheDocument()
    const actions = screen.getByRole('dialog').querySelector<HTMLElement>('[data-slot="action-row"]')!
    expect(actions.style.justifyContent).toBe('flex-end')
    expect(actions.style.gap).toBe('12px')
    expect(actions.querySelectorAll('.orbit-pill-action')).toHaveLength(2)
    for (const pill of actions.querySelectorAll('.orbit-pill-action')) expect(pill).toHaveAttribute('data-size', 'sm')
    expect(state.clear).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: messages.common.cancel }))
    expect(screen.getAllByRole('listitem')).toHaveLength(50)
    deleteFromSheet('Alert 0')
    chooseInboxAction(messages.notifications.deleteAll)
    fireEvent.click(screen.getByRole('button', { name: messages.notifications.deleteAllAction }))
    view.rerender(<><NotificationInbox /><NotificationDeleteNotice /></>)
    expect(screen.getByText(messages.notifications.empty)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: messages.notifications.deleteUndo })).toBeNull()
    void act(() => vi.advanceTimersByTime(5000))
    expect(state.remove).not.toHaveBeenCalled()
  })

  it.each([
    ['en', 'The alert leaves the list. There is no way to undo this.'],
    ['pt-BR', 'O aviso sai da lista. Não há como desfazer.'],
  ])('names the one visible alert in the clear confirmation in %s', (locale, confirmBody) => {
    state.locale = locale
    seed(1)
    const messages = locale === 'en' ? en : pt
    showInbox()
    chooseInboxAction(messages.notifications.deleteAll)
    expect(screen.getByText(confirmBody)).toBeInTheDocument()
  })

  it('groups the small intrinsic detail actions at the trailing edge', () => {
    seed(1)
    showInbox()
    fireEvent.click(screen.getByRole('button', { name: 'Alert 0. unread. Progress' }))
    const row = screen.getByRole('dialog').querySelector('[data-slot="sheet-actions"]')!.firstElementChild as HTMLElement
    expect(row).toHaveAttribute('data-slot', 'action-row')
    expect(row.style.justifyContent).toBe('flex-end')
    expect([...row.children].map((button) => button.textContent))
      .toEqual([en.notifications.markAsRead, 'Open in Progress', en.notifications.delete])
    for (const button of row.querySelectorAll('button')) {
      expect(button).toHaveAttribute('data-size', 'sm')
      expect(button.style.width).toBe('auto')
    }
  })

  it.each([
    ['achievement', 'New achievement: First Orbit', 'Create your first habit (+25 XP)'],
    ['level up', 'You reached level 3', 'Keep the streak going.'],
  ])('leads the %s row to Progress and opens it from the sheet', (_kind, title, body) => {
    state.notifications = [createMockNotification({ title, body, url: '/progress', habitId: null, isRead: false })]
    state.unreadCount = 1
    showInbox()
    const row = screen.getByRole('button', { name: `${title}. unread. Progress` })
    expect(within(row).getByText('Progress')).toBeInTheDocument()
    const expected = document.createElement('div')
    expected.innerHTML = renderToStaticMarkup(<ChartLine size={16} />)
    expect(row.querySelector('svg')!.innerHTML).toBe(expected.querySelector('svg')!.innerHTML)
    fireEvent.click(row)
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Open in Progress' }))
    expect(state.push).toHaveBeenCalledWith('/progress')
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

function chooseInboxAction(label: string) {
  const messages = state.locale === 'en' ? en : pt
  fireEvent.click(screen.getByRole('button', { name: messages.notifications.options }))
  fireEvent.click(screen.getByRole('menuitem', { name: label }))
}
