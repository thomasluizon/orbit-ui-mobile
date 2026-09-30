import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import AboutPage from '@/app/(app)/about/page'
import { useAuthStore } from '@/stores/auth-store'
import ptBR from '@orbit/shared/i18n/pt-BR.json'

const mocks = vi.hoisted(() => ({
  email: 'profile-account-with-a-long-address@example.com',
  push: vi.fn(),
}))

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key.split('.').reduce<unknown>(
    (value, part) => (value as Record<string, unknown>)[part],
    ptBR,
  ) as string,
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
vi.mock('@/components/ui/sheet', () => ({
  Sheet: ({ open, title, titleTranslate, children }: { open: boolean; title: string; titleTranslate?: 'no'; children: React.ReactNode }) =>
    open ? <section role="dialog" aria-label={title} translate={titleTranslate}>{children}</section> : null,
}))

describe('AboutPage', () => {
  beforeEach(() => {
    mocks.push.mockClear()
    vi.stubEnv('NEXT_PUBLIC_WEB_COMMIT_SHA', '3f9c2ab5d1e0')
    useAuthStore.setState({ isAuthenticated: true })
  })

  afterEach(() => { vi.unstubAllEnvs() })

  it('shows the short commit of the served build as the version', () => {
    render(<AboutPage />)
    expect(screen.getByTestId('about-fact-version-value')).toHaveTextContent('3f9c2ab')
    expect(screen.queryByText(/0\.0\.1/)).not.toBeInTheDocument()
  })

  it('renders no version row when the build carries no commit', () => {
    vi.stubEnv('NEXT_PUBLIC_WEB_COMMIT_SHA', undefined)
    render(<AboutPage />)
    expect(screen.getByText('Orbit')).toBeInTheDocument()
    expect(screen.queryByTestId('about-fact-version')).not.toBeInTheDocument()
  })

  it('renders the About identity, real facts, and four destinations in order', () => {
    const { container } = render(<AboutPage />)

    expect(container.querySelector('[data-asset="orbit-mark-accent"]')).toBeInTheDocument()
    expect(screen.getByText('Orbit')).toBeInTheDocument()
    expect(screen.getByText(ptBR.about.tagline)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Sobre' })).toBeInTheDocument()
    expect(screen.getByText('3f9c2ab')).toBeInTheDocument()
    expect(screen.getByText(mocks.email)).toBeInTheDocument()
    expect(screen.queryByTestId('about-credit')).not.toBeInTheDocument()

    const destinations = within(screen.getByTestId('about-destinations'))
    const destinationLabels = destinations
      .getAllByRole('button')
      .map((row) => row.getAttribute('aria-label'))
    expect(destinationLabels).toEqual([
      'Guia do Orbit',
      'Falar com o suporte',
      'Termos de uso',
      'Política de privacidade',
    ])

    fireEvent.click(destinations.getByRole('button', { name: 'Guia do Orbit' }))
    expect(screen.getByRole('dialog', { name: 'Guia do Orbit' })).toHaveAttribute('translate', 'no')
    expect(destinations.getByText('Guia do Orbit')).toHaveAttribute('translate', 'no')

    fireEvent.click(destinations.getByRole('button', { name: 'Falar com o suporte' }))
    fireEvent.click(destinations.getByRole('button', { name: 'Termos de uso' }))
    fireEvent.click(destinations.getByRole('button', { name: 'Política de privacidade' }))
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
