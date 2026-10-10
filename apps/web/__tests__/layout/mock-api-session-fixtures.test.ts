// @vitest-environment node
import { createServer, type Server } from 'node:http'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createPaginatedSchema, habitScheduleItemSchema } from '@orbit/shared/types/habit'
import { makeHabitScheduleItem } from '@orbit/shared/test-support/habit-detail-fixtures'
import { emptyHabitsPageFixture } from '../../test-support/hermetic/mock-api/fixtures/collections'
import { mintHermeticJwt } from '../../test-support/hermetic/hermetic-session'
import { handleRequest } from '../../test-support/hermetic/mock-api/request-handler'

let server: Server
let origin: string
const pageFor = (id: string) => createPaginatedSchema(habitScheduleItemSchema).parse({
  ...emptyHabitsPageFixture,
  items: [makeHabitScheduleItem({ id, title: id })],
  totalCount: 1,
})
const tokenFor = (session: string) => mintHermeticJwt(undefined, undefined, undefined, session)
const seed = (session: string, body: unknown) => fetch(`${origin}/_test/session-fixtures`, {
  method: 'PUT', headers: { Authorization: `Bearer ${tokenFor(session)}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ fixtures: [{ path: '/api/habits', body }] }),
})
const read = (session: string, query = '') => fetch(`${origin}/api/habits${query}`, {
  headers: { Authorization: `Bearer ${tokenFor(session)}` },
})

beforeAll(async () => {
  server = createServer(handleRequest)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Expected a mock API port')
  origin = `http://127.0.0.1:${address.port}`
})
afterAll(async () => {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
})

describe('mock API session fixtures', () => {
  it('serves isolated seeded pages to server and browser reads and keeps unseeded defaults', async () => {
    const first = pageFor('first-session-habit')
    const second = pageFor('second-session-habit')
    const seeded = await seed('first', first)
    await seed('second', second)
    expect(await (await read('first', '?dateFrom=2026-09-04')).json()).toEqual(first)
    expect(await (await read('second')).json()).toEqual(second)
    expect(await (await read('first')).json()).toEqual(first)
    expect(seeded.status).toBe(204)
    expect(await (await read('unseeded')).json()).toEqual(emptyHabitsPageFixture)
  })

  it('rejects invalid bodies without replacing a valid session fixture', async () => {
    const valid = pageFor('valid-habit')
    await seed('validation', valid)
    expect((await seed('validation', { items: [{ id: 'invalid' }] })).status).toBe(400)
    expect(await (await read('validation')).json()).toEqual(valid)
  })

  it('keeps query-specific pages and mutation refetches in their own session', async () => {
    const first = pageFor('query-first')
    const second = pageFor('query-second')
    const created = pageFor('created-habit')
    const response = await fetch(`${origin}/_test/session-fixtures`, {
      method: 'PUT', headers: { Authorization: `Bearer ${tokenFor('changing')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fixtures: [
        { path: '/api/habits', body: first, afterMutation: { method: 'POST', path: '/api/habits', body: created } },
        { path: '/api/habits', query: { search: 'Read', page: '2' }, body: second },
      ] }),
    })
    expect(response.status).toBe(204)
    expect(await (await read('changing', '?page=2&search=Read')).json()).toEqual(second)
    expect(await (await read('changing')).json()).toEqual(first)
    await fetch(`${origin}/api/habits`, { method: 'POST', headers: { Authorization: `Bearer ${tokenFor('other-mutation')}` } })
    expect(await (await read('changing')).json()).toEqual(first)
    await fetch(`${origin}/api/habits`, { method: 'POST', headers: { Authorization: `Bearer ${tokenFor('changing')}` } })
    expect(await (await read('changing')).json()).toEqual(created)
    expect(await (await read('changing', '?search=Read&page=2')).json()).toEqual(second)
    expect(await (await read('unseeded')).json()).toEqual(emptyHabitsPageFixture)
  })

  it('requires a session and validates profile fixtures and future mutation bodies atomically', async () => {
    const request = (token: string, fixtures: unknown) => fetch(`${origin}/_test/session-fixtures`, {
      method: 'PUT', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fixtures }),
    })
    expect((await request(mintHermeticJwt(), [{ path: '/api/habits', body: pageFor('no-session') }])).status).toBe(400)
    expect((await request(tokenFor('atomic'), [
      { path: '/api/habits', body: pageFor('not-stored') }, { path: '/api/profile', body: {} },
    ])).status).toBe(400)
    expect(await (await read('atomic')).json()).toEqual(emptyHabitsPageFixture)
    expect((await request(tokenFor('atomic'), [{ path: '/unknown', body: {} }])).status).toBe(400)
    expect((await request(tokenFor('atomic'), [{
      path: '/api/habits', body: pageFor('not-stored'), afterMutation: { method: 'POST', path: '/api/habits', body: {} },
    }])).status).toBe(400)
  })
})
