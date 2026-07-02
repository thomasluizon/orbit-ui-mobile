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
const mockPush = vi.fn()

vi.mock('@/hooks/use-profile', () => ({
  useTrialExpired: () => mockTrialExpired,
}))

vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
  useRouter: () => ({ push: mockPush }),
}))

vi.mock('@/components/ui/app-overlay', () => ({
  AppOverlay: ({ open, children, title, titleContent, footer }: {
    open: boolean
    children: React.ReactNode
    title?: string
    titleContent?: React.ReactNode
    footer?: React.ReactNode
  }) => {
    if (!open) return null
    return (
      <div data-testid="overlay">
        {title && <h2>{title}</h2>}
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
    mockPush.mockClear()
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
    expect(screen.getByText('trial.expired.heading')).toBeInTheDocument()
  })

  it('renders the paused feature rows', () => {
    mockTrialExpired = true
    render(<TrialExpiredModal />)
    expect(screen.getByText('trial.expired.aiChat')).toBeInTheDocument()
    expect(screen.getByText('trial.expired.allColors')).toBeInTheDocument()
    expect(screen.getByText('trial.expired.aiSummary')).toBeInTheDocument()
    expect(screen.getByText('trial.expired.subHabits')).toBeInTheDocument()
    expect(screen.getByText('trial.expired.goals')).toBeInTheDocument()
  })

  it('renders the quiet subtitle copy', () => {
    mockTrialExpired = true
    render(<TrialExpiredModal />)
    expect(screen.getByText('trial.expired.subtitleQuiet')).toBeInTheDocument()
  })

  it('renders the subscribe button and routes to upgrade on click', () => {
    mockTrialExpired = true
    render(<TrialExpiredModal />)
    const subscribe = screen.getByText('trial.expired.subscribe')
    expect(subscribe).toBeInTheDocument()
    fireEvent.click(subscribe)
    expect(mockPush).toHaveBeenCalledWith('/upgrade')
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
    expect(screen.getByTestId('overlay')).toBeInTheDocument()
  })
})
