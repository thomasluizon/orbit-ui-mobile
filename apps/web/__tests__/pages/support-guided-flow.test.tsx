import { act, fireEvent, render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { holdAccount } from '@/__tests__/support/account-change'
import SupportPage from '@/app/(app)/support/page'

const mocks = vi.hoisted(() => ({ push: vi.fn(), back: vi.fn(), send: vi.fn(), online: true, completed: vi.fn(), guided: true }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push }) }))
vi.mock('@/hooks/use-go-back-or-fallback', () => ({ useGoBackOrFallback: () => mocks.back }))
vi.mock('@/hooks/use-flag', () => ({ useFlag: () => mocks.guided }))
vi.mock('@/hooks/use-profile', () => ({ useProfile: () => ({ profile: { name: 'Ada', email: 'ada@example.com' } }) }))
vi.mock('@/hooks/use-offline', () => ({ useOffline: () => ({ isOnline: mocks.online }) }))
vi.mock('@/lib/actions/support', () => ({ sendSupportMessage: (...args: unknown[]) => mocks.send(...args) }))
vi.mock('@/lib/posthog', async (importOriginal) => ({ ...await importOriginal<typeof import('@/lib/posthog')>(), captureGuidedFlowCompleted: mocks.completed, captureGuidedFlowEvent: vi.fn() }))
vi.mock('@/components/ui/sheet', async () => await import('@/__tests__/support/sheet-double'))

function stubMedia(reducedMotion: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: reducedMotion && query.includes('prefers-reduced-motion'), media: query, addEventListener: () => {}, removeEventListener: () => {} }))
}

function mount(locale: string, messages: typeof en) {
  return render(<NextIntlClientProvider locale={locale} messages={messages}><SupportPage /></NextIntlClientProvider>)
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  mocks.online = true
  mocks.guided = true
  mocks.send.mockResolvedValue(undefined)
  holdAccount('user-1')
})
afterEach(() => vi.unstubAllGlobals())

describe.each([{ locale: 'en', messages: en }, { locale: 'pt-BR', messages: ptBR }] as const)('guided support request in $locale', ({ locale, messages }) => {
  describe.each([false, true])('reduced motion %s', (reducedMotion) => {
    it('asks the subject with quick options, then the message, and closes with the Feliz result dialog', async () => {
      stubMedia(reducedMotion)
      mount(locale, messages)
      expect(screen.getByRole('heading', { level: 1, name: messages.profile.support.subject })).toBeInTheDocument()
      expect(document.querySelector('[data-orbit-state]')).toBeNull()
      const options = [...document.querySelectorAll('[data-option-card]')].map((option) => option.textContent)
      expect(options).toEqual([messages.profile.support.subjects.problem.label, messages.profile.support.subjects.billing.label, messages.profile.support.subjects.account.label, messages.profile.support.subjects.other.label])
      fireEvent.click(screen.getByRole('button', { name: messages.profile.support.subjects.billing.label }))

      expect(screen.getByRole('heading', { level: 1, name: messages.profile.support.message })).toBeInTheDocument()
      const field = screen.getByRole('textbox', { name: messages.profile.support.message })
      expect(field).toHaveAttribute('name', 'message')
      fireEvent.click(screen.getByRole('button', { name: messages.profile.support.send }))
      expect(mocks.send).not.toHaveBeenCalled()
      expect(screen.getByText(messages.profile.support.messageRequired)).toBeInTheDocument()
      fireEvent.change(field, { target: { value: 'The walk went back to pending.' } })
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: messages.profile.support.send })) })

      expect(mocks.send).toHaveBeenCalledOnce()
      expect(mocks.completed).toHaveBeenCalledWith('support_request', 2, false)
      expect(document.querySelector('[data-result-dialog]')?.getAttribute('data-orbit-state')).toBe('feliz')
      expect(screen.getByText(messages.result.support.sent.replace('{email}', 'ada@example.com'))).toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: messages.profile.support.backToAbout }))
      expect(mocks.push).toHaveBeenCalledWith('/about')
    })
  })

  it('keeps the message step with the failure text and retry when sending fails', async () => {
    stubMedia(false)
    mocks.send.mockRejectedValue(new Error('Failed'))
    mount(locale, messages)
    fireEvent.click(screen.getByRole('button', { name: messages.profile.support.subjects.problem.label }))
    fireEvent.change(screen.getByRole('textbox', { name: messages.profile.support.message }), { target: { value: 'It broke.' } })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: messages.profile.support.send })) })
    expect(screen.getByText(messages.profile.support.failureTitle)).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: messages.profile.support.message })).toHaveValue('It broke.')
    expect(screen.getByRole('button', { name: messages.profile.support.retry })).toBeInTheDocument()
    expect(document.querySelector('[data-result-dialog]')).toBeNull()
  })

  it('keeps the words offline and states the reason', () => {
    stubMedia(false)
    mocks.online = false
    mount(locale, messages)
    fireEvent.click(screen.getByRole('button', { name: messages.profile.support.subjects.other.label }))
    fireEvent.change(screen.getByRole('textbox', { name: messages.profile.support.message }), { target: { value: 'Later.' } })
    fireEvent.click(screen.getByRole('button', { name: messages.profile.support.send }))
    expect(screen.getByText(messages.profile.support.offlineReason)).toBeInTheDocument()
    expect(mocks.send).not.toHaveBeenCalled()
  })

  it('goes back to the subject with the message kept', () => {
    stubMedia(false)
    mount(locale, messages)
    fireEvent.click(screen.getByRole('button', { name: messages.profile.support.subjects.problem.label }))
    fireEvent.change(screen.getByRole('textbox', { name: messages.profile.support.message }), { target: { value: 'Kept.' } })
    fireEvent.click(screen.getByRole('button', { name: messages.common.back }))
    expect(screen.getByRole('button', { name: messages.profile.support.subjects.problem.label })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByRole('button', { name: messages.profile.support.subjects.problem.label }))
    expect(screen.getByRole('textbox', { name: messages.profile.support.message })).toHaveValue('Kept.')
  })
})

it('keeps the current form with the flag off', () => {
  stubMedia(false)
  mocks.guided = false
  mount('en', en)
  expect(document.querySelector('[data-question-flow]')).toBeNull()
  expect(screen.getByRole('button', { name: en.profile.support.send })).toBeInTheDocument()
  expect(screen.getByText(en.profile.support.description)).toBeInTheDocument()
})
