import { render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import AboutPage from '@/app/(app)/about/page'

const mocks = vi.hoisted(() => ({
  email: 'profile-account-with-a-long-address@example.com',
  push: vi.fn(),
}))

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push }),
}))

vi.mock('@/hooks/use-go-back-or-fallback', () => ({
  useGoBackOrFallback: () => vi.fn(),
}))

vi.mock('@/hooks/use-profile', () => ({
  useProfile: () => ({ profile: { email: mocks.email } }),
}))

vi.mock('@/components/ui/app-bar', () => ({ AppBar: () => null }))
vi.mock('@/components/onboarding/feature-guide-drawer', () => ({
  FeatureGuideDrawer: () => null,
}))

describe('AboutPage', () => {
  beforeEach(() => mocks.push.mockClear())

  it('renders the About identity, real facts, and four destinations in order', () => {
    const { container } = render(<AboutPage />)

    expect(container.querySelector('[data-asset="orbit-mark-accent"]')).toBeInTheDocument()
    expect(screen.getByText('common.appName')).toBeInTheDocument()
    expect(screen.getByText('about.tagline')).toBeInTheDocument()
    expect(screen.getByText('0.0.1')).toBeInTheDocument()
    expect(screen.getByText(mocks.email)).toBeInTheDocument()

    const destinations = within(screen.getByTestId('about-destinations'))
      .getAllByRole('button')
      .map((row) => row.getAttribute('aria-label'))
    expect(destinations).toEqual([
      'onboarding.featureGuide.openButton',
      'profile.support.title',
      'terms.title',
      'privacy.title',
    ])
  })

  it('keeps every 412px column shrinkable and lets fact values wrap', () => {
    render(<AboutPage />)

    expect(screen.getByTestId('about-content')).toHaveClass('min-w-0')
    expect(screen.getByTestId('about-identity')).toHaveClass('min-w-0')
    expect(screen.getByTestId('about-destinations')).toHaveClass('min-w-0')
    expect(screen.getByTestId('about-facts')).toHaveClass('min-w-0')

    for (const fact of ['version', 'account']) {
      const row = screen.getByTestId(`about-fact-${fact}`)
      const label = screen.getByTestId(`about-fact-${fact}-label`)
      const value = screen.getByTestId(`about-fact-${fact}-value`)
      expect(row).toHaveClass('flex-wrap', 'min-w-0')
      expect(label).toHaveStyle({ minWidth: '0px', flexGrow: '1', flexShrink: '1' })
      expect(value).toHaveStyle({ minWidth: '0px', flexShrink: '1', overflowWrap: 'anywhere' })
    }
  })
})
