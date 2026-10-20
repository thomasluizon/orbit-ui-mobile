// @vitest-environment node
import type { IncomingMessage, ServerResponse } from 'node:http'
import { Readable } from 'node:stream'
import type { BrowserContext } from '@playwright/test'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { API } from '@orbit/shared/api'
import { bulkCreateRequestSchema, reorderHabitsRequestSchema } from '@orbit/shared/types/habit'
import { mintHermeticJwt } from '../../test-support/hermetic/hermetic-session'
import { handleRequest } from '../../test-support/hermetic/mock-api/request-handler'
import { setLayoutFixtureSession } from '../../e2e/layout/profile-session'

const journalPath = '/_test/habit-mutations'
const tokenFor = (session: string) => mintHermeticJwt(undefined, undefined, undefined, session)

function request(method: string, path: string, token?: string, body?: unknown): Promise<{ status: number; body: unknown }> {
  const req = Object.assign(Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))]), {
    method, url: path, headers: token ? { authorization: `Bearer ${token}` } : {},
  }) as IncomingMessage
  return new Promise((resolve) => {
    let status = 200
    const res = {
      writeHead: (code: number) => { status = code },
      end: (payload?: string) => resolve({ status, body: payload ? JSON.parse(payload) as unknown : null }),
    } as unknown as ServerResponse
    handleRequest(req, res)
  })
}

const mutationCases = [
  { method: 'POST', path: API.habits.bulk, body: bulkCreateRequestSchema.parse({ habits: [{ title: 'Read' }] }), status: 200 },
  { method: 'PUT', path: API.habits.reorder, body: reorderHabitsRequestSchema.parse({ positions: [{ habitId: 'first', position: 0 }] }), status: 204 },
  { method: 'POST', path: API.habits.log('first'), body: { date: '2026-09-04' }, status: 200 },
] as const

describe('mock API mutation journal isolation', () => {
  afterEach(() => vi.unstubAllGlobals())

  it.each(mutationCases)('isolates $method $path writes and clearing between sessions', async ({ method, path, body, status }) => {
    const firstToken = tokenFor(`journal-first-${path}`)
    const secondToken = tokenFor(`journal-second-${path}`)
    const mutation = { method, path, body }
    const otherMutation = { method: 'PUT', path: API.habits.reorder, body: { positions: [{ habitId: 'second', position: 1 }] } }

    expect((await request(method, path, firstToken, body)).status).toBe(status)
    expect((await request('GET', journalPath, secondToken)).body).toEqual([])
    expect((await request(otherMutation.method, otherMutation.path, secondToken, otherMutation.body)).status).toBe(204)
    expect((await request('GET', journalPath, firstToken)).body).toEqual([mutation])
    expect((await request('GET', journalPath, secondToken)).body).toEqual([otherMutation])

    expect(await request('DELETE', journalPath, firstToken)).toEqual({ status: 200, body: [] })
    expect((await request('GET', journalPath, firstToken)).body).toEqual([])
    expect((await request('GET', journalPath, secondToken)).body).toEqual([otherMutation])
  })

  it('keeps requests without a fixture session in a separate bucket', async () => {
    const token = tokenFor('journal-authenticated')
    const { method, path, body } = mutationCases[1]
    const mutation = { method, path, body }
    await request('DELETE', journalPath)
    await request(method, path, undefined, body)
    expect((await request('GET', journalPath, token)).body).toEqual([])
    expect((await request('GET', journalPath, mintHermeticJwt())).body).toEqual([mutation])

    await request(method, path, token, body)
    await request('DELETE', journalPath, mintHermeticJwt())
    expect((await request('GET', journalPath)).body).toEqual([])
    expect((await request('GET', journalPath, token)).body).toEqual([mutation])

    await request(method, path, undefined, body)
    await request('DELETE', journalPath, token)
    expect((await request('GET', journalPath)).body).toEqual([mutation])
    expect((await request('GET', journalPath, token)).body).toEqual([])
  })

  it('rejects an invalid session without reading or clearing a valid session journal', async () => {
    const token = tokenFor('journal-valid')
    const { method, path, body } = mutationCases[1]
    await request(method, path, token, body)
    for (const invalidMethod of ['GET', 'DELETE']) {
      expect((await request(invalidMethod, journalPath, 'invalid.payload.signature')).status).toBe(400)
    }
    expect((await request('GET', journalPath, token)).body).toEqual([{ method, path, body }])
  })

  it('returns the page cookie token for journal reads and clears in the same fixture session', async () => {
    const addCookies = vi.fn<BrowserContext['addCookies']>().mockResolvedValue(undefined)
    const context = { addCookies } as unknown as BrowserContext
    vi.stubGlobal('fetch', async (_url: string, options: { headers: { Authorization: string }; body: string }) => {
      const response = await request('PUT', '/_test/session-fixtures',
        options.headers.Authorization.slice('Bearer '.length), JSON.parse(options.body) as unknown)
      return new Response(null, { status: response.status })
    })
    const token = await setLayoutFixtureSession(context, [])
    expect(addCookies).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({ name: 'auth_token', value: token }),
      expect.objectContaining({ name: 'refresh_token', value: token }),
    ]))
    const { method, path, body } = mutationCases[1]
    await request(method, path, token, body)
    expect((await request('GET', journalPath, token)).body).toEqual([{ method, path, body }])
    expect((await request('GET', journalPath, tokenFor('other-page'))).body).toEqual([])
    expect(await request('DELETE', journalPath, token)).toEqual({ status: 200, body: [] })
  })
})
