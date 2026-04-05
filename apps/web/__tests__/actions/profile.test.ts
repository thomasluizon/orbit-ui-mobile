import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/auth-api', () => ({
  getAuthHeaders: vi.fn().mockResolvedValue({
    Authorization: 'Bearer test-token',
  }),
}))

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

const {
  updateTimezone,
  updateLanguage,
  updateAiMemory,
  updateAiSummary,
  updateWeekStartDay,
  updateThemePreference,
  updateColorScheme,
  completeOnboarding,
  resetAccount,
  dismissCalendarImport,
} = await import('@/app/actions/profile')

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

  // -------------------------------------------------------------------------
  // updateTimezone
  // -------------------------------------------------------------------------

  describe('updateTimezone', () => {
    it('sends PUT to /api/profile/timezone', async () => {
      mock204()

      await updateTimezone({ timeZone: 'America/Sao_Paulo' })

      const [url, init] = mockFetch.mock.calls[0]!
      expect(url).toContain('/api/profile/timezone')
      expect(init.method).toBe('PUT')
      expect(JSON.parse(init.body)).toEqual({ timeZone: 'America/Sao_Paulo' })
    })

    it('includes auth headers', async () => {
      mock204()

      await updateTimezone({ timeZone: 'UTC' })

      const [, init] = mockFetch.mock.calls[0]!
      expect(init.headers).toHaveProperty('Authorization', 'Bearer test-token')
    })

    it('throws on server error', async () => {
      mockApiResponse({ error: 'Invalid timezone' }, 400)

      await expect(
        updateTimezone({ timeZone: 'Invalid/Zone' }),
      ).rejects.toThrow('Invalid timezone')
    })
  })

  // -------------------------------------------------------------------------
  // updateLanguage
  // -------------------------------------------------------------------------

  describe('updateLanguage', () => {
    it('sends PUT to /api/profile/language', async () => {
      mock204()

      await updateLanguage({ language: 'pt-BR' })

      const [url, init] = mockFetch.mock.calls[0]!
      expect(url).toContain('/api/profile/language')
      expect(init.method).toBe('PUT')
      expect(JSON.parse(init.body)).toEqual({ language: 'pt-BR' })
    })

    it('throws on server error', async () => {
      mockApiResponse({ error: 'Unsupported language' }, 400)

      await expect(
        updateLanguage({ language: 'xx' as never }),
      ).rejects.toThrow('Unsupported language')
    })
  })

  // -------------------------------------------------------------------------
  // updateAiMemory
  // -------------------------------------------------------------------------

  describe('updateAiMemory', () => {
    it('sends PUT to /api/profile/ai-memory', async () => {
      mock204()

      await updateAiMemory({ enabled: true })

      const [url, init] = mockFetch.mock.calls[0]!
      expect(url).toContain('/api/profile/ai-memory')
      expect(init.method).toBe('PUT')
      expect(JSON.parse(init.body)).toEqual({ enabled: true })
    })

    it('sends false value', async () => {
      mock204()

      await updateAiMemory({ enabled: false })

      const [, init] = mockFetch.mock.calls[0]!
      expect(JSON.parse(init.body)).toEqual({ enabled: false })
    })
  })

  // -------------------------------------------------------------------------
  // updateAiSummary
  // -------------------------------------------------------------------------

  describe('updateAiSummary', () => {
    it('sends PUT to /api/profile/ai-summary', async () => {
      mock204()

      await updateAiSummary({ enabled: true })

      const [url, init] = mockFetch.mock.calls[0]!
      expect(url).toContain('/api/profile/ai-summary')
      expect(init.method).toBe('PUT')
      expect(JSON.parse(init.body)).toEqual({ enabled: true })
    })

    it('sends false value', async () => {
      mock204()

      await updateAiSummary({ enabled: false })

      const [, init] = mockFetch.mock.calls[0]!
      expect(JSON.parse(init.body)).toEqual({ enabled: false })
    })
  })

  // -------------------------------------------------------------------------
  // updateWeekStartDay
  // -------------------------------------------------------------------------

  describe('updateWeekStartDay', () => {
    it('sends PUT to /api/profile/week-start-day', async () => {
      mock204()

      await updateWeekStartDay({ weekStartDay: 1 })

      const [url, init] = mockFetch.mock.calls[0]!
      expect(url).toContain('/api/profile/week-start-day')
      expect(init.method).toBe('PUT')
      expect(JSON.parse(init.body)).toEqual({ weekStartDay: 1 })
    })

    it('handles Sunday value', async () => {
      mock204()

      await updateWeekStartDay({ weekStartDay: 0 })

      const [, init] = mockFetch.mock.calls[0]!
      expect(JSON.parse(init.body)).toEqual({ weekStartDay: 0 })
    })

    it('throws on server error', async () => {
      mockApiResponse({ error: 'Invalid day' }, 400)

      await expect(
        updateWeekStartDay({ weekStartDay: 'Invalid' as never }),
      ).rejects.toThrow('Invalid day')
    })
  })

  // -------------------------------------------------------------------------
  // updateThemePreference
  // -------------------------------------------------------------------------

  describe('updateThemePreference', () => {
    it('sends PUT to /api/profile/theme-preference', async () => {
      mock204()

      await updateThemePreference({ themePreference: 'dark' })

      const [url, init] = mockFetch.mock.calls[0]!
      expect(url).toContain('/api/profile/theme-preference')
      expect(init.method).toBe('PUT')
      expect(JSON.parse(init.body)).toEqual({ themePreference: 'dark' })
    })

    it('handles light theme', async () => {
      mock204()

      await updateThemePreference({ themePreference: 'light' })

      const [, init] = mockFetch.mock.calls[0]!
      expect(JSON.parse(init.body)).toEqual({ themePreference: 'light' })
    })
  })

  // -------------------------------------------------------------------------
  // updateColorScheme
  // -------------------------------------------------------------------------

  describe('updateColorScheme', () => {
    it('sends PUT to /api/profile/color-scheme', async () => {
      mock204()

      await updateColorScheme({ colorScheme: 'ocean' })

      const [url, init] = mockFetch.mock.calls[0]!
      expect(url).toContain('/api/profile/color-scheme')
      expect(init.method).toBe('PUT')
      expect(JSON.parse(init.body)).toEqual({ colorScheme: 'ocean' })
    })

    it('throws on server error', async () => {
      mockApiResponse({ error: 'Invalid color scheme' }, 400)

      await expect(
        updateColorScheme({ colorScheme: 'invalid' as never }),
      ).rejects.toThrow('Invalid color scheme')
    })
  })

  // -------------------------------------------------------------------------
  // completeOnboarding
  // -------------------------------------------------------------------------

  describe('completeOnboarding', () => {
    it('sends PUT to /api/profile/onboarding with no body', async () => {
      mock204()

      await completeOnboarding()

      const [url, init] = mockFetch.mock.calls[0]!
      expect(url).toContain('/api/profile/onboarding')
      expect(init.method).toBe('PUT')
    })

    it('includes auth headers', async () => {
      mock204()

      await completeOnboarding()

      const [, init] = mockFetch.mock.calls[0]!
      expect(init.headers).toHaveProperty('Authorization', 'Bearer test-token')
    })

    it('throws on server error', async () => {
      mockApiResponse({ error: 'Not authenticated' }, 401)

      await expect(completeOnboarding()).rejects.toThrow('Not authenticated')
    })
  })

  // -------------------------------------------------------------------------
  // resetAccount
  // -------------------------------------------------------------------------

  describe('resetAccount', () => {
    it('sends POST to /api/profile/reset', async () => {
      mock204()

      await resetAccount()

      const [url, init] = mockFetch.mock.calls[0]!
      expect(url).toContain('/api/profile/reset')
      expect(init.method).toBe('POST')
    })

    it('throws on server error', async () => {
      mockApiResponse({ error: 'Forbidden' }, 403)

      await expect(resetAccount()).rejects.toThrow('Forbidden')
    })
  })

  // -------------------------------------------------------------------------
  // dismissCalendarImport
  // -------------------------------------------------------------------------

  describe('dismissCalendarImport', () => {
    it('sends PUT to /api/calendar/dismiss', async () => {
      mock204()

      await dismissCalendarImport()

      const [url, init] = mockFetch.mock.calls[0]!
      expect(url).toContain('/api/calendar/dismiss')
      expect(init.method).toBe('PUT')
    })

    it('throws on server error', async () => {
      mockApiResponse({ error: 'Server error' }, 500)

      await expect(dismissCalendarImport()).rejects.toThrow('Server error')
    })
  })

  // -------------------------------------------------------------------------
  // Error handling
  // -------------------------------------------------------------------------

  describe('error handling', () => {
    it('throws with error message from response body', async () => {
      mockApiResponse({ error: 'Not authenticated' }, 401)

      await expect(resetAccount()).rejects.toThrow('Not authenticated')
    })

    it('throws with message field from response body', async () => {
      mockApiResponse({ message: 'Validation failed' }, 400)

      await expect(
        updateTimezone({ timeZone: '' }),
      ).rejects.toThrow('Validation failed')
    })

    it('throws with status code when no error body', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        json: () => Promise.reject(new Error('No JSON')),
      })

      await expect(resetAccount()).rejects.toThrow('500')
    })
  })
})
