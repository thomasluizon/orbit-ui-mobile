import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) => {
    if (params) return `${key}:${JSON.stringify(params)}`
    return key
  },
}))

let mockStats: { successfulReferrals: number; maxReferrals: number } | null = null
let mockIsLoading = false

vi.mock('@/hooks/use-referral', () => ({
  useReferral: () => ({
    stats: mockStats,
    isLoading: mockIsLoading,
  }),
}))

import { ReferralCard } from '@/components/referral/referral-card'

describe('ReferralCard', () => {
  it('renders the card', () => {
    mockIsLoading = false
    mockStats = null
    render(<ReferralCard onOpen={vi.fn()} />)
    expect(screen.getByText('referral.card.title')).toBeInTheDocument()
  })

  it('shows hint text when loading', () => {
    mockIsLoading = true
    mockStats = null
    render(<ReferralCard onOpen={vi.fn()} />)
    expect(screen.getByText('referral.card.hint')).toBeInTheDocument()
  })

  it('shows progress when stats are loaded', () => {
    mockIsLoading = false
    mockStats = { successfulReferrals: 3, maxReferrals: 10 }
    render(<ReferralCard onOpen={vi.fn()} />)
    expect(document.body.textContent).toContain('referral.card.progress')
  })

  it('shows hint when not loading and no stats', () => {
    mockIsLoading = false
    mockStats = null
    render(<ReferralCard onOpen={vi.fn()} />)
    expect(screen.getByText('referral.card.hint')).toBeInTheDocument()
  })

  it('calls onOpen when clicked', () => {
    mockIsLoading = false
    mockStats = null
    const onOpen = vi.fn()
    render(<ReferralCard onOpen={onOpen} />)
    fireEvent.click(screen.getByText('referral.card.title'))
    expect(onOpen).toHaveBeenCalled()
  })

  it('renders Gift icon', () => {
    mockIsLoading = false
    mockStats = null
    const { container } = render(<ReferralCard onOpen={vi.fn()} />)
    const svg = container.querySelector('svg')
    expect(svg).toBeInTheDocument()
  })

  it('renders chevron icon', () => {
    mockIsLoading = false
    mockStats = null
    const { container } = render(<ReferralCard onOpen={vi.fn()} />)
    const svgs = container.querySelectorAll('svg')
    expect(svgs.length).toBeGreaterThanOrEqual(2)
  })
})
