import { pressRadioKey } from '@/__tests__/support/radio-key'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { createTranslator } from 'next-intl'
import { getAppVersion } from '@/lib/app-version'
import { getSupportMessageMaxLength } from '@orbit/shared/utils'
import { resetAuthStore } from '@/__tests__/support/account-change'

const PINNED_TEST_TIME = new Date('2026-09-12T09:00:00.000Z')
vi.setSystemTime(PINNED_TEST_TIME)
beforeEach(() => vi.setSystemTime(PINNED_TEST_TIME))
afterEach(() => vi.useRealTimers())

const mockI18n = vi.hoisted(() => ({ overrides: new Map<string, string>() }))
vi.mock('next-intl', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next-intl')>()
  return {
    ...actual,
    useTranslations: () => (key: string, values?: { version?: string }) =>
      mockI18n.overrides.get(key) ?? (values?.version ? `${key}(${values.version})` : key),
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
function emailField() {
  return screen.getByRole('button', { name: /^profile\.support\.email(?: |$)/ })
}
function sendButton() {
  return screen.getByRole('button', { name: 'profile.support.send' })
}

describe('SupportPage', () => {
  it('shows subject labels without redundant descriptions', () => {
    render(<SupportPage />)
    for (const subject of ['problem', 'billing', 'account', 'other']) {
      expect(screen.queryByText(`profile.support.subjects.${subject}.description`)).not.toBeInTheDocument()
    }
  })

  beforeEach(async () => {
    vi.stubGlobal('fetch', vi.fn())
    await resetAuthStore()
    mockProfile = { name: 'Orbit User', email: 'orbit@example.com' }
    mockIsOnline = true
    vi.stubEnv('NEXT_PUBLIC_WEB_COMMIT_SHA', '58aa9802b7e')
    mockSendSupportMessage.mockReset()
    mockGoBackOrFallback.mockReset()
    mockRouterPush.mockReset()
    mockI18n.overrides.clear()
    localStorage.clear()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
    localStorage.clear()
  })

  it('does not render an editable name field', () => {
    render(<SupportPage />)
    expect(screen.queryByRole('textbox', { name: 'profile.support.name' })).not.toBeInTheDocument()
  })

  it('uses the truthful offline reason', () => {
    const translate = createTranslator({ locale: 'en', messages: en })
    expect(translate('profile.support.offlineReason')).toBe(
      'No connection. Your words stay on this device, so you can send when the connection returns.',
    )
  })

  it('keeps an oversized restored draft and refuses to send it', () => {
    const translate = createTranslator({ locale: 'en', messages: en })
    const message = 'm'.repeat(5000)
    const overLimit = translate('profile.support.messageOverLimit', { overage: 15 })
    const sendReason = translate('profile.support.sendNeedsShorterMessage')
    mockI18n.overrides.set('profile.support.messageOverLimit', overLimit)
    mockI18n.overrides.set('profile.support.sendNeedsShorterMessage', sendReason)
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ subject: 'problem', message }))

    render(<SupportPage />)

    expect(messageField()).toHaveValue(message)
    expect(messageField()).toHaveAttribute('maxlength', '5000')
    expect(messageField()).toHaveAccessibleDescription(overLimit)
    expect(sendButton()).toBeEnabled()
    expect(sendButton()).toHaveAccessibleDescription(sendReason)
    fireEvent.click(sendButton())
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
  })
})
