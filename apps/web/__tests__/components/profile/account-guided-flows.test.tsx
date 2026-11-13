import { act, fireEvent, render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import type { Profile } from '@orbit/shared/types/profile'
import { motionPresets } from '@orbit/shared/theme'
import { holdAccount } from '@/__tests__/support/account-change'

const mocks = vi.hoisted(() => ({
  push: vi.fn(), refresh: vi.fn(), resetAccount: vi.fn(), requestDeletion: vi.fn(), online: true,
  completed: vi.fn(), event: vi.fn(), resetQueries: vi.fn(async () => {}),
}))
vi.mock('next/navigation', async (importOriginal) => ({ ...await importOriginal<typeof import('next/navigation')>(), useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }) }))
vi.mock('@tanstack/react-query', async (importOriginal) => ({ ...await importOriginal<typeof import('@tanstack/react-query')>(), useQueryClient: () => ({}) }))
vi.mock('@orbit/shared/query', async (importOriginal) => ({ ...await importOriginal<typeof import('@orbit/shared/query')>(), resetAccountQueries: mocks.resetQueries }))
vi.mock('@/lib/actions/profile', () => ({ resetAccount: (...args: unknown[]) => mocks.resetAccount(...args) }))
vi.mock('@/lib/actions/auth', () => ({ requestDeletion: (...args: unknown[]) => mocks.requestDeletion(...args) }))
vi.mock('@/hooks/use-offline', () => ({ useOffline: () => ({ isOnline: mocks.online }) }))
vi.mock('@/lib/posthog', async (importOriginal) => ({ ...await importOriginal<typeof import('@/lib/posthog')>(), captureGuidedFlowCompleted: mocks.completed, captureGuidedFlowEvent: mocks.event }))
vi.mock('@/components/ui/sheet', async () => await import('@/__tests__/support/sheet-double'))

import { DeleteAccountModal } from '@/app/(app)/profile/_components/delete-account-modal'
import { FreshStartModal } from '@/app/(app)/profile/_components/fresh-start-modal'

const locales = [{ locale: 'en', messages: en }, { locale: 'pt-BR', messages: ptBR }] as const
const reducedMotionCases = [false, true] as const

function stubMedia(reducedMotion: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: reducedMotion && query.includes('prefers-reduced-motion'),
    media: query, addEventListener: () => {}, removeEventListener: () => {},
  }))
}

function withIntl(locale: string, messages: typeof en, node: React.ReactNode) {
  return <NextIntlClientProvider locale={locale} messages={messages}>{node}</NextIntlClientProvider>
}

const proProfile = { hasProAccess: true, planExpiresAt: '2999-01-01T00:00:00Z', billingProvider: 'app_store', subscriptionSource: null, email: 'ada@example.com' } as unknown as Profile

beforeEach(() => {
  vi.clearAllMocks()
  mocks.online = true
  mocks.resetAccount.mockResolvedValue(undefined)
  mocks.requestDeletion.mockResolvedValue(undefined)
  holdAccount('user-1')
})
afterEach(() => vi.unstubAllGlobals())

describe.each(locales)('fresh start flow in $locale', ({ locale, messages }) => {
  describe.each(reducedMotionCases)('reduced motion %s', (reducedMotion) => {
    beforeEach(() => stubMedia(reducedMotion))

    it('asks what goes and what stays, then takes the typed confirmation and closes with the Parado result dialog', async () => {
      const onOpenChange = vi.fn()
      render(withIntl(locale, messages, <FreshStartModal open guided onOpenChange={onOpenChange} />))
      expect(screen.getByRole('heading', { level: 1, name: messages.profile.freshStart.question })).toBeInTheDocument()
      expect(document.querySelector('[data-fresh-start-lists]')).not.toBeNull()
      expect(screen.getByText(messages.profile.freshStart.deleteHabits)).toBeInTheDocument()
      expect(screen.getByText(messages.profile.freshStart.preserveAccount)).toBeInTheDocument()
      expect(document.querySelector('[data-orbit-state]')).toBeNull()
      expect(document.querySelector('[data-flow-screen-motion]')?.getAttribute('data-enter-duration')).toBe(String(reducedMotion ? motionPresets['route-push'].reducedMotion.enterDuration : motionPresets['route-push'].enterDuration))
      fireEvent.click(screen.getByRole('button', { name: messages.profile.freshStart.reviewDeletion }))

      expect(screen.getByRole('heading', { level: 1, name: messages.profile.freshStart.confirmLabel })).toBeInTheDocument()
      const field = screen.getByLabelText(messages.profile.freshStart.confirmInstruction)
      fireEvent.click(screen.getByRole('button', { name: messages.profile.freshStart.deleteData }))
      expect(mocks.resetAccount).not.toHaveBeenCalled()
      fireEvent.change(field, { target: { value: 'orbit' } })
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: messages.profile.freshStart.deleteData })) })

      expect(mocks.resetAccount).toHaveBeenCalledOnce()
      expect(mocks.completed).toHaveBeenCalledWith('fresh_start', 2, false)
      const dialog = document.querySelector('[data-result-dialog]')
      expect(dialog?.getAttribute('data-orbit-state')).toBe('parado')
      expect(screen.getByText(messages.result.account.freshStart)).toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: messages.result.account.openToday }))
      expect(mocks.push).toHaveBeenCalledWith('/')
      expect(onOpenChange).toHaveBeenCalledWith(false)
    })
  })

  it('keeps the confirmation step open with the failure text when the reset fails', async () => {
    stubMedia(false)
    mocks.resetAccount.mockRejectedValue(new Error('Failed'))
    render(withIntl(locale, messages, <FreshStartModal open guided onOpenChange={vi.fn()} />))
    fireEvent.click(screen.getByRole('button', { name: messages.profile.freshStart.reviewDeletion }))
    fireEvent.change(screen.getByLabelText(messages.profile.freshStart.confirmInstruction), { target: { value: 'ORBIT' } })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: messages.profile.freshStart.deleteData })) })
    expect(screen.getByRole('alert')).toHaveTextContent(messages.profile.freshStart.errorGeneric)
    expect(document.querySelector('[data-result-dialog]')).toBeNull()
  })

  it('blocks the reset offline with the reason', () => {
    stubMedia(false)
    mocks.online = false
    render(withIntl(locale, messages, <FreshStartModal open guided onOpenChange={vi.fn()} />))
    fireEvent.click(screen.getByRole('button', { name: messages.profile.freshStart.reviewDeletion }))
    fireEvent.change(screen.getByLabelText(messages.profile.freshStart.confirmInstruction), { target: { value: 'ORBIT' } })
    fireEvent.click(screen.getByRole('button', { name: messages.profile.freshStart.deleteData }))
    expect(screen.getByText(messages.profile.freshStart.offlineReason)).toBeInTheDocument()
    expect(mocks.resetAccount).not.toHaveBeenCalled()
  })

  it('goes back to the lists from the confirmation and keeps the typed text', () => {
    stubMedia(false)
    render(withIntl(locale, messages, <FreshStartModal open guided onOpenChange={vi.fn()} />))
    fireEvent.click(screen.getByRole('button', { name: messages.profile.freshStart.reviewDeletion }))
    fireEvent.change(screen.getByLabelText(messages.profile.freshStart.confirmInstruction), { target: { value: 'ORB' } })
    fireEvent.click(screen.getByRole('button', { name: messages.common.back }))
    expect(screen.getByRole('heading', { level: 1, name: messages.profile.freshStart.question })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: messages.profile.freshStart.reviewDeletion }))
    expect(screen.getByLabelText(messages.profile.freshStart.confirmInstruction)).toHaveValue('ORB')
  })
})

describe.each(locales)('delete account flow in $locale', ({ locale, messages }) => {
  beforeEach(() => stubMedia(false))

  it('states the warning for the plan, then sends the code and opens the code entry', async () => {
    render(withIntl(locale, messages, <DeleteAccountModal open guided profile={proProfile} onOpenChange={vi.fn()} />))
    expect(screen.getByRole('heading', { level: 1, name: messages.profile.deleteAccount.headingAreYouSure })).toBeInTheDocument()
    expect(screen.getByText(`${messages.profile.deleteAccount.warningPro} ${messages.profile.deleteAccount.warningAppStore}`)).toBeInTheDocument()
    expect(document.querySelector('[data-orbit-state]')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: messages.common.continue }))
    expect(screen.getByRole('heading', { level: 1, name: messages.profile.deleteAccount.sendQuestion })).toBeInTheDocument()
    expect(screen.getByText(messages.profile.deleteAccount.sendLine.replace('{email}', 'ada@example.com'))).toBeInTheDocument()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: messages.profile.deleteAccount.sendCode })) })
    expect(mocks.requestDeletion).toHaveBeenCalledOnce()
    expect(mocks.push).toHaveBeenCalledWith('/step-up?operation=delete')
  })

  it('states the free warning for a free plan', () => {
    render(withIntl(locale, messages, <DeleteAccountModal open guided profile={{ ...proProfile, hasProAccess: false, billingProvider: null } as Profile} onOpenChange={vi.fn()} />))
    expect(screen.getByText(messages.profile.deleteAccount.warningFree)).toBeInTheDocument()
  })

  it('keeps the code request step with the failure text when the request fails', async () => {
    mocks.requestDeletion.mockRejectedValue(new Error('Failed'))
    render(withIntl(locale, messages, <DeleteAccountModal open guided profile={proProfile} onOpenChange={vi.fn()} />))
    fireEvent.click(screen.getByRole('button', { name: messages.common.continue }))
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: messages.profile.deleteAccount.sendCode })) })
    expect(screen.getByRole('alert')).toHaveTextContent(messages.profile.deleteAccount.errorGeneric)
    expect(mocks.push).not.toHaveBeenCalled()
  })

  it('blocks the flow offline with the reason and no action', () => {
    mocks.online = false
    render(withIntl(locale, messages, <DeleteAccountModal open guided profile={proProfile} onOpenChange={vi.fn()} />))
    expect(screen.getByText(messages.profile.deleteAccount.offlineDescription)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: messages.common.continue })).toBeNull()
  })
})

describe('flag off', () => {
  it('keeps the current sheets', () => {
    stubMedia(false)
    render(withIntl('en', en, <><FreshStartModal open onOpenChange={vi.fn()} /><DeleteAccountModal open profile={proProfile} onOpenChange={vi.fn()} /></>))
    expect(document.querySelector('[data-question-flow]')).toBeNull()
    expect(screen.getByText(en.profile.freshStart.heading)).toBeInTheDocument()
    expect(screen.getByText(en.profile.deleteAccount.headingAreYouSure)).toBeInTheDocument()
  })
})
