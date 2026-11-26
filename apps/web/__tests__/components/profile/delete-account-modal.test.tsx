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

  describe('the code request step of the guided flow', () => {
    const reachTheSendStep = () => fireEvent.click(screen.getByRole('button', { name: 'common.continue' }))
    const sendCode = () => screen.getByRole('button', { name: 'profile.deleteAccount.sendCode' })

    it('sends one deletion request when Send code is pressed twice in the same turn', async () => {
      let reject!: (error: Error) => void
      mocks.requestDeletion.mockReturnValueOnce(new Promise<void>((_resolve, rejectRequest) => { reject = rejectRequest }))
      render(<DeleteAccountModal open onOpenChange={mocks.onOpenChange} profile={profile} />)
      reachTheSendStep()
      const send = sendCode()
      act(() => { fireEvent.click(send); fireEvent.click(send) })
      expect(mocks.requestDeletion).toHaveBeenCalledOnce()
      await act(async () => reject(new Error('Failed')))
      expect(useAuthStore.getState().isAuthenticated).toBe(true)
      expect(getHeldAccountId()).toBe('user-1')
    })

    it.each(destructiveFailureCases.flatMap(scenario => ['en', 'pt-BR'].map(locale => ({ ...scenario, locale }))))('shows $kind failure copy in $locale and keeps the session', async ({ createError, key, locale }) => {
      failureCopy.actual = true; failureCopy.locale = locale
      mocks.requestDeletion.mockRejectedValueOnce(createError())
      render(<DeleteAccountModal open onOpenChange={mocks.onOpenChange} profile={profile} />)
      fireEvent.click(screen.getByRole('button', { name: destructiveActionMessage(locale, 'common.continue') }))
      const label = destructiveActionMessage(locale, 'profile.deleteAccount.sendCode')
      fireEvent.click(screen.getByRole('button', { name: label }))
      expect(await screen.findByRole('alert')).toHaveTextContent(destructiveActionMessage(locale, key ?? 'profile.deleteAccount.errorGeneric'))
      expect(screen.getByRole('button', { name: label })).toBeEnabled()
      expect(useAuthStore.getState().isAuthenticated).toBe(true)
      expect(getHeldAccountId()).toBe('user-1')
      expect(mocks.beginChallenge).not.toHaveBeenCalled()
      expect(mocks.push).not.toHaveBeenCalled()
      expect(mocks.onOpenChange).not.toHaveBeenCalled()
    })

    it('does not request deletion without an account', async () => {
      await retireHeldAccount()
      render(<DeleteAccountModal open onOpenChange={mocks.onOpenChange} profile={profile} />)
      reachTheSendStep()
      fireEvent.click(sendCode())
      expect(mocks.requestDeletion).not.toHaveBeenCalled()
      expect(mocks.beginChallenge).not.toHaveBeenCalled()
    })

    it('persists the challenge and routes to the deletion step up screen', async () => {
      render(<DeleteAccountModal open onOpenChange={mocks.onOpenChange} profile={profile} />)
      reachTheSendStep()
      fireEvent.click(sendCode())

      await waitFor(() => expect(mocks.requestDeletion).toHaveBeenCalledOnce())
      expect(mocks.beginChallenge).toHaveBeenCalledWith('delete', 'user-1')
      expect(mocks.onOpenChange).toHaveBeenCalledWith(false)
      expect(mocks.push).toHaveBeenCalledWith('/step-up?operation=delete')
    })

    it('keeps the first gate open and reports a safe error when sending fails', async () => {
      mocks.requestDeletion.mockRejectedValueOnce(new Error('private backend detail'))
      render(<DeleteAccountModal open onOpenChange={mocks.onOpenChange} profile={profile} />)
      reachTheSendStep()
      fireEvent.click(sendCode())

      expect(await screen.findByRole('alert')).toHaveTextContent('profile.deleteAccount.errorGeneric')
      expect(mocks.beginChallenge).not.toHaveBeenCalled()
      expect(mocks.push).not.toHaveBeenCalled()
      expect(useAuthStore.getState().isAuthenticated).toBe(true)
      expect(getHeldAccountId()).toBe('user-1')
    })

    it('drops the send failure when another account replaces the tab', async () => {
      mocks.requestDeletion.mockRejectedValueOnce(new Error('private backend detail'))
      render(<DeleteAccountModal open onOpenChange={mocks.onOpenChange} profile={profile} />)
      reachTheSendStep()
      fireEvent.click(sendCode())
      expect(await screen.findByRole('alert')).toHaveTextContent('profile.deleteAccount.errorGeneric')

      await replaceAccountWith('user-2')

      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
      expect(useAuthStore.getState().isAuthenticated).toBe(true)
      expect(getHeldAccountId()).toBe('user-2')
    })

    it('keeps the send failure when the same account recovers from a rejected refresh', async () => {
      mocks.requestDeletion.mockRejectedValueOnce(new Error('private backend detail'))
      render(<DeleteAccountModal open onOpenChange={mocks.onOpenChange} profile={profile} />)
      reachTheSendStep()
      fireEvent.click(sendCode())
      expect(await screen.findByRole('alert')).toHaveTextContent('profile.deleteAccount.errorGeneric')

      await recoverSameAccount('user-1')

      expect(screen.getByRole('alert')).toHaveTextContent('profile.deleteAccount.errorGeneric')
      expect(getHeldAccountId()).toBe('user-1')
    })

    it('drops a late send failure when another account replaced the tab mid request', async () => {
      let reject!: (error: Error) => void
      mocks.requestDeletion.mockReturnValueOnce(new Promise<void>((_resolve, rejectRequest) => { reject = rejectRequest }))
      render(<DeleteAccountModal open onOpenChange={mocks.onOpenChange} profile={profile} />)
      reachTheSendStep()
      fireEvent.click(sendCode())
      await replaceAccountWith('user-2')
      await act(async () => reject(new Error('Account A failure')))
      reachTheSendStep()

      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
      expect(mocks.beginChallenge).not.toHaveBeenCalled()
      expect(getHeldAccountId()).toBe('user-2')
    })

    it('stops the send busy state when another account replaces the tab mid request', async () => {
      mocks.requestDeletion.mockReturnValue(new Promise(() => {}))
      render(<DeleteAccountModal open onOpenChange={mocks.onOpenChange} profile={profile} />)
      reachTheSendStep()
      fireEvent.click(sendCode())
      const button = sendCode().closest('button')
      await waitFor(() => expect(button).toHaveAttribute('aria-busy', 'true'))

      await replaceAccountWith('user-2')

      expect(button).not.toHaveAttribute('aria-busy')
    })

    it('does not start the challenge when the account changed while the request ran', async () => {
      let resolve!: () => void
      mocks.requestDeletion.mockReturnValueOnce(new Promise<void>((done) => { resolve = done }))
      render(<DeleteAccountModal open onOpenChange={mocks.onOpenChange} profile={profile} />)
      reachTheSendStep()
      fireEvent.click(sendCode())
      await replaceAccountWith('user-2')
      await act(async () => resolve())

      expect(mocks.beginChallenge).not.toHaveBeenCalled()
      expect(mocks.push).not.toHaveBeenCalled()
    })
  })
})
