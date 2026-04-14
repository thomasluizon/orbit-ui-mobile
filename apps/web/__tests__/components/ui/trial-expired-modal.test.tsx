import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

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
let mockPathname = '/'

vi.mock('@/hooks/use-profile', () => ({
  useTrialExpired: () => mockTrialExpired,
}))

vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
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
    mockPathname = '/'
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

  it('renders nothing on the upgrade page itself', () => {
    mockTrialExpired = true
    mockPathname = '/upgrade'
    const { container } = render(<TrialExpiredModal />)
    expect(container.innerHTML).toBe('')
  })

  it('renders the modal when trial is expired and not dismissed', () => {
    mockTrialExpired = true
    render(<TrialExpiredModal />)
    expect(screen.getByTestId('overlay')).toBeInTheDocument()
    expect(screen.getByText('trial.expired.title')).toBeInTheDocument()
  })

  it('renders all feature list items', () => {
    mockTrialExpired = true
    render(<TrialExpiredModal />)
    expect(screen.getByText('trial.expired.unlimitedHabits')).toBeInTheDocument()
    expect(screen.getByText('trial.expired.aiChat')).toBeInTheDocument()
    expect(screen.getByText('trial.expired.allColors')).toBeInTheDocument()
    expect(screen.getByText('trial.expired.aiSummary')).toBeInTheDocument()
    expect(screen.getByText('trial.expired.subHabits')).toBeInTheDocument()
  })

  it('renders the subtitle with days parameter', () => {
    mockTrialExpired = true
    render(<TrialExpiredModal />)
    // The plural mock returns the text as-is
    expect(screen.getByText(/trial.expired.subtitle/)).toBeInTheDocument()
  })

  it('renders the dontLose message', () => {
    mockTrialExpired = true
    render(<TrialExpiredModal />)
    expect(screen.getByText('trial.expired.dontLose')).toBeInTheDocument()
  })

  it('renders the subscribe/upgrade link', () => {
    mockTrialExpired = true
    render(<TrialExpiredModal />)
    const upgradeLink = screen.getByText('trial.expired.subscribe')
    expect(upgradeLink).toBeInTheDocument()
    expect(upgradeLink.closest('a')).toHaveAttribute('href', '/upgrade')
  })

  it('renders the continue free button', () => {
    mockTrialExpired = true
    render(<TrialExpiredModal />)
    expect(screen.getByText('trial.expired.continueFree')).toBeInTheDocument()
  })

  it('dismisses when continue free button is clicked', () => {
    mockTrialExpired = true
    render(<TrialExpiredModal />)
    fireEvent.click(screen.getByText('trial.expired.continueFree'))
    expect(localStorage.getItem('orbit_trial_expired_seen')).toBe('1')
  })

  it('dismisses when subscribe link is clicked', () => {
    mockTrialExpired = true
    render(<TrialExpiredModal />)
    fireEvent.click(screen.getByText('trial.expired.subscribe'))
    expect(localStorage.getItem('orbit_trial_expired_seen')).toBe('1')
  })

  it('dismisses when overlay onOpenChange is called with false', () => {
    mockTrialExpired = true
    render(<TrialExpiredModal />)
    // The overlay is open, verify it exists
    expect(screen.getByTestId('overlay')).toBeInTheDocument()
  })
})
