import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) => {
    if (params) return `${key}:${JSON.stringify(params)}`
    return key
  },
}))

let mockProfile: { isTrialActive: boolean; hasProAccess: boolean } = {
  isTrialActive: true,
  hasProAccess: true,
}
let mockTrialDaysLeft = 5

vi.mock('@/hooks/use-profile', () => ({
  useProfile: () => ({ profile: mockProfile }),
  useTrialDaysLeft: () => mockTrialDaysLeft,
}))

vi.mock('@/lib/plural', () => ({
  plural: (text: string) => text,
}))

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string }) => (
    <a href={href} {...props}>{children}</a>
  ),
}))

import { TrialBanner } from '@/components/ui/trial-banner'

describe('TrialBanner', () => {
  it('renders nothing for a Pro account outside a trial', () => {
    mockProfile = { isTrialActive: false, hasProAccess: true }
    const { container } = render(<TrialBanner />)
    expect(container.innerHTML).toBe('')
  })

  it('renders the free-plan variant outside a trial', () => {
    mockProfile = { isTrialActive: false, hasProAccess: false }
    render(<TrialBanner />)
    expect(screen.getByText('trial.banner.freeLine')).toBeInTheDocument()
  })

  it('renders banner when trial is active', () => {
    mockProfile = { isTrialActive: true, hasProAccess: true }
    mockTrialDaysLeft = 5
    render(<TrialBanner />)
    expect(document.querySelector('[data-trial-line]')).toBeInTheDocument()
  })

  it('shows upgrade link', () => {
    mockProfile = { isTrialActive: true, hasProAccess: true }
    render(<TrialBanner />)
    const link = screen.getByText('trial.banner.upgrade')
    expect(link).toBeInTheDocument()
    expect(link.closest('a')).toHaveAttribute('href', '/upgrade')
  })

  it('shows last day message when 0 days left', () => {
    mockProfile = { isTrialActive: true, hasProAccess: true }
    mockTrialDaysLeft = 0
    render(<TrialBanner />)
    expect(screen.getByText('trial.banner.lastDay')).toBeInTheDocument()
  })

  it('uses the singular day-count variant when 1 day is left', () => {
    mockProfile = { isTrialActive: true, hasProAccess: true }
    mockTrialDaysLeft = 1
    render(<TrialBanner />)
    expect(document.body.textContent).toContain('trial.banner.daysLeft')
    expect(screen.queryByText('trial.banner.lastDay')).not.toBeInTheDocument()
  })

  it('shows the plural days-left count', () => {
    mockProfile = { isTrialActive: true, hasProAccess: true }
    mockTrialDaysLeft = 5
    render(<TrialBanner />)
    expect(document.body.textContent).toContain('trial.banner.daysLeft')
  })

  it('renders as a quiet, non-dismissible line', () => {
    mockProfile = { isTrialActive: true, hasProAccess: true }
    render(<TrialBanner />)
    const line = document.querySelector('[data-trial-line]')
    expect(line).toHaveClass('font-mono', 'text-xs', 'text-[var(--fg-3)]')
    expect(screen.queryByLabelText('common.dismiss')).not.toBeInTheDocument()
  })
})
