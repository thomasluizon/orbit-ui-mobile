import { beforeEach, expect, it, vi } from 'vitest'
import { API } from '@orbit/shared/api'
import { createNotionAuthorization, createNotionCallback } from '@orbit/shared/__tests__/notion-fixtures'
import { authorizeNotion, completeNotion, disconnectNotion } from '@/lib/actions/profile'

const mocks = vi.hoisted(() => ({ mutate: vi.fn() }))
vi.mock('@/lib/server-fetch', () => ({ serverAuthMutate: mocks.mutate, serverAuthFetch: vi.fn() }))
beforeEach(() => mocks.mutate.mockReset())
it('forwards authorization and callback requests with their intended account', async () => {
  mocks.mutate.mockResolvedValueOnce(createNotionAuthorization())
  const request = createNotionCallback()
  await expect(authorizeNotion({ redirectUri: request.redirectUri }, 'account-a')).resolves.toEqual(createNotionAuthorization())
  expect(mocks.mutate).toHaveBeenCalledWith(API.connections.notionAuthorize, { method: 'POST', body: JSON.stringify({ redirectUri: request.redirectUri }) }, expect.any(String), expect.anything())
  await completeNotion(request, 'account-a')
  const [path, options] = mocks.mutate.mock.calls[1]!
  expect(path).toBe(API.connections.notionCallback)
  expect(options.method).toBe('POST')
  expect(JSON.parse(options.body)).toEqual(request)
})
it('sends one bodyless disconnect and propagates failures', async () => {
  await disconnectNotion('account-a')
  expect(mocks.mutate).toHaveBeenCalledExactlyOnceWith(API.connections.notion, { method: 'DELETE' }, expect.any(String))
  mocks.mutate.mockRejectedValueOnce(new Error('Unavailable'))
  await expect(disconnectNotion('account-a')).rejects.toThrow('Unavailable')
})
