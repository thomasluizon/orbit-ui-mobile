import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

const mockProfile = { isTrialActive: false, hasProAccess: false }

vi.mock('@/hooks/use-profile', () => ({
  useProfile: () => ({ profile: mockProfile }),
}))

import { ProBadge } from '@/components/ui/pro-badge'

describe('ProBadge', () => {
  it('renders nothing when user has no pro access and no trial', () => {
    mockProfile.isTrialActive = false
    mockProfile.hasProAccess = false
    const { container } = render(<ProBadge />)
    expect(container.innerHTML).toBe('')
  })

  it('renders trial badge when trial is active', () => {
    mockProfile.isTrialActive = true
    mockProfile.hasProAccess = false
    render(<ProBadge />)
    expect(screen.getByText('trial.proBadge')).toBeInTheDocument()
  })

  it('renders pro badge when user has pro access', () => {
    mockProfile.isTrialActive = false
    mockProfile.hasProAccess = true
    render(<ProBadge />)
    expect(screen.getByText('common.proBadge')).toBeInTheDocument()
  })

  it('renders trial badge when both trial and pro are active', () => {
    mockProfile.isTrialActive = true
    mockProfile.hasProAccess = true
    render(<ProBadge />)
    // Trial takes priority in the condition check
    expect(screen.getByText('trial.proBadge')).toBeInTheDocument()
  })

  it('has shimmer CSS class', () => {
    mockProfile.isTrialActive = false
    mockProfile.hasProAccess = true
    render(<ProBadge />)
    const badge = screen.getByText('common.proBadge')
    expect(badge.className).toContain('pro-badge-shimmer')
  })
})
