import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import AboutPage from '@/app/(app)/about/page'
import { useAuthStore } from '@/stores/auth-store'

const mocks = vi.hoisted(() => ({
  email: 'profile-account-with-a-long-address@example.com',
  guideOpen: vi.fn(),
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
  FeatureGuideDrawer: ({ open }: { open: boolean }) => {
    mocks.guideOpen(open)
    return null
  },
}))

describe('AboutPage', () => {
  beforeEach(() => {
    mocks.guideOpen.mockClear()
    mocks.push.mockClear()
    useAuthStore.setState({ isAuthenticated: true })
  })

  it('renders the About identity, real facts, and four destinations in order', () => {
    const { container } = render(<AboutPage />)

    expect(container.querySelector('[data-asset="orbit-mark-accent"]')).toBeInTheDocument()
    expect(screen.getByText('common.appName')).toBeInTheDocument()
    expect(screen.getByText('about.tagline')).toBeInTheDocument()
    expect(screen.getByText('0.0.1')).toBeInTheDocument()
    expect(screen.getByText(mocks.email)).toBeInTheDocument()
    expect(screen.getByTestId('about-credit')).toHaveStyle({ color: 'var(--fg-3)' })

    const destinations = within(screen.getByTestId('about-destinations'))
    const destinationLabels = destinations
      .getAllByRole('button')
      .map((row) => row.getAttribute('aria-label'))
    expect(destinationLabels).toEqual([
      'onboarding.featureGuide.openButton',
      'profile.support.title',
      'terms.title',
      'privacy.title',
    ])

    fireEvent.click(destinations.getByRole('button', { name: 'onboarding.featureGuide.openButton' }))
    expect(mocks.guideOpen).toHaveBeenLastCalledWith(true)

    fireEvent.click(destinations.getByRole('button', { name: 'profile.support.title' }))
    fireEvent.click(destinations.getByRole('button', { name: 'terms.title' }))
    fireEvent.click(destinations.getByRole('button', { name: 'privacy.title' }))
    expect(mocks.push.mock.calls).toEqual([['/support'], ['/terms'], ['/privacy']])
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
