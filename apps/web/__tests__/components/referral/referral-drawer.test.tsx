import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) => {
    if (params) return `${key}:${JSON.stringify(params)}`
    return key
  },
}))

vi.mock('dompurify', () => ({
  default: { sanitize: (html: string) => html },
}))

let mockStats: { successfulReferrals: number; maxReferrals: number; pendingReferrals: number; discountPercent: number } | null = null
let mockReferralUrl = 'https://app.useorbit.org/ref/abc123'
let mockIsLoading = false
let mockIsError = false
let mockError: { message: string } | null = null

vi.mock('@/hooks/use-referral', () => ({
  useReferral: () => ({
    stats: mockStats,
    referralUrl: mockReferralUrl,
    isLoading: mockIsLoading,
    isError: mockIsError,
    error: mockError,
  }),
}))

import { ReferralDrawer } from '@/components/referral/referral-drawer'

describe('ReferralDrawer', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    mockStats = null
    mockIsLoading = false
    mockIsError = false
    mockError = null
  })

  it('renders nothing when closed', () => {
    const { container } = render(
      <ReferralDrawer open={false} onOpenChange={vi.fn()} />,
    )
    expect(container.innerHTML).toBe('')
  })

  it('renders title when open', () => {
    render(<ReferralDrawer open={true} onOpenChange={vi.fn()} />)
    expect(screen.getByText('referral.drawer.title')).toBeInTheDocument()
  })

  it('shows loading state', () => {
    mockIsLoading = true
    render(<ReferralDrawer open={true} onOpenChange={vi.fn()} />)
    const pulseElements = document.querySelectorAll('.animate-pulse')
    expect(pulseElements.length).toBeGreaterThan(0)
  })

  it('shows error state', () => {
    mockIsError = true
    mockError = { message: 'Failed to load' }
    render(<ReferralDrawer open={true} onOpenChange={vi.fn()} />)
    expect(screen.getByText('Failed to load')).toBeInTheDocument()
  })

  it('shows referral URL when loaded', () => {
    mockIsLoading = false
    mockIsError = false
    render(<ReferralDrawer open={true} onOpenChange={vi.fn()} />)
    expect(document.body.textContent).toContain('https://app.useorbit.org/ref/abc123')
  })

  it('shows copy button', () => {
    render(<ReferralDrawer open={true} onOpenChange={vi.fn()} />)
    expect(screen.getByText('referral.drawer.copy')).toBeInTheDocument()
  })

  it('shows stats when available', () => {
    mockStats = {
      successfulReferrals: 3,
      maxReferrals: 10,
      pendingReferrals: 2,
      discountPercent: 10,
    }
    render(<ReferralDrawer open={true} onOpenChange={vi.fn()} />)
    expect(screen.getByText('referral.drawer.completed')).toBeInTheDocument()
    expect(document.body.textContent).toContain('3 / 10')
  })

  it('shows pending referrals when > 0', () => {
    mockStats = {
      successfulReferrals: 1,
      maxReferrals: 10,
      pendingReferrals: 2,
      discountPercent: 10,
    }
    render(<ReferralDrawer open={true} onOpenChange={vi.fn()} />)
    expect(screen.getByText('referral.drawer.pending')).toBeInTheDocument()
    expect(document.body.textContent).toContain('2')
  })

  it('shows coupons earned when successful referrals > 0', () => {
    mockStats = {
      successfulReferrals: 3,
      maxReferrals: 10,
      pendingReferrals: 0,
      discountPercent: 10,
    }
    render(<ReferralDrawer open={true} onOpenChange={vi.fn()} />)
    expect(screen.getByText('referral.drawer.couponsEarned')).toBeInTheDocument()
  })

  it('shows how it works section', () => {
    render(<ReferralDrawer open={true} onOpenChange={vi.fn()} />)
    expect(screen.getByText('referral.drawer.howItWorks')).toBeInTheDocument()
  })

  it('shows disclaimer', () => {
    render(<ReferralDrawer open={true} onOpenChange={vi.fn()} />)
    expect(document.body.textContent).toContain('referral.drawer.disclaimer')
  })

  it('shows your link label', () => {
    render(<ReferralDrawer open={true} onOpenChange={vi.fn()} />)
    expect(screen.getByText('referral.drawer.yourLink')).toBeInTheDocument()
  })
})
