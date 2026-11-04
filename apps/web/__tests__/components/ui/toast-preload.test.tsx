import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { NotificationDeleteNotice } from '@/components/navigation/notification-delete-notice'

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))
vi.mock('@/components/ui/toast', () => { throw new Error('Toast chunk unavailable') })

afterEach(cleanup)

it('reports a failed notification preload through browser error handling', async () => {
  const reported: ErrorEvent[] = []
  const receiveError = (event: ErrorEvent) => { event.preventDefault(); reported.push(event) }
  window.addEventListener('error', receiveError)
  try {
    render(<NotificationDeleteNotice />)
    await act(async () => { await vi.dynamicImportSettled() })
    expect(reported).toHaveLength(1)
    expect(reported[0]?.error).toBeInstanceOf(Error)
    expect(screen.queryByRole('group')).toBeNull()
  } finally {
    window.removeEventListener('error', receiveError)
  }
})
