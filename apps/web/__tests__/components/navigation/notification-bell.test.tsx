import { beforeEach, describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'

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
const markAsReadMutate = vi.fn()
const markAllAsReadMutate = vi.fn()
const deleteNotificationMutate = vi.fn()
const deleteAllMutate = vi.fn()
const showQueued = vi.fn()

vi.mock('@/hooks/use-notifications', () => ({
  useNotifications: () => ({
    notifications: mockNotifications,
    unreadCount: mockUnreadCount,
    isLoading: mockIsLoading,
  }),
  useMarkNotificationRead: () => ({ mutate: markAsReadMutate }),
  useMarkAllNotificationsRead: () => ({ mutate: markAllAsReadMutate }),
  useDeleteNotification: () => ({ mutate: deleteNotificationMutate }),
  useDeleteAllNotifications: () => ({ mutate: deleteAllMutate }),
}))

vi.mock('./notification-detail-modal', () => ({
  NotificationDetailModal: () => null,
}))

vi.mock('@/components/navigation/notification-detail-modal', () => ({
  NotificationDetailModal: () => null,
}))

vi.mock('@/hooks/use-app-toast', () => ({
  useAppToast: () => ({
    showQueued,
  }),
}))

import { NotificationBell } from '@/components/navigation/notification-bell'

describe('NotificationBell', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    mockNotifications = []
    mockUnreadCount = 0
    mockIsLoading = false
    markAsReadMutate.mockReset()
    markAllAsReadMutate.mockReset()
    deleteNotificationMutate.mockReset()
    deleteAllMutate.mockReset()
    showQueued.mockReset()
  })

  it('renders the bell button', () => {
    render(<NotificationBell />)
    expect(screen.getByLabelText('notifications.bell')).toBeInTheDocument()
  })

  it('shows unread count badge when there are unread notifications', () => {
    mockNotifications = Array.from({ length: 3 }, (_, index) => ({
      id: `${index + 1}`,
      title: `Notification ${index + 1}`,
      body: 'Body',
      isRead: false,
      createdAtUtc: new Date().toISOString(),
      url: null,
      habitId: null,
    }))
    render(<NotificationBell />)
    expect(screen.getByText('3')).toBeInTheDocument()
  })

  it('shows 9+ for more than 9 unread', () => {
    mockNotifications = Array.from({ length: 15 }, (_, index) => ({
      id: `${index + 1}`,
      title: `Notification ${index + 1}`,
      body: 'Body',
      isRead: false,
      createdAtUtc: new Date().toISOString(),
      url: null,
      habitId: null,
    }))
    render(<NotificationBell />)
    expect(screen.getByText('9+')).toBeInTheDocument()
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

  it('queues single deletes with undo instead of deleting immediately', () => {
    let undoAction: (() => void) | undefined
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
    mockUnreadCount = 1
    showQueued.mockImplementation((_message, _label, onAction) => {
      undoAction = onAction
    })

    render(<NotificationBell />)
    fireEvent.click(screen.getByLabelText(/notifications.bellWithCount/))
    fireEvent.click(screen.getByLabelText('notifications.deleteNotification'))

    expect(showQueued).toHaveBeenCalled()
    expect(screen.queryByText('Test notification')).not.toBeInTheDocument()
    expect(deleteNotificationMutate).not.toHaveBeenCalled()

    act(() => {
      undoAction?.()
    })

    expect(screen.getByText('Test notification')).toBeInTheDocument()

    fireEvent.click(screen.getByLabelText('notifications.deleteNotification'))
    vi.advanceTimersByTime(5000)

    expect(deleteNotificationMutate).toHaveBeenCalledWith('1')
  })

  it('opens a confirmation dialog before deleting all notifications', () => {
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
    fireEvent.click(screen.getByLabelText('notifications.deleteAll'))

    expect(screen.getByText('notifications.deleteAllConfirmTitle')).toBeInTheDocument()
    expect(deleteAllMutate).not.toHaveBeenCalled()
  })
})
