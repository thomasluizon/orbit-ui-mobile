import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

// ---------------------------------------------------------------------------
// Mocks -- must come before component import
// ---------------------------------------------------------------------------

const mockLogout = vi.fn()

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) => {
    if (params) return `${key}:${JSON.stringify(params)}`
    return key
  },
  useLocale: () => 'en',
}))

vi.mock('@/stores/auth-store', () => ({
  useAuthStore: (selector: (state: { logout: () => void }) => unknown) =>
    selector({ logout: mockLogout }),
}))

const mockRequestDeletion = vi.fn()
const mockConfirmDeletion = vi.fn()

vi.mock('@/app/actions/auth', () => ({
  requestDeletion: (...args: unknown[]) => mockRequestDeletion(...args),
  confirmDeletion: (...args: unknown[]) => mockConfirmDeletion(...args),
}))

vi.mock('@/components/ui/app-overlay', () => ({
  AppOverlay: ({
    open,
    onOpenChange,
    title,
    children,
  }: {
    open: boolean
    onOpenChange: (v: boolean) => void
    title?: string
    children: React.ReactNode
  }) =>
    open ? (
      <div data-testid="overlay">
        {title && <h2>{title}</h2>}
        <button data-testid="overlay-close" onClick={() => onOpenChange(false)}>
          Close
        </button>
        <button data-testid="overlay-reopen" onClick={() => onOpenChange(true)}>
          Reopen
        </button>
        {children}
      </div>
    ) : null,
}))

// ---------------------------------------------------------------------------
// Import component after mocks
// ---------------------------------------------------------------------------

import { DeleteAccountModal } from '@/app/(app)/profile/_components/delete-account-modal'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const defaultProfile = {
  name: 'Thomas',
  email: 'thomas@example.com',
  timeZone: 'America/Sao_Paulo',
  aiMemoryEnabled: true,
  aiSummaryEnabled: true,
  hasCompletedOnboarding: true,
  hasCompletedTour: false,
  language: 'en' as const,
  plan: 'free' as const,
  hasProAccess: false,
  isTrialActive: false,
  trialEndsAt: null,
  planExpiresAt: null,
  aiMessagesUsed: 0,
  aiMessagesLimit: 15,
  hasImportedCalendar: false,
  hasGoogleConnection: false,
  subscriptionInterval: null,
  isLifetimePro: false,
  weekStartDay: 0,
  totalXp: 0,
  level: 1,
  levelTitle: 'Beginner',
  adRewardsClaimedToday: 0,
  currentStreak: 0,
  streakFreezesAvailable: 0,
  themePreference: null,
  colorScheme: null,
  googleCalendarAutoSyncEnabled: false,
  googleCalendarAutoSyncStatus: 'Idle' as const,
  googleCalendarLastSyncedAt: null,
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DeleteAccountModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequestDeletion.mockResolvedValue(undefined)
    mockConfirmDeletion.mockResolvedValue({ scheduledDeletionAt: '2025-02-01T00:00:00Z' })
  })

  it('renders nothing when closed', () => {
    const { container } = render(
      <DeleteAccountModal open={false} onOpenChange={vi.fn()} profile={defaultProfile} />,
    )
    expect(container.innerHTML).toBe('')
  })

  it('renders overlay with title when open', () => {
    render(
      <DeleteAccountModal open={true} onOpenChange={vi.fn()} profile={defaultProfile} />,
    )
    expect(screen.getByTestId('overlay')).toBeInTheDocument()
    expect(screen.getByText('profile.deleteAccount.title')).toBeInTheDocument()
  })

  it('shows confirm step by default with warning and send-code button', () => {
    render(
      <DeleteAccountModal open={true} onOpenChange={vi.fn()} profile={defaultProfile} />,
    )
    expect(screen.getByText('profile.deleteAccount.warningFree')).toBeInTheDocument()
    expect(screen.getByText('profile.deleteAccount.warningDetail')).toBeInTheDocument()
    expect(screen.getByText('profile.deleteAccount.sendCode')).toBeInTheDocument()
  })

  it('shows pro warning when user has pro access', () => {
    const proProfile = {
      ...defaultProfile,
      plan: 'pro' as const,
      hasProAccess: true,
      planExpiresAt: '2025-12-31T00:00:00Z',
    }
    render(
      <DeleteAccountModal open={true} onOpenChange={vi.fn()} profile={proProfile} />,
    )
    // The pro warning includes the formatted date via i18n params
    expect(document.body.textContent).toContain('profile.deleteAccount.warningPro')
  })

  it('transitions to code step after requesting deletion', async () => {
    render(
      <DeleteAccountModal open={true} onOpenChange={vi.fn()} profile={defaultProfile} />,
    )

    fireEvent.click(screen.getByText('profile.deleteAccount.sendCode'))

    await waitFor(() => {
      expect(mockRequestDeletion).toHaveBeenCalledTimes(1)
    })

    await waitFor(() => {
      expect(screen.getByText('profile.deleteAccount.codeInstructions')).toBeInTheDocument()
    })
  })

  it('shows error when requestDeletion fails', async () => {
    mockRequestDeletion.mockRejectedValueOnce(new Error('Network error'))

    render(
      <DeleteAccountModal open={true} onOpenChange={vi.fn()} profile={defaultProfile} />,
    )

    fireEvent.click(screen.getByText('profile.deleteAccount.sendCode'))

    // Plain Error messages are surfaced directly by getErrorMessage.
    await waitFor(() => {
      expect(screen.getByText('Network error')).toBeInTheDocument()
    })
  })

  it('renders 6 code input fields in code step', async () => {
    render(
      <DeleteAccountModal open={true} onOpenChange={vi.fn()} profile={defaultProfile} />,
    )

    fireEvent.click(screen.getByText('profile.deleteAccount.sendCode'))

    await waitFor(() => {
      expect(screen.getByText('profile.deleteAccount.codeInstructions')).toBeInTheDocument()
    })

    const inputs = screen.getAllByRole('textbox')
    expect(inputs).toHaveLength(6)
  })

  it('confirm button is disabled when code is incomplete', async () => {
    render(
      <DeleteAccountModal open={true} onOpenChange={vi.fn()} profile={defaultProfile} />,
    )

    fireEvent.click(screen.getByText('profile.deleteAccount.sendCode'))

    await waitFor(() => {
      expect(screen.getByText('profile.deleteAccount.confirmDelete')).toBeInTheDocument()
    })

    const confirmBtn = screen.getByText('profile.deleteAccount.confirmDelete')
    expect(confirmBtn).toBeDisabled()
  })

  it('transitions to deactivated step after confirming deletion', async () => {
    render(
      <DeleteAccountModal open={true} onOpenChange={vi.fn()} profile={defaultProfile} />,
    )

    // Go to code step
    fireEvent.click(screen.getByText('profile.deleteAccount.sendCode'))
    await waitFor(() => {
      expect(screen.getByText('profile.deleteAccount.codeInstructions')).toBeInTheDocument()
    })

    // Fill in code
    const inputs = screen.getAllByRole('textbox')
    inputs.forEach((input, i) => {
      fireEvent.change(input, { target: { value: String(i + 1) } })
    })

    // Confirm
    fireEvent.click(screen.getByText('profile.deleteAccount.confirmDelete'))

    await waitFor(() => {
      expect(mockConfirmDeletion).toHaveBeenCalledWith('123456')
    })

    await waitFor(() => {
      expect(screen.getByText('profile.logout')).toBeInTheDocument()
    })
  })

  it('shows error when confirmDeletion fails', async () => {
    mockConfirmDeletion.mockRejectedValueOnce(new Error('Invalid code'))

    render(
      <DeleteAccountModal open={true} onOpenChange={vi.fn()} profile={defaultProfile} />,
    )

    // Go to code step
    fireEvent.click(screen.getByText('profile.deleteAccount.sendCode'))
    await waitFor(() => {
      expect(screen.getByText('profile.deleteAccount.codeInstructions')).toBeInTheDocument()
    })

    // Fill in code
    const inputs = screen.getAllByRole('textbox')
    inputs.forEach((input, i) => {
      fireEvent.change(input, { target: { value: String(i + 1) } })
    })

    // Confirm
    fireEvent.click(screen.getByText('profile.deleteAccount.confirmDelete'))

    // Plain Error messages are surfaced directly by getErrorMessage.
    await waitFor(() => {
      expect(screen.getByText('Invalid code')).toBeInTheDocument()
    })
  })

  it('calls logout in deactivated step', async () => {
    render(
      <DeleteAccountModal open={true} onOpenChange={vi.fn()} profile={defaultProfile} />,
    )

    // Go to code step
    fireEvent.click(screen.getByText('profile.deleteAccount.sendCode'))
    await waitFor(() => {
      expect(screen.getByText('profile.deleteAccount.codeInstructions')).toBeInTheDocument()
    })

    // Fill in code
    const inputs = screen.getAllByRole('textbox')
    inputs.forEach((input, i) => {
      fireEvent.change(input, { target: { value: String(i + 1) } })
    })

    // Confirm deletion
    fireEvent.click(screen.getByText('profile.deleteAccount.confirmDelete'))
    await waitFor(() => {
      expect(screen.getByText('profile.logout')).toBeInTheDocument()
    })

    // Click logout
    fireEvent.click(screen.getByText('profile.logout'))
    expect(mockLogout).toHaveBeenCalledTimes(1)
  })

  it('resets state when overlay triggers onOpenChange(true)', async () => {
    const onOpenChange = vi.fn()

    render(
      <DeleteAccountModal open={true} onOpenChange={onOpenChange} profile={defaultProfile} />,
    )

    // Navigate to code step
    fireEvent.click(screen.getByText('profile.deleteAccount.sendCode'))
    await waitFor(() => {
      expect(screen.getByText('profile.deleteAccount.codeInstructions')).toBeInTheDocument()
    })

    // Simulate overlay triggering onOpenChange(true) - this calls handleOpenChange(true) which resets state
    // The overlay-reopen button in the mock triggers this path
    fireEvent.click(screen.getByTestId('overlay-reopen'))

    // Should be back at confirm step since handleOpenChange resets state when value is true
    expect(screen.getByText('profile.deleteAccount.sendCode')).toBeInTheDocument()
  })
})
