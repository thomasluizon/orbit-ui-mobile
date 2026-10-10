import { cleanup, render, screen, act } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { QueryClientProvider } from '@tanstack/react-query'
import { NotificationsPreload } from '@/lib/notifications-preload'
import { createQueryClient } from '@/lib/query-client'
import { advanceAccountGeneration } from '@/lib/session-epoch'
import { useNotifications } from '@/hooks/use-notifications'

vi.mock('@/lib/api-fetch', () => ({ fetchJson: () => new Promise(() => {}) }))
afterEach(cleanup)

function NotificationCount() {
  const { unreadCount } = useNotifications()
  return <output aria-label="Unread">{unreadCount}</output>
}

it('does not reseed server notifications when a consumer remounts after an account reset', () => {
  const queryClient = createQueryClient()
  const initialNotifications = { items: [], unreadCount: 15 }
  const shell = (showCount: boolean) => <NotificationsPreload initialNotifications={initialNotifications}>
    <QueryClientProvider client={queryClient}>{showCount && <NotificationCount />}</QueryClientProvider>
  </NotificationsPreload>
  const tree = render(shell(true))
  expect(screen.getByRole('status', { name: 'Unread' })).toHaveTextContent('15')
  tree.rerender(shell(false))
  act(() => {
    advanceAccountGeneration()
    queryClient.clear()
  })
  tree.rerender(shell(true))
  expect(screen.getByRole('status', { name: 'Unread' })).toHaveTextContent('0')
})
