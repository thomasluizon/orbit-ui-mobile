import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import {
  OnboardingActionsProvider,
  type OnboardingActions,
} from '@/components/onboarding/onboarding-actions-context'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

import { OnboardingCompleteHabit } from '@/components/onboarding/onboarding-complete-habit'

const logHabit = vi.fn().mockResolvedValue(undefined)
const stubActions: OnboardingActions = {
  createHabit: vi.fn().mockResolvedValue({ id: 'h1', title: 'x' }),
  logHabit,
  createGoal: vi.fn().mockResolvedValue(undefined),
  setWeekStartDay: vi.fn().mockResolvedValue(undefined),
  setColorScheme: vi.fn().mockResolvedValue(undefined),
  finishOnboarding: vi.fn().mockResolvedValue(undefined),
}

function renderStep(props: {
  habitId: string | null
  habitTitle: string
  onCompleted: () => void
}) {
  return render(
    <OnboardingActionsProvider actions={stubActions} hasProAccess={false} isLive={false}>
      <OnboardingCompleteHabit {...props} />
    </OnboardingActionsProvider>,
  )
}

describe('OnboardingCompleteHabit', () => {
  const defaultProps = {
    habitId: 'h1',
    habitTitle: 'Drink Water',
    onCompleted: vi.fn(),
  }

  beforeEach(() => {
    logHabit.mockClear()
    defaultProps.onCompleted.mockClear()
  })

  it('renders the title and instruction', () => {
    renderStep(defaultProps)
    expect(screen.getByText('onboarding.flow.completeHabit.title')).toBeInTheDocument()
    expect(screen.getByText('onboarding.flow.completeHabit.instruction')).toBeInTheDocument()
  })

  it('renders the habit title', () => {
    renderStep(defaultProps)
    expect(screen.getByText('Drink Water')).toBeInTheDocument()
  })

  it('logs the habit through the action surface when the completion dot is clicked', () => {
    renderStep(defaultProps)
    const completeButton = screen.getByRole('button', {
      name: 'onboarding.flow.completeHabit.tapHint',
    })
    fireEvent.click(completeButton)
    expect(logHabit).toHaveBeenCalledWith('h1')
  })

  it('does nothing when habitId is null', () => {
    renderStep({ ...defaultProps, habitId: null })
    const buttons = screen.getAllByRole('button')
    buttons.forEach((btn) => fireEvent.click(btn))
    expect(logHabit).not.toHaveBeenCalled()
  })
})
