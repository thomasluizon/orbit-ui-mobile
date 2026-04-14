import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string; [key: string]: unknown }) => (
    <a href={href} {...props}>{children}</a>
  ),
}))

vi.mock('@/hooks/use-go-back-or-fallback', () => ({
  useGoBackOrFallback: () => vi.fn(),
}))

vi.mock('dompurify', () => ({
  default: {
    sanitize: (value: string) => value,
  },
}))

let mockIsOnline = false

vi.mock('@/hooks/use-offline', () => ({
  useOffline: () => ({ isOnline: mockIsOnline }),
}))

vi.mock('@/hooks/use-profile', () => ({
  useProfile: () => ({ profile: { hasProAccess: true, isTrialActive: false, isLifetimePro: false } }),
  useHasProAccess: () => true,
  useIsYearlyPro: () => true,
}))

vi.mock('@/hooks/use-retrospective', () => ({
  useRetrospective: () => ({
    retrospective: null,
    setRetrospective: vi.fn(),
    isLoading: false,
    error: null,
    setError: vi.fn(),
    fromCache: false,
    period: 'week',
    setPeriod: vi.fn(),
    generate: vi.fn(),
  }),
}))

vi.mock('@orbit/shared/utils', () => ({
  getErrorMessage: (_err: unknown, fallback: string) => fallback,
}))

vi.mock('@orbit/shared/api', () => ({
  API: { subscription: { portal: '/api/subscription/portal' } },
}))

vi.mock('@/components/ui/offline-unavailable-state', () => ({
  OfflineUnavailableState: ({ title, description }: { title: string; description: string }) => (
    <div role="alert">
      <span>{title}</span>
      <span>{description}</span>
    </div>
  ),
}))

import RetrospectivePage from '@/app/(app)/retrospective/page'

describe('RetrospectivePage', () => {
  beforeEach(() => {
    mockIsOnline = false
    vi.stubGlobal('fetch', vi.fn())
  })

  it('shows an offline state and disables generation when offline', () => {
    render(<RetrospectivePage />)

    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'retrospective.generate' })).toBeDisabled()
  })
})
