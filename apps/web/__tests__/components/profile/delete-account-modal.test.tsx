import { getHeldAccountId, useAuthStore } from '@/stores/auth-store'
import { destructiveFailureCases, destructiveActionMessage } from '@orbit/shared/test-support/destructive-action-fixtures'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { expectSmallSheetActions, sheetSlotButtons } from '@/__tests__/support/sheet-slots'
import en from '@orbit/shared/i18n/en.json'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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

const failureCopy = vi.hoisted(() => ({ actual: false, locale: 'en' }))

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) => {
    if (failureCopy.actual) return destructiveActionMessage(failureCopy.locale, key)
      const warningKey = key.slice('profile.deleteAccount.'.length)
    const warning = key.startsWith('profile.deleteAccount.warning') || key === 'profile.deleteAccount.offlineDescription'
      ? Reflect.get(en.profile.deleteAccount, warningKey) as unknown
      : undefined
    if (typeof warning === 'string') {
      return warning.replace(/\{(\w+)\}/g, (_, token: string) => String(params?.[token]))
    }
    return params ? `${key}:${JSON.stringify(params)}` : key
  },
  useLocale: () => 'en',
}))

vi.mock('@/lib/actions/auth', () => ({
  requestDeletion: () => mocks.requestDeletion(),
}))

vi.mock('@/lib/step-up-storage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/step-up-storage')>()),
  beginStepUpChallenge: (operation: string, accountId: string | null) =>
    mocks.beginChallenge(operation, accountId),
}))

vi.mock('@/components/ui/sheet', async () =>
  await import('@/__tests__/support/sheet-double'))

import { DeleteAccountModal } from '@/app/(app)/profile/_components/delete-account-modal'
import {
  holdAccount,
  retireHeldAccount,
  recoverSameAccount,
  replaceAccountWith,
} from '@/__tests__/support/account-change'

const profile = {
  name: 'Alex',
  email: 'alex@example.com',
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
    failureCopy.actual = false; failureCopy.locale = 'en'
    vi.clearAllMocks()
    sheetTestControls.defer(false)
    mocks.requestDeletion.mockResolvedValue(undefined)
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
    vi.stubGlobal('fetch', vi.fn())
    holdAccount('user-1')
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('explains Apple cancellation while preserving the deletion window', () => {
    render(<DeleteAccountModal open onOpenChange={mocks.onOpenChange} profile={{ ...profile, billingProvider: 'app_store' }} />)
    expect(screen.getByText(new RegExp(en.profile.deleteAccount.warningAppStore))).toBeInTheDocument()
    expect(screen.getByText(new RegExp(en.profile.deleteAccount.warningFree))).toBeInTheDocument()
  })

  it('shows the Pro deletion upper bound without tying it to the plan ending', () => {
    render(
      <DeleteAccountModal
        open
        onOpenChange={mocks.onOpenChange}
        profile={{
          ...profile,
          plan: 'pro',
          hasProAccess: true,
          planExpiresAt: '2999-01-01T00:00:00Z',
        }}
      />,
    )

    expect(screen.getByText(/up to 30 days from today/i)).toHaveTextContent(
      en.profile.deleteAccount.warningPro,
    )
    expect(screen.queryByText(/after your plan ends/i)).not.toBeInTheDocument()
    expect(screen.queryByText(en.profile.deleteAccount.warningFree)).not.toBeInTheDocument()
  })

  it('shows the Free warning for Pro access without a plan expiry', () => {
    render(
      <DeleteAccountModal
        open
        onOpenChange={mocks.onOpenChange}
        profile={{
          ...profile,
          plan: 'pro',
          hasProAccess: true,
          planExpiresAt: null,
        }}
      />,
    )

    expect(screen.getByText(en.profile.deleteAccount.warningFree)).toBeInTheDocument()
    expect(screen.queryByText(en.profile.deleteAccount.warningPro)).not.toBeInTheDocument()
  })

  it('shows the Free warning for Pro access with a past plan expiry', () => {
    render(
      <DeleteAccountModal
        open
        onOpenChange={mocks.onOpenChange}
        profile={{
          ...profile,
          plan: 'pro',
          hasProAccess: true,
          planExpiresAt: '2000-01-01T00:00:00Z',
        }}
      />,
    )

    expect(screen.getByText(en.profile.deleteAccount.warningFree)).toBeInTheDocument()
    expect(screen.queryByText(en.profile.deleteAccount.warningPro)).not.toBeInTheDocument()
  })

  it('renders nothing while closed', () => {
    const { container } = render(
      <DeleteAccountModal open={false} onOpenChange={mocks.onOpenChange} profile={profile} />,
    )
    expect(container).toBeEmptyDOMElement()
  })
})
