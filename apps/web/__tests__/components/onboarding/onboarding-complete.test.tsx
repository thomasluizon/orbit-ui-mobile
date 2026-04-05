import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) => {
    if (params) return `${key}(${JSON.stringify(params)})`
    return key
  },
  useLocale: () => 'en',
}))

vi.mock('@/hooks/use-profile', () => ({
  useProfile: () => ({
    profile: {
      isTrialActive: false,
      trialEndsAt: null,
    },
  }),
  useHasProAccess: () => false,
}))

import { OnboardingComplete } from '@/components/onboarding/onboarding-complete'

describe('OnboardingComplete', () => {
  const defaultProps = {
    createdHabit: 'Exercise',
    createdGoal: true,
    onFinish: vi.fn(),
  }

  beforeEach(() => {
    defaultProps.onFinish.mockClear()
  })

  it('renders the completion title', () => {
    render(<OnboardingComplete {...defaultProps} />)
    expect(screen.getByText('onboarding.flow.complete.title')).toBeInTheDocument()
    expect(screen.getByText('onboarding.flow.complete.subtitle')).toBeInTheDocument()
  })

  it('shows recap items for created habit and goal', () => {
    render(<OnboardingComplete {...defaultProps} />)
    expect(screen.getByText('onboarding.flow.complete.recap.habit')).toBeInTheDocument()
    expect(screen.getByText('onboarding.flow.complete.recap.goal')).toBeInTheDocument()
  })

  it('hides goal recap when no goal created', () => {
    render(<OnboardingComplete {...defaultProps} createdGoal={false} />)
    expect(screen.queryByText('onboarding.flow.complete.recap.goal')).not.toBeInTheDocument()
  })

  it('calls onFinish when CTA clicked', () => {
    render(<OnboardingComplete {...defaultProps} />)
    fireEvent.click(screen.getByText('onboarding.flow.complete.start'))
    expect(defaultProps.onFinish).toHaveBeenCalled()
  })
})
