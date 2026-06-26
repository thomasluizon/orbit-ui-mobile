import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { createMockHabit, createMockRescheduleSuggestion } from '@orbit/shared/__tests__/factories'
import type { RescheduleSuggestion } from '@orbit/shared/types/habit'
import { RescheduleSheet } from '@/components/habits/reschedule-sheet'

const h = vi.hoisted(() => ({
  push: vi.fn(),
  mutateAsync: vi.fn(),
  showError: vi.fn(),
  profile: { hasProAccess: true, language: 'en' },
  reschedule: {
    suggestion: null as RescheduleSuggestion | null,
    isLoading: false,
    error: null as Error | null,
    refetch: vi.fn(),
  },
}))

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: h.push }) }))
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => 'en',
}))
vi.mock('@/hooks/use-profile', () => ({ useProfile: () => ({ profile: h.profile }) }))
vi.mock('@/hooks/use-time-format', () => ({ useTimeFormat: () => ({ displayTime: (value: string) => value }) }))
vi.mock('@/hooks/use-app-toast', () => ({ useAppToast: () => ({ showError: h.showError }) }))
vi.mock('@/hooks/use-habits', () => ({ useUpdateHabit: () => ({ mutateAsync: h.mutateAsync, isPending: false }) }))
vi.mock('@/hooks/use-reschedule-suggestion', () => ({ useRescheduleSuggestion: () => h.reschedule }))
vi.mock('@/components/ui/app-overlay', () => ({
  AppOverlay: ({ open, children, footer }: { open: boolean; children?: ReactNode; footer?: ReactNode }) =>
    open ? (
      <div>
        {children}
        {footer}
      </div>
    ) : null,
}))

const overdueHabit = createMockHabit({ id: 'habit-1', title: 'Run', isOverdue: true, dueDate: '2025-01-01' })

describe('RescheduleSheet', () => {
  beforeEach(() => {
    h.push.mockReset()
    h.mutateAsync.mockReset().mockResolvedValue(undefined)
    h.showError.mockReset()
    h.reschedule.refetch.mockReset()
    h.profile = { hasProAccess: true, language: 'en' }
    h.reschedule.suggestion = null
    h.reschedule.isLoading = false
    h.reschedule.error = null
  })

  it('accept applies the suggestion through the update path with a merged request', async () => {
    h.reschedule.suggestion = createMockRescheduleSuggestion({
      frequencyUnit: 'Week',
      frequencyQuantity: 2,
      dueDate: '2025-02-01',
      dueTime: null,
    })

    render(<RescheduleSheet open onOpenChange={vi.fn()} habit={overdueHabit} />)

    fireEvent.click(screen.getByTestId('reschedule-accept'))

    await waitFor(() => expect(h.mutateAsync).toHaveBeenCalledTimes(1))
    expect(h.mutateAsync).toHaveBeenCalledWith({
      habitId: 'habit-1',
      data: expect.objectContaining({
        title: 'Run',
        isBadHabit: false,
        dueDate: '2025-02-01',
        frequencyUnit: 'Week',
        frequencyQuantity: 2,
      }),
    })
  })

  it('shows the upgrade prompt for free users and routes to /upgrade', () => {
    h.profile = { hasProAccess: false, language: 'en' }

    render(<RescheduleSheet open onOpenChange={vi.fn()} habit={overdueHabit} />)

    expect(screen.getByTestId('reschedule-free-prompt')).toBeInTheDocument()
    fireEvent.click(screen.getByText('habits.reschedule.upgrade'))
    expect(h.push).toHaveBeenCalledWith('/upgrade')
  })

  it('shows an error with a retry that refetches', () => {
    h.reschedule.error = new Error('unavailable')

    render(<RescheduleSheet open onOpenChange={vi.fn()} habit={overdueHabit} />)

    expect(screen.getByTestId('reschedule-error')).toBeInTheDocument()
    fireEvent.click(screen.getByText('habits.reschedule.retry'))
    expect(h.reschedule.refetch).toHaveBeenCalled()
  })
})
