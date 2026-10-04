import { expectSmallSheetActions, sheetSlotButtons } from '@/__tests__/support/sheet-slots'
import { afterEach, describe, it, expect, vi, beforeEach } from 'vitest'
import { act, render, screen, fireEvent } from '@testing-library/react'

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
const { mockUseSubscriptionPlans } = vi.hoisted(() => ({
  mockUseSubscriptionPlans: vi.fn(() => ({
    plans: { savingsPercent: 41 },
  })),
}))

vi.mock('@/hooks/use-profile', () => ({
  useTrialExpired: () => mockTrialExpired,
}))

vi.mock('@/hooks/use-subscription-plans', () => ({
  useSubscriptionPlans: mockUseSubscriptionPlans,
}))

vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
  useRouter: () => ({ push: mockPush }),
}))

vi.mock('@/components/ui/sheet', async () => await import('@/__tests__/support/sheet-double'))

import { buildAccountScopedStorageKey } from '@orbit/shared/utils'
import { TrialExpiredModal } from '@/components/ui/trial-expired-modal'
import { useUIStore } from '@/stores/ui-store'
import { holdAccount } from '@/__tests__/support/account-change'

/** The notice is owed to one account, so the key it is written under names that account. */
const SEEN_KEY = buildAccountScopedStorageKey('orbit_trial_expired_seen', 'user-1')

describe('TrialExpiredModal', () => {
  beforeEach(() => {
    mockTrialExpired = false
    mockPathname = '/'
    mockPush.mockClear()
    mockUseSubscriptionPlans.mockClear()
    localStorage.clear()
    vi.stubGlobal('fetch', vi.fn())
    holdAccount('user-1')
    useUIStore.setState({ openOverlayIds: [], showCreateModal: false })
  })

  afterEach(() => {
    localStorage.clear()
    vi.unstubAllGlobals()
  })

  it('renders nothing when trial is not expired', () => {
    mockTrialExpired = false
    const { container } = render(<TrialExpiredModal />)
    expect(container.innerHTML).toBe('')
    expect(mockUseSubscriptionPlans).toHaveBeenCalledWith({
      enabled: false,
      handlesError: true,
    })
  })

  it('renders nothing when already dismissed via localStorage', () => {
    mockTrialExpired = true
    localStorage.setItem(SEEN_KEY, '1')
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
    expect(screen.getByTestId('sheet')).toBeInTheDocument()
    expect(screen.getByText('trial.expired.heading')).toBeInTheDocument()
    expect(mockUseSubscriptionPlans).toHaveBeenCalledWith({
      enabled: true,
      handlesError: true,
    })
  })

  it('uses a small intrinsic dismissal before Subscribe', () => {
    mockTrialExpired = true
    render(<TrialExpiredModal />)
    expect(sheetSlotButtons('sheet-actions')).toEqual(['trial.expired.continueFree', 'trial.expired.subscribe'])
    expectSmallSheetActions()
  })

  it('waits for an open sheet before presenting the trial notice', async () => {
    mockTrialExpired = true
    useUIStore.getState().registerOpenOverlay('existing-sheet')
    render(<TrialExpiredModal />)
    expect(screen.queryByText('trial.expired.heading')).toBeNull()

    act(() => useUIStore.getState().unregisterOpenOverlay('existing-sheet'))
    expect(await screen.findByText('trial.expired.heading')).toBeInTheDocument()
  })

  it('renders the paused feature rows', () => {
    mockTrialExpired = true
    render(<TrialExpiredModal />)
    expect(screen.getByText('trial.expired.astraCeiling')).toBeInTheDocument()
    expect(screen.getByText('trial.expired.calendarSync')).toBeInTheDocument()
    expect(screen.getByText('trial.expired.retrospective')).toBeInTheDocument()
    expect(screen.getByText('trial.expired.proactiveAstra')).toBeInTheDocument()
    expect(screen.queryByText('trial.expired.subHabits')).not.toBeInTheDocument()
    expect(screen.queryByText('trial.expired.goals')).not.toBeInTheDocument()
  })

  it('places each paused status on the supporting line beneath its feature label', () => {
    mockTrialExpired = true
    render(<TrialExpiredModal />)
    const pausedStatuses = screen.getAllByText('trial.expired.paused')
    expect(pausedStatuses).toHaveLength(4)
    for (const [index, feature] of ['astraCeiling', 'calendarSync', 'retrospective', 'proactiveAstra'].entries()) {
      const label = screen.getByText(`trial.expired.${feature}`)
      expect(pausedStatuses[index]?.parentElement).toBe(label.parentElement?.parentElement)
      expect(label.parentElement?.nextElementSibling).toBe(pausedStatuses[index])
    }
  })

  it('renders the annual saving from the plans payload', () => {
    mockTrialExpired = true
    render(<TrialExpiredModal />)
    expect(screen.getByText('trial.expired.savings')).toBeInTheDocument()
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
    expect(localStorage.getItem(SEEN_KEY)).toBe('1')
  })

  it('dismisses when subscribe link is clicked', () => {
    mockTrialExpired = true
    render(<TrialExpiredModal />)
    fireEvent.click(screen.getByText('trial.expired.subscribe'))
    expect(localStorage.getItem(SEEN_KEY)).toBe('1')
  })

  it('dismisses through the sheet when the close control is used', () => {
    mockTrialExpired = true
    render(<TrialExpiredModal />)
    expect(screen.getByTestId('sheet')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'close-overlay' }))

    expect(localStorage.getItem(SEEN_KEY)).toBe('1')
  })

  it('shows B trial notice after A dismisses it in a mounted shell', () => {
    mockTrialExpired = true
    holdAccount('account-a')
    const modal = render(<TrialExpiredModal />)
    fireEvent.click(screen.getByText('trial.expired.continueFree'))
    expect(localStorage.getItem('orbit_trial_expired_seen:account-a')).toBe('1')

    act(() => holdAccount('account-b'))
    modal.rerender(<TrialExpiredModal />)

    expect(screen.getByText('trial.expired.continueFree')).toBeInTheDocument()
  })
})
