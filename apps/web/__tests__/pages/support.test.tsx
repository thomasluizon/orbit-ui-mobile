import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import en from '@orbit/shared/i18n/en.json'
import { createTranslator } from 'next-intl'

const PINNED_TEST_TIME = new Date('2026-09-12T09:00:00.000Z')
vi.setSystemTime(PINNED_TEST_TIME)
beforeEach(() => vi.setSystemTime(PINNED_TEST_TIME))
afterEach(() => vi.useRealTimers())

const mockI18n = vi.hoisted(() => ({ overrides: new Map<string, string>() }))
vi.mock('next-intl', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next-intl')>()
  return {
    ...actual,
    useTranslations: () => (key: string) => mockI18n.overrides.get(key) ?? key,
  }
})

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string; [key: string]: unknown }) => (
    <a href={href} {...props}>{children}</a>
  ),
}))

const mockGoBackOrFallback = vi.fn()
const mockRouterPush = vi.fn()
vi.mock('@/hooks/use-go-back-or-fallback', () => ({
  useGoBackOrFallback: () => mockGoBackOrFallback,
}))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockRouterPush }),
}))

let mockProfile: Record<string, unknown> | null = null
let mockIsOnline = false

vi.mock('@/hooks/use-profile', () => ({
  useProfile: () => ({ profile: mockProfile }),
}))

vi.mock('@/hooks/use-offline', () => ({
  useOffline: () => ({ isOnline: mockIsOnline }),
}))

const mockSendSupportMessage = vi.fn()
vi.mock('@/lib/actions/support', () => ({
  sendSupportMessage: (...args: unknown[]) => mockSendSupportMessage(...args),
}))

vi.mock('@orbit/shared/utils', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  return {
    ...actual,
    buildSupportRequestBody: (
      profile: Record<string, unknown> | null,
      fields: { name: string; email: string; subject: string; message: string },
    ) => ({
      name: fields.name.trim() || profile?.name,
      email: fields.email.trim() || profile?.email,
      subject: fields.subject.trim(),
      message: fields.message.trim(),
    }),
    getFriendlyErrorMessage: (_err: unknown, _t: unknown, _fallbackKey: string, _kind: string) =>
      'support.sendError',
  }
})

import SupportPage from '@/app/(app)/support/page'
import { useAuthStore } from '@/stores/auth-store'

const DRAFT_KEY = 'orbit-support-draft'

function messageField() {
  return screen.getByRole('textbox', { name: 'profile.support.message' })
}
function nameField() {
  return screen.getByRole('textbox', { name: 'profile.support.name' })
}
function emailField() {
  return screen.getByRole('textbox', { name: 'profile.support.email' })
}
function sendButton() {
  return screen.getByRole('button', { name: 'profile.support.send' })
}

describe('SupportPage', () => {
  beforeEach(() => {
    mockProfile = { name: 'Orbit User', email: 'orbit@example.com' }
    mockIsOnline = true
    mockSendSupportMessage.mockReset()
    mockGoBackOrFallback.mockReset()
    mockRouterPush.mockReset()
    mockI18n.overrides.clear()
    localStorage.clear()
  })

  afterEach(() => {
    localStorage.clear()
  })

  it('shows an explicit offline state and disables sending when offline', () => {
    mockIsOnline = false
    render(<SupportPage />)

    const reason = screen.getByText('profile.support.offlineReason')
    expect(reason).toBeInTheDocument()
    expect(sendButton()).toBeDisabled()
    expect(sendButton()).toHaveAttribute('aria-describedby', 'support-send-reason')
    expect(document.getElementById('support-send-reason')).toContainElement(reason)
  })

  it('uses one radio tab stop and selects with arrow, Home, and End keys', () => {
    render(<SupportPage />)

    const radios = screen.getAllByRole('radio')
    expect(Array.from(screen.getByRole('radiogroup', { name: 'profile.support.subject' }).children))
      .toEqual(radios)
    expect(radios.map((radio) => radio.tabIndex)).toEqual([0, -1, -1, -1])

    radios[0]!.focus()
    fireEvent.keyDown(radios[0]!, { key: 'ArrowDown' })
    expect(radios[1]).toHaveFocus()
    expect(radios[1]).toHaveAttribute('aria-checked', 'true')
    expect(radios.map((radio) => radio.tabIndex)).toEqual([-1, 0, -1, -1])

    fireEvent.keyDown(radios[1]!, { key: 'End' })
    expect(radios[3]).toHaveFocus()
    expect(radios[3]).toHaveAttribute('aria-checked', 'true')

    fireEvent.keyDown(radios[3]!, { key: 'Home' })
    expect(radios[0]).toHaveFocus()
    expect(radios[0]).toHaveAttribute('aria-checked', 'true')

    fireEvent.keyDown(radios[0]!, { key: 'ArrowUp' })
    expect(radios[3]).toHaveFocus()
    fireEvent.keyDown(radios[3]!, { key: 'ArrowRight' })
    expect(radios[0]).toHaveFocus()
    fireEvent.keyDown(radios[0]!, { key: 'ArrowLeft' })
    expect(radios[3]).toHaveFocus()
  })

  it('uses the truthful offline reason', () => {
    const translate = createTranslator({ locale: 'en', messages: en })
    expect(translate('profile.support.offlineReason')).toBe(
      'No connection. Your words stay on this device, so you can send when the connection returns.',
    )
  })

  it('renders four subject choices and sends the selected wording', async () => {
    mockSendSupportMessage.mockResolvedValue(undefined)
    const translate = createTranslator({ locale: 'en', messages: en })
    const problemLabel = translate('profile.support.subjects.problem.label')
    mockI18n.overrides.set('profile.support.subjects.problem.label', problemLabel)
    render(<SupportPage />)

    expect(screen.getAllByRole('radio')).toHaveLength(4)
    expect(screen.getByText('profile.support.subjects.problem.description')).toBeInTheDocument()
    expect(screen.getByText('profile.support.subjects.billing.description')).toBeInTheDocument()
    expect(screen.getByText('profile.support.subjects.account.description')).toBeInTheDocument()
    expect(screen.getByText('profile.support.subjects.other.description')).toBeInTheDocument()

    fireEvent.click(screen.getByText(problemLabel))
    fireEvent.change(messageField(), { target: { value: 'The log disappeared' } })
    fireEvent.click(sendButton())

    await waitFor(() => expect(mockSendSupportMessage).toHaveBeenCalledWith({
      name: 'Orbit User',
      email: 'orbit@example.com',
      subject: problemLabel,
      message: 'The log disappeared\n\nOrbit 0.0.1',
    }, null))
  })

  it('uses the system inputs, including a six-row message and the disabled account email', () => {
    render(<SupportPage />)

    expect(messageField()).toHaveAttribute('rows', '6')
    expect(messageField().closest('[data-multiline]')).toHaveAttribute('data-multiline', '')
    expect(nameField()).toHaveValue('Orbit User')
    expect(emailField()).toHaveValue('orbit@example.com')
    expect(emailField()).toBeDisabled()
    const lockedReason = screen.getByText('profile.support.emailLockedReason')
    expect(lockedReason).toBeInTheDocument()
    expect(emailField()).toHaveAttribute('aria-describedby', lockedReason.id)
    expect(sendButton().parentElement).toHaveClass(
      'md:[&_button]:bg-[var(--fg-1)]',
    )
  })

  it('does not show the locked email reason when the account email is editable', () => {
    mockProfile = null
    render(<SupportPage />)

    expect(emailField()).toBeEnabled()
    expect(screen.queryByText('profile.support.emailLockedReason')).not.toBeInTheDocument()
  })

  it('shows the required subject error beside the picker', async () => {
    render(<SupportPage />)
    fireEvent.change(messageField(), { target: { value: 'Message' } })

    fireEvent.blur(screen.getByRole('radiogroup'))

    expect(await screen.findByText('profile.support.subjectRequired')).toBeInTheDocument()
    expect(sendButton()).toBeDisabled()
    expect(mockSendSupportMessage).not.toHaveBeenCalled()
  })

  it('shows the required message error and focuses the message', async () => {
    render(<SupportPage />)
    fireEvent.click(screen.getByText('profile.support.subjects.problem.label'))

    fireEvent.blur(messageField())

    expect(await screen.findByText('profile.support.messageRequired')).toBeInTheDocument()
    expect(sendButton()).toBeDisabled()
    expect(mockSendSupportMessage).not.toHaveBeenCalled()
  })

  it('keeps Send disabled with an announced reason until subject and message are filled', () => {
    render(<SupportPage />)

    const reason = screen.getByText('profile.support.sendIncomplete')
    expect(sendButton()).toBeDisabled()
    expect(sendButton()).toHaveAttribute('aria-describedby', reason.id)

    fireEvent.change(messageField(), { target: { value: 'Message' } })
    expect(screen.getByText('profile.support.sendNeedsSubject')).toBeInTheDocument()
    fireEvent.click(screen.getByText('profile.support.subjects.problem.label'))
    expect(sendButton()).toBeEnabled()
    expect(sendButton()).not.toHaveAttribute('aria-describedby')

    fireEvent.change(messageField(), { target: { value: '   ' } })
    expect(sendButton()).toBeDisabled()
    expect(screen.getByText('profile.support.sendNeedsMessage')).toBeInTheDocument()
  })

  it('accepts the API message length boundary', async () => {
    mockSendSupportMessage.mockResolvedValue(undefined)
    render(<SupportPage />)

    const message = 'm'.repeat(4987)
    expect(messageField()).toHaveAttribute('maxlength', '4987')
    expect(screen.getByText('profile.support.versionIncluded')).toBeInTheDocument()

    fireEvent.click(screen.getByText('profile.support.subjects.problem.label'))
    fireEvent.change(messageField(), { target: { value: message } })
    fireEvent.click(sendButton())

    await waitFor(() => expect(mockSendSupportMessage).toHaveBeenCalledWith({
      name: 'Orbit User',
      email: 'orbit@example.com',
      subject: 'profile.support.subjects.problem.label',
      message: `${message}\n\nOrbit 0.0.1`,
    }, null))
  })

  it('keeps an oversized restored draft and refuses to send it', () => {
    const translate = createTranslator({ locale: 'en', messages: en })
    const message = 'm'.repeat(5000)
    const overLimit = translate('profile.support.messageOverLimit', { overage: 13 })
    const sendReason = translate('profile.support.sendNeedsShorterMessage')
    mockI18n.overrides.set('profile.support.messageOverLimit', overLimit)
    mockI18n.overrides.set('profile.support.sendNeedsShorterMessage', sendReason)
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ subject: 'problem', message }))

    render(<SupportPage />)

    expect(messageField()).toHaveValue(message)
    expect(messageField()).toHaveAttribute('maxlength', '5000')
    expect(messageField()).toHaveAccessibleDescription(overLimit)
    expect(sendButton()).toBeDisabled()
    expect(sendButton()).toHaveAccessibleDescription(sendReason)
    fireEvent.click(sendButton())
    expect(mockSendSupportMessage).not.toHaveBeenCalled()
  })

  it('replaces an email typed while loading with the resolved profile email', async () => {
    mockProfile = null
    mockSendSupportMessage.mockResolvedValue(undefined)
    const view = render(<SupportPage />)

    fireEvent.change(nameField(), { target: { value: 'Orbit User' } })
    fireEvent.change(emailField(), { target: { value: 'stale@example.com' } })
    fireEvent.click(screen.getByText('profile.support.subjects.problem.label'))
    fireEvent.change(messageField(), { target: { value: 'Message' } })

    mockProfile = { name: 'Profile User', email: 'profile@example.com' }
    view.rerender(<SupportPage />)
    expect(emailField()).toHaveValue('profile@example.com')
    expect(emailField()).toBeDisabled()
    fireEvent.click(sendButton())

    await waitFor(() => expect(mockSendSupportMessage).toHaveBeenCalledWith({
      name: 'Orbit User',
      email: 'profile@example.com',
      subject: 'profile.support.subjects.problem.label',
      message: 'Message\n\nOrbit 0.0.1',
    }, null))
  })

  it('clears stale account errors when profile hydration supplies valid values', async () => {
    mockProfile = null
    const view = render(<SupportPage />)
    fireEvent.click(screen.getByText('profile.support.subjects.problem.label'))
    fireEvent.change(messageField(), { target: { value: 'Message' } })
    fireEvent.click(sendButton())
    expect(await screen.findByText('profile.support.nameRequired')).toBeInTheDocument()
    expect(screen.getByText('profile.support.emailRequired')).toBeInTheDocument()

    mockProfile = { name: 'Profile User', email: 'profile@example.com' }
    view.rerender(<SupportPage />)
    expect(screen.queryByText('profile.support.nameRequired')).not.toBeInTheDocument()
    expect(screen.queryByText('profile.support.emailRequired')).not.toBeInTheDocument()
    expect(nameField()).not.toHaveAttribute('aria-invalid')
    expect(emailField()).not.toHaveAttribute('aria-invalid')
  })

  it('places the existing contact errors beside their system inputs', async () => {
    mockProfile = null
    render(<SupportPage />)

    fireEvent.click(screen.getByText('profile.support.subjects.problem.label'))
    fireEvent.change(messageField(), { target: { value: 'Message' } })
    fireEvent.click(sendButton())

    expect(await screen.findByText('profile.support.nameRequired')).toBeInTheDocument()
    expect(screen.getByText('profile.support.emailRequired')).toBeInTheDocument()
    fireEvent.change(nameField(), { target: { value: 'Orbit User' } })
    fireEvent.change(emailField(), { target: { value: 'invalid' } })
    fireEvent.click(sendButton())
    expect(await screen.findByText('profile.support.emailInvalid')).toBeInTheDocument()
    expect(mockSendSupportMessage).not.toHaveBeenCalled()
  })

  it('sends the built payload, shows success, and clears the draft', async () => {
    mockSendSupportMessage.mockResolvedValue(undefined)
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ subject: 'billing', message: 'y' }))
    render(<SupportPage />)
    const announcer = screen.getByRole('status')
    expect(announcer).toBeEmptyDOMElement()

    fireEvent.click(screen.getByText('profile.support.subjects.account.label'))
    fireEvent.change(messageField(), { target: { value: 'Google button spins forever' } })
    fireEvent.click(sendButton())

    await waitFor(() => expect(announcer).toHaveTextContent('profile.support.success'))
    expect(mockSendSupportMessage).toHaveBeenCalledWith({
      name: 'Orbit User',
      email: 'orbit@example.com',
      subject: 'profile.support.subjects.account.label',
      message: 'Google button spins forever\n\nOrbit 0.0.1',
    }, null)
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull()
    expect(announcer).toHaveTextContent('profile.support.success')
    expect(screen.getByRole('heading', { name: 'profile.support.success' })).toBeInTheDocument()
    expect(screen.getByText('profile.support.successHint')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'profile.support.backToAbout' })).toHaveAttribute(
      'data-variant',
      'ghost',
    )
    fireEvent.click(screen.getByRole('button', { name: 'profile.support.backToAbout' }))
    expect(mockRouterPush).toHaveBeenCalledWith('/about')
  })

  it('surfaces a friendly error when the send fails and stays on the form', async () => {
    mockSendSupportMessage.mockRejectedValue(new Error('boom'))
    render(<SupportPage />)

    fireEvent.click(screen.getByText('profile.support.subjects.problem.label'))
    fireEvent.change(messageField(), { target: { value: 'Message body' } })
    fireEvent.click(sendButton())

    await waitFor(() => expect(screen.getByText('profile.support.failureTitle')).toBeInTheDocument())
    expect(screen.getByText('profile.support.failureTitle')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'profile.support.retry' })).toHaveAttribute(
      'data-variant',
      'primary',
    )
    expect(screen.queryByText('profile.support.success')).not.toBeInTheDocument()
    expect(JSON.parse(localStorage.getItem(DRAFT_KEY) ?? '{}')).toEqual({
      subject: 'problem',
      message: 'Message body',
    })
  })

  it('hydrates the form from a stored draft', () => {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ subject: 'billing', message: 'Saved message' }))
    render(<SupportPage />)

    expect(screen.getByRole('radio', {
      name: 'profile.support.subjects.billing.labelprofile.support.subjects.billing.description',
    })).toHaveAttribute('aria-checked', 'true')
    expect(messageField()).toHaveValue('Saved message')
  })

  it('maps a legacy free-text draft to the catch-all subject without losing the message', () => {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ subject: 'Old subject', message: 'Saved message' }))
    render(<SupportPage />)

    expect(screen.getByRole('radio', {
      name: 'profile.support.subjects.other.labelprofile.support.subjects.other.description',
    })).toHaveAttribute('aria-checked', 'true')
    expect(messageField()).toHaveValue('Saved message')
  })

  it('discards a corrupt stored draft instead of crashing', () => {
    localStorage.setItem(DRAFT_KEY, '{not valid json')
    render(<SupportPage />)

    expect(screen.getAllByRole('radio').every((radio) => radio.getAttribute('aria-checked') === 'false')).toBe(true)
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull()
  })

  it('persists the picker selection and message on every change', () => {
    render(<SupportPage />)

    fireEvent.click(screen.getByText('profile.support.subjects.billing.label'))
    expect(JSON.parse(localStorage.getItem(DRAFT_KEY) ?? '{}')).toMatchObject({
      subject: 'billing',
    })

    fireEvent.change(messageField(), { target: { value: 'Draft message' } })
    fireEvent.change(messageField(), { target: { value: '' } })
    expect(JSON.parse(localStorage.getItem(DRAFT_KEY) ?? '{}')).toEqual({
      subject: 'billing',
      message: '',
    })
  })

  it('shows loading and disables the controls while sending', async () => {
    let finishSend: (() => void) | undefined
    mockSendSupportMessage.mockImplementation(
      () => new Promise<void>((resolve) => { finishSend = resolve }),
    )
    render(<SupportPage />)

    fireEvent.click(screen.getByText('profile.support.subjects.problem.label'))
    fireEvent.change(messageField(), { target: { value: 'Message' } })
    fireEvent.click(sendButton())

    await waitFor(() => expect(sendButton()).toHaveAttribute('aria-busy', 'true'))
    const disabledRadios = screen.getAllByRole('radio')
    expect(disabledRadios).toHaveLength(4)
    expect(disabledRadios.every((radio) => radio.getAttribute('aria-disabled') === 'true')).toBe(true)
    fireEvent.click(screen.getByText('profile.support.subjects.billing.label'))
    expect(disabledRadios[0]).toHaveAttribute('aria-checked', 'true')
    expect(disabledRadios[1]).toHaveAttribute('aria-checked', 'false')
    expect(messageField()).toBeDisabled()
    finishSend?.()
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('profile.support.success'))
  })

  it('ignores clicks while offline even with a valid form', () => {
    mockIsOnline = false
    render(<SupportPage />)

    fireEvent.click(screen.getByText('profile.support.subjects.problem.label'))
    fireEvent.change(messageField(), { target: { value: 'Message' } })
    act(() => {
      fireEvent.click(sendButton())
    })

    expect(mockSendSupportMessage).not.toHaveBeenCalled()
  })

  describe('an account replacement under a running tab', () => {
    const mockFetch = vi.fn()

    beforeEach(() => {
      mockFetch.mockReset()
      vi.stubGlobal('fetch', mockFetch)
    })

    afterEach(() => {
      vi.unstubAllGlobals()
    })

    function respondWithAccount(userId: string) {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ expiresAt: Date.now() + 3600000, userId, refreshFailed: false }),
      })
    }

    function signInAndType(text: string) {
      useAuthStore.getState().setAuth({ userId: 'user-1', name: 'Ada', email: 'ada@example.com' })
      render(<SupportPage />)
      fireEvent.click(screen.getByText('profile.support.subjects.billing.label'))
      fireEvent.change(messageField(), { target: { value: text } })
    }

    async function replaceAccount(userId: string) {
      respondWithAccount(userId)
      await act(async () => {
        await useAuthStore.getState().checkSession()
      })
    }

    it('takes the replaced account typed text off the screen, not only out of storage', async () => {
      signInAndType('you charged me twice on the 14th, card ending 4242')

      await replaceAccount('user-2')

      expect(localStorage.getItem(DRAFT_KEY)).toBeNull()
      expect(messageField()).toHaveValue('')
      expect(
        screen.getAllByRole('radio').every((radio) => radio.getAttribute('aria-checked') === 'false'),
      ).toBe(true)
    })

    it('writes only the next account text back to storage on the next keystroke', async () => {
      signInAndType('you charged me twice on the 14th, card ending 4242')

      await replaceAccount('user-2')
      fireEvent.change(messageField(), { target: { value: 'my streak reset overnight' } })

      expect(JSON.parse(localStorage.getItem(DRAFT_KEY) ?? '{}')).toEqual({
        subject: null,
        message: 'my streak reset overnight',
      })
    })

    it('keeps the typed text when the same account recovers from a rejected refresh', async () => {
      signInAndType('my streak reset overnight')

      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        json: () => Promise.resolve({ refreshFailed: true }),
      })
      await act(async () => {
        await useAuthStore.getState().confirmSessionRefreshFailure()
      })
      respondWithAccount('user-1')
      await act(async () => {
        await useAuthStore.getState().recoverSessionRefreshFailure()
      })

      expect(messageField()).toHaveValue('my streak reset overnight')
      expect(JSON.parse(localStorage.getItem(DRAFT_KEY) ?? '{}')).toMatchObject({
        message: 'my streak reset overnight',
      })
    })
  })
})
