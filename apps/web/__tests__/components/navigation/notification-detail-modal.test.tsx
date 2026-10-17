import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

const PINNED_TEST_TIME = new Date('2026-09-12T09:00:00.000Z')
vi.setSystemTime(PINNED_TEST_TIME)
beforeEach(() => vi.setSystemTime(PINNED_TEST_TIME))
afterEach(() => vi.useRealTimers())

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
vi.mock('@/lib/proactive-item', () => ({ openCurrentProactiveItem: async () => { useUIStore.getState().setAstraConversationOpen(true) } }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}))

vi.mock('@/components/ui/sheet', async () => await import('@/__tests__/support/sheet-double'))

import { NotificationDetailModal } from '@/components/navigation/notification-detail-modal'
import type { NotificationItem } from '@orbit/shared/types/notification'
import { useUIStore } from '@/stores/ui-store'

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
    useUIStore.setState({ astraConversationOpen: false })
    defaultProps.onOpenChange.mockClear()
    defaultProps.onMarkAsRead.mockClear()
    defaultProps.onDelete.mockClear()
    mockPush.mockClear()
  })

  it('renders nothing when closed', () => {
    const { container } = render(
      <QueryClientProvider client={new QueryClient()}><NotificationDetailModal {...defaultProps} open={false} /></QueryClientProvider>,
    )
    expect(container.innerHTML).toBe('')
  })

  it('renders notification details when open', () => {
    render(<QueryClientProvider client={new QueryClient()}><NotificationDetailModal {...defaultProps} /></QueryClientProvider>)
    expect(screen.getByText('You earned a badge!')).toBeInTheDocument()
  })

  it('keeps actions outside the scrolling body for long notifications', () => {
    const longBody = Array.from({ length: 80 }, (_, index) => `Line ${index + 1}`).join('\n')
    const { container } = render(
      <QueryClientProvider client={new QueryClient()}><NotificationDetailModal
        {...defaultProps}
        notification={{ ...mockNotification, body: longBody }}
      /></QueryClientProvider>,
    )
    const body = container.querySelector('[data-slot="sheet-body"]')!
    const actions = container.querySelector('[data-slot="sheet-actions"]')!

    expect(body.querySelector('.whitespace-pre-wrap')?.textContent).toBe(longBody)
    expect(body.querySelectorAll('button')).toHaveLength(0)
    expect(actions.querySelectorAll('button')).toHaveLength(3)
  })

  it('shows mark as read button for unread notifications', () => {
    render(<QueryClientProvider client={new QueryClient()}><NotificationDetailModal {...defaultProps} /></QueryClientProvider>)
    expect(screen.getByText('notifications.markAsRead')).toBeInTheDocument()
  })

  it('hides mark as read for already read notifications', () => {
    const readNotification = { ...mockNotification, isRead: true }
    render(
      <QueryClientProvider client={new QueryClient()}><NotificationDetailModal {...defaultProps} notification={readNotification} /></QueryClientProvider>,
    )
    expect(screen.queryByText('notifications.markAsRead')).not.toBeInTheDocument()
  })

  it('calls onMarkAsRead when mark as read clicked', () => {
    render(<QueryClientProvider client={new QueryClient()}><NotificationDetailModal {...defaultProps} /></QueryClientProvider>)
    fireEvent.click(screen.getByText('notifications.markAsRead'))
    expect(defaultProps.onMarkAsRead).toHaveBeenCalledWith('n1')
  })

  it('calls onDelete and closes when delete clicked', () => {
    render(<QueryClientProvider client={new QueryClient()}><NotificationDetailModal {...defaultProps} /></QueryClientProvider>)
    fireEvent.click(screen.getByText('notifications.delete'))
    expect(defaultProps.onDelete).toHaveBeenCalledWith('n1')
    expect(defaultProps.onOpenChange).toHaveBeenCalledWith(false)
  })

  it('navigates and closes when view button clicked', () => {
    render(<QueryClientProvider client={new QueryClient()}><NotificationDetailModal {...defaultProps} /></QueryClientProvider>)
    fireEvent.click(screen.getByRole('button', { name: /notifications.openIn/ }))
    expect(mockPush).toHaveBeenCalledWith('/progress/achievements')
    expect(defaultProps.onOpenChange).toHaveBeenCalledWith(false)
  })

  it.each([
    ['/progress', '/progress'],
    ['/progress/streak', '/progress/streak'],
    ['/progress/goals', '/progress/goals'],
    ['/progress/achievements', '/progress/achievements'],
    ['/streak?source=inbox#freezes', '/progress/streak?source=inbox#freezes'],
    ['/goals?status=Active', '/progress/goals?status=Active'],
    ['/achievements?earned=latest', '/progress/achievements?earned=latest'],
  ])('opens notification %s in its owning screen', (url, destination) => {
    render(<QueryClientProvider client={new QueryClient()}><NotificationDetailModal {...defaultProps} notification={{ ...mockNotification, url }} /></QueryClientProvider>)
    fireEvent.click(screen.getByRole('button', { name: /notifications.openIn/ }))
    expect(mockPush).toHaveBeenCalledWith(destination)
  })

  it('preserves the closed month when opening a Wrapped notification', () => {
    render(<QueryClientProvider client={new QueryClient()}><NotificationDetailModal {...defaultProps} notification={{ ...mockNotification, url: '/progress?wrapped=month&year=2024&month=2' }} /></QueryClientProvider>)
    fireEvent.click(screen.getByRole('button', { name: /notifications.openIn/ }))
    expect(mockPush).toHaveBeenCalledWith('/wrapped?period=month&year=2024&month=2')
  })

  it('does not show view button for invalid URLs', () => {
    const noUrlNotification = { ...mockNotification, url: null }
    render(
      <QueryClientProvider client={new QueryClient()}><NotificationDetailModal {...defaultProps} notification={noUrlNotification} /></QueryClientProvider>,
    )
    expect(screen.queryByRole('button', { name: /notifications.openIn/ })).not.toBeInTheDocument()
  })

  it('does not navigate on open redirect attempt', () => {
    const badUrl = { ...mockNotification, url: '//evil.com' }
    render(
      <QueryClientProvider client={new QueryClient()}><NotificationDetailModal {...defaultProps} notification={badUrl} /></QueryClientProvider>,
    )
    expect(screen.queryByRole('button', { name: /notifications.openIn/ })).not.toBeInTheDocument()
  })

  it.each([
    ['/', '/'], ['/calendar', '/calendar'], ['/profile', '/profile'],
    ['/progress?wrapped=month&year=2026&month=8', '/wrapped?period=month&year=2026&month=8'],
    ['/', '/habits/a12b34cd-1234-4567-89ab-123456789abc', 'a12b34cd-1234-4567-89ab-123456789abc'], ['/chat', '/'], ['/calendar-sync?mode=review', '/calendar?mode=review'],
  ])('opens %s in its existing destination %s', (url, destination, habitId: string | null = null) => {
    render(<QueryClientProvider client={new QueryClient()}><NotificationDetailModal {...defaultProps} notification={{ ...mockNotification, url, habitId }} /></QueryClientProvider>)
    fireEvent.click(screen.getByRole('button', { name: /notifications.openIn/ }))
    expect(mockPush).toHaveBeenCalledWith(destination)
    expect(useUIStore.getState().astraConversationOpen).toBe(url === '/chat')
  })
})
