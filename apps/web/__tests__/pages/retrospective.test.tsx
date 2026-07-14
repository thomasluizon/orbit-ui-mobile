import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string; [key: string]: unknown }) => (
    <a href={href} {...props}>{children}</a>
  ),
}))

const mockReplace = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    replace: mockReplace,
    push: vi.fn(),
    back: vi.fn(),
    refresh: vi.fn(),
  }),
}))

vi.mock('@/hooks/use-go-back-or-fallback', () => ({
  useGoBackOrFallback: () => vi.fn(),
}))

vi.mock('dompurify', () => ({
  default: { sanitize: (value: string) => value },
}))

let mockIsOnline = true
vi.mock('@/hooks/use-offline', () => ({
  useOffline: () => ({ isOnline: mockIsOnline }),
}))

let mockHasPro = true
let mockIsYearly = true
let mockProfile: Record<string, unknown> | null = { isTrialActive: false }
vi.mock('@/hooks/use-profile', () => ({
  useProfile: () => ({ profile: mockProfile }),
  useHasProAccess: () => mockHasPro,
  useIsYearlyPro: () => mockIsYearly,
}))

const retroState = {
  data: null as unknown,
  setData: vi.fn(),
  isLoading: false,
  error: null as string | null,
  setError: vi.fn(),
  noData: false,
  setNoData: vi.fn(),
  fromCache: false,
  period: 'week',
  setPeriod: vi.fn(),
  generate: vi.fn(),
}
vi.mock('@/hooks/use-retrospective', () => ({
  useRetrospective: () => retroState,
}))

const mockOpenCustomerPortal = vi.fn()
vi.mock('@/app/actions/subscription', () => ({
  openCustomerPortal: (...args: unknown[]) => mockOpenCustomerPortal(...args),
}))

vi.mock('@orbit/shared/utils', () => ({
  getFriendlyErrorMessage: () => 'retrospective.portalError',
}))

vi.mock('@/components/ui/offline-unavailable-state', () => ({
  OfflineUnavailableState: ({ title }: { title: string }) => <div role="alert">{title}</div>,
}))

import RetrospectivePage from '@/app/(app)/retrospective/page'

describe('RetrospectivePage', () => {
  beforeEach(() => {
    mockIsOnline = true
    mockHasPro = true
    mockIsYearly = true
    mockProfile = { isTrialActive: false }
    retroState.data = null
    retroState.error = null
    retroState.period = 'week'
    retroState.setPeriod.mockReset()
    retroState.setData.mockReset()
    retroState.setError.mockReset()
    retroState.setNoData.mockReset()
    retroState.generate.mockReset()
    mockReplace.mockReset()
    mockOpenCustomerPortal.mockReset()
    localStorage.clear()
  })

  afterEach(() => localStorage.clear())

  it('shows an offline state and disables generation when offline', () => {
    mockIsOnline = false
    render(<RetrospectivePage />)

    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'retrospective.generate' })).toBeDisabled()
  })

  it('redirects non-pro users to the upgrade screen once the profile is loaded', () => {
    mockHasPro = false
    mockIsYearly = false
    render(<RetrospectivePage />)

    expect(mockReplace).toHaveBeenCalledWith('/upgrade')
  })

  it('does not redirect while the profile is still loading', () => {
    mockHasPro = false
    mockProfile = null
    render(<RetrospectivePage />)

    expect(mockReplace).not.toHaveBeenCalled()
  })

  it('resets view state when a different period is selected', () => {
    render(<RetrospectivePage />)

    fireEvent.click(screen.getByRole('button', { name: 'retrospective.periods.month' }))

    expect(retroState.setPeriod).toHaveBeenCalledWith('month')
    expect(retroState.setData).toHaveBeenCalledWith(null)
    expect(retroState.setError).toHaveBeenCalledWith(null)
    expect(retroState.setNoData).toHaveBeenCalledWith(false)
  })

  it('triggers generation when online', () => {
    render(<RetrospectivePage />)

    fireEvent.click(screen.getByRole('button', { name: 'retrospective.generate' }))

    expect(retroState.generate).toHaveBeenCalledTimes(1)
  })

  it('persists generated data to the versioned cache key', () => {
    mockIsYearly = false
    retroState.data = { summary: 'A great week' }
    render(<RetrospectivePage />)

    const stored = Object.keys(localStorage).find((key) => key.endsWith('_v2'))
    expect(stored).toBeDefined()
    expect(JSON.parse(localStorage.getItem(stored as string) ?? '{}')).toMatchObject({
      summary: 'A great week',
    })
  })
})
