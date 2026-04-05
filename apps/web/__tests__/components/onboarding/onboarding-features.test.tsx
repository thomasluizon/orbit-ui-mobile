import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

import { OnboardingFeatures } from '@/components/onboarding/onboarding-features'

describe('OnboardingFeatures', () => {
  it('renders the title and subtitle', () => {
    render(<OnboardingFeatures />)
    expect(screen.getByText('onboarding.flow.features.title')).toBeInTheDocument()
    expect(screen.getByText('onboarding.flow.features.subtitle')).toBeInTheDocument()
  })

  it('renders all four feature items', () => {
    render(<OnboardingFeatures />)
    expect(screen.getByText('onboarding.flow.features.chat.title')).toBeInTheDocument()
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
