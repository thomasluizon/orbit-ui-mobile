import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import en from '@orbit/shared/i18n/en.json'

const mocks = vi.hoisted(() => ({  }))

vi.mock('next/navigation', async (importOriginal) => ({ ...await importOriginal<typeof import('next/navigation')>(), useRouter: () => ({ push: vi.fn(), replace: vi.fn() }), useSearchParams: () => new URLSearchParams(), usePathname: () => '/onboarding' }))
vi.mock('@/lib/providers', () => ({ Providers: ({ children }: { children: ReactNode }) => <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider> }))
vi.mock('@/hooks/use-profile', () => ({ useProfile: () => ({ profile: undefined, refetch: vi.fn() }) }))
vi.mock('@/hooks/use-onboarding-suggestion', () => ({ useOnboardingSuggestion: () => ({ available: false, mutateAsync: vi.fn(), verification: null, cancel: vi.fn() }) }))
vi.mock('@/hooks/use-push-notification-preferences', () => ({ usePushNotificationPreferences: () => ({ supported: true, permission: 'default' }), subscribeToPushNotifications: vi.fn(), requestWebPushPermission: vi.fn() }))
vi.mock('@/lib/posthog', async (importOriginal) => ({ ...await importOriginal<typeof import('@/lib/posthog')>(), captureGuidedFlowEvent: vi.fn(), captureGuidedFlowCompleted: vi.fn() }))

import OnboardingLayout from '@/app/(onboarding)/layout'
import OnboardingPage from '@/app/(onboarding)/onboarding/page'
import { RetainedOnboardingOverlay } from '@/components/onboarding/retained-onboarding-overlay'
import { ShellWide } from '@/components/shell/shell-wide'
import { useOnboardingDraftStore } from '@/stores/onboarding-draft-store'

const copy = en.onboarding.flow

function renderOnboardingRoute() {
  return render(
    <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
      <OnboardingLayout><OnboardingPage /></OnboardingLayout>
    </NextIntlClientProvider>,
  )
}

function expectOneMainLandmarkOutsideTheDialog(state: string) {
  const landmarks = document.querySelectorAll('main')
  expect(landmarks, state).toHaveLength(1)
  expect(landmarks[0]?.closest('[role="dialog"]'), state).toBeNull()
}

function renderRetainedOnboarding() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
        <ShellWide nav={false}><h1>Today</h1></ShellWide>
        <RetainedOnboardingOverlay />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  )
}

async function dialog() {
  return within(await screen.findByRole('dialog'))
}

async function expectDoneShell() {
  const onboarding = await dialog()
  await waitFor(() => expect(onboarding.getAllByRole('navigation', { name: en.nav.mainNavigation }).length).toBeGreaterThan(0))
  expect(document.querySelector('[role="dialog"] [data-shell-scroller]')).toBeInTheDocument()
}

describe('the one main landmark of /onboarding, through the real layout, shells and flow', () => {
  beforeEach(() => {
    localStorage.clear()
    useOnboardingDraftStore.getState().reset()
    useOnboardingDraftStore.setState({ onboardingLocallyDone: false, introSeen: false })
  })
  afterEach(() => {
    cleanup()
  })

  it('holds exactly one main landmark on the intro, on the first question and on the done shell with the guided flag on', async () => {
    renderOnboardingRoute()
    const onboarding = await dialog()

    const skipIntro = await onboarding.findByRole('button', { name: copy.guided.intro.skip })
    expect(document.querySelector('[data-question-flow]')).toBeInTheDocument()
    expectOneMainLandmarkOutsideTheDialog('the intro')

    fireEvent.click(skipIntro)
    const leave = await onboarding.findByRole('button', { name: copy.skip })
    expectOneMainLandmarkOutsideTheDialog('the first question')

    fireEvent.click(leave)
    await expectDoneShell()
    expectOneMainLandmarkOutsideTheDialog('the done shell')
  })
})
