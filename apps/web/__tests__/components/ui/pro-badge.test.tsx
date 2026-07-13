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

  it.each([
    { name: 'renders trial badge when trial is active', isTrialActive: true, hasProAccess: false, text: 'trial.proBadge' },
    { name: 'renders pro badge when user has pro access', isTrialActive: false, hasProAccess: true, text: 'common.proBadge' },
    { name: 'renders trial badge when both trial and pro are active', isTrialActive: true, hasProAccess: true, text: 'trial.proBadge' },
  ])('$name', ({ isTrialActive, hasProAccess, text }) => {
    mockProfile.isTrialActive = isTrialActive
    mockProfile.hasProAccess = hasProAccess
    render(<ProBadge />)
    expect(screen.getByText(text)).toBeInTheDocument()
  })
})
