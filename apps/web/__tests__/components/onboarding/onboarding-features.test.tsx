import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

import { OnboardingFeatures } from '@/components/onboarding/onboarding-features'

describe('OnboardingFeatures', () => {
  it('renders the title', () => {
    render(<OnboardingFeatures />)
    expect(screen.getByText('onboarding.flow.features.title')).toBeInTheDocument()
  })

  it('renders all five feature items including sub-habits', () => {
    render(<OnboardingFeatures />)
    expect(screen.getByText('onboarding.flow.features.chat.title')).toBeInTheDocument()
    expect(screen.getByText('onboarding.flow.features.subHabits.title')).toBeInTheDocument()
    expect(screen.getByText('onboarding.flow.features.calendar.title')).toBeInTheDocument()
    expect(screen.getByText('onboarding.flow.features.achievements.title')).toBeInTheDocument()
    expect(screen.getByText('onboarding.flow.features.notifications.title')).toBeInTheDocument()
  })

  it('renders feature descriptions', () => {
    render(<OnboardingFeatures />)
    expect(screen.getByText('onboarding.flow.features.chat.desc')).toBeInTheDocument()
    expect(screen.getByText('onboarding.flow.features.calendar.desc')).toBeInTheDocument()
  })
})
