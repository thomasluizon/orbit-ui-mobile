import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) => {
    if (params) return `${key}(${JSON.stringify(params)})`
    return key
  },
}))

vi.mock('dompurify', () => ({
  default: { sanitize: (html: string) => html },
}))

const mockPush = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}))

vi.mock('@/components/ui/app-overlay', () => ({
  AppOverlay: ({ open, children, title, footer }: {
    open: boolean; children: React.ReactNode; title?: string; footer?: React.ReactNode
  }) => {
    if (!open) return null
    return (
      <div data-testid="overlay">
        {title && <h2>{title}</h2>}
        {children}
        {footer}
      </div>
    )
  },
}))

import { NotificationDetailModal } from '@/components/navigation/notification-detail-modal'
import type { NotificationItem } from '@orbit/shared/types/notification'

const mockNotification: NotificationItem = {
  id: 'n1',
  title: 'New Achievement',
  body: 'You earned a badge!',
  isRead: false,
  url: '/achievements',
  habitId: null,
  createdAtUtc: new Date().toISOString(),
}

describe('NotificationDetailModal', () => {
  const defaultProps = {
    open: true,
    onOpenChange: vi.fn(),
    notification: mockNotification,
    onMarkAsRead: vi.fn(),
    onDelete: vi.fn(),
  }

  beforeEach(() => {
    defaultProps.onOpenChange.mockClear()
    defaultProps.onMarkAsRead.mockClear()
    defaultProps.onDelete.mockClear()
    mockPush.mockClear()
  })

  it('renders nothing when closed', () => {
    const { container } = render(
      <NotificationDetailModal {...defaultProps} open={false} />,
    )
    expect(container.innerHTML).toBe('')
  })

  it('renders notification details when open', () => {
    render(<NotificationDetailModal {...defaultProps} />)
    expect(screen.getByText('You earned a badge!')).toBeInTheDocument()
  })

  it('shows mark as read button for unread notifications', () => {
    render(<NotificationDetailModal {...defaultProps} />)
    expect(screen.getByText('notifications.markAsRead')).toBeInTheDocument()
  })

  it('hides mark as read for already read notifications', () => {
    const readNotification = { ...mockNotification, isRead: true }
    render(
      <NotificationDetailModal {...defaultProps} notification={readNotification} />,
    )
    expect(screen.queryByText('notifications.markAsRead')).not.toBeInTheDocument()
  })

  it('calls onMarkAsRead when mark as read clicked', () => {
    render(<NotificationDetailModal {...defaultProps} />)
    fireEvent.click(screen.getByText('notifications.markAsRead'))
    expect(defaultProps.onMarkAsRead).toHaveBeenCalledWith('n1')
  })

  it('calls onDelete and closes when delete clicked', () => {
    render(<NotificationDetailModal {...defaultProps} />)
    fireEvent.click(screen.getByText('notifications.deleteNotification'))
    expect(defaultProps.onDelete).toHaveBeenCalledWith('n1')
    expect(defaultProps.onOpenChange).toHaveBeenCalledWith(false)
  })

  it('navigates and closes when view button clicked', () => {
    render(<NotificationDetailModal {...defaultProps} />)
    fireEvent.click(screen.getByText('notifications.view'))
    expect(mockPush).toHaveBeenCalledWith('/achievements')
    expect(defaultProps.onOpenChange).toHaveBeenCalledWith(false)
  })

  it('does not show view button for invalid URLs', () => {
    const noUrlNotification = { ...mockNotification, url: null }
    render(
      <NotificationDetailModal {...defaultProps} notification={noUrlNotification} />,
    )
    expect(screen.queryByText('notifications.view')).not.toBeInTheDocument()
  })

  it('does not navigate on open redirect attempt', () => {
    const badUrl = { ...mockNotification, url: '//evil.com' }
    render(
      <NotificationDetailModal {...defaultProps} notification={badUrl} />,
    )
    expect(screen.queryByText('notifications.view')).not.toBeInTheDocument()
  })
})
