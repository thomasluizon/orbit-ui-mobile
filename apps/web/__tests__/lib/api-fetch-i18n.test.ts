import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock sonner
const mockToastError = vi.fn()
vi.mock('sonner', () => ({
  toast: {
    error: (...args: unknown[]) => mockToastError(...args),
  },
}))

// Mock auth store
vi.mock('@/stores/auth-store', () => ({
  useAuthStore: {
    getState: () => ({
      logout: vi.fn(),
    }),
  },
}))

// Mock extractBackendError
vi.mock('@orbit/shared/utils', () => ({
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
      // expected
    }

    expect(mockToastError).toHaveBeenCalledWith(
      'translated:toast.errors.validation',
      expect.any(Object),
    )
  })

  it('translates 404 errors', async () => {
    const { setApiFetchTranslate, apiFetch } = await import('@/lib/api-fetch')

    const translate = (key: string) => `t:${key}`
    setApiFetchTranslate(translate)

    mockFetch.mockResolvedValue({
      ok: false,
      status: 404,
      json: () => Promise.resolve({}),
    })

    try {
      await apiFetch('/api/test')
    } catch {
      // expected
    }

    expect(mockToastError).toHaveBeenCalledWith(
      't:toast.errors.notFound',
      expect.any(Object),
    )
  })

  it('translates 409 errors', async () => {
    const { setApiFetchTranslate, apiFetch } = await import('@/lib/api-fetch')

    const translate = (key: string) => `t:${key}`
    setApiFetchTranslate(translate)

    mockFetch.mockResolvedValue({
      ok: false,
      status: 409,
      json: () => Promise.resolve({}),
    })

    try {
      await apiFetch('/api/test')
    } catch {
      // expected
    }

    expect(mockToastError).toHaveBeenCalledWith(
      't:toast.errors.conflict',
      expect.any(Object),
    )
  })

  it('translates 429 errors', async () => {
    const { setApiFetchTranslate, apiFetch } = await import('@/lib/api-fetch')

    const translate = (key: string) => `t:${key}`
    setApiFetchTranslate(translate)

    mockFetch.mockResolvedValue({
      ok: false,
      status: 429,
      json: () => Promise.resolve({}),
    })

    try {
      await apiFetch('/api/test')
    } catch {
      // expected
    }

    expect(mockToastError).toHaveBeenCalledWith(
      't:toast.errors.tooManyRequests',
      expect.any(Object),
    )
  })

  it('translates 500+ errors', async () => {
    const { setApiFetchTranslate, apiFetch } = await import('@/lib/api-fetch')

    const translate = (key: string) => `t:${key}`
    setApiFetchTranslate(translate)

    mockFetch.mockResolvedValue({
      ok: false,
      status: 503,
      json: () => Promise.resolve({}),
    })

    try {
      await apiFetch('/api/test')
    } catch {
      // expected
    }

    expect(mockToastError).toHaveBeenCalledWith(
      't:toast.errors.server',
      expect.any(Object),
    )
  })

  it('translates unknown status errors', async () => {
    const { setApiFetchTranslate, apiFetch } = await import('@/lib/api-fetch')

    const translate = (key: string) => `t:${key}`
    setApiFetchTranslate(translate)

    mockFetch.mockResolvedValue({
      ok: false,
      status: 418, // I'm a teapot
      json: () => Promise.resolve({}),
    })

    try {
      await apiFetch('/api/test')
    } catch {
      // expected
    }

    expect(mockToastError).toHaveBeenCalledWith(
      't:toast.errors.unknown',
      expect.any(Object),
    )
  })
})
