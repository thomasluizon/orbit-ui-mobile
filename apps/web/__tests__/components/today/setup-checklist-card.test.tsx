import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { createMockProfile } from '@orbit/shared/__tests__/factories'
import type { Profile } from '@orbit/shared/types'

let mockProfile: Profile | undefined
let mockDismissed = false
const setDismissed = vi.fn()

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) =>
    params ? `${key}(${JSON.stringify(params)})` : key,
}))

vi.mock('@/hooks/use-profile', () => ({
  useProfile: () => ({ profile: mockProfile }),
}))

vi.mock('@/stores/ui-store', () => ({
  useUIStore: <T,>(
    selector: (state: {
      setupChecklistDismissed: boolean
      setSetupChecklistDismissed: typeof setDismissed
    }) => T,
  ) =>
    selector({
      setupChecklistDismissed: mockDismissed,
      setSetupChecklistDismissed: setDismissed,
    }),
}))

import { SetupChecklistCard } from '@/components/today/setup-checklist-card'

describe('SetupChecklistCard', () => {
  beforeEach(() => {
    mockProfile = createMockProfile({
      hasCreatedFirstHabit: false,
      hasLoggedFirstHabit: false,
      hasTriedAstra: false,
      hasCompletedOnboardingChecklist: false,
    })
    mockDismissed = false
    setDismissed.mockClear()
  })

  it('renders nothing while the profile is loading', () => {
    mockProfile = undefined
    const { container } = render(<SetupChecklistCard />)
    expect(container.innerHTML).toBe('')
  })

  it('renders nothing once the checklist is completed server-side', () => {
    mockProfile = createMockProfile({ hasCompletedOnboardingChecklist: true })
    const { container } = render(<SetupChecklistCard />)
    expect(container.innerHTML).toBe('')
  })

  it('renders nothing when dismissed', () => {
    mockDismissed = true
    const { container } = render(<SetupChecklistCard />)
    expect(container.innerHTML).toBe('')
  })

  it('reflects per-item completion and progress from the profile flags', () => {
    mockProfile = createMockProfile({
      hasCreatedFirstHabit: true,
      hasLoggedFirstHabit: false,
      hasTriedAstra: false,
      hasCompletedOnboardingChecklist: false,
    })
    render(<SetupChecklistCard />)

    expect(screen.getByTestId('setup-checklist-progress').textContent).toBe(
      'today.setupChecklist.progress({"done":1,"total":3})',
    )
    const items = screen.getAllByRole('listitem')
    expect(items).toHaveLength(3)
    expect(items[0]?.getAttribute('data-done')).toBe('true')
    expect(items[1]?.getAttribute('data-done')).toBe('false')
    expect(items[2]?.getAttribute('data-done')).toBe('false')
  })

  it('shows the completion message when all three signals are done', () => {
    mockProfile = createMockProfile({
      hasCreatedFirstHabit: true,
      hasLoggedFirstHabit: true,
      hasTriedAstra: true,
      hasCompletedOnboardingChecklist: false,
    })
    render(<SetupChecklistCard />)

    expect(screen.getByText('today.setupChecklist.complete')).toBeTruthy()
    expect(screen.getByTestId('setup-checklist-progress').textContent).toBe(
      'today.setupChecklist.progress({"done":3,"total":3})',
    )
  })

  it('persists dismissal when the close button is clicked', () => {
    render(<SetupChecklistCard />)
    fireEvent.click(screen.getByLabelText('today.setupChecklist.dismiss'))
    expect(setDismissed).toHaveBeenCalledWith(true)
  })
})
