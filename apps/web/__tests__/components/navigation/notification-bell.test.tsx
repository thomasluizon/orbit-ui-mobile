import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) => {
    if (params) return `${key}:${JSON.stringify(params)}`
    return key
  },
}))

vi.mock('@/lib/plural', () => ({
  plural: (text: string) => text,
}))

let mockNotifications: Array<{ id: string; title: string; body: string; isRead: boolean; createdAtUtc: string; url: string | null; habitId: string | null }> = []
let mockUnreadCount = 0
let mockIsLoading = false

vi.mock('@/hooks/use-notifications', () => ({
  useNotifications: () => ({
    notifications: mockNotifications,
    unreadCount: mockUnreadCount,
    isLoading: mockIsLoading,
  }),
  useMarkNotificationRead: () => ({ mutate: vi.fn() }),
  useMarkAllNotificationsRead: () => ({ mutate: vi.fn() }),
  useDeleteNotification: () => ({ mutate: vi.fn() }),
  useDeleteAllNotifications: () => ({ mutate: vi.fn() }),
}))

vi.mock('./notification-detail-modal', () => ({
  NotificationDetailModal: () => null,
}))

vi.mock('@/components/navigation/notification-detail-modal', () => ({
  NotificationDetailModal: () => null,
}))

import { NotificationBell } from '@/components/navigation/notification-bell'

describe('NotificationBell', () => {
  it('renders the bell button', () => {
    mockUnreadCount = 0
    render(<NotificationBell />)
    expect(screen.getByLabelText('notifications.bell')).toBeInTheDocument()
  })

  it('shows unread count badge when there are unread notifications', () => {
    mockUnreadCount = 3
    render(<NotificationBell />)
    expect(document.body.textContent).toContain('3')
  })

  it('shows 9+ for more than 9 unread', () => {
    mockUnreadCount = 15
    render(<NotificationBell />)
    expect(document.body.textContent).toContain('9+')
  })

  it('does not show badge when unread count is 0', () => {
    mockUnreadCount = 0
    const { container } = render(<NotificationBell />)
    const badge = container.querySelector('.animate-gentle-pulse')
    expect(badge).not.toBeInTheDocument()
  })

  it('opens dropdown on click', () => {
    mockUnreadCount = 0
    mockNotifications = []
    render(<NotificationBell />)
    fireEvent.click(screen.getByLabelText('notifications.bell'))
    expect(screen.getByText('notifications.title')).toBeInTheDocument()
  })

  it('shows empty state when no notifications', () => {
    mockUnreadCount = 0
    mockNotifications = []
    mockIsLoading = false
    render(<NotificationBell />)
    fireEvent.click(screen.getByLabelText('notifications.bell'))
    expect(screen.getByText('notifications.empty')).toBeInTheDocument()
  })

  it('shows loading skeletons when loading', () => {
    mockUnreadCount = 0
    mockNotifications = []
    mockIsLoading = true
    render(<NotificationBell />)
    fireEvent.click(screen.getByLabelText('notifications.bell'))
    const pulseElements = document.querySelectorAll('.animate-pulse')
    expect(pulseElements.length).toBeGreaterThan(0)
  })

  it('renders notification items', () => {
    mockIsLoading = false
    mockUnreadCount = 1
    mockNotifications = [
      {
        id: '1',
        title: 'Test notification',
        body: 'Test body',
        isRead: false,
        createdAtUtc: new Date().toISOString(),
        url: null,
        habitId: null,
      },
    ]
    render(<NotificationBell />)
    fireEvent.click(screen.getByLabelText(/notifications.bellWithCount/))
    expect(screen.getByText('Test notification')).toBeInTheDocument()
    expect(screen.getByText('Test body')).toBeInTheDocument()
  })

  it('shows mark all read button when there are unread notifications', () => {
    mockIsLoading = false
    mockUnreadCount = 2
    mockNotifications = [
      {
        id: '1',
        title: 'N1',
        body: 'B1',
        isRead: false,
        createdAtUtc: new Date().toISOString(),
        url: null,
        habitId: null,
      },
    ]
    render(<NotificationBell />)
    fireEvent.click(screen.getByLabelText(/notifications.bellWithCount/))
    expect(screen.getByText('notifications.markAllRead')).toBeInTheDocument()
  })

  it('has aria-expanded attribute', () => {
    mockUnreadCount = 0
    render(<NotificationBell />)
    const btn = screen.getByLabelText('notifications.bell')
    expect(btn).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(btn)
    expect(btn).toHaveAttribute('aria-expanded', 'true')
  })
})
