import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import AboutPage from '@/app/(app)/about/page'
import ptBR from '@orbit/shared/i18n/pt-BR.json'

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
}))

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, string>) => {
    const message = key.split('.').reduce<unknown>(
      (value, part) => (value as Record<string, unknown>)[part],
      ptBR,
    ) as string
    return message.replace(/\{(\w+)\}/g, (_, name: string) => params?.[name] ?? '')
  },
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push }),
}))

vi.mock('@/hooks/use-go-back-or-fallback', () => ({
  useGoBackOrFallback: () => vi.fn(),
}))

vi.mock('@/components/ui/app-bar', () => ({ AppBar: () => null }))
vi.mock('@/components/onboarding/feature-guide-drawer', () => ({
  FeatureGuideDrawer: ({ open }: { open: boolean }) =>
    open ? <section role="dialog" aria-label={ptBR.onboarding.featureGuide.openButton} /> : null,
}))

describe('AboutPage', () => {
  beforeEach(() => {
    mocks.push.mockClear()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('shows the short commit of the served build as the version', () => {
    vi.stubEnv('NEXT_PUBLIC_WEB_COMMIT_SHA', '3f9c2ab5d1e0')

    render(<AboutPage />)

    expect(screen.getByText('Versão 3f9c2ab')).toBeInTheDocument()
    expect(screen.queryByText(/0\.0\.1/)).not.toBeInTheDocument()
  })

  it('renders no version row when the build carries no commit', () => {
    vi.stubEnv('NEXT_PUBLIC_WEB_COMMIT_SHA', undefined)

    render(<AboutPage />)

    expect(screen.getByText('Orbit')).toBeInTheDocument()
    expect(screen.queryByText(/Versão/)).not.toBeInTheDocument()
  })

  it('opens the feature guide and routes the other destinations', () => {
    render(<AboutPage />)

    fireEvent.click(screen.getByRole('button', { name: ptBR.onboarding.featureGuide.openButton }))
    expect(
      screen.getByRole('dialog', { name: ptBR.onboarding.featureGuide.openButton }),
    ).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: ptBR.profile.support.title }))
    fireEvent.click(screen.getByRole('button', { name: ptBR.terms.title }))
    fireEvent.click(screen.getByRole('button', { name: ptBR.privacy.title }))
    expect(mocks.push.mock.calls).toEqual([['/support'], ['/terms'], ['/privacy']])
  })
})
