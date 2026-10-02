import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { createMockProfile } from '@orbit/shared/__tests__/factories'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import en from '@orbit/shared/i18n/en.json'
import { useUIStore } from '@/stores/ui-store'

import type { PushPreferenceSnapshot } from '@/hooks/use-push-notification-preferences'

interface MockDeviceState {
  count: number | undefined
  max: number
  isCurrentDeviceRegistered: boolean
  isLoading: boolean
  isError: boolean
  refresh: ReturnType<typeof vi.fn>
}

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
  mockApplyTheme,
  mockUpdateWeekStartDay,
  mockUpdateLanguage,
  mockTogglePush,
  mockPushPreferenceState,
  mockDeviceState,
  mockTranslate,
  mockLocale,
} = vi.hoisted(() => {
  const deviceState: MockDeviceState = { count: 0, max: 5, isCurrentDeviceRegistered: false, isLoading: false, isError: false, refresh: vi.fn() }
  return ({
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
  mockApplyTheme: vi.fn(),
  mockUpdateWeekStartDay: vi.fn(),
  mockUpdateLanguage: vi.fn(),
  mockTogglePush: vi.fn(),
  mockPushPreferenceState: { current: { supported: true, subscribed: false, permission: 'default', status: 'not-registered' } as PushPreferenceSnapshot },
  mockDeviceState: { current: deviceState },
  mockTranslate: { current: (key: string, params?: Record<string, string | number>) => key === 'profile.settingsRows.devicesCount' ? [params?.count ?? '', 'of', params?.max ?? ''].join(' ') : key },
  mockLocale: { current: 'en' },
  mockProfileState: {
    current: {
      profile: undefined as ReturnType<typeof createMockProfile> | undefined,
      isLoading: false,
      error: null as Error | null,
    },
  },
}) })

vi.mock('@/lib/actions/profile', () => ({
  exportUserData: mockExportUserData,
  updateAiSummary: mockUpdateAiSummary,
  updateProactiveAstra: mockUpdateProactiveAstra,
  updateWeekStartDay: mockUpdateWeekStartDay,
  updateLanguage: mockUpdateLanguage,
}))

vi.mock('@/hooks/use-push-notification-preferences', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  usePushNotificationPreferences: () => ({
    ...mockPushPreferenceState.current,
    loading: false,
    togglePush: mockTogglePush,
  }),
}))

vi.mock('@/hooks/use-push-subscriptions', () => ({
  usePushSubscriptions: () => mockDeviceState.current,
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

vi.mock('@/hooks/use-shell-notice-slot', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useShellNoticeSlot: mockShellNoticeSlot,
}))

vi.mock('next-intl', () => ({
  useLocale: () => mockLocale.current,
  useTranslations: () => (key: string, params?: Record<string, string | number>) => mockTranslate.current(key, params),
}))

vi.mock('@/hooks/use-color-scheme', () => ({
  useColorScheme: () => ({ currentTheme: 'dark', applyTheme: mockApplyTheme }),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockRouterPush,
    replace: mockRouterPush,
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
  useTrialExpired: () => true,
}))

vi.mock('@/hooks/use-gamification', () => ({
  useGamificationProfile: mockUseGamificationProfile,
  useStreakInfo: () => ({ data: { currentStreak: 0 } }),
  useReportEvent: () => ({ mutate: vi.fn() }),
}))

vi.mock('@/stores/auth-store', () => ({
  getHeldAccountId: () => 'account-a',
  useAuthStore: (selector: (state: { logout: () => void; isAuthenticated: boolean }) => unknown) =>
    selector({ logout: vi.fn(), isAuthenticated: true }),
  useHeldAccountId: () => 'user-1',
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

import { ProfileSubscreen } from '@/app/(app)/profile/_components/profile-subscreen'

describe('ProfilePage', () => {
  it.each([
    ['account', ['profile.settingsRows.editName', 'profile.settingsRows.export', 'profile.analytics.title', 'profile.settingsRows.startOver', 'profile.settingsRows.deleteAccount']],
    ['preferences', ['profile.settingsRows.timezone', 'profile.settingsRows.weekStart', 'settings.clock.title', 'profile.language.title', 'profile.settingsRows.theme', 'settings.homeScreen.showGeneral']],
    ['astra', ['profile.allowance.title', 'profile.proactiveAstra.title', 'profile.aiSummary.title', 'profile.settingsRows.apiKeysMcp']],
    ['notifications', ['profile.settingsRows.devices', 'profile.marketingEmails.question', 'profile.settingsRows.remindersNote']],
  ] as const)('opens %s from Perfil and keeps its settings in that screen alone', (destination, labels) => {
    const top = render(<ProfilePage />)
    const entry = screen.getAllByRole('link').find((link) => link.getAttribute('href') === `/profile/${destination}`)!
    fireEvent.click(entry)
    expect(entry).toHaveAttribute('href', `/profile/${destination}`)
    top.unmount()
    const content = render(<ProfileSubscreen screen={destination} />)
    const group = screen.getByTestId(`profile-settings-group-${destination}`)
    for (const label of labels.filter((key) => key !== 'profile.settingsRows.editName')) expect(group.textContent).toContain(label)
    if (destination === 'account') expect(within(group).getByRole('button', { name: /profile.settingsRows.editName/ })).toBeInTheDocument()
    const ordered = labels.filter((label) => label !== 'profile.settingsRows.editName')
    expect(ordered.map((label) => group.textContent.indexOf(label))).toEqual(ordered.map((label) => group.textContent.indexOf(label)).sort((left, right) => left - right))
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: 'common.backToProfile' }))
    expect(mockRouterPush).toHaveBeenCalledWith('/profile')
    for (const other of ['account', 'preferences', 'astra', 'notifications']) {
      if (other !== destination) expect(screen.queryByTestId(`profile-settings-group-${other}`)).not.toBeInTheDocument()
    }
    content.unmount()
  })

  it('opens settings through four sub-menu entries instead of rendering their controls on Perfil', () => {
    render(<ProfilePage />)
    for (const path of ['/profile/account', '/profile/preferences', '/profile/astra', '/profile/notifications']) {
      expect(screen.getAllByRole('link').some((link) => link.getAttribute('href') === path)).toBe(true)
    }
    expect(screen.queryByRole('button', { name: /profile.settingsRows.timezone/ })).not.toBeInTheDocument()
    expect(screen.queryByTestId('profile-api-keys')).not.toBeInTheDocument()
  })

  beforeEach(() => {
    mockPushPreferenceState.current = { supported: true, subscribed: false, permission: 'default', status: 'not-registered' }
    mockTranslate.current = (key, params) => key === 'profile.settingsRows.devicesCount' ? [params?.count ?? '', 'of', params?.max ?? ''].join(' ') : key
    mockLocale.current = 'en'
    useUIStore.getState().setAstraConversationOpen(false)
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
    mockApplyTheme.mockReset()
    mockUpdateWeekStartDay.mockReset().mockResolvedValue(undefined)
    mockUpdateLanguage.mockReset().mockRejectedValue(new Error('save failed'))
    mockTogglePush.mockReset().mockResolvedValue(undefined)
    mockDeviceState.current = { count: 0, max: 5, isCurrentDeviceRegistered: false, isLoading: false, isError: false, refresh: vi.fn().mockResolvedValue(undefined) }
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
      'profile.groups.more',
    ])
    expect(screen.getByText('profile.settingsRows.wrapped')).toBeInTheDocument()
    expect(screen.queryByText('profile.wrappedHint')).not.toBeInTheDocument()
    expect(screen.getByText('profile.widgetTitle')).toBeInTheDocument()
    expect(screen.getByText('profile.calendarSync.title')).toBeInTheDocument()
    expect(screen.getByText('profile.support.rowTitle')).toBeInTheDocument()
    expect(screen.getByText('profile.aboutRow')).toBeInTheDocument()
    expect(screen.queryByText('profile.aboutRowHint')).not.toBeInTheDocument()
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

  it('places the clock choice between week start and language', () => {
    mockProfileState.current.profile = createMockProfile({ uses24HourClock: true })
    render(<ProfileSubscreen screen="preferences" />)
    const week = screen.getByRole('button', { name: /profile.settingsRows.weekStart/i })
    const clock = screen.getByRole('button', { name: /settings.clock.title/i })
    const language = screen.getByRole('button', { name: /profile.language.title/i })
    expect(week.compareDocumentPosition(clock) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(clock.compareDocumentPosition(language) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(clock).toHaveTextContent('settings.clock.hour24')
  })

  it('opens each inline preference directly and sends Support to its form', () => {
    for (const label of ['profile.language.title', 'profile.settingsRows.weekStart', 'settings.clock.title']) {
      const view = render(<ProfileSubscreen screen="preferences" />)
      mockRouterPush.mockClear()
      fireEvent.click(screen.getByRole('button', { name: new RegExp(label, 'i') }))
      expect(mockRouterPush).not.toHaveBeenCalled()
      expect(screen.getByRole('dialog')).toBeInTheDocument()
      view.unmount()
    }
    render(<ProfileSubscreen screen="preferences" />)
    const themeChoices = screen.getByRole('group', { name: 'profile.settingsRows.theme' })
    expect(themeChoices).toContainElement(screen.getByRole('button', { name: 'preferences.themeModeDark' }))
    expect(themeChoices).toContainElement(screen.getByRole('button', { name: 'preferences.themeModeLight' }))
    expect(themeChoices).toHaveClass('flex-wrap', 'max-w-full')
    render(<ProfilePage />)
    expect(screen.getByRole('link', { name: /profile\.support\.rowTitle/i })).toHaveAttribute('href', '/support')
  })

  it('changes the inline theme and general habits preference', () => {
    const write = vi.spyOn(Storage.prototype, 'setItem')
    render(<ProfileSubscreen screen="preferences" />)
    fireEvent.click(screen.getByRole('button', { name: 'preferences.themeModeLight' }))
    expect(mockApplyTheme).toHaveBeenCalledWith('light')

    const showGeneral = screen.getByRole('switch', { name: 'settings.homeScreen.showGeneral' })
    fireEvent.click(showGeneral)
    expect(showGeneral).toHaveAttribute('aria-checked', 'true')
    expect(write).toHaveBeenCalledWith(expect.stringContaining('orbit_show_general_on_today'), 'true')
    write.mockRestore()
  })

  it('opens widget help inline', () => {
    render(<ProfilePage />)
    fireEvent.click(screen.getByRole('button', { name: /profile\.widgetTitle/i }))
    expect(screen.getByRole('dialog', { name: 'profile.widgetTitle' })).toBeInTheDocument()
  })

  it('commits a week start choice from the inline picker', () => {
    render(<ProfileSubscreen screen="preferences" />)
    fireEvent.click(screen.getByRole('button', { name: /profile\.settingsRows\.weekStart/i }))
    fireEvent.click(screen.getByRole('radio', { name: 'settings.weekStartDay.sunday' }))
    expect(mockUpdateWeekStartDay).toHaveBeenCalledWith({ weekStartDay: 0 }, 'account-a')
  })

  it('submits a language choice from the inline picker', async () => {
    render(<ProfileSubscreen screen="preferences" />)
    fireEvent.click(screen.getByRole('button', { name: /profile\.language\.title/i }))
    fireEvent.click(screen.getByRole('radio', { name: 'Português' }))
    await waitFor(() => expect(mockUpdateLanguage).toHaveBeenCalledWith({ language: 'pt-BR' }, 'account-a'))
  })

  it('uses the current device switch to enable browser push', () => {
    render(<ProfileSubscreen screen="notifications" />)
    fireEvent.click(screen.getByRole('switch', { name: 'profile.settingsRows.alertsOnThisDevice' }))
    expect(mockTogglePush).toHaveBeenCalledWith(true)
  })

  it.each([0, 1, 5])('shows %i devices against the cap', (count) => {
    mockDeviceState.current.count = count
    render(<ProfileSubscreen screen="notifications" />)
    expect(screen.getByText(`${count} of 5`)).toBeInTheDocument()
    expect(screen.getByText('profile.settingsRows.devices')).toBeInTheDocument()
    expect(screen.getByText('profile.settingsRows.currentDevice')).toBeInTheDocument()
    expect(screen.queryByText('profile.settingsRows.alertsOnThisDevice')).not.toBeInTheDocument()
  })

  it('names this device when its endpoint is registered and turns it off', () => {
    mockDeviceState.current.count = 1
    mockDeviceState.current.isCurrentDeviceRegistered = true
    render(<ProfileSubscreen screen="notifications" />)
    const control = screen.getByRole('switch', { name: 'profile.settingsRows.alertsOnThisDevice' })
    expect(control).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByText('profile.settingsRows.currentDevice')).toBeInTheDocument()
    expect(screen.queryByText('profile.settingsRows.alertsOnThisDevice')).not.toBeInTheDocument()
    fireEvent.click(control)
    expect(mockTogglePush).toHaveBeenCalledWith(false)
  })

  it('reserves the count while devices load', () => {
    mockDeviceState.current.count = undefined
    mockDeviceState.current.isLoading = true
    render(<ProfileSubscreen screen="notifications" />)
    const placeholder = screen.getByRole('status', { name: 'profile.loading' })
    expect(placeholder.closest('[aria-busy]')).toHaveAttribute('aria-busy', 'true')
  })

  it('keeps browser push status empty and reserves the switch while checking', () => {
    mockPushPreferenceState.current = { supported: false, subscribed: false, permission: '', status: 'checking' }
    render(<ProfileSubscreen screen="notifications" />)
    expect(screen.queryByText('settings.notifications.unsupported')).not.toBeInTheDocument()
    expect(screen.queryByRole('switch', { name: 'profile.settingsRows.alertsOnThisDevice' })).not.toBeInTheDocument()
    expect(screen.getByTestId('push-status')).toHaveTextContent(/^\s*$/)
    expect(screen.getByTestId('push-status').closest('[aria-busy]')).toHaveAttribute('aria-busy', 'true')
  })

  it('reports unsupported after browser push checking finishes', () => {
    mockPushPreferenceState.current = { supported: false, subscribed: false, permission: '', status: 'unsupported' }
    render(<ProfileSubscreen screen="notifications" />)
    expect(screen.getByTestId('push-status')).toHaveTextContent('settings.notifications.unsupported')
    expect(screen.getByRole('switch', { name: 'profile.settingsRows.alertsOnThisDevice' })).toBeDisabled()
  })

  it('explains the full device cap and keeps this device off', () => {
    mockDeviceState.current.count = 5
    render(<ProfileSubscreen screen="notifications" />)
    expect(screen.getByText('profile.settingsRows.pushDeviceLimit')).toBeInTheDocument()
    expect(screen.getByRole('switch', { name: 'profile.settingsRows.alertsOnThisDevice' })).toBeDisabled()
  })

  it('offers retry when the device list fails', () => {
    mockDeviceState.current.isError = true
    render(<ProfileSubscreen screen="notifications" />)
    fireEvent.click(screen.getByRole('button', { name: 'common.retry' }))
    expect(mockDeviceState.current.refresh).toHaveBeenCalledOnce()
  })

  it('keeps the share card off Perfil', () => {
    render(<ProfilePage />)
    expect(screen.queryByRole('button', { name: /shareCard\.entry/i })).not.toBeInTheDocument()
  })

  it('puts Sign out first in Ending things', () => {
    render(<ProfilePage />)
    const ending = screen.getByTestId('profile-settings-group-ending')

    expect(within(ending).getAllByRole('button')[0]).toHaveTextContent('profile.settingsRows.signOut')
  })

  it('routes every More of Orbit row', () => {
    const view = render(<ProfilePage />)
    const freeMore = within(screen.getByTestId('profile-settings-group-more'))

    expect(freeMore.getByRole('link', { name: /profile\.settingsRows\.wrapped/i })).toHaveAttribute('href', '/wrapped')
    expect(freeMore.getByRole('button', { name: /profile\.widgetTitle/i })).toBeInTheDocument()
    const calendarGate = freeMore.getByRole('link', { name: /profile\.calendarSync\.title/i })
    expect(calendarGate).toHaveAttribute('href', '/upgrade')
    expect(calendarGate).not.toHaveAttribute('aria-disabled', 'true')
    expect(freeMore.getByRole('link', { name: /profile\.support\.rowTitle/i })).toHaveAttribute('href', '/support')
    expect(freeMore.getByRole('link', { name: /profile\.aboutRow/i })).toHaveAttribute('href', '/about')
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
    expect(proMore.getByRole('link', { name: /profile\.calendarSync\.title/i })).toHaveAttribute('href', '/calendar')
    expect(proMore.queryByText('common.proBadge')).not.toBeInTheDocument()
  })

  it('shows the free daily allowance as an enabled route to Pro', () => {
    render(<ProfileSubscreen screen="astra" />)

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
    render(<ProfileSubscreen screen="astra" />)

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

  it.each([
    ['pt-BR', false, 'Astra avisa quando algo escapa', 'Resumo do dia pela Astra'],
    ['pt-BR', true, 'Astra avisa quando algo escapa', 'Resumo do dia pela Astra'],
    ['en', false, 'Astra tells you when something slips', 'Daily summary from Astra'],
    ['en', true, 'Astra tells you when something slips', 'Daily summary from Astra'],
  ] as const)('renders the %s Astra labels for Pro access %s', (locale, hasProAccess, proactive, summary) => {
    mockLocale.current = locale
    const messages = locale === 'pt-BR' ? ptBR : en
    mockTranslate.current = (key) => {
      let message: unknown = messages
      for (const segment of key.split('.')) {
        message = message && typeof message === 'object'
          ? (message as Record<string, unknown>)[segment]
          : undefined
      }
      return typeof message === 'string' ? message : key
    }
    mockProfileState.current.profile = createMockProfile({
      plan: hasProAccess ? 'pro' : 'free', hasProAccess, language: locale,
    })
    render(<ProfileSubscreen screen="astra" />)

    const astra = within(screen.getByTestId('profile-settings-group-astra'))
    if (hasProAccess) {
      expect(astra.getByRole('switch', { name: proactive })).toBeInTheDocument()
      expect(astra.getByRole('switch', { name: summary })).toBeInTheDocument()
    } else {
      for (const label of [proactive, summary]) {
        const row = astra.getByRole('button', { name: new RegExp(label) })
        expect(within(row).getByText('Pro')).toBeInTheDocument()
        expect(row).toBeEnabled()
        fireEvent.click(row)
      }
      expect(mockRouterPush).toHaveBeenNthCalledWith(1, '/upgrade')
      expect(mockRouterPush).toHaveBeenNthCalledWith(2, '/upgrade')
    }
  })

  it('shows only the API key description and upgrade row to free accounts', () => {
    render(<ProfileSubscreen screen="astra" />)

    const apiKeys = within(screen.getByTestId('profile-api-keys'))
    expect(apiKeys.getByText('profile.apiKeys.description')).toBeInTheDocument()
    const upgradeRow = apiKeys.getByRole('button', { name: 'profile.apiKeys.unlock' })
    expect(apiKeys.queryByText('orbitMcp.noKeys')).not.toBeInTheDocument()
    expect(upgradeRow).toBeEnabled()

    fireEvent.click(upgradeRow)
    expect(mockRouterPush).toHaveBeenCalledWith('/upgrade')
  })

  it('badges the locked API keys section Pro, never with the trial label', () => {
    mockProfileState.current = {
      profile: createMockProfile({ plan: 'free', hasProAccess: false, isTrialActive: true }),
      isLoading: false,
      error: null,
    }
    render(<ProfileSubscreen screen="astra" />)

    const apiKeys = within(screen.getByTestId('profile-api-keys'))
    const badges = apiKeys.getAllByText('common.proBadge')
    expect(badges).toHaveLength(2)
    expect(badges.map((badge) => badge.dataset.variant)).toEqual(['solid', 'solid'])
    expect(apiKeys.queryByText('trial.proBadge')).not.toBeInTheDocument()
  })

  it('keeps every free API key state on the enabled lock route', () => {
    mockStepUpVerified.current = true
    mockApiKeys.current = [{
      id: 'key-1',
      name: 'Work key',
      keyPrefix: 'orb_live_1234',
    }]

    render(<ProfileSubscreen screen="astra" />)

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
    render(<ProfileSubscreen screen="astra" />)

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

    render(<ProfileSubscreen screen="astra" />)

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
    render(<ProfileSubscreen screen="astra" />)

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
    const firstView = render(<ProfileSubscreen screen="astra" />)

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
    render(<ProfileSubscreen screen="astra" />)
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
    const firstView = render(<ProfileSubscreen screen="astra" />)

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
    render(<ProfileSubscreen screen="astra" />)
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
    render(<ProfileSubscreen screen="astra" />)

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
    render(<ProfileSubscreen screen="astra" />)

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
    render(<ProfileSubscreen screen="astra" />)

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
    const proactiveRow = proactiveSwitch.closest('[data-testid="profile-value-row"]')
    const summaryRow = summarySwitch.closest('[data-testid="profile-value-row"]')
    expect(summaryRow?.parentElement).not.toBe(proactiveRow?.parentElement)
    expect(summaryRow?.parentElement?.getAttribute('style')).toContain('border-top: 1px solid var(--hairline)')
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
    render(<ProfileSubscreen screen="astra" />)

    const astra = within(screen.getByTestId('profile-settings-group-astra'))
    expect(astra.getByText('profile.allowance.pro')).toBeInTheDocument()
    expect(astra.queryByRole('link', { name: 'profile.allowance.seePro' })).not.toBeInTheDocument()
    expect(astra.queryByRole('link', { name: 'profile.allowance.manageSubscription' })).not.toBeInTheDocument()
  })

  it('shows Preparing on the row and registers completion in the shell notice slot', async () => {
    let finishExport!: (value: Record<string, never>) => void
    mockExportUserData.mockReturnValueOnce(
      new Promise((resolve) => {
        finishExport = resolve
      }),
    )
    render(<ProfileSubscreen screen="account" />)

    const exportRow = screen.getByRole('button', { name: /profile\.settingsRows\.export/i })
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
    render(<ProfileSubscreen screen="preferences" />)

    fireEvent.click(
      screen.getByRole('button', { name: /profile.settingsRows.timezone/ }),
    )

    expect(
      screen.getByRole('dialog', { name: 'profile.settingsRows.timezone' }),
    ).toBeInTheDocument()
  })

  it('renders only the drawn Notifications rows and the recorded deviations, in order', () => {
    render(<ProfileSubscreen screen="notifications" />)

    const notificationsGroup = screen.getByTestId('profile-settings-group-notifications')
    const controls = [...notificationsGroup.querySelectorAll('button, a, input')].map((control) =>
      `${control.getAttribute('role') ?? control.tagName.toLowerCase()}: ${control.getAttribute('aria-label') ?? control.textContent}`)
    const textLines = [...notificationsGroup.querySelectorAll('*')]
      .filter((element) => element.children.length === 0 && element.textContent.trim())
      .map((element) => element.textContent)

    expect(controls).toEqual([
      'switch: profile.settingsRows.alertsOnThisDevice',
      'button: profile.marketingEmails.accept',
      'button: profile.marketingEmails.decline',
    ])
    expect(textLines).toEqual([
      'profile.settingsRows.devices',
      '0 of 5',
      'profile.settingsRows.currentDevice',
      'profile.marketingEmails.question',
      'profile.marketingEmails.questionDescription',
      'profile.marketingEmails.accept',
      'profile.marketingEmails.decline',
      'profile.settingsRows.remindersNote',
    ])
  })

  it('restores the analytics switch and explains a failed local save', async () => {
    const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('storage failed')
    })
    try {
      render(<ProfileSubscreen screen="account" />)
      const control = screen.getByRole('switch', { name: 'profile.analytics.title' })
      fireEvent.click(control)
      await waitFor(() => expect(control).toHaveAttribute('aria-checked', 'true'))
      expect(screen.getByRole('status')).toHaveTextContent('profile.analytics.saveError')
    } finally {
      write.mockRestore()
    }
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
