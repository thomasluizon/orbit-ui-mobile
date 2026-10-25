import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { AppToastHost } from '@/components/ui/app-toast-host'
import { NotificationDeleteNotice } from '@/components/navigation/notification-delete-notice'

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))
vi.mock('@/components/ui/toast', () => { throw new Error('Toast chunk unavailable') })

afterEach(cleanup)

it.each([
  { name: 'application', ToastHost: AppToastHost },
  { name: 'notification', ToastHost: NotificationDeleteNotice },
])('reports a failed $name preload through browser error handling', async ({ ToastHost }) => {
  const reported: ErrorEvent[] = []
  const receiveError = (event: ErrorEvent) => { event.preventDefault(); reported.push(event) }
  window.addEventListener('error', receiveError)
  try {
    render(<ToastHost />)
    await act(async () => { await vi.dynamicImportSettled() })
    expect(reported).toHaveLength(1)
    expect(reported[0]?.error).toBeInstanceOf(Error)
    expect(screen.queryByRole('group')).toBeNull()
  } finally {
    window.removeEventListener('error', receiveError)
  }
})
