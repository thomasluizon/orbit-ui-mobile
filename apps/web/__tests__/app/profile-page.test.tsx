import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { createMockProfile } from '@orbit/shared/__tests__/factories'

const {
  mockExportUserData,
  mockUpdateAiSummary,
  mockUpdateProactiveAstra,
  mockShellNoticeSlot,
  mockUseGamificationProfile,
  mockPatchProfile,
  mockProfileState,
  mockRouterPush,
} = vi.hoisted(() => ({
  mockExportUserData: vi.fn(),
  mockUpdateAiSummary: vi.fn(),
  mockUpdateProactiveAstra: vi.fn(),
  mockShellNoticeSlot: vi.fn(),
  mockUseGamificationProfile: vi.fn(() => ({ profile: null })),
  mockPatchProfile: vi.fn(),
  mockRouterPush: vi.fn(),
  mockProfileState: {
    current: {
      profile: undefined as ReturnType<typeof createMockProfile> | undefined,
      isLoading: false,
      error: null as Error | null,
    },
  },
}))

vi.mock('@/app/actions/profile', () => ({
  exportUserData: mockExportUserData,
  updateAiSummary: mockUpdateAiSummary,
  updateProactiveAstra: mockUpdateProactiveAstra,
}))

vi.mock('@orbit/shared/hooks', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useShellNoticeSlot: mockShellNoticeSlot,
}))

vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: () => (key: string) => key,
}))

vi.mock('@/hooks/use-color-scheme', () => ({
  useColorScheme: () => ({ currentTheme: 'dark', applyTheme: vi.fn() }),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockRouterPush,
    replace: vi.fn(),
    back: vi.fn(),
    refresh: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
}))

vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: undefined, isLoading: false, isError: false }),
  useQueryClient: () => ({
    invalidateQueries: vi.fn(),
  }),
  useMutation: (options: { mutationFn?: (value: boolean) => unknown }) => ({
    mutate: (value: boolean) => options.mutationFn?.(value),
    isPending: false,
  }),
}))

vi.mock('@/hooks/use-profile', () => ({
  useProfile: () => ({ ...mockProfileState.current, patchProfile: mockPatchProfile }),
  useTrialDaysLeft: () => 0,
  useTrialExpired: () => true,
}))

vi.mock('@/hooks/use-gamification', () => ({
  useGamificationProfile: mockUseGamificationProfile,
  useStreakInfo: () => ({ data: { currentStreak: 0 } }),
  useReportEvent: () => ({ mutate: vi.fn() }),
}))

vi.mock('@/stores/auth-store', () => ({
  useAuthStore: (selector: (state: { logout: () => void }) => unknown) =>
    selector({ logout: vi.fn() }),
}))

vi.mock('@/components/ui/theme-toggle', () => ({
  ThemeToggle: () => null,
}))

vi.mock('@/components/gamification/streak-badge', () => ({
  StreakBadge: () => null,
}))

vi.mock('@/components/navigation/notification-bell', () => ({
  NotificationBell: () => null,
}))

vi.mock('@/app/(app)/profile/_components/subscription-card', () => ({
  SubscriptionCard: () => null,
}))

vi.mock('@/app/(app)/profile/_components/fresh-start-modal', () => ({
  FreshStartModal: () => null,
}))

vi.mock('@/app/(app)/profile/_components/delete-account-modal', () => ({
  DeleteAccountModal: () => null,
}))

vi.mock('@/app/(app)/profile/_components/profile-nav-card', () => ({
  ProfileNavCard: () => null,
}))

vi.mock('@/components/profile/profile-nav-icon', () => ({
  ProfileNavIcon: () => null,
}))

vi.mock('@/app/(app)/profile/_components/tour-replay-card', () => ({
  TourReplayCard: () => null,
}))

vi.mock('@/components/referral/referral-card', () => ({
  ReferralCard: ({ onOpen }: { onOpen: () => void; onDismiss?: () => void }) => (
    <button data-testid="profile-referral-card" onClick={onOpen}>
      referral
    </button>
  ),
}))

vi.mock('@/components/referral/referral-drawer', () => ({
  ReferralDrawer: ({ open }: { open: boolean; onOpenChange?: (open: boolean) => void }) =>
    open ? <div data-testid="profile-referral-drawer" /> : null,
}))

import ProfilePage from '@/app/(app)/profile/page'

describe('ProfilePage', () => {
  beforeEach(() => {
    mockExportUserData.mockReset()
    mockUpdateAiSummary.mockReset()
    mockUpdateProactiveAstra.mockReset()
    mockShellNoticeSlot.mockReset()
    mockPatchProfile.mockReset()
    Object.defineProperties(URL, {
      createObjectURL: { configurable: true, value: vi.fn(() => 'blob:export') },
      revokeObjectURL: { configurable: true, value: vi.fn() },
    })
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    mockUseGamificationProfile.mockClear()
    mockRouterPush.mockClear()
    mockProfileState.current = {
      profile: createMockProfile({
        plan: 'free',
        hasProAccess: false,
        currentStreak: 13,
        aiMessagesUsed: 2,
        aiMessagesLimit: 5,
      }),
      isLoading: false,
      error: null,
    }
  })

  it('renders the remaining phone feature sections in order', () => {
    render(<ProfilePage />)

    expect(screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent)).toEqual([
      'profile.groups.you',
      'profile.groups.astra',
      'profile.groups.notifications',
      'profile.groups.more',
      'profile.groups.ending',
    ])
    expect(screen.getByText('profile.wrappedTitle')).toBeInTheDocument()
    expect(screen.getByText('calendar.profileButton')).toBeInTheDocument()
    expect(screen.getByText('profile.sections.aboutHelp')).toBeInTheDocument()
    expect(screen.queryByText('profile.sections.preferences')).not.toBeInTheDocument()
    expect(screen.queryByText('profile.sections.aiFeatures')).not.toBeInTheDocument()
    expect(screen.queryByText('profile.sections.advanced')).not.toBeInTheDocument()
    const retiredLabels = [
      ['so', 'cial.profileNav.title'].join(''),
      ['profile.public', 'Profile.title'].join(''),
    ]
    for (const label of retiredLabels) {
      expect(screen.queryByText(label)).not.toBeInTheDocument()
    }
  })

  it('keeps every profile setting reachable by its accessible name', () => {
    render(<ProfilePage />)

    const accessibleNames = [
      'profile.settingsRows.editName',
      'profile.language.title',
      'profile.settingsRows.timezone',
      'settings.weekStartDay.title',
      'preferences.themeMode',
      'profile.subscription.plan',
      'profile.settingsRows.apiKeysMcp',
      'profile.wrappedTitle',
      'calendar.profileButton',
      'profile.sections.aboutHelp',
      'dataExport.button',
      'shareCard.entry',
      'profile.freshStart.button',
      'profile.logout',
      'profile.deleteAccount.button',
    ]

    for (const name of accessibleNames) {
      expect(screen.getByRole('button', { name: new RegExp(name, 'i') })).toBeInTheDocument()
    }
    expect(
      screen.getByRole('button', { name: 'profile.marketingEmails.accept' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'profile.marketingEmails.decline' }),
    ).toBeInTheDocument()
  })

  it('shows the free daily allowance and routes its only plan action to Pro', () => {
    render(<ProfilePage />)

    const astra = within(screen.getByTestId('profile-settings-group-astra'))
    const progress = astra.getByRole('progressbar', { name: 'profile.allowance.title' })
    expect(progress).toHaveAttribute('aria-valuenow', '2')
    expect(progress).toHaveAttribute('aria-valuemax', '5')
    expect(astra.getByText('profile.allowance.usage')).toBeInTheDocument()
    expect(astra.queryByText('profile.allowance.spent')).not.toBeInTheDocument()
    const proactiveGate = astra.getByRole('button', { name: /profile\.proactiveAstra\.title/i })
    const summaryGate = astra.getByRole('button', { name: /profile\.aiSummary\.title/i })
    expect(astra.queryByRole('link', { name: 'profile.allowance.manageSubscription' })).not.toBeInTheDocument()

    expect(astra.getByRole('link', { name: 'profile.allowance.seePro' })).toHaveAttribute('href', '/upgrade')
    fireEvent.click(proactiveGate)
    fireEvent.click(summaryGate)
    expect(mockRouterPush).toHaveBeenNthCalledWith(1, '/upgrade')
    expect(mockRouterPush).toHaveBeenNthCalledWith(2, '/upgrade')
  })

  it('shows trial copy and routes its allowance action to the trial pitch', () => {
    mockProfileState.current = {
      profile: createMockProfile({
        plan: 'pro',
        hasProAccess: true,
        isTrialActive: true,
        aiMessagesUsed: 2,
        aiMessagesLimit: 50,
      }),
      isLoading: false,
      error: null,
    }
    render(<ProfilePage />)

    const astra = within(screen.getByTestId('profile-settings-group-astra'))
    expect(astra.getByText('profile.subscription.trial')).toBeInTheDocument()
    expect(astra.getByRole('link', { name: 'profile.allowance.seePro' })).toHaveAttribute('href', '/upgrade')
    expect(astra.queryByRole('link', { name: 'profile.allowance.manageSubscription' })).not.toBeInTheDocument()
  })

  it('shows a spent Pro allowance and hands subscription management off directly', () => {
    mockProfileState.current = {
      profile: createMockProfile({
        plan: 'pro',
        hasProAccess: true,
        aiMessagesUsed: 50,
        aiMessagesLimit: 50,
      }),
      isLoading: false,
      error: null,
    }
    render(<ProfilePage />)

    const astra = within(screen.getByTestId('profile-settings-group-astra'))
    const progress = astra.getByRole('progressbar', { name: 'profile.allowance.title' })
    expect(progress).toHaveAttribute('aria-valuenow', '50')
    expect(progress).toHaveAttribute('aria-valuemax', '50')
    expect(progress).toHaveAttribute('data-complete', 'true')
    expect(astra.getByText('profile.allowance.spent')).toBeInTheDocument()
    expect(astra.queryByRole('link', { name: 'profile.allowance.seePro' })).not.toBeInTheDocument()

    expect(astra.getByRole('link', { name: 'profile.allowance.manageSubscription' })).toHaveAttribute('href', '/upgrade')
    const proactiveSwitch = astra.getByRole('switch', { name: 'profile.proactiveAstra.title' })
    const summarySwitch = astra.getByRole('switch', { name: 'profile.aiSummary.title' })
    fireEvent.click(proactiveSwitch)
    fireEvent.click(summarySwitch)
    expect(mockUpdateProactiveAstra).toHaveBeenCalledWith({ enabled: true })
    expect(mockUpdateAiSummary).toHaveBeenCalledWith({ enabled: false })
  })

  it('places export last in You instead of Ending things', () => {
    render(<ProfilePage />)

    const youGroup = screen.getByTestId('profile-settings-group-you')
    const endingGroup = screen.getByTestId('profile-settings-group-ending')
    const youButtons = Array.from(youGroup.querySelectorAll('button'))

    expect(youButtons.at(-1)).toHaveAccessibleName(/dataExport\.button/i)
    expect(endingGroup).not.toHaveTextContent('dataExport.button')
  })

  it('shows Preparing on the row and registers completion in the shell notice slot', async () => {
    let finishExport!: (value: Record<string, never>) => void
    mockExportUserData.mockReturnValueOnce(
      new Promise((resolve) => {
        finishExport = resolve
      }),
    )
    render(<ProfilePage />)

    const exportRow = screen.getByRole('button', { name: /dataExport\.button/i })
    fireEvent.click(exportRow)
    expect(exportRow).toHaveTextContent('dataExport.preparing')

    await act(async () => finishExport({}))
    await waitFor(() => {
      expect(mockShellNoticeSlot.mock.calls.some(([enabled]) => enabled)).toBe(true)
    })
    const noticeCall = [...mockShellNoticeSlot.mock.calls]
      .reverse()
      .find((call) => call[0] === true)
    const notice = noticeCall?.[1]() as React.ReactElement<{ kind: string; message: string }>
    expect(notice.props).toMatchObject({ kind: 'done', message: 'dataExport.done' })
  })

  it('opens the timezone picker from the timezone row', () => {
    render(<ProfilePage />)

    fireEvent.click(
      screen.getByRole('button', { name: /profile.settingsRows.timezone/ }),
    )

    expect(
      screen.getByRole('dialog', { name: 'profile.settingsRows.timezone' }),
    ).toBeInTheDocument()
  })

  it('renders habit notification guidance without action semantics or chevrons', () => {
    render(<ProfilePage />)

    expect(
      screen.queryByRole('button', { name: 'profile.settingsRows.reminders' }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'habits.form.slipAlert' }),
    ).not.toBeInTheDocument()

    const guidance = screen.getByText('profile.settingsRows.remindersNote')
    expect(guidance.closest('button, a')).toBeNull()
    expect(guidance.closest('[data-profile-notification-guidance]')?.querySelector('svg')).toBeNull()
  })

  it('shows one eight-row settings skeleton before the groups arrive', () => {
    mockProfileState.current = {
      profile: createMockProfile({ hasProAccess: false }),
      isLoading: true,
      error: null,
    }
    render(<ProfilePage />)

    expect(screen.getByRole('progressbar', { name: 'profile.loading' })).toBeInTheDocument()
    expect(document.querySelectorAll('[data-settings-skeleton-row]')).toHaveLength(8)
    expect(screen.queryAllByRole('heading', { level: 2 })).toHaveLength(0)
  })
})
