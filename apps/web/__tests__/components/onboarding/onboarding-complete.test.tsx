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
      hasProAccess: true,
      isTrialActive: false,
      trialEndsAt: null,
    },
  }),
  useHasProAccess: () => false,
}))

vi.mock('@/components/onboarding/onboarding-actions-context', () => ({
  useOnboardingIsLive: () => true,
}))

import { OnboardingComplete } from '@/components/onboarding/onboarding-complete'

describe('OnboardingComplete', () => {
  const defaultProps = {
    createdHabit: 'Exercise',
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

  it('shows the created habit recap', () => {
    render(<OnboardingComplete {...defaultProps} />)
    expect(screen.getByText('onboarding.flow.complete.recap.habit')).toBeInTheDocument()
  })

  it('does not claim a Pro account personalized a theme', () => {
    render(<OnboardingComplete {...defaultProps} />)
    expect(screen.queryByText('onboarding.flow.complete.recap.theme')).not.toBeInTheDocument()
  })

  it('calls onFinish when CTA clicked', () => {
    render(<OnboardingComplete {...defaultProps} />)
    fireEvent.click(screen.getByText('onboarding.flow.complete.start'))
    expect(defaultProps.onFinish).toHaveBeenCalled()
  })
})
