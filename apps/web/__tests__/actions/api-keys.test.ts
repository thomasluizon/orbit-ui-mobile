import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/auth-api', () => ({
  resolveServerSession: vi.fn().mockResolvedValue({
    token: 'test-token',
    expiresAt: null,
    refreshed: false,
  }),
}))

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

const { createApiKey } = await import('@/app/actions/api-keys')

describe('API key server actions', () => {
  beforeEach(() => mockFetch.mockReset())

  it('returns a serializable challenge result for the confirmed 428 error', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 428,
      json: () => Promise.resolve({
        error: 'Confirm the emailed code before creating an API key.',
        errorCode: 'API_KEY_CREATION_CHALLENGE_REQUIRED',
      }),
    })

    await expect(createApiKey({ name: 'CI key' })).resolves.toEqual({
      success: false,
      challengeRequired: true,
    })
  })

  it('keeps unrelated create failures on the error path', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ error: 'Internal error' }),
    })

    await expect(createApiKey({ name: 'CI key' })).rejects.toThrow('Internal error')
  })
})
