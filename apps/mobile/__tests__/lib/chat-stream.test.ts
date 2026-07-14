import { beforeEach, describe, expect, it, vi } from 'vitest'
import { API } from '@orbit/shared/api'

import { openChatStream } from '@/lib/chat-stream'

const mocks = vi.hoisted(() => ({
  expoFetch: vi.fn(),
  getToken: vi.fn(),
  refreshSessionToken: vi.fn(),
}))

vi.mock('expo/fetch', () => ({
  fetch: mocks.expoFetch,
}))

vi.mock('@/lib/secure-store', () => ({
  getToken: mocks.getToken,
}))

vi.mock('@/stores/auth-store', () => ({
  refreshSessionToken: mocks.refreshSessionToken,
}))

const API_BASE = process.env.EXPO_PUBLIC_API_BASE ?? 'https://api.useorbit.org'
const STREAM_URL = `${API_BASE}${API.chat.stream}`

function makeResponse(status: number): { status: number } {
  return { status }
}

describe('openChatStream', () => {
  beforeEach(() => {
    mocks.expoFetch.mockReset()
    mocks.getToken.mockReset()
    mocks.refreshSessionToken.mockReset()
  })

  it('posts the form data with a bearer token and time-zone header', async () => {
    mocks.getToken.mockResolvedValue('token-123')
    mocks.expoFetch.mockResolvedValue(makeResponse(200))

    const formData = new FormData()
    formData.append('message', 'hello')
    const controller = new AbortController()

    const response = await openChatStream(formData, controller.signal)

    expect(response).toEqual(makeResponse(200))
    expect(mocks.expoFetch).toHaveBeenCalledTimes(1)
    expect(mocks.expoFetch).toHaveBeenCalledWith(
      STREAM_URL,
      expect.objectContaining({
        method: 'POST',
        body: formData,
        signal: controller.signal,
        headers: expect.objectContaining({
          Authorization: 'Bearer token-123',
          'X-Orbit-Time-Zone': expect.any(String),
        }),
      }),
    )
    expect(mocks.refreshSessionToken).not.toHaveBeenCalled()
  })

  it('omits the Authorization header when no token is stored', async () => {
    mocks.getToken.mockResolvedValue(null)
    mocks.expoFetch.mockResolvedValue(makeResponse(200))

    await openChatStream(new FormData(), new AbortController().signal)

    const headers = mocks.expoFetch.mock.calls[0]?.[1]?.headers as Record<
      string,
      string
    >
    expect(headers.Authorization).toBeUndefined()
  })

  it('refreshes the token exactly once and retries after a 401', async () => {
    mocks.getToken.mockResolvedValue('stale-token')
    mocks.refreshSessionToken.mockResolvedValue('fresh-token')
    mocks.expoFetch
      .mockResolvedValueOnce(makeResponse(401))
      .mockResolvedValueOnce(makeResponse(200))

    const response = await openChatStream(
      new FormData(),
      new AbortController().signal,
    )

    expect(response).toEqual(makeResponse(200))
    expect(mocks.refreshSessionToken).toHaveBeenCalledTimes(1)
    expect(mocks.refreshSessionToken).toHaveBeenCalledWith({
      clearOnFailure: false,
    })
    expect(mocks.expoFetch).toHaveBeenCalledTimes(2)
    expect(mocks.expoFetch.mock.calls[1]?.[1]?.headers).toMatchObject({
      Authorization: 'Bearer fresh-token',
    })
  })

  it('returns the original 401 without retrying when the refresh fails', async () => {
    mocks.getToken.mockResolvedValue('stale-token')
    mocks.refreshSessionToken.mockResolvedValue(null)
    mocks.expoFetch.mockResolvedValue(makeResponse(401))

    const response = await openChatStream(
      new FormData(),
      new AbortController().signal,
    )

    expect(response).toEqual(makeResponse(401))
    expect(mocks.refreshSessionToken).toHaveBeenCalledTimes(1)
    expect(mocks.expoFetch).toHaveBeenCalledTimes(1)
  })

  it('does not refresh when the first response is a non-401 error', async () => {
    mocks.getToken.mockResolvedValue('token-123')
    mocks.expoFetch.mockResolvedValue(makeResponse(500))

    const response = await openChatStream(
      new FormData(),
      new AbortController().signal,
    )

    expect(response).toEqual(makeResponse(500))
    expect(mocks.refreshSessionToken).not.toHaveBeenCalled()
    expect(mocks.expoFetch).toHaveBeenCalledTimes(1)
  })
})
