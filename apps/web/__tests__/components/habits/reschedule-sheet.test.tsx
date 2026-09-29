import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { createMockHabit, createMockRescheduleSuggestion } from '@orbit/shared/__tests__/factories'
import type { RescheduleSuggestion } from '@orbit/shared/types/habit'
import { RescheduleSheet } from '@/components/habits/reschedule-sheet'
import { sheetTestControls } from '@/__tests__/support/sheet-double'

const h = vi.hoisted(() => ({
  push: vi.fn(),
  mutateAsync: vi.fn(),
  showError: vi.fn(),
  wide: false,
  pending: false,
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
vi.mock('@/hooks/use-habits', () => ({ useUpdateHabit: () => ({ mutateAsync: h.mutateAsync, isPending: h.pending }) }))
vi.mock('@/hooks/use-is-desktop', () => ({ useIsWideDesktop: () => h.wide }))
vi.mock('@/hooks/use-reschedule-suggestion', () => ({ useRescheduleSuggestion: () => h.reschedule }))
vi.mock('@/components/ui/sheet', async () => await import('@/__tests__/support/sheet-double'))

const overdueHabit = createMockHabit({ id: 'habit-1', title: 'Run', isOverdue: true, dueDate: '2025-01-01' })

describe('RescheduleSheet', () => {
  it.each(['free', 'error', 'accept'] as const)('renders trailing small actions in the %s footer', (state) => {
    if (state === 'free') h.profile = { hasProAccess: false, language: 'en' }
    if (state === 'error') h.reschedule.error = new Error('unavailable')
    render(<RescheduleSheet open onOpenChange={vi.fn()} habit={overdueHabit} />)
    const primary = state === 'free' ? 'habits.reschedule.upgrade' : state === 'error' ? 'habits.reschedule.retry' : 'habits.reschedule.accept'
    const actions = screen.getByTestId('sheet').querySelector('[data-slot="sheet-actions"]')!
    expect(Array.from(actions.children).map((button) => button.textContent)).toEqual(['habits.reschedule.dismiss', primary])
    expect(Array.from(actions.children).map((button) => button.getAttribute('data-size'))).toEqual(['sm', 'sm'])
    expect(Array.from(actions.children).map((button) => button.getAttribute('data-variant'))).toEqual(['ghost', 'primary'])
  })
  it.each(['free', 'error', 'accept'] as const)('dismisses the %s footer without applying or navigating', (state) => {
    if (state === 'free') h.profile = { hasProAccess: false, language: 'en' }
    if (state === 'error') h.reschedule.error = new Error('unavailable')
    const onOpenChange = vi.fn()
    render(<RescheduleSheet open onOpenChange={onOpenChange} habit={overdueHabit} />)
    fireEvent.click(screen.getByRole('button', { name: 'habits.reschedule.dismiss' }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(h.mutateAsync).not.toHaveBeenCalled()
    expect(h.push).not.toHaveBeenCalled()
  })
  beforeEach(() => {
    h.push.mockReset()
    h.mutateAsync.mockReset().mockResolvedValue(undefined)
    h.showError.mockReset()
    h.wide = false
    h.pending = false
    sheetTestControls.defer(false)
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

    fireEvent.click(screen.getByRole('button', { name: 'habits.reschedule.accept' }))

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

  it('shows only the date line for a plan without a frequency', () => {
    h.reschedule.suggestion = createMockRescheduleSuggestion({ frequencyUnit: null, frequencyQuantity: null, days: [] })
    render(<RescheduleSheet open onOpenChange={vi.fn()} habit={overdueHabit} />)
    const schedule = screen.getByTestId('reschedule-proposed-schedule')
    expect(schedule).toHaveTextContent(/\d/)
    expect(schedule.parentElement?.children).toHaveLength(1)
    expect(screen.queryByText('habits.oneTimeTask')).not.toBeInTheDocument()
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

  it('shows a schedule-card placeholder while the suggestion is loading', () => {
    h.reschedule.isLoading = true

    render(<RescheduleSheet open onOpenChange={vi.fn()} habit={overdueHabit} />)

    expect(screen.getByText('habits.reschedule.loading')).toBeInTheDocument()
    expect(screen.getByTestId('reschedule-loading-skeleton')).toBeInTheDocument()
    expect(screen.getAllByRole('progressbar')).toHaveLength(1)
    expect(screen.getByTestId('reschedule-loading-skeleton').querySelectorAll('[data-variant="habit-row"]')).toHaveLength(2)
    expect(screen.queryByRole('button', { name: 'habits.reschedule.accept' })).not.toBeInTheDocument()
  })

  it('uses an accessible dialog title and the proposed Astra label', () => {
    h.profile = { hasProAccess: true, language: 'pt-BR' }
    h.reschedule.suggestion = createMockRescheduleSuggestion({ dueDate: '2026-08-20', dueTime: '07:30:00' })
    render(<RescheduleSheet open onOpenChange={vi.fn()} habit={overdueHabit} />)
    expect(screen.getByRole('dialog', { name: 'habits.reschedule.title' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'habits.reschedule.title' })).not.toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'habits.form.proposedByAstra' })).toBeInTheDocument()
    expect(screen.queryByText('habits.reschedule.proposedScheduleLabel')).not.toBeInTheDocument()
    expect(screen.getByTestId('reschedule-proposed-schedule')).not.toHaveTextContent('2026')
    expect(screen.getByTestId('reschedule-proposed-schedule')).toHaveTextContent(/qui/i)
    expect(screen.getByText('Astra')).toHaveAttribute('translate', 'no')
    expect(screen.getByText('Astra')).not.toHaveStyle({ textTransform: 'uppercase' })
    expect(screen.getByTestId('sheet').querySelector('[data-asset="astra-mark"]')).toHaveAttribute('color', 'var(--fg-1)')
  })

  it('uses the neutral filled action at wide width and shows a busy accept while saving', () => {
    h.wide = true
    h.reschedule.suggestion = createMockRescheduleSuggestion({})
    h.mutateAsync.mockImplementation(() => new Promise(() => {}))
    const onOpenChange = vi.fn()
    const { rerender } = render(<RescheduleSheet open onOpenChange={onOpenChange} habit={overdueHabit} />)
    expect(screen.getByRole('button', { name: 'habits.reschedule.accept' })).toHaveAttribute('data-variant', 'secondary')
    fireEvent.click(screen.getByRole('button', { name: 'habits.reschedule.accept' }))
    h.pending = true
    rerender(<RescheduleSheet open onOpenChange={onOpenChange} habit={overdueHabit} />)
    expect(screen.getByRole('button', { name: 'habits.reschedule.accept' })).toHaveAttribute('aria-busy', 'true')
    expect(screen.getByRole('button', { name: 'habits.reschedule.accept' })).toBeDisabled()
  })

  it('waits for dismissal before navigating to Pro', () => {
    h.profile = { hasProAccess: false, language: 'en' }
    sheetTestControls.defer(true)
    const onOpenChange = vi.fn()
    render(<RescheduleSheet open onOpenChange={onOpenChange} habit={overdueHabit} />)
    fireEvent.click(screen.getByRole('button', { name: 'habits.reschedule.upgrade' }))
    expect(onOpenChange).not.toHaveBeenCalled()
    expect(h.push).not.toHaveBeenCalled()
    sheetTestControls.completeDismissal()
    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(h.push).toHaveBeenCalledWith('/upgrade')
  })

  it('waits for dismissal before closing a proposed plan', () => {
    h.reschedule.suggestion = createMockRescheduleSuggestion({})
    sheetTestControls.defer(true)
    const onOpenChange = vi.fn()
    render(<RescheduleSheet open onOpenChange={onOpenChange} habit={overdueHabit} />)
    fireEvent.click(screen.getByRole('button', { name: 'habits.reschedule.dismiss' }))
    expect(onOpenChange).not.toHaveBeenCalled()
    expect(sheetTestControls.isDismissPending).toBe(true)
    sheetTestControls.completeDismissal()
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})
