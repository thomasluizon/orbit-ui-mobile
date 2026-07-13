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
  it.each([
    { name: 'renders the card', isLoading: false, text: 'referral.card.title' },
    { name: 'shows hint text when loading', isLoading: true, text: 'referral.card.hint' },
    { name: 'shows hint when not loading and no stats', isLoading: false, text: 'referral.card.hint' },
  ])('$name', ({ isLoading, text }) => {
    mockIsLoading = isLoading
    mockStats = null
    render(<ReferralCard onOpen={vi.fn()} />)
    expect(screen.getByText(text)).toBeInTheDocument()
  })

  it('shows progress when stats are loaded', () => {
    mockIsLoading = false
    mockStats = { successfulReferrals: 3, maxReferrals: 10 }
    render(<ReferralCard onOpen={vi.fn()} />)
    expect(document.body.textContent).toContain('referral.card.progress')
  })

  it('calls onOpen when clicked', () => {
    mockIsLoading = false
    mockStats = null
    const onOpen = vi.fn()
    render(<ReferralCard onOpen={onOpen} />)
    fireEvent.click(screen.getByText('referral.card.title'))
    expect(onOpen).toHaveBeenCalled()
  })

  it('renders chevron icon', () => {
    mockIsLoading = false
    mockStats = null
    const { container } = render(<ReferralCard onOpen={vi.fn()} />)
    const svg = container.querySelector('svg')
    expect(svg).toBeInTheDocument()
  })

  it('renders a dismiss control and calls onDismiss without opening', () => {
    mockIsLoading = false
    mockStats = null
    const onOpen = vi.fn()
    const onDismiss = vi.fn()
    render(<ReferralCard onOpen={onOpen} onDismiss={onDismiss} />)

    const dismiss = screen.getByRole('button', { name: 'common.dismiss' })
    fireEvent.click(dismiss)

    expect(onDismiss).toHaveBeenCalledTimes(1)
    expect(onOpen).not.toHaveBeenCalled()
  })
})
