import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { sheetTestControls } from '@/__tests__/support/sheet-double'

const mocks = vi.hoisted(() => ({
  beginChallenge: vi.fn(),
  onOpenChange: vi.fn(),
  push: vi.fn(),
  requestDeletion: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push }),
}))

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) =>
    params ? `${key}:${JSON.stringify(params)}` : key,
  useLocale: () => 'en',
}))

vi.mock('@/app/actions/auth', () => ({
  requestDeletion: () => mocks.requestDeletion(),
}))

vi.mock('@/lib/step-up-storage', () => ({
  beginStepUpChallenge: (operation: string) => mocks.beginChallenge(operation),
}))

vi.mock('@/components/ui/sheet', async () =>
  await import('@/__tests__/support/sheet-double'))

import { DeleteAccountModal } from '@/app/(app)/profile/_components/delete-account-modal'

const profile = {
  name: 'Thomas',
  email: 'thomas@example.com',
  timeZone: 'America/Sao_Paulo',
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
  aiMessagesLimit: 20,
  hasImportedCalendar: false,
  hasSeenImportPrompt: false,
  hasGoogleConnection: false,
  subscriptionInterval: null,
  subscriptionSource: null,
  isLifetimePro: false,
  weekStartDay: 0 as const,
  totalXp: 0,
  level: 1,
  levelTitle: 'Beginner',
  adRewardsClaimedToday: 0,
  currentStreak: 0,
  longestStreak: 0,
  streakFreezesAvailable: 0,
  themePreference: null,
  colorScheme: null,
  googleCalendarAutoSyncEnabled: false,
  googleCalendarAutoSyncStatus: 'Idle' as const,
  googleCalendarLastSyncedAt: null,
}

describe('DeleteAccountModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    sheetTestControls.defer(false)
    mocks.requestDeletion.mockResolvedValue(undefined)
  })

  it('keeps the confirmation and warning as the first gate', () => {
    render(<DeleteAccountModal open onOpenChange={mocks.onOpenChange} profile={profile} />)

    expect(screen.getByText('profile.deleteAccount.headingAreYouSure')).toBeInTheDocument()
    expect(screen.getByText('profile.deleteAccount.warningFree')).toBeInTheDocument()
    expect(screen.getByText('profile.deleteAccount.warningDetail')).toBeInTheDocument()
    expect(screen.getByText('profile.deleteAccount.sendCode')).toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })

  it('shows the Pro warning with the formatted plan date', () => {
    render(
      <DeleteAccountModal
        open
        onOpenChange={mocks.onOpenChange}
        profile={{
          ...profile,
          plan: 'pro',
          hasProAccess: true,
          planExpiresAt: '2026-09-30T00:00:00Z',
        }}
      />,
    )

    expect(document.body.textContent).toContain('profile.deleteAccount.warningPro')
  })

  it('persists the send time and routes to the deletion step up screen', async () => {
    render(<DeleteAccountModal open onOpenChange={mocks.onOpenChange} profile={profile} />)

    fireEvent.click(screen.getByText('profile.deleteAccount.sendCode'))

    await waitFor(() => expect(mocks.requestDeletion).toHaveBeenCalledOnce())
    expect(mocks.beginChallenge).toHaveBeenCalledWith('delete')
    expect(mocks.onOpenChange).toHaveBeenCalledWith(false)
    expect(mocks.push).toHaveBeenCalledWith('/step-up?operation=delete')
  })

  it('waits for sheet dismissal before closing and navigating', async () => {
    sheetTestControls.defer(true)
    render(<DeleteAccountModal open onOpenChange={mocks.onOpenChange} profile={profile} />)

    fireEvent.click(screen.getByText('profile.deleteAccount.sendCode'))

    await waitFor(() => expect(sheetTestControls.isDismissPending).toBe(true))
    expect(mocks.beginChallenge).toHaveBeenCalledWith('delete')
    expect(mocks.onOpenChange).not.toHaveBeenCalled()
    expect(mocks.push).not.toHaveBeenCalled()

    act(() => sheetTestControls.completeDismissal())

    expect(mocks.onOpenChange).toHaveBeenCalledWith(false)
    expect(mocks.push).toHaveBeenCalledWith('/step-up?operation=delete')
  })

  it('keeps the first gate open and reports a safe error when sending fails', async () => {
    mocks.requestDeletion.mockRejectedValueOnce(new Error('private backend detail'))
    render(<DeleteAccountModal open onOpenChange={mocks.onOpenChange} profile={profile} />)

    fireEvent.click(screen.getByText('profile.deleteAccount.sendCode'))

    expect(await screen.findByRole('alert')).toHaveTextContent('profile.deleteAccount.errorGeneric')
    expect(mocks.beginChallenge).not.toHaveBeenCalled()
    expect(mocks.push).not.toHaveBeenCalled()
  })

  it('renders nothing while closed', () => {
    const { container } = render(
      <DeleteAccountModal open={false} onOpenChange={mocks.onOpenChange} profile={profile} />,
    )
    expect(container).toBeEmptyDOMElement()
  })
})
