import type { ReactNode } from 'react'
import { render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import en from '@orbit/shared/i18n/en.json'
import OnboardingLayout from '@/app/(onboarding)/layout'
import OnboardingPage from '@/app/(onboarding)/onboarding/page'
import { OnboardingActionsProvider, type OnboardingActions } from '@/components/onboarding/onboarding-actions-context'
import { OnboardingFlow } from '@/components/onboarding/onboarding-flow'
import { ShellWide } from '@/components/shell/shell-wide'

vi.mock('next/navigation', () => ({
  usePathname: () => '/onboarding',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('@/lib/providers', () => ({ Providers: ({ children }: { children: ReactNode }) => children }))
vi.mock('@/stores/onboarding-draft-store', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/stores/onboarding-draft-store')>(),
  useOnboardingDraftHydrated: () => true,
}))
vi.mock('@/hooks/use-is-desktop', () => ({ useIsWideDesktop: () => false, useIsDesktop: () => false }))
vi.mock('@/hooks/use-profile', () => ({ useProfile: () => ({ profile: undefined, refetch: vi.fn() }) }))
vi.mock('@/hooks/use-onboarding-suggestion', () => ({
  useOnboardingSuggestion: () => ({ available: false, verification: null, cancel: vi.fn(), mutateAsync: vi.fn() }),
}))
vi.mock('@/hooks/use-push-notification-preferences', () => ({
  usePushNotificationPreferences: () => ({ supported: false }),
  subscribeToPushNotifications: vi.fn(),
  requestWebPushPermission: vi.fn(),
}))
vi.mock('@/components/onboarding/onboarding-pro-step', () => ({ OnboardingProStep: () => null }))
vi.mock('@/components/ui/update-available-banner', () => ({ UpdateAvailableBanner: () => null }))
vi.mock('@/components/ui/app-toast-host', () => ({ AppToastHost: () => null }))

const DUPLICATE_NAME_WARNING = 'There are two <ViewTransition name=%s> components with the same name mounted at the same time.'

const liveActions = {
  createHabit: vi.fn(), updateHabit: vi.fn(), createHabitsBulk: vi.fn(), logHabit: vi.fn(),
  createGoal: vi.fn(), setWeekStartDay: vi.fn(), deferPushRegistration: vi.fn(),
  recordCompletion: vi.fn(), finishOnboarding: vi.fn(),
} as unknown as OnboardingActions

function withMessages(children: ReactNode) {
  return <NextIntlClientProvider locale="en" messages={en}>{children}</NextIntlClientProvider>
}

function duplicateNameWarnings(consoleError: MockInstance<typeof console.error>) {
  return consoleError.mock.calls.filter(([message]) => typeof message === 'string' && message.startsWith(DUPLICATE_NAME_WARNING))
}

describe('tab view transition boundary ownership', () => {
  let consoleError: MockInstance<typeof console.error>

  beforeEach(() => {
    consoleError = vi.spyOn(console, 'error')
  })

  afterEach(() => {
    consoleError.mockRestore()
  })

  it('mounts no orbit-tab-page boundary in the onboarding layout shell around the onboarding flow', async () => {
    render(withMessages(<OnboardingLayout><OnboardingPage /></OnboardingLayout>))

    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    expect(duplicateNameWarnings(consoleError)).toEqual([])
  })

  it('keeps the destination shell boundary alone beside the retained onboarding Done shell', async () => {
    render(withMessages(<>
      <ShellWide astraRow={{ label: 'Astra', onOpen: () => {} }} items={[]} activeId="hoje" navLabel="Main" tabViewTransition>
        <p>Today</p>
      </ShellWide>
      <OnboardingActionsProvider actions={liveActions} isLive>
        <OnboardingFlow finalStepOnly />
      </OnboardingActionsProvider>
    </>))

    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    expect(duplicateNameWarnings(consoleError)).toEqual([])
  })
})
