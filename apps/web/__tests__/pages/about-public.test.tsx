import { render, screen } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'

import AboutPage from '@/app/(app)/about/page'
import AppLayout from '@/app/(app)/layout'
import { useAuthStore } from '@/stores/auth-store'

const mocks = vi.hoisted(() => ({ fetch: vi.fn(), push: vi.fn() }))

vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: () => (key: string) => key,
}))

vi.mock('next/navigation', () => ({
  usePathname: () => '/about',
  useRouter: () => ({ prefetch: vi.fn(), push: mocks.push }),
  useSearchParams: () => new URLSearchParams(),
}))

vi.mock('next/dynamic', () => ({ default: () => () => null }))

vi.mock('@/hooks/use-go-back-or-fallback', () => ({
  useGoBackOrFallback: () => vi.fn(),
}))

vi.mock('@/components/ui/app-bar', () => ({ AppBar: () => null }))
vi.mock('@/components/onboarding/feature-guide-drawer', () => ({
  FeatureGuideDrawer: () => null,
}))

beforeEach(() => {
  mocks.fetch.mockReset()
  mocks.push.mockReset()
  vi.stubGlobal('fetch', mocks.fetch)
  useAuthStore.setState({ isAuthenticated: false, user: null, expiresAt: null })
})

it('renders public About without a profile provider or request', () => {
  expect(() => render(<AppLayout><AboutPage /></AppLayout>)).not.toThrow()

  expect(screen.getByText('common.appName')).toBeInTheDocument()
  expect(screen.queryByTestId('about-fact-account')).not.toBeInTheDocument()
  expect(mocks.fetch).not.toHaveBeenCalled()
})
