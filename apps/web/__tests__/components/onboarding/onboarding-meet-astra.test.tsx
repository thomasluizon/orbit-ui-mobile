import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

import { OnboardingMeetAstra } from '@/components/onboarding/onboarding-meet-astra'

describe('OnboardingMeetAstra', () => {
  it('renders Astra avatar with an accessible label', () => {
    render(<OnboardingMeetAstra />)
    expect(screen.getByRole('img', { name: 'chat.astraAvatarLabel' })).toBeInTheDocument()
  })

  it('renders the orbital mark (svg) for both the hero and the bubble', () => {
    const { container } = render(<OnboardingMeetAstra />)
    expect(container.querySelectorAll('svg').length).toBeGreaterThanOrEqual(2)
  })

  it('shows the intro copy', () => {
    render(<OnboardingMeetAstra />)
    expect(screen.getByText('onboarding.flow.meetAstra.title')).toBeInTheDocument()
    expect(screen.getByText('onboarding.flow.meetAstra.subtitle')).toBeInTheDocument()
  })
})
