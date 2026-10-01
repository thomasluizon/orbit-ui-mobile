import type { ReactNode } from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockProfile } from '@orbit/shared/__tests__/factories'
import { CHAT_DRAFT_STORAGE_KEY } from '@orbit/shared/hooks'
import AppLayout from '@/app/(app)/layout'
import { ACCOUNT_CHANGED_ERROR_CODE } from '@/app/actions/action-result'
import { useAuthStore } from '@/stores/auth-store'
import { useUIStore } from '@/stores/ui-store'
import { getCurrentRouteTransitionIntent, resetRouteTransitionIntent } from '@/lib/motion/route-intent'

const mocks = vi.hoisted(() => ({
  profile: undefined as ReturnType<typeof createMockProfile> | undefined,
  patchProfile: vi.fn(),
  dismissCalendarImport: vi.fn(),
  dismissImportPrompt: vi.fn(),
  showPersistentError: vi.fn(),
  router: { push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() },
  searchParams: new URLSearchParams(),
}))

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))
vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useRouter: () => mocks.router,
  useSearchParams: () => mocks.searchParams,
}))
vi.mock('next/dynamic', () => ({ default: () => () => null }))
vi.mock('@/lib/providers', () => ({ Providers: ({ children }: { children: ReactNode }) => children }))
vi.mock('@/lib/account-event-connection', () => ({ AccountEventConnection: () => null }))
vi.mock('@/app/(app)/today-provider', () => ({ TodayProvider: ({ children }: { children: ReactNode }) => children, useToday: () => undefined }))
vi.mock('@/components/shell/destination-shell', () => ({ DestinationShell: ({ children, conversationOpen }: { children: ReactNode; conversationOpen: boolean }) => <main>{children}{conversationOpen ? <p>Astra conversation</p> : null}</main> }))
vi.mock('@/components/command/command-palette', () => ({ CommandPaletteBackground: ({ children }: { children: ReactNode }) => children }))
vi.mock('@/components/motion/route-transition-shell', () => ({ RouteTransitionShell: ({ children }: { children: ReactNode }) => children }))
vi.mock('@/hooks/use-profile', () => ({ useProfile: () => ({ profile: mocks.profile, patchProfile: mocks.patchProfile }) }))
vi.mock('@/hooks/use-offline', () => ({ useOffline: () => ({ isOnline: true }) }))
vi.mock('@/hooks/use-is-desktop', () => ({ useIsWideDesktop: () => false }))
vi.mock('@/hooks/use-timezone-auto-sync', () => ({ useTimezoneAutoSync: () => {} }))
vi.mock('@/hooks/use-onboarding-flush', () => ({ useOnboardingFlush: () => {} }))
vi.mock('@/hooks/use-retained-onboarding-guard', () => ({ useRetainedOnboardingGuard: () => false }))
vi.mock('@/hooks/use-onboarding-pro-pending', () => ({ useOnboardingProPending: () => false }))
vi.mock('@/hooks/use-onboarding-completion-queue', () => ({ useOnboardingCompletionQueue: () => false }))
vi.mock('@/hooks/use-habit-queries', () => ({ useHabitCountLoaded: () => ({ count: 0, isLoaded: true }) }))
vi.mock('@/hooks/use-gamification', () => ({ useGamificationProfile: () => ({ crossedStreakMilestones: [], newAchievements: [] }) }))
vi.mock('@/hooks/use-chat-composer', () => ({ useChatComposer: () => ({ composerProps: {} }) }))
vi.mock('@/stores/onboarding-draft-store', () => ({
  useOnboardingDraftHydrated: () => true,
  useOnboardingHasPendingAnswers: () => false,
  useOnboardingDraftStore: (selector: (state: { pushRegistrationFailed: boolean }) => unknown) => selector({ pushRegistrationFailed: false }),
}))
vi.mock('@/hooks/use-app-toast', () => ({ useAppToast: () => ({ showPersistentError: mocks.showPersistentError }) }))
vi.mock('@/lib/actions/calendar', () => ({ dismissCalendarImport: mocks.dismissCalendarImport }))
vi.mock('@/lib/actions/onboarding', () => ({ dismissImportPrompt: mocks.dismissImportPrompt }))
vi.mock('@/components/navigation/notification-delete-notice', () => ({ NotificationDeleteNotice: () => null }))
vi.mock('@/components/ui/update-available-banner', () => ({ UpdateAvailableBanner: () => null }))
vi.mock('@/components/ui/app-toast-host', () => ({ AppToastHost: () => null }))
vi.mock('@/components/ui/trial-expired-modal', () => ({ TrialExpiredModal: () => null }))
vi.mock('@/components/ui/expiry-warning', () => ({ ExpiryWarning: () => null }))
vi.mock('@/components/onboarding/retained-onboarding-overlay', () => ({ RetainedOnboardingOverlay: () => null }))
vi.mock('@/components/referral/referral-prompt', () => ({ ReferralPrompt: () => null }))
vi.mock('@/components/milestone-share/milestone-share-prompt', () => ({ MilestoneSharePrompt: () => null }))
vi.mock('@/components/marketing-consent/marketing-consent-prompt', () => ({ MarketingConsentPrompt: () => null }))
vi.mock('@/components/shell/composer', () => ({ Composer: () => null }))
vi.mock('@/components/gamification/celebration-panel', () => ({ CelebrationPanel: () => null }))
vi.mock('@/lib/api-fetch-i18n-provider', () => ({ ApiFetchI18nProvider: () => null }))

const prompts = [
  { name: 'calendar', title: 'onboarding.wizard.calendarTitle', later: 'common.later', import: 'onboarding.wizard.calendarButton' },
  { name: 'Astra', title: 'onboarding.wizard.importTitle', later: 'onboarding.wizard.importNotNow', import: 'onboarding.wizard.importButton' },
] as const

function holdDismissal(dialog: HTMLElement) {
  let finish!: () => void
  const finished = new Promise<void>((resolve) => { finish = resolve })
  const readAnimations = vi.fn(() => [{ finished }])
  Object.defineProperty(dialog, 'getAnimations', { configurable: true, value: readAnimations })
  return { readAnimations, finish }
}

describe('AppLayout import prompt dismissal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.dismissCalendarImport.mockResolvedValue(undefined)
    mocks.dismissImportPrompt.mockResolvedValue(undefined)
    useAuthStore.setState({ isAuthenticated: true, startExpiryMonitor: () => () => {} })
    useUIStore.setState(useUIStore.getInitialState())
    localStorage.clear()
    resetRouteTransitionIntent()
  })

  afterEach(() => {
    cleanup()
    useAuthStore.setState(useAuthStore.getInitialState())
  })

  describe.each(prompts)('$name prompt', (prompt) => {
    function mountPrompt() {
      mocks.profile = createMockProfile({
        hasCompletedOnboarding: true,
        hasImportedCalendar: prompt.name === 'Astra',
        hasSeenImportPrompt: prompt.name === 'calendar',
      })
      render(<AppLayout><p>Today content</p></AppLayout>)
      return screen.getByRole('dialog', { name: prompt.title })
    }

    it.each(['later', 'import', 'close'] as const)('waits for dismissal before running %s', async (action) => {
      const dialog = mountPrompt()
      const dismissal = holdDismissal(dialog)
      fireEvent.click(screen.getByRole('button', { name: action === 'close' ? 'common.close' : prompt[action] }))

      expect(dialog).toBeInTheDocument()
      await waitFor(() => expect(dismissal.readAnimations).toHaveBeenCalled())
      expect(dialog).toBeInTheDocument()
      expect(mocks.dismissCalendarImport).not.toHaveBeenCalled()
      expect(mocks.dismissImportPrompt).not.toHaveBeenCalled()
      expect(mocks.patchProfile).not.toHaveBeenCalled()
      expect(mocks.router.push).not.toHaveBeenCalled()
      expect(screen.queryByText('Astra conversation')).toBeNull()
      expect(localStorage.getItem(CHAT_DRAFT_STORAGE_KEY)).toBeNull()
      expect(getCurrentRouteTransitionIntent()).toBe('neutral')

      await act(async () => { dismissal.finish() })
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
      const dismissAction = prompt.name === 'calendar' ? mocks.dismissCalendarImport : mocks.dismissImportPrompt
      expect(dismissAction).toHaveBeenCalledOnce()
      if (prompt.name === 'Astra') expect(mocks.patchProfile).toHaveBeenCalledExactlyOnceWith({ hasSeenImportPrompt: true })
      if (action === 'import' && prompt.name === 'calendar') {
        expect(mocks.router.push).toHaveBeenCalledExactlyOnceWith('/calendar?import=1')
        expect(screen.queryByText('Astra conversation')).toBeNull()
      } else if (action === 'import') {
        expect(screen.getByText('Astra conversation')).toBeInTheDocument()
        expect(localStorage.getItem(CHAT_DRAFT_STORAGE_KEY)).toBe('onboarding.flow.meetAstra.importPrompt')
        expect(mocks.router.push).not.toHaveBeenCalled()
      } else {
        expect(mocks.router.push).not.toHaveBeenCalled()
        expect(screen.queryByText('Astra conversation')).toBeNull()
        expect(localStorage.getItem(CHAT_DRAFT_STORAGE_KEY)).toBeNull()
      }
      expect(getCurrentRouteTransitionIntent()).toBe(action === 'import' ? 'forward' : 'neutral')
    })

    it.each(['later', 'import', 'close'] as const)('preserves account-change feedback after %s', async (action) => {
      const dismissAction = prompt.name === 'calendar' ? mocks.dismissCalendarImport : mocks.dismissImportPrompt
      dismissAction.mockRejectedValue({ code: ACCOUNT_CHANGED_ERROR_CODE })
      const dismissal = holdDismissal(mountPrompt())
      fireEvent.click(screen.getByRole('button', { name: action === 'close' ? 'common.close' : prompt[action] }))
      await waitFor(() => expect(dismissal.readAnimations).toHaveBeenCalled())
      expect(mocks.showPersistentError).not.toHaveBeenCalled()

      await act(async () => { dismissal.finish() })
      await waitFor(() => expect(mocks.showPersistentError).toHaveBeenCalledExactlyOnceWith('errors.api.accountChanged', 'errorScreen.reload'))
      expect(screen.queryByRole('dialog')).toBeNull()
    })
  })
})
