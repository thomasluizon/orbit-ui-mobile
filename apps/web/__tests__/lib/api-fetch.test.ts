import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock sonner
vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
  },
}))

// Mock auth store (dynamic import inside apiFetch)
const mockLogout = vi.fn()
vi.mock('@/stores/auth-store', () => ({
  useAuthStore: {
    getState: () => ({
      logout: mockLogout,
    }),
  },
}))

// Mock extractBackendError
vi.mock('@orbit/shared/utils', () => ({
  extractBackendError: vi.fn((err: { data?: { error?: string } }) => err?.data?.error ?? undefined),
}))

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

// Store original location
const originalLocation = globalThis.location

import { apiFetch, fetchJson, ApiError } from '@/lib/api-fetch'
import { toast } from 'sonner'

describe('apiFetch', () => {
  beforeEach(() => {
    mockFetch.mockReset()
    mockLogout.mockReset()
    vi.mocked(toast.error).mockReset()
  })

  afterEach(() => {
    // Restore location if it was modified
    if (globalThis.location !== originalLocation) {
      Object.defineProperty(globalThis, 'location', {
        value: originalLocation,
        writable: true,
        configurable: true,
      })
    }
  })

  it('returns parsed JSON on success', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ id: '1', name: 'Test' }),
    })

    const result = await apiFetch<{ id: string; name: string }>('/api/test')
    expect(result).toEqual({ id: '1', name: 'Test' })
  })

  it('passes request options to fetch', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
    })

    await apiFetch('/api/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: true }),
    })

    expect(mockFetch).toHaveBeenCalledWith('/api/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"data":true}',
    })
  })

  it('calls logout on 401 without toast', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 401,
      json: () => Promise.resolve({ error: 'Unauthorized' }),
    })

    await expect(apiFetch('/api/test')).rejects.toThrow(ApiError)
    expect(mockLogout).toHaveBeenCalled()
    expect(toast.error).not.toHaveBeenCalled()
  })

  it('throws ApiError with status 401', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 401,
      json: () => Promise.resolve({ error: 'Token expired' }),
    })

    try {
      await apiFetch('/api/test')
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError)
      expect((err as ApiError).status).toBe(401)
      expect((err as ApiError).message).toBe('Unauthorized')
    }
  })

  it('redirects to /upgrade on 403 without toast', async () => {
    const mockHref = { href: '' }
    Object.defineProperty(globalThis, 'location', {
      value: mockHref,
      writable: true,
      configurable: true,
    })

    mockFetch.mockResolvedValue({
      ok: false,
      status: 403,
      json: () => Promise.resolve({ error: 'Forbidden' }),
    })

    await expect(apiFetch('/api/test')).rejects.toThrow(ApiError)
    expect(mockHref.href).toBe('/upgrade')
    expect(toast.error).not.toHaveBeenCalled()
  })

  it('does not redirect again when already on /upgrade', async () => {
    const locationOnUpgrade = {
      href: 'https://app.useorbit.org/upgrade',
      pathname: '/upgrade',
    }
    Object.defineProperty(globalThis, 'location', {
      value: locationOnUpgrade,
      writable: true,
      configurable: true,
    })

    mockFetch.mockResolvedValue({
      ok: false,
      status: 403,
      json: () => Promise.resolve({ error: 'Forbidden' }),
    })

    await expect(apiFetch('/api/test')).rejects.toThrow(ApiError)
    expect(locationOnUpgrade.href).toBe('https://app.useorbit.org/upgrade')
    expect(toast.error).not.toHaveBeenCalled()
  })

  it('shows validation error toast on 400', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 400,
      json: () => Promise.resolve({ error: 'Title is required' }),
    })

    await expect(apiFetch('/api/test')).rejects.toThrow(ApiError)
    expect(toast.error).toHaveBeenCalledWith('Validation error', {
      description: 'Title is required',
      duration: 5000,
    })
  })

  it('shows not found toast on 404', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 404,
      json: () => Promise.resolve({ error: 'Habit not found' }),
    })

    await expect(apiFetch('/api/test')).rejects.toThrow(ApiError)
    expect(toast.error).toHaveBeenCalledWith('Not found', {
      description: 'Habit not found',
      duration: 5000,
    })
  })

  it('shows conflict toast on 409', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 409,
      json: () => Promise.resolve({ error: 'Already exists' }),
    })

    await expect(apiFetch('/api/test')).rejects.toThrow(ApiError)
    expect(toast.error).toHaveBeenCalledWith('Conflict', {
      description: 'Already exists',
      duration: 5000,
    })
  })

  it('shows rate limit toast on 429', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 429,
      json: () => Promise.resolve({ error: 'Slow down' }),
    })

    await expect(apiFetch('/api/test')).rejects.toThrow(ApiError)
    expect(toast.error).toHaveBeenCalledWith('Too many requests', {
      description: 'Slow down',
      duration: 5000,
    })
  })

  it('shows server error toast on 500', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ error: 'Internal server error' }),
    })

    await expect(apiFetch('/api/test')).rejects.toThrow(ApiError)
    expect(toast.error).toHaveBeenCalledWith('Server error', {
      description: 'Internal server error',
      duration: 5000,
    })
  })

  it('shows server error toast on 502', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 502,
      json: () => Promise.resolve({}),
    })

    await expect(apiFetch('/api/test')).rejects.toThrow(ApiError)
    expect(toast.error).toHaveBeenCalledWith('Server error', {
      description: undefined,
      duration: 5000,
    })
  })

  it('uses generic title when no backend error message', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 418,
      json: () => Promise.resolve({}),
    })

    await expect(apiFetch('/api/test')).rejects.toThrow(ApiError)
    expect(toast.error).toHaveBeenCalledWith('Something went wrong', {
      description: undefined,
      duration: 5000,
    })
  })

  it('handles body parse failure gracefully', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.reject(new Error('Invalid JSON')),
    })

    await expect(apiFetch('/api/test')).rejects.toThrow(ApiError)
  })
})

describe('fetchJson', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  it('delegates to apiFetch for GET requests', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ items: [1, 2, 3] }),
    })

    const result = await fetchJson<{ items: number[] }>('/api/items')
    expect(result).toEqual({ items: [1, 2, 3] })
    expect(mockFetch).toHaveBeenCalledWith('/api/items', undefined)
  })
})

describe('ApiError', () => {
  it('has status and data properties', () => {
    const err = new ApiError(404, 'Not found', { detail: 'gone' })
    expect(err).toBeInstanceOf(Error)
    expect(err.status).toBe(404)
    expect(err.message).toBe('Not found')
    expect(err.data).toEqual({ detail: 'gone' })
  })
})
