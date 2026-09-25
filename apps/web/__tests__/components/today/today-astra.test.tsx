import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { NotificationItem } from '@orbit/shared/types/notification'
import { TodayAstra } from '@/components/today/today-astra'
import { useUIStore } from '@/stores/ui-store'

interface TodayAstraMocks {
  notifications: NotificationItem[]
  markRead: ReturnType<typeof vi.fn>
  profile: { id: string; timeZone: string; lastCompletionDate?: string | null }
}

const mocks = vi.hoisted((): TodayAstraMocks => ({
  notifications: [],
  markRead: vi.fn(),
  profile: { id: 'profile', timeZone: 'UTC' },
}))

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: { days: number }) =>
    values ? `${key}:${values.days}` : key,
}))

vi.mock('@/hooks/use-profile', () => ({
  useProfile: () => ({ profile: mocks.profile, isPending: false, isError: false }),
}))
vi.mock('@/hooks/use-notifications', () => ({
  useNotifications: () => ({ notifications: mocks.notifications }),
  useMarkNotificationRead: () => ({ mutate: mocks.markRead }),
}))
vi.mock('@/components/ui/astra-glyph', () => ({ AstraGlyph: () => null }))

function renderTodayAstra() {
  return render(<TodayAstra isTodaySelected suppressed={false} />)
}

describe('web Today Astra', () => {
  beforeEach(() => {
    mocks.notifications = []
    mocks.markRead.mockReset()
    mocks.profile = { id: 'profile', timeZone: 'UTC' }
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-29T12:00:00Z'))
    useUIStore.setState({ astraConversationOpen: false })
    document.getElementById('today-composer-slot')?.remove()
  })

  function appendComposerSlot() {
    const slot = document.createElement('div')
    slot.id = 'today-composer-slot'
    document.body.append(slot)
    return slot
  }

  it('leaves the retired Today composer slot empty', () => {
    const slot = appendComposerSlot()

    renderTodayAstra()

    expect(slot).toBeEmptyDOMElement()
  })

  it('renders no proactive row when there is no unread check-in', () => {
    const { container } = renderTodayAstra()

    expect(container).toBeEmptyDOMElement()
  })

  it.each([
    ['recent subhabit', '2026-08-26', 'todayAstra.returningElapsed:3'],
    ['older root and newer subhabit', '2026-08-26', 'todayAstra.returningElapsed:3'],
    ['recent general habit', '2026-08-25', 'todayAstra.returningElapsed:4'],
    ['gap beyond the window', '2026-07-29', 'todayAstra.returningBounded'],
  ])('shows the profile interval for %s', (_scenario, lastCompletionDate, expected) => {
    mocks.profile = { id: 'profile', timeZone: 'UTC', lastCompletionDate }

    renderTodayAstra()

    expect(screen.getByText(expected, { exact: false })).toBeInTheDocument()
  })

  it.each([null, undefined])('shows no interval for %s completion', (lastCompletionDate) => {
    mocks.profile = { id: 'profile', timeZone: 'UTC', lastCompletionDate }

    const { container } = renderTodayAstra()

    expect(container).toBeEmptyDOMElement()
  })

  it('renders a proactive check-in and opens its conversation', () => {
    mocks.notifications = [{
      id: 'check-in',
      title: 'Astra',
      body: 'Check in',
      url: '/chat',
      habitId: null,
      isRead: false,
      createdAtUtc: '2026-08-29T10:00:00Z',
    }]

    renderTodayAstra()

    expect(screen.getByText(/Check in/)).toBeInTheDocument()
    const action = screen.getByRole('button', { name: 'todayAstra.openConversation' })
    expect(action).toHaveClass('orbit-link-action-persistent')
    fireEvent.click(action)
    expect(mocks.markRead).toHaveBeenCalledWith('check-in')
    expect(useUIStore.getState().astraConversationOpen).toBe(true)
  })

})
