import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import {
  OnboardingActionsProvider,
  type OnboardingActions,
} from '@/components/onboarding/onboarding-actions-context'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock('@/hooks/use-color-scheme', () => ({
  useColorScheme: () => ({
    currentScheme: 'violet',
    applyScheme: vi.fn(),
  }),
}))

import { OnboardingWelcome } from '@/components/onboarding/onboarding-welcome'

const stubActions: OnboardingActions = {
  createHabit: vi.fn().mockResolvedValue({ id: '0', title: 'x' }),
  createHabitsBulk: vi.fn().mockResolvedValue(undefined),
  logHabit: vi.fn().mockResolvedValue(undefined),
  createGoal: vi.fn().mockResolvedValue(undefined),
  setWeekStartDay: vi.fn().mockResolvedValue(undefined),
  setColorScheme: vi.fn().mockResolvedValue(undefined),
  finishOnboarding: vi.fn().mockResolvedValue(undefined),
}

function renderWelcome(hasProAccess: boolean) {
  return render(
    <OnboardingActionsProvider actions={stubActions} hasProAccess={hasProAccess} isLive={false}>
      <OnboardingWelcome hasProAccess={hasProAccess} />
    </OnboardingActionsProvider>,
  )
}

describe('OnboardingWelcome', () => {
  it('renders welcome title heading', () => {
    renderWelcome(false)
    expect(screen.getByText('onboarding.flow.welcome.title')).toBeInTheDocument()
  })

  it('renders the week start day section label', () => {
    renderWelcome(false)
    expect(screen.getByText('onboarding.flow.welcome.weekStart')).toBeInTheDocument()
  })

  it('renders exactly the monday and sunday week-start choices', () => {
    renderWelcome(false)
    expect(
      screen.getByRole('button', { name: 'settings.weekStartDay.monday' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'settings.weekStartDay.sunday' }),
    ).toBeInTheDocument()
  })

  it('does not show color scheme for non-pro users', () => {
    renderWelcome(false)
    expect(screen.queryByText('onboarding.flow.welcome.colorScheme')).not.toBeInTheDocument()
  })

  it('shows color scheme for pro users', () => {
    renderWelcome(true)
    expect(screen.getByText('onboarding.flow.welcome.colorScheme')).toBeInTheDocument()
  })
})
