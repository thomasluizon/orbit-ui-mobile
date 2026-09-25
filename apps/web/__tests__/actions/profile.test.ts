import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/auth-api', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/auth-api')>(),
  getAuthHeaders: vi.fn().mockResolvedValue({
    Authorization: 'Bearer test-token',
  }),
  resolveServerSession: vi.fn().mockResolvedValue({
    token: 'test-token',
    expiresAt: null,
    refreshed: false,
  }),
}))

import { resolveServerSession } from '@/lib/auth-api'

const accountClaim = 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier'

function tokenForAccount(accountId: string): string {
  const payload = Buffer.from(JSON.stringify({ [accountClaim]: accountId })).toString('base64url')
  return `header.${payload}.signature`
}

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

const {
  updateName,
  updateTimezone,
  updateLanguage,
  updateAiSummary,
  updateProactiveAstra,
  updateMarketingConsent,
  updateWeekStartDay,
  updateThemePreference,
  updateColorScheme,
  completeOnboarding,
  resetAccount,
} = await import('@/lib/actions/profile')
const {
  dismissCalendarImport,
  setSelectedCalendars,
  setCalendarAutoSync,
  runCalendarSyncNow,
  dismissCalendarSuggestion,
} = await import('@/lib/actions/calendar')
const { openCustomerPortal } = await import('@/lib/actions/subscription')
const { sendSupportMessage } = await import('@/lib/actions/support')

describe('profile server actions', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  function mockApiResponse(body: unknown, status = 200) {
    mockFetch.mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      json: () => Promise.resolve(body),
    })
  }

  function mock204() {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 204,
      json: () => Promise.reject(new Error('No body')),
    })
  }


  describe('updateTimezone', () => {
    it('sends PUT to /api/profile/timezone', async () => {
      mock204()

      await updateTimezone({ timeZone: 'America/Sao_Paulo' }, 'account-a')

      const [url, init] = mockFetch.mock.calls[0]!
      expect(url).toContain('/api/profile/timezone')
      expect(init.method).toBe('PUT')
      expect(JSON.parse(init.body)).toEqual({ timeZone: 'America/Sao_Paulo' })
    })

    it('includes auth headers', async () => {
      mock204()

      await updateTimezone({ timeZone: 'UTC' }, 'account-a')

      const [, init] = mockFetch.mock.calls[0]!
      expect(init.headers).toHaveProperty('Authorization', 'Bearer test-token')
    })

    it('throws on server error', async () => {
      mockApiResponse({ error: 'Invalid timezone' }, 400)

      await expect(
        updateTimezone({ timeZone: 'Invalid/Zone' }, 'account-a'),
      ).rejects.toThrow('Invalid timezone')
    })
  })


  describe('updateLanguage', () => {
    it('sends PUT to /api/profile/language', async () => {
      mock204()

      await updateLanguage({ language: 'pt-BR' }, 'account-a')

      const [url, init] = mockFetch.mock.calls[0]!
      expect(url).toContain('/api/profile/language')
      expect(init.method).toBe('PUT')
      expect(JSON.parse(init.body)).toEqual({ language: 'pt-BR' })
    })

    it('throws on server error', async () => {
      mockApiResponse({ error: 'Unsupported language' }, 400)

      await expect(
        updateLanguage({ language: 'xx' as never }, 'account-a'),
      ).rejects.toThrow('Unsupported language')
    })
  })



  describe('updateAiSummary', () => {
    it('sends PUT to /api/profile/ai-summary', async () => {
      mock204()

      await updateAiSummary({ enabled: true }, 'account-a')

      const [url, init] = mockFetch.mock.calls[0]!
      expect(url).toContain('/api/profile/ai-summary')
      expect(init.method).toBe('PUT')
      expect(JSON.parse(init.body)).toEqual({ enabled: true })
    })

    it('sends false value', async () => {
      mock204()

      await updateAiSummary({ enabled: false }, 'account-a')

      const [, init] = mockFetch.mock.calls[0]!
      expect(JSON.parse(init.body)).toEqual({ enabled: false })
    })
  })


  describe('updateWeekStartDay', () => {
    it('sends PUT to /api/profile/week-start-day', async () => {
      mock204()

      await updateWeekStartDay({ weekStartDay: 1 }, 'account-a')

      const [url, init] = mockFetch.mock.calls[0]!
      expect(url).toContain('/api/profile/week-start-day')
      expect(init.method).toBe('PUT')
      expect(JSON.parse(init.body)).toEqual({ weekStartDay: 1 })
    })

    it('handles Sunday value', async () => {
      mock204()

      await updateWeekStartDay({ weekStartDay: 0 }, 'account-a')

      const [, init] = mockFetch.mock.calls[0]!
      expect(JSON.parse(init.body)).toEqual({ weekStartDay: 0 })
    })

    it('throws on server error', async () => {
      mockApiResponse({ error: 'Invalid day' }, 400)

      await expect(
        updateWeekStartDay({ weekStartDay: 'Invalid' as never }, 'account-a'),
      ).rejects.toThrow('Invalid day')
    })
  })


  describe('updateThemePreference', () => {
    it('sends PUT to /api/profile/theme-preference', async () => {
      mock204()

      await updateThemePreference({ themePreference: 'dark' }, 'account-a')

      const [url, init] = mockFetch.mock.calls[0]!
      expect(url).toContain('/api/profile/theme-preference')
      expect(init.method).toBe('PUT')
      expect(JSON.parse(init.body)).toEqual({ themePreference: 'dark' })
    })

    it('handles light theme', async () => {
      mock204()

      await updateThemePreference({ themePreference: 'light' }, 'account-a')

      const [, init] = mockFetch.mock.calls[0]!
      expect(JSON.parse(init.body)).toEqual({ themePreference: 'light' })
    })
  })


  describe('updateColorScheme', () => {
    it('sends PUT to /api/profile/color-scheme', async () => {
      mock204()

      await updateColorScheme({ colorScheme: 'ocean' }, 'account-a')

      const [url, init] = mockFetch.mock.calls[0]!
      expect(url).toContain('/api/profile/color-scheme')
      expect(init.method).toBe('PUT')
      expect(JSON.parse(init.body)).toEqual({ colorScheme: 'ocean' })
    })

    it('throws on server error', async () => {
      mockApiResponse({ error: 'Invalid color scheme' }, 400)

      await expect(
        updateColorScheme({ colorScheme: 'invalid' as never }, 'account-a'),
      ).rejects.toThrow('Invalid color scheme')
    })
  })


  describe('completeOnboarding', () => {
    it('sends PUT to /api/profile/onboarding with no body', async () => {
      mock204()

      await completeOnboarding('account-a')

      const [url, init] = mockFetch.mock.calls[0]!
      expect(url).toContain('/api/profile/onboarding')
      expect(init.method).toBe('PUT')
    })

    it('includes auth headers', async () => {
      mock204()

      await completeOnboarding('account-a')

      const [, init] = mockFetch.mock.calls[0]!
      expect(init.headers).toHaveProperty('Authorization', 'Bearer test-token')
    })

    it('throws on server error', async () => {
      mockApiResponse({ error: 'Not authenticated' }, 401)

      await expect(completeOnboarding('account-a')).rejects.toThrow('Not authenticated')
    })
  })


  describe('resetAccount', () => {
    it('sends POST to /api/profile/reset', async () => {
      mock204()

      await resetAccount('account-a')

      const [url, init] = mockFetch.mock.calls[0]!
      expect(url).toContain('/api/profile/reset')
      expect(init.method).toBe('POST')
    })

    it('throws on server error', async () => {
      mockApiResponse({ error: 'Forbidden' }, 403)

      await expect(resetAccount('account-a')).rejects.toThrow('Forbidden')
    })
  })


  describe('dismissCalendarImport', () => {
    it('sends PUT to /api/calendar/dismiss', async () => {
      mock204()

      await dismissCalendarImport('account-a')

      const [url, init] = mockFetch.mock.calls[0]!
      expect(url).toContain('/api/calendar/dismiss')
      expect(init.method).toBe('PUT')
    })

    it('throws on server error', async () => {
      mockApiResponse({ error: 'Server error' }, 500)

      await expect(dismissCalendarImport('account-a')).rejects.toThrow('Server error')
    })
  })

  describe('other account-scoped actions', () => {
    beforeEach(() => {
      vi.mocked(resolveServerSession).mockResolvedValue({
        token: tokenForAccount('account-a'),
        expiresAt: null,
        refreshed: false,
        refreshFailed: false,
      })
    })

    it.each([
      ['name', () => updateName({ name: 'Ada' }, 'account-a')],
      ['proactive Astra', () => updateProactiveAstra({ enabled: true }, 'account-a')],
      ['marketing consent', () => updateMarketingConsent({ enabled: false }, 'account-a')],
      ['selected calendars', () => setSelectedCalendars(['work', 'home'], 'account-a')],
      ['calendar auto-sync', () => setCalendarAutoSync(true, 'account-a')],
      ['calendar sync', () => runCalendarSyncNow('account-a')],
      ['calendar suggestion', () => dismissCalendarSuggestion('suggestion-1', 'account-a')],
      ['customer portal', () => openCustomerPortal('account-a')],
      ['support message', () => sendSupportMessage({ subject: 'Sync', message: 'My calendar did not sync.' }, 'account-a')],
    ] as const)('refuses the %s write after the cookie changes accounts', async (_label, send) => {
      vi.mocked(resolveServerSession).mockResolvedValue({
        token: tokenForAccount('account-b'),
        expiresAt: null,
        refreshed: false,
        refreshFailed: false,
      })
      mock204()

      await expect(send()).rejects.toMatchObject({ status: 409, code: 'ACCOUNT_CHANGED' })
      expect(mockFetch).not.toHaveBeenCalled()
    })

    it.each([
      ['name', () => updateName({ name: 'Ada' }, 'account-a'), { name: 'Ada' }, '/api/profile/name'],
      ['proactive Astra', () => updateProactiveAstra({ enabled: true }, 'account-a'), { enabled: true }, '/api/profile/proactive-astra'],
      ['marketing consent', () => updateMarketingConsent({ enabled: false }, 'account-a'), { enabled: false }, '/api/profile/marketing-consent'],
    ] as const)('sends the %s change through the guarded PUT', async (_label, send, payload, path) => {
      mock204()
      await send()
      const [url, init] = mockFetch.mock.calls[0]!
      expect(url).toContain(path)
      expect(init.method).toBe('PUT')
      expect(JSON.parse(init.body)).toEqual(payload)
    })

    it('sends selected calendar IDs through the guarded PUT', async () => {
      mock204()
      await setSelectedCalendars(['work', 'home'], 'account-a')
      const [url, init] = mockFetch.mock.calls[0]!
      expect(url).toContain('/api/calendar/selected')
      expect(init.method).toBe('PUT')
      expect(JSON.parse(init.body)).toEqual({ calendarIds: ['work', 'home'] })
    })

    it('sends the auto-sync setting through the guarded PUT', async () => {
      mock204()
      await setCalendarAutoSync(true, 'account-a')
      const [url, init] = mockFetch.mock.calls[0]!
      expect(url).toContain('/api/calendar/auto-sync')
      expect(init.method).toBe('PUT')
      expect(JSON.parse(init.body)).toEqual({ enabled: true })
    })

    it('starts calendar sync with POST', async () => {
      mock204()
      await runCalendarSyncNow('account-a')
      const [url, init] = mockFetch.mock.calls[0]!
      expect(url).toContain('/api/calendar/auto-sync/run')
      expect(init.method).toBe('POST')
    })

    it('dismisses the named calendar suggestion with PUT', async () => {
      mock204()
      await dismissCalendarSuggestion('suggestion-1', 'account-a')
      const [url, init] = mockFetch.mock.calls[0]!
      expect(url).toContain('/api/calendar/auto-sync/suggestions/suggestion-1/dismiss')
      expect(init.method).toBe('PUT')
    })

    it('opens the customer portal with POST and returns its URL', async () => {
      mockFetch.mockResolvedValue(new Response(JSON.stringify({ url: 'https://billing.example/portal' }), {
        status: 200,
      }))
      await expect(openCustomerPortal('account-a')).resolves.toEqual({ url: 'https://billing.example/portal' })
      const [url, init] = mockFetch.mock.calls[0]!
      expect(url).toContain('/api/subscriptions/portal')
      expect(init.method).toBe('POST')
    })

    it('sends the support message body with POST', async () => {
      mock204()
      const payload = { subject: 'Sync', message: 'My calendar did not sync.' }
      await sendSupportMessage(payload, 'account-a')
      const [url, init] = mockFetch.mock.calls[0]!
      expect(url).toContain('/api/support')
      expect(init.method).toBe('POST')
      expect(JSON.parse(init.body)).toEqual(payload)
    })
  })


  describe('error handling', () => {
    it('throws with error message from response body', async () => {
      mockApiResponse({ error: 'Not authenticated' }, 401)

      await expect(resetAccount('account-a')).rejects.toThrow('Not authenticated')
    })

    it('throws with message field from response body', async () => {
      mockApiResponse({ message: 'Validation failed' }, 400)

      await expect(
        updateTimezone({ timeZone: '' }, 'account-a'),
      ).rejects.toThrow('Validation failed')
    })

    it('throws with status code when no error body', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        json: () => Promise.reject(new Error('No JSON')),
      })

      await expect(resetAccount('account-a')).rejects.toThrow('500')
    })
  })
})
