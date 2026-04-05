import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock('next/link', () => ({
  default: ({ children, ...props }: { children: React.ReactNode; href: string }) => (
    <a {...props}>{children}</a>
  ),
}))

vi.mock('dompurify', () => ({
  default: { sanitize: (html: string) => html },
}))

vi.mock('@/lib/plural', () => ({
  plural: (text: string) => text,
}))

let mockTrialExpired = false

vi.mock('@/hooks/use-profile', () => ({
  useTrialExpired: () => mockTrialExpired,
}))

vi.mock('@/components/ui/app-overlay', () => ({
  AppOverlay: ({ open, children, titleContent, footer }: {
    open: boolean
    children: React.ReactNode
    titleContent?: React.ReactNode
    footer?: React.ReactNode
  }) => {
    if (!open) return null
    return (
      <div data-testid="overlay">
        {titleContent}
        {children}
        {footer}
      </div>
    )
  },
}))

import { TrialExpiredModal } from '@/components/ui/trial-expired-modal'

describe('TrialExpiredModal', () => {
  beforeEach(() => {
    mockTrialExpired = false
    localStorage.clear()
  })

  it('renders nothing when trial is not expired', () => {
    mockTrialExpired = false
    const { container } = render(<TrialExpiredModal />)
    expect(container.innerHTML).toBe('')
  })

  it('renders nothing when already dismissed via localStorage', () => {
    mockTrialExpired = true
    localStorage.setItem('orbit_trial_expired_seen', '1')
    const { container } = render(<TrialExpiredModal />)
    expect(container.innerHTML).toBe('')
  })
})
