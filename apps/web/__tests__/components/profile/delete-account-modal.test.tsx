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

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) => {
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

  it('keeps the cancellation path in the pre-confirmation copy', () => {
    render(<DeleteAccountModal open onOpenChange={mocks.onOpenChange} profile={profile} />)

    expect(screen.getByText('profile.deleteAccount.headingAreYouSure')).toBeInTheDocument()
    expect(screen.getByText(/time to change your mind/i)).toBeInTheDocument()
    expect(screen.getByText(en.profile.deleteAccount.warningFree)).toBeInTheDocument()
    expect(screen.queryByText(en.profile.deleteAccount.warningPro)).not.toBeInTheDocument()
    expect(screen.getByText(en.profile.deleteAccount.warningDetail)).toBeInTheDocument()
    expect(screen.getByText('profile.deleteAccount.sendCode')).toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })

  it('pins Send code and Cancel in the sheet footer, never in the scrolling body', () => {
    render(<DeleteAccountModal open onOpenChange={mocks.onOpenChange} profile={profile} />)
    expect(sheetSlotButtons('sheet-actions')).toEqual(['common.cancel', 'profile.deleteAccount.sendCode'])
    expectSmallSheetActions()
    expect(sheetSlotButtons('sheet-body')).toEqual([])
  })

  it('cancels before requesting an account deletion code', () => {
    render(<DeleteAccountModal open onOpenChange={mocks.onOpenChange} profile={profile} />)
    fireEvent.click(screen.getByRole('button', { name: 'common.cancel' }))
    expect(mocks.onOpenChange).toHaveBeenCalledWith(false)
    expect(mocks.requestDeletion).not.toHaveBeenCalled()
  })

  it('shows the offline message without offering or requesting a deletion code', () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    render(<DeleteAccountModal open onOpenChange={mocks.onOpenChange} profile={profile} />)

    expect(screen.getByRole('alert')).toHaveTextContent(en.profile.deleteAccount.offlineDescription)
    expect(screen.queryByText(en.profile.deleteAccount.warningFree)).not.toBeInTheDocument()
    expect(sheetSlotButtons('sheet-actions')).toEqual([])
    expect(mocks.requestDeletion).not.toHaveBeenCalled()
    expect(mocks.beginChallenge).not.toHaveBeenCalled()
    expect(mocks.push).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'close-overlay' }))
    expect(mocks.onOpenChange).toHaveBeenCalledWith(false)
    expect(mocks.requestDeletion).not.toHaveBeenCalled()
  })

  it('restores the deletion flow when the open modal reconnects', async () => {
    const connectivity = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    render(<DeleteAccountModal open onOpenChange={mocks.onOpenChange} profile={profile} />)
    expect(mocks.requestDeletion).not.toHaveBeenCalled()

    act(() => {
      connectivity.mockReturnValue(true)
      globalThis.dispatchEvent(new Event('online'))
    })

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByText(en.profile.deleteAccount.warningFree)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'profile.deleteAccount.sendCode' }))

    await waitFor(() => expect(mocks.requestDeletion).toHaveBeenCalledOnce())
    expect(mocks.beginChallenge).toHaveBeenCalledWith('delete', 'user-1')
    expect(mocks.push).toHaveBeenCalledWith('/step-up?operation=delete')
  })

  it('replaces a failed send with the offline state when the connection drops', async () => {
    const connectivity = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
    mocks.requestDeletion.mockRejectedValueOnce(new Error('private backend detail'))
    render(<DeleteAccountModal open onOpenChange={mocks.onOpenChange} profile={profile} />)
    fireEvent.click(screen.getByRole('button', { name: 'profile.deleteAccount.sendCode' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('profile.deleteAccount.errorGeneric')

    act(() => {
      connectivity.mockReturnValue(false)
      globalThis.dispatchEvent(new Event('offline'))
    })

    expect(screen.getByRole('alert')).toHaveTextContent(en.profile.deleteAccount.offlineDescription)
    expect(screen.queryByText('profile.deleteAccount.errorGeneric')).not.toBeInTheDocument()
    expect(sheetSlotButtons('sheet-actions')).toEqual([])
    expect(mocks.requestDeletion).toHaveBeenCalledOnce()
    expect(mocks.push).not.toHaveBeenCalled()
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

  it('persists the send time and routes to the deletion step up screen', async () => {
    render(<DeleteAccountModal open onOpenChange={mocks.onOpenChange} profile={profile} />)

    fireEvent.click(screen.getByText('profile.deleteAccount.sendCode'))

    await waitFor(() => expect(mocks.requestDeletion).toHaveBeenCalledOnce())
    expect(mocks.beginChallenge).toHaveBeenCalledWith('delete', 'user-1')
    expect(mocks.onOpenChange).toHaveBeenCalledWith(false)
    expect(mocks.push).toHaveBeenCalledWith('/step-up?operation=delete')
  })

  it('waits for sheet dismissal before closing and navigating', async () => {
    sheetTestControls.defer(true)
    render(<DeleteAccountModal open onOpenChange={mocks.onOpenChange} profile={profile} />)

    fireEvent.click(screen.getByText('profile.deleteAccount.sendCode'))

    await waitFor(() => expect(sheetTestControls.isDismissPending).toBe(true))
    expect(mocks.beginChallenge).toHaveBeenCalledWith('delete', 'user-1')
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

  it('shows a failed send in the pinned footer, beside Send code', async () => {
    mocks.requestDeletion.mockRejectedValueOnce(new Error('private backend detail'))
    render(<DeleteAccountModal open onOpenChange={mocks.onOpenChange} profile={profile} />)

    fireEvent.click(screen.getByText('profile.deleteAccount.sendCode'))

    expect((await screen.findByRole('alert')).closest('[data-slot="sheet-actions"]')).not.toBeNull()
  })

  it('renders nothing while closed', () => {
    const { container } = render(
      <DeleteAccountModal open={false} onOpenChange={mocks.onOpenChange} profile={profile} />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('drops the send failure when another account replaces the tab', async () => {
    mocks.requestDeletion.mockRejectedValueOnce(new Error('private backend detail'))
    render(<DeleteAccountModal open onOpenChange={mocks.onOpenChange} profile={profile} />)

    fireEvent.click(screen.getByText('profile.deleteAccount.sendCode'))
    expect(await screen.findByRole('alert')).toHaveTextContent('profile.deleteAccount.errorGeneric')

    await replaceAccountWith('user-2')

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('keeps the send failure when the same account recovers from a rejected refresh', async () => {
    mocks.requestDeletion.mockRejectedValueOnce(new Error('private backend detail'))
    render(<DeleteAccountModal open onOpenChange={mocks.onOpenChange} profile={profile} />)

    fireEvent.click(screen.getByText('profile.deleteAccount.sendCode'))
    expect(await screen.findByRole('alert')).toHaveTextContent('profile.deleteAccount.errorGeneric')

    await recoverSameAccount('user-1')

    expect(screen.getByRole('alert')).toHaveTextContent('profile.deleteAccount.errorGeneric')
  })

  it('stops the send spinner when another account replaces the tab mid request', async () => {
    mocks.requestDeletion.mockReturnValue(new Promise(() => {}))
    render(<DeleteAccountModal open onOpenChange={mocks.onOpenChange} profile={profile} />)

    fireEvent.click(screen.getByText('profile.deleteAccount.sendCode'))
    const sendCode = screen.getByText('profile.deleteAccount.sendCode').closest('button')
    await waitFor(() => expect(sendCode).toHaveAttribute('aria-busy', 'true'))

    await replaceAccountWith('user-2')

    expect(sendCode).not.toHaveAttribute('aria-busy')
  })
})
