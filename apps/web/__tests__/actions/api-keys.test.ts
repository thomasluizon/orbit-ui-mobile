import { beforeEach, describe, expect, it, vi } from 'vitest'

const resolveServerSession = vi.hoisted(() => vi.fn())

vi.mock('@/lib/auth-api', () => ({
  resolveServerSession,
}))

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

const { confirmApiKeyCreationChallenge, createApiKey } = await import('@/app/actions/api-keys')

describe('API key server actions', () => {
  beforeEach(() => {
    mockFetch.mockReset()
    resolveServerSession.mockReset()
    resolveServerSession.mockResolvedValue({
      token: 'test-token',
      expiresAt: null,
      refreshed: false,
      refreshFailed: false,
    })
  })

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
      ok: true,
      data: {
        success: false,
        challengeRequired: true,
      },
    })
  })

  it('keeps unrelated create failures on the error path', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ error: 'Internal error' }),
    })

    await expect(createApiKey({ name: 'CI key' })).resolves.toEqual({
      ok: false,
      error: 'Internal error',
      status: 500,
      sessionRefreshFailed: false,
    })
  })

  it('preserves a definitive refresh rejection during challenge confirmation', async () => {
    resolveServerSession.mockResolvedValue({
      token: null,
      expiresAt: null,
      refreshed: false,
      refreshFailed: true,
    })

    await expect(confirmApiKeyCreationChallenge('123456')).resolves.toEqual({
      ok: false,
      error: 'Unauthorized',
      status: 401,
      sessionRefreshFailed: true,
    })
  })
})
