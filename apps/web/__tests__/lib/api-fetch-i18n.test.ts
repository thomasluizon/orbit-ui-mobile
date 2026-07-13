import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const mockToastError = vi.fn()
vi.mock('sonner', () => ({
  toast: {
    error: (...args: unknown[]) => mockToastError(...args),
  },
}))

vi.mock('@/stores/auth-store', () => ({
  useAuthStore: {
    getState: () => ({
      logout: vi.fn(),
    }),
  },
}))

vi.mock('@orbit/shared/utils', () => ({
  buildClientTimeZoneHeaders: vi.fn(() => ({
    'X-Orbit-Time-Zone': 'America/Sao_Paulo',
  })),
  extractBackendError: vi.fn(() => undefined),
}))

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

describe('setApiFetchTranslate', () => {
  beforeEach(() => {
    mockFetch.mockReset()
    mockToastError.mockReset()
  })

  it('uses translated toast titles when translate function is set', async () => {
    const { setApiFetchTranslate, apiFetch } = await import('@/lib/api-fetch')

    const translate = (key: string) => `translated:${key}`
    setApiFetchTranslate(translate)

    mockFetch.mockResolvedValue({
      ok: false,
      status: 400,
      json: () => Promise.resolve({}),
    })

    try {
      await apiFetch('/api/test')
    } catch {
    }

    expect(mockToastError).toHaveBeenCalledWith(
      'translated:toast.errors.validation',
      expect.any(Object),
    )
  })

  it.each([
    { name: 'translates 404 errors', status: 404, key: 't:toast.errors.notFound' },
    { name: 'translates 409 errors', status: 409, key: 't:toast.errors.conflict' },
    { name: 'translates 429 errors', status: 429, key: 't:toast.errors.tooManyRequests' },
    { name: 'translates 500+ errors', status: 503, key: 't:toast.errors.server' },
    { name: 'translates unknown status errors', status: 418, key: 't:toast.errors.unknown' },
  ])('$name', async ({ status, key }) => {
    const { setApiFetchTranslate, apiFetch } = await import('@/lib/api-fetch')

    const translate = (translationKey: string) => `t:${translationKey}`
    setApiFetchTranslate(translate)

    mockFetch.mockResolvedValue({
      ok: false,
      status,
      json: () => Promise.resolve({}),
    })

    try {
      await apiFetch('/api/test')
    } catch {
    }

    expect(mockToastError).toHaveBeenCalledWith(
      key,
      expect.any(Object),
    )
  })
})
