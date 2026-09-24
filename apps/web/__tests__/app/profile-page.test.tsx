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
  mockSearchParams,
  mockStepUpVerified,
  mockCreateGrant,
  mockApiKeys,
  mockCreateApiKey,
  mockRequestApiKeyCreationChallenge,
} = vi.hoisted(() => ({
  mockExportUserData: vi.fn(),
  mockUpdateAiSummary: vi.fn(),
  mockUpdateProactiveAstra: vi.fn(),
  mockShellNoticeSlot: vi.fn(),
  mockUseGamificationProfile: vi.fn(() => ({ profile: null })),
  mockPatchProfile: vi.fn(),
  mockRouterPush: vi.fn(),
  mockSearchParams: { current: '' },
  mockStepUpVerified: { current: false },
  mockCreateGrant: { consumed: false },
  mockApiKeys: { current: [] as Record<string, unknown>[] },
  mockCreateApiKey: vi.fn(),
  mockRequestApiKeyCreationChallenge: vi.fn(),
  mockProfileState: {
    current: {
      profile: undefined as ReturnType<typeof createMockProfile> | undefined,
      isLoading: false,
      error: null as Error | null,
    },
  },
}))

vi.mock('@/lib/actions/profile', () => ({
  exportUserData: mockExportUserData,
  updateAiSummary: mockUpdateAiSummary,
  updateProactiveAstra: mockUpdateProactiveAstra,
}))

vi.mock('@/lib/actions/api-keys', () => ({
  createApiKey: mockCreateApiKey,
  revokeApiKey: vi.fn(),
  requestApiKeyCreationChallenge: mockRequestApiKeyCreationChallenge,
}))

vi.mock('@/lib/step-up-storage', () => ({
  beginStepUpChallenge: vi.fn(),
  isStepUpVerified: () => mockStepUpVerified.current,
  hasApiKeyCreationGrant: () => mockStepUpVerified.current && !mockCreateGrant.consumed,
  consumeApiKeyCreationGrant: () => {
    mockCreateGrant.consumed = true
  },
  clearApiKeyCreationGrant: () => {
    mockCreateGrant.consumed = true
  },
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
  useSearchParams: () => new URLSearchParams(mockSearchParams.current),
}))

vi.mock('@tanstack/react-query', () => ({
  useQuery: ({ queryKey }: { queryKey?: string[] }) => ({
    data: queryKey?.[0] === 'apiKeys' ? mockApiKeys.current : undefined,
    error: null,
    isLoading: false,
    isError: false,
  }),
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
  getHeldAccountId: () => 'account-a',
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
    mockSearchParams.current = ''
    mockStepUpVerified.current = false
    mockCreateGrant.consumed = false
    mockApiKeys.current = []
    mockCreateApiKey.mockReset()
    mockRequestApiKeyCreationChallenge.mockReset().mockResolvedValue(undefined)
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
    expect(screen.queryByText('profile.wrappedHint')).not.toBeInTheDocument()
    expect(screen.getByText('profile.widgetTitle')).toBeInTheDocument()
    expect(screen.getByText('calendar.profileButton')).toBeInTheDocument()
    expect(screen.getByText('profile.support.title')).toBeInTheDocument()
    expect(screen.getByText('profile.sections.aboutHelp')).toBeInTheDocument()
    expect(screen.queryByText('profile.sections.aboutHelpHint')).not.toBeInTheDocument()
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
      'dataExport.button',
      'profile.logout',
      'profile.freshStart.button',
      'profile.deleteAccount.button',
    ]

    for (const name of accessibleNames) {
      expect(screen.getByRole('button', { name: new RegExp(name, 'i') })).toBeInTheDocument()
    }
    for (const name of [
      'profile.wrappedTitle',
      'profile.widgetTitle',
      'calendar.profileButton',
      'profile.support.title',
      'profile.sections.aboutHelp',
    ]) {
      expect(screen.getByRole('link', { name: new RegExp(name, 'i') })).toBeInTheDocument()
    }
    expect(
      screen.getByRole('button', { name: 'profile.marketingEmails.accept' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'profile.marketingEmails.decline' }),
    ).toBeInTheDocument()
  })

  it('keeps the share card reachable outside Ending things', () => {
    render(<ProfilePage />)

    const shareCardEntry = screen.getByRole('button', { name: /shareCard\.entry/i })
    const ending = screen.getByTestId('profile-settings-group-ending')

    expect(shareCardEntry).toBeInTheDocument()
    expect(ending).not.toContainElement(shareCardEntry)
  })

  it('puts Sign out first in Ending things', () => {
    render(<ProfilePage />)
    const ending = screen.getByTestId('profile-settings-group-ending')

    expect(within(ending).getAllByRole('button')[0]).toHaveTextContent('profile.logout')
  })

  it('puts Fresh Start directly after Sign out', () => {
    render(<ProfilePage />)
    const ending = screen.getByTestId('profile-settings-group-ending')
    const labels = within(ending).getAllByRole('button').map((button) => button.textContent)

    expect(labels.slice(0, 2)).toEqual(['profile.logout', 'profile.freshStart.button'])
  })

  it('keeps Delete account last in the three-row ending group', () => {
    render(<ProfilePage />)
    const ending = screen.getByTestId('profile-settings-group-ending')
    const labels = within(ending).getAllByRole('button').map((button) => button.textContent)

    expect(labels).toEqual([
      'profile.logout',
      'profile.freshStart.button',
      'profile.deleteAccount.button',
    ])
  })

  it('routes every More of Orbit row', () => {
    const view = render(<ProfilePage />)
    const freeMore = within(screen.getByTestId('profile-settings-group-more'))

    expect(freeMore.getByRole('link', { name: /profile\.wrappedTitle/i })).toHaveAttribute('href', '/wrapped')
    expect(freeMore.getByRole('link', { name: /profile\.widgetTitle/i })).toHaveAttribute('href', '/advanced')
    const calendarGate = freeMore.getByRole('link', { name: /calendar\.profileButton/i })
    expect(calendarGate).toHaveAttribute('href', '/upgrade')
    expect(calendarGate).not.toHaveAttribute('aria-disabled', 'true')
    expect(freeMore.getByRole('link', { name: /profile\.support\.title/i })).toHaveAttribute('href', '/support')
    expect(freeMore.getByRole('link', { name: /profile\.sections\.aboutHelp/i })).toHaveAttribute('href', '/about')
    expect(freeMore.getByText('common.proBadge')).toBeInTheDocument()

    view.unmount()
    mockRouterPush.mockClear()
    mockProfileState.current = {
      profile: createMockProfile({ plan: 'pro', hasProAccess: true }),
      isLoading: false,
      error: null,
    }
    render(<ProfilePage />)
    const proMore = within(screen.getByTestId('profile-settings-group-more'))
    expect(proMore.getByRole('link', { name: /calendar\.profileButton/i })).toHaveAttribute('href', '/calendar-sync')
    expect(proMore.queryByText('common.proBadge')).not.toBeInTheDocument()
  })

  it('shows the free daily allowance as an enabled route to Pro', () => {
    render(<ProfilePage />)

    const astra = within(screen.getByTestId('profile-settings-group-astra'))
    const progress = astra.getByRole('progressbar', { name: 'profile.allowance.title' })
    expect(progress).toHaveAttribute('aria-valuenow', '2')
    expect(progress).toHaveAttribute('aria-valuemax', '5')
    expect(astra.getByText('profile.allowance.usage')).toBeInTheDocument()
    expect(astra.queryByText('profile.allowance.spent')).not.toBeInTheDocument()
    expect(astra.queryByRole('link', { name: 'profile.allowance.manageSubscription' })).not.toBeInTheDocument()

    const allowanceGate = astra.getByRole('link', { name: 'profile.allowance.seePro' })
    expect(allowanceGate).toHaveAttribute('href', '/upgrade')
    expect(allowanceGate).not.toHaveAttribute('aria-disabled', 'true')
  })

  it('shows both free Astra switch gates as enabled routes to Pro', () => {
    render(<ProfilePage />)

    const astra = within(screen.getByTestId('profile-settings-group-astra'))
    const proactiveGate = astra.getByRole('button', { name: /profile\.proactiveAstra\.title/i })
    const summaryGate = astra.getByRole('button', { name: /profile\.aiSummary\.title/i })

    expect(proactiveGate).toBeEnabled()
    expect(summaryGate).toBeEnabled()
    fireEvent.click(proactiveGate)
    fireEvent.click(summaryGate)
    expect(mockRouterPush).toHaveBeenNthCalledWith(1, '/upgrade')
    expect(mockRouterPush).toHaveBeenNthCalledWith(2, '/upgrade')
  })

  it('shows only the API key description and upgrade row to free accounts', () => {
    render(<ProfilePage />)

    const apiKeys = within(screen.getByTestId('profile-api-keys'))
    expect(apiKeys.getByText('profile.apiKeys.description')).toBeInTheDocument()
    const upgradeRow = apiKeys.getByRole('button', { name: 'profile.apiKeys.unlock' })
    expect(apiKeys.queryByText('orbitMcp.noKeys')).not.toBeInTheDocument()
    expect(upgradeRow).toBeEnabled()

    fireEvent.click(upgradeRow)
    expect(mockRouterPush).toHaveBeenCalledWith('/upgrade')
  })

  it('keeps every free API key state on the enabled lock route', () => {
    mockStepUpVerified.current = true
    mockApiKeys.current = [{
      id: 'key-1',
      name: 'Work key',
      keyPrefix: 'orb_live_1234',
    }]

    render(<ProfilePage />)

    const apiKeys = within(screen.getByTestId('profile-api-keys'))
    const upgradeRow = apiKeys.getByRole('button', { name: 'profile.apiKeys.unlock' })
    expect(upgradeRow).toBeEnabled()
    expect(apiKeys.queryByText('Work key')).not.toBeInTheDocument()
    fireEvent.click(upgradeRow)
    expect(mockRouterPush).toHaveBeenCalledWith('/upgrade')
  })

  it('puts the step up before the API key list for Pro accounts', () => {
    mockProfileState.current = {
      profile: createMockProfile({ plan: 'pro', hasProAccess: true }),
      isLoading: false,
      error: null,
    }
    render(<ProfilePage />)

    const apiKeys = within(screen.getByTestId('profile-api-keys'))
    expect(apiKeys.queryByText('orbitMcp.noKeys')).not.toBeInTheDocument()
    fireEvent.click(apiKeys.getByRole('button', { name: 'profile.apiKeys.open' }))

    expect(
      apiKeys.getByRole('button', { name: 'profile.apiKeys.stepUpAction' }),
    ).toBeInTheDocument()
    expect(apiKeys.queryByText('orbitMcp.noKeys')).not.toBeInTheDocument()
  })

  it('does not unlock API keys from a manually typed return hint', () => {
    mockProfileState.current = {
      profile: createMockProfile({ plan: 'pro', hasProAccess: true }),
      isLoading: false,
      error: null,
    }
    mockSearchParams.current = 'api-keys=1'
    mockApiKeys.current = [{
      id: 'key-1',
      name: 'Work key',
      keyPrefix: 'orb_live_1234',
    }]

    render(<ProfilePage />)

    const apiKeys = within(screen.getByTestId('profile-api-keys'))
    expect(apiKeys.getByRole('button', { name: 'profile.apiKeys.open' })).toBeInTheDocument()
    expect(apiKeys.queryByText('Work key')).not.toBeInTheDocument()
  })

  it('shows verified keys and submits a free-text scope', async () => {
    mockProfileState.current = {
      profile: createMockProfile({ plan: 'pro', hasProAccess: true }),
      isLoading: false,
      error: null,
    }
    mockStepUpVerified.current = true
    mockApiKeys.current = [{
      id: 'key-1',
      name: 'Work key',
      keyPrefix: 'orb_live_1234',
      scopes: [],
      isReadOnly: false,
      expiresAtUtc: null,
      createdAtUtc: '2026-09-14T12:00:00Z',
      lastUsedAtUtc: null,
      isRevoked: false,
    }]
    mockCreateApiKey.mockResolvedValue({
      success: true,
      response: {
        ...mockApiKeys.current[0],
        id: 'key-2',
        key: 'orb_secret',
      },
    })
    render(<ProfilePage />)

    const apiKeys = within(screen.getByTestId('profile-api-keys'))
    expect(apiKeys.getByText('Work key')).toBeInTheDocument()
    expect(apiKeys.getByText('orb_live_1234…')).toBeInTheDocument()
    fireEvent.click(apiKeys.getByRole('button', { name: 'profile.apiKeys.revokeNamed' }))
    expect(screen.getByRole('dialog', { name: 'profile.apiKeys.revokeNamedQuestion' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'orbitMcp.cancel' }))
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'profile.apiKeys.revokeNamedQuestion' })).not.toBeInTheDocument()
    })

    fireEvent.click(apiKeys.getByRole('button', { name: 'profile.apiKeys.createScoped' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'profile.apiKeys.scopeLabel' }), {
      target: { value: 'habits:read' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'profile.apiKeys.scopeAction' }))

    await waitFor(() => {
      expect(mockCreateApiKey).toHaveBeenCalledWith({
        name: 'profile.apiKeys.newKeyName',
        scopes: ['habits:read'],
      }, 'account-a')
    })
  })

  it('resets scoped creation after cancellation and successful creation', async () => {
    mockProfileState.current = {
      profile: createMockProfile({ plan: 'pro', hasProAccess: true }),
      isLoading: false,
      error: null,
    }
    mockStepUpVerified.current = true
    mockCreateApiKey
      .mockRejectedValueOnce(new Error('failed'))
      .mockResolvedValueOnce({
        success: true,
        response: { id: 'key-2', key: 'orb_secret' },
      })
    const firstView = render(<ProfilePage />)

    const apiKeys = within(screen.getByTestId('profile-api-keys'))
    fireEvent.click(apiKeys.getByRole('button', { name: 'profile.apiKeys.createScoped' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'profile.apiKeys.scopeLabel' }), {
      target: { value: 'stale:scope' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'profile.apiKeys.scopeAction' }))
    expect(await screen.findByText('orbitMcp.createKeyError')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'common.cancel' }))
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'profile.apiKeys.scopeTitle' })).not.toBeInTheDocument()
    })

    fireEvent.click(apiKeys.getByRole('button', { name: 'profile.apiKeys.createScoped' }))
    expect(screen.getByRole('textbox', { name: 'profile.apiKeys.scopeLabel' })).toHaveValue('')
    expect(screen.queryByText('orbitMcp.createKeyError')).not.toBeInTheDocument()
    fireEvent.change(screen.getByRole('textbox', { name: 'profile.apiKeys.scopeLabel' }), {
      target: { value: 'fresh:scope' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'profile.apiKeys.scopeAction' }))
    expect(await screen.findByRole('dialog', { name: 'orbitMcp.revealHeading' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'orbitMcp.done' }))
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'orbitMcp.revealHeading' })).not.toBeInTheDocument()
    })

    firstView.unmount()
    mockCreateGrant.consumed = false
    render(<ProfilePage />)
    fireEvent.click(screen.getByRole('button', { name: 'profile.apiKeys.createScoped' }))
    expect(screen.getByRole('textbox', { name: 'profile.apiKeys.scopeLabel' })).toHaveValue('')
  })

  it('requires a fresh verified grant before creating a second key', async () => {
    mockProfileState.current = {
      profile: createMockProfile({ plan: 'pro', hasProAccess: true }),
      isLoading: false,
      error: null,
    }
    mockStepUpVerified.current = true
    mockCreateApiKey
      .mockResolvedValueOnce({
        success: true,
        response: { id: 'key-1', key: 'orb_first' },
      })
      .mockResolvedValueOnce({
        success: true,
        response: { id: 'key-2', key: 'orb_second' },
      })
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
    })
    const firstView = render(<ProfilePage />)

    const create = screen.getByRole('button', { name: 'profile.apiKeys.create' })
    fireEvent.click(create)
    await screen.findByText('orb_first')
    fireEvent.click(screen.getByRole('button', { name: 'orbitMcp.copy' }))
    expect(await screen.findByRole('button', { name: 'orbitMcp.copied' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'orbitMcp.done' }))
    await waitFor(() => expect(screen.queryByText('orb_first')).not.toBeInTheDocument())

    fireEvent.click(create)
    await waitFor(() => {
      expect(mockRouterPush).toHaveBeenCalledWith('/step-up?operation=keys')
    })
    expect(mockCreateApiKey).toHaveBeenCalledTimes(1)

    firstView.unmount()
    mockStepUpVerified.current = true
    mockCreateGrant.consumed = false
    render(<ProfilePage />)
    fireEvent.click(screen.getByRole('button', { name: 'profile.apiKeys.create' }))
    await screen.findByText('orb_second')
    expect(screen.getByRole('button', { name: 'orbitMcp.copy' })).toBeInTheDocument()
  })

  it('restarts step up when the API rejects a stale create grant', async () => {
    mockProfileState.current = {
      profile: createMockProfile({ plan: 'pro', hasProAccess: true }),
      isLoading: false,
      error: null,
    }
    mockStepUpVerified.current = true
    mockCreateApiKey.mockResolvedValue({ success: false, challengeRequired: true })
    render(<ProfilePage />)

    fireEvent.click(screen.getByRole('button', { name: 'profile.apiKeys.create' }))

    await waitFor(() => {
      expect(mockRouterPush).toHaveBeenCalledWith('/step-up?operation=keys')
    })
    expect(mockCreateGrant.consumed).toBe(true)
    expect(screen.queryByText('orbitMcp.createKeyError')).not.toBeInTheDocument()
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
    expect(mockUpdateProactiveAstra).toHaveBeenCalledWith({ enabled: true }, 'account-a')
    expect(mockUpdateAiSummary).toHaveBeenCalledWith({ enabled: false }, 'account-a')
  })

  it('shows lifetime Pro without advertising a subscription management action', () => {
    mockProfileState.current = {
      profile: createMockProfile({
        plan: 'pro',
        hasProAccess: true,
        isTrialActive: false,
        isLifetimePro: true,
        aiMessagesUsed: 2,
        aiMessagesLimit: 50,
      }),
      isLoading: false,
      error: null,
    }
    render(<ProfilePage />)

    const astra = within(screen.getByTestId('profile-settings-group-astra'))
    expect(astra.getByText('profile.allowance.pro')).toBeInTheDocument()
    expect(astra.queryByRole('link', { name: 'profile.allowance.seePro' })).not.toBeInTheDocument()
    expect(astra.queryByRole('link', { name: 'profile.allowance.manageSubscription' })).not.toBeInTheDocument()
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

  it('renders only the unanswered product email consent in Notifications', () => {
    render(<ProfilePage />)

    const notificationsGroup = screen.getByTestId('profile-settings-group-notifications')
    expect(
      within(notificationsGroup).getByRole('button', {
        name: 'profile.marketingEmails.accept',
      }),
    ).toBeInTheDocument()
    expect(
      within(notificationsGroup).getByRole('button', {
        name: 'profile.marketingEmails.decline',
      }),
    ).toBeInTheDocument()
    expect(
      within(notificationsGroup).queryByText('profile.settingsRows.remindersNote'),
    ).not.toBeInTheDocument()
    expect(
      within(notificationsGroup).queryByRole('switch', {
        name: 'profile.settingsRows.currentDevice',
      }),
    ).not.toBeInTheDocument()
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
