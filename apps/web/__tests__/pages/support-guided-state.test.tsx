import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import en from '@orbit/shared/i18n/en.json'
import { getSupportMessageMaxLength } from '@orbit/shared/utils'
import { getAppVersion } from '@/lib/app-version'
import { replaceAccountWith, recoverSameAccount, resetAuthStore } from '@/__tests__/support/account-change'
import { useAuthStore } from '@/stores/auth-store'
import SupportPage from '@/app/(app)/support/page'

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  back: vi.fn(),
  send: vi.fn(),
  online: true,
  profile: null as Record<string, unknown> | null,
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push }) }))
vi.mock('@/hooks/use-go-back-or-fallback', () => ({ useGoBackOrFallback: () => mocks.back }))
vi.mock('@/hooks/use-profile', () => ({ useProfile: () => ({ profile: mocks.profile }) }))
vi.mock('@/hooks/use-offline', () => ({ useOffline: () => ({ isOnline: mocks.online }) }))
vi.mock('@/lib/actions/support', () => ({ sendSupportMessage: (...args: unknown[]) => mocks.send(...args) }))
vi.mock('@/lib/posthog', async (importOriginal) => ({ ...await importOriginal<typeof import('@/lib/posthog')>(), captureGuidedFlowCompleted: vi.fn(), captureGuidedFlowEvent: vi.fn() }))
vi.mock('@/components/ui/sheet', async () => await import('@/__tests__/support/sheet-double'))

const DRAFT_KEY = 'orbit-support-draft'
const messages = en
const subjects = messages.profile.support.subjects

function mount() {
  return render(<NextIntlClientProvider locale="en" messages={messages}><SupportPage /></NextIntlClientProvider>)
}
const messageField = () => screen.getByRole('textbox', { name: messages.profile.support.message })
const sendButton = () => screen.getByRole('button', { name: messages.profile.support.send })
const optionButton = (subject: keyof typeof subjects) => screen.getByRole('button', { name: subjects[subject].option })
const storedDraft = () => JSON.parse(localStorage.getItem(DRAFT_KEY) ?? '{}')

beforeEach(async () => {
  vi.stubGlobal('fetch', vi.fn())
  vi.stubEnv('NEXT_PUBLIC_WEB_COMMIT_SHA', '58aa9802b7e')
  await resetAuthStore()
  vi.clearAllMocks()
  localStorage.clear()
  mocks.online = true
  mocks.profile = { name: 'Orbit User', email: 'orbit@example.com' }
  mocks.send.mockResolvedValue(undefined)
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  localStorage.clear()
})

describe('the guided support draft', () => {
  it('hydrates the flow from a stored draft and opens at the message with the subject kept', () => {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ subject: 'billing', message: 'Saved message' }))
    mount()

    expect(messageField()).toHaveValue('Saved message')
    fireEvent.click(screen.getByRole('button', { name: messages.common.back }))
    expect(optionButton('billing')).toHaveAttribute('aria-pressed', 'true')
  })

  it('maps a legacy free-text draft to the catch-all subject without losing the message', () => {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ subject: 'Old subject', message: 'Saved message' }))
    mount()

    expect(messageField()).toHaveValue('Saved message')
    fireEvent.click(screen.getByRole('button', { name: messages.common.back }))
    expect(optionButton('other')).toHaveAttribute('aria-pressed', 'true')
  })

  it('discards a corrupt stored draft and starts at the subject', () => {
    localStorage.setItem(DRAFT_KEY, '{not valid json')
    mount()

    expect(screen.getByRole('heading', { level: 1, name: messages.profile.support.subject })).toBeInTheDocument()
    for (const subject of ['problem', 'billing', 'account', 'other'] as const) {
      expect(optionButton(subject)).toHaveAttribute('aria-pressed', 'false')
    }
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull()
  })

  it('persists the subject and the message on every change', () => {
    mount()

    fireEvent.click(optionButton('billing'))
    expect(storedDraft()).toMatchObject({ subject: 'billing' })
    fireEvent.change(messageField(), { target: { value: 'Draft message' } })
    expect(storedDraft()).toEqual({ subject: 'billing', message: 'Draft message' })
    fireEvent.change(messageField(), { target: { value: '' } })
    expect(storedDraft()).toEqual({ subject: 'billing', message: '' })
  })

  it('keeps an oversized restored draft and refuses to send it', () => {
    const message = 'm'.repeat(5000)
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ subject: 'problem', message }))
    mount()

    expect(messageField()).toHaveValue(message)
    expect(messageField()).toHaveAttribute('maxlength', '5000')
    fireEvent.click(sendButton())
    expect(mocks.send).not.toHaveBeenCalled()
    expect(messageField()).toHaveValue(message)
  })
})

describe('the guided support send', () => {
  it('accepts the API message length boundary and appends the version', async () => {
    mount()
    const limit = getSupportMessageMaxLength(getAppVersion())
    const message = 'm'.repeat(limit)
    fireEvent.click(optionButton('problem'))
    expect(messageField()).toHaveAttribute('maxlength', String(limit))
    expect(screen.getByText(messages.profile.support.versionIncluded.replace('{version}', getAppVersion() ?? ''))).toBeInTheDocument()
    fireEvent.change(messageField(), { target: { value: message } })
    await act(async () => { fireEvent.click(sendButton()) })

    expect(mocks.send).toHaveBeenCalledWith({
      name: 'Orbit User',
      email: 'orbit@example.com',
      subject: subjects.problem.label,
      message: `${message}\n\nOrbit 58aa980`,
    }, null)
  })

  it('sends the contact details of the profile that loads after the first render', async () => {
    mocks.profile = null
    const view = mount()
    fireEvent.click(optionButton('problem'))
    fireEvent.change(messageField(), { target: { value: 'Message' } })

    mocks.profile = { name: 'Profile User', email: 'profile@example.com' }
    view.rerender(<NextIntlClientProvider locale="en" messages={messages}><SupportPage /></NextIntlClientProvider>)
    await act(async () => { fireEvent.click(sendButton()) })

    expect(mocks.send).toHaveBeenCalledWith({
      name: 'Profile User',
      email: 'profile@example.com',
      subject: subjects.problem.label,
      message: 'Message\n\nOrbit 58aa980',
    }, null)
  })

  it('clears the stored draft after a send and shows the result dialog', async () => {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ subject: 'billing', message: 'y' }))
    mount()
    fireEvent.click(screen.getByRole('button', { name: messages.common.back }))
    fireEvent.click(optionButton('account'))
    fireEvent.change(messageField(), { target: { value: 'Google button spins forever' } })
    await act(async () => { fireEvent.click(sendButton()) })

    expect(mocks.send).toHaveBeenCalledWith(expect.objectContaining({ subject: subjects.account.label, message: 'Google button spins forever\n\nOrbit 58aa980' }), null)
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull()
    expect(screen.getByRole('status')).toHaveTextContent(messages.profile.support.success)
    expect(document.querySelector('[data-result-dialog]')).not.toBeNull()
  })

  it('keeps the field message and the general server validation visible without losing the draft', async () => {
    mocks.send.mockRejectedValue({ errors: { Message: ['Message exceeds 123 characters'], Email: ['Server email failure'] } })
    mount()
    fireEvent.click(optionButton('problem'))
    fireEvent.change(messageField(), { target: { value: 'Message body' } })
    await act(async () => { fireEvent.click(sendButton()) })

    await waitFor(() => expect(messageField()).toHaveAccessibleDescription('Message exceeds 123 characters'))
    expect(screen.getByText('Server email failure')).toBeInTheDocument()
    expect(messageField()).toHaveValue('Message body')
    expect(storedDraft()).toEqual({ subject: 'problem', message: 'Message body' })
  })

  it('keeps the draft in storage when the send fails', async () => {
    mocks.send.mockRejectedValue(new Error('boom'))
    mount()
    fireEvent.click(optionButton('problem'))
    fireEvent.change(messageField(), { target: { value: 'Message body' } })
    await act(async () => { fireEvent.click(sendButton()) })

    expect(screen.getByText(messages.profile.support.failureTitle)).toBeInTheDocument()
    expect(storedDraft()).toEqual({ subject: 'problem', message: 'Message body' })
  })

  it('locks the message and the send action while the request runs', async () => {
    let finish: (() => void) | undefined
    mocks.send.mockImplementation(() => new Promise<void>((resolve) => { finish = resolve }))
    mount()
    fireEvent.click(optionButton('problem'))
    fireEvent.change(messageField(), { target: { value: 'Message' } })
    await act(async () => { fireEvent.click(sendButton()) })

    expect(messageField()).toBeDisabled()
    fireEvent.click(sendButton())
    expect(mocks.send).toHaveBeenCalledOnce()
    await act(async () => { finish?.() })
    expect(screen.getByRole('status')).toHaveTextContent(messages.profile.support.success)
  })
})

describe('an account replacement under a running guided support tab', () => {
  function signInAndType(text: string) {
    useAuthStore.getState().setAuth({ userId: 'user-1', name: 'Ada', email: 'ada@example.com' })
    mount()
    fireEvent.click(optionButton('billing'))
    fireEvent.change(messageField(), { target: { value: text } })
  }

  it('takes the replaced account typed text off the screen, not only out of storage', async () => {
    signInAndType('you charged me twice on the 14th, card ending 4242')
    await replaceAccountWith('user-2')

    expect(localStorage.getItem(DRAFT_KEY)).toBeNull()
    expect(screen.queryByRole('textbox', { name: messages.profile.support.message })).not.toBeInTheDocument()
    for (const subject of ['problem', 'billing', 'account', 'other'] as const) {
      expect(optionButton(subject)).toHaveAttribute('aria-pressed', 'false')
    }
  })

  it('writes only the next account text back to storage on the next keystroke', async () => {
    signInAndType('you charged me twice on the 14th, card ending 4242')
    await replaceAccountWith('user-2')
    fireEvent.click(optionButton('problem'))
    fireEvent.change(messageField(), { target: { value: 'my streak reset overnight' } })

    expect(storedDraft()).toEqual({ subject: 'problem', message: 'my streak reset overnight' })
  })

  it('keeps the typed text when the same account recovers from a rejected refresh', async () => {
    signInAndType('my streak reset overnight')
    await recoverSameAccount('user-1')

    expect(messageField()).toHaveValue('my streak reset overnight')
    expect(storedDraft()).toMatchObject({ message: 'my streak reset overnight' })
  })

  it('refuses to report a send that finished after the account changed', async () => {
    let finish: (() => void) | undefined
    mocks.send.mockImplementation(() => new Promise<void>((resolve) => { finish = resolve }))
    signInAndType('for the first account')
    await act(async () => { fireEvent.click(sendButton()) })
    await replaceAccountWith('user-2')
    await act(async () => { finish?.() })

    expect(document.querySelector('[data-result-dialog]')).toBeNull()
  })
})
