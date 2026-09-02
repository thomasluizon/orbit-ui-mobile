import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { NotificationItem } from '@orbit/shared/types/notification'
import { TodayAstra } from '@/components/today/today-astra'
import { useUIStore } from '@/stores/ui-store'

interface TodayAstraMocks {
  notifications: NotificationItem[]
  markRead: ReturnType<typeof vi.fn>
}

const mocks = vi.hoisted((): TodayAstraMocks => ({
  notifications: [],
  markRead: vi.fn(),
}))

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock('@/hooks/use-profile', () => ({
  useProfile: () => ({ profile: { id: 'profile' }, isPending: false, isError: false }),
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
